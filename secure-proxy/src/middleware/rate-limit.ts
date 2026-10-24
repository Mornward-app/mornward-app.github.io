import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../http/api-error.ts';
import type { Logger } from '../http/logger.ts';
import { requestIdOf } from '../http/request-id.ts';
import { requireUser } from './auth.ts';

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until one request would be allowed. 0 when allowed. */
  retryAfterSeconds: number;
}

/** Async so a shared store (Redis, DynamoDB) can replace the in-memory one without touching callers. */
export interface RateLimitStore {
  consume(key: string): Promise<RateLimitDecision>;
}

export interface TokenBucketOptions {
  /** Burst size: requests allowed back to back from a full bucket. */
  capacity: number;
  /** Sustained rate. 0.1 is one request per 10 seconds. */
  refillPerSecond: number;
  /** Hard bound on tracked keys. The least recently used bucket is dropped first. */
  maxKeys: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  updatedAtMs: number;
}

/**
 * Per-process token bucket. State is not shared between instances, so behind N instances the effective
 * limit is up to N times higher. Use a shared RateLimitStore where that matters.
 * Evicting a bucket forgives that key, which is the price of a bounded memory footprint.
 */
export function createInMemoryTokenBucket(options: TokenBucketOptions): RateLimitStore {
  const { capacity, refillPerSecond, maxKeys } = options;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(capacity) || capacity < 1) throw new RangeError('capacity must be at least 1');
  if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) throw new RangeError('refillPerSecond must be positive');
  if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new RangeError('maxKeys must be a positive integer');

  // A Map iterates in insertion order. Deleting and re-inserting on every touch keeps the oldest at the front.
  const buckets = new Map<string, Bucket>();

  return {
    consume(key: string): Promise<RateLimitDecision> {
      const nowMs = now();
      const existing = buckets.get(key);
      const elapsedSeconds = existing === undefined ? 0 : Math.max(0, (nowMs - existing.updatedAtMs) / 1000);
      const tokens = Math.min(capacity, (existing?.tokens ?? capacity) + elapsedSeconds * refillPerSecond);

      buckets.delete(key);
      let decision: RateLimitDecision;
      if (tokens >= 1) {
        buckets.set(key, { tokens: tokens - 1, updatedAtMs: nowMs });
        decision = { allowed: true, retryAfterSeconds: 0 };
      } else {
        buckets.set(key, { tokens, updatedAtMs: nowMs });
        decision = { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / refillPerSecond)) };
      }
      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next();
        if (oldest.done === true) break;
        buckets.delete(oldest.value);
      }
      return Promise.resolve(decision);
    },
  };
}

/**
 * Limits per verified user. Mount it AFTER authentication (the key is `req.user.id`) and BEFORE body
 * parsing, so a throttled caller costs a map lookup and not a parsed body.
 * If the store itself fails the request is refused: this limiter exists to cap spend, so it fails closed.
 */
export function createRateLimitMiddleware(store: RateLimitStore, logger: Pick<Logger, 'warn' | 'error'>): RequestHandler {
  const handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = requireUser(req);
    let decision: RateLimitDecision;
    try {
      decision = await store.consume(user.id);
    } catch (cause) {
      logger.error({ requestId: requestIdOf(res), errorName: cause instanceof Error ? cause.constructor.name : typeof cause }, 'rate limit store failed');
      throw new ApiError('RATE_LIMIT_UNAVAILABLE', 503, 'The service is unavailable. Try again shortly.', {
        retryable: true,
        headers: { 'Retry-After': '5' },
        cause,
      });
    }
    if (!decision.allowed) {
      logger.warn({ requestId: requestIdOf(res), retryAfterSeconds: decision.retryAfterSeconds }, 'rate limited');
      throw new ApiError('RATE_LIMITED', 429, 'Too many requests. Try again shortly.', {
        retryable: true,
        headers: { 'Retry-After': String(decision.retryAfterSeconds) },
      });
    }
    next();
  };
  return (req, res, next) => {
    handle(req, res, next).catch(next);
  };
}
