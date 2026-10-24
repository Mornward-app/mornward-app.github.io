import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { z } from 'zod';
import { ApiError, sendApiError } from '../http/api-error.ts';
import type { Logger } from '../http/logger.ts';
import { requestIdOf } from '../http/request-id.ts';

/* ------------------------------------------------------------------ */
/* Request typing                                                      */
/* ------------------------------------------------------------------ */

export interface AuthenticatedUser {
  /** The verified `sub` claim. The only user identity any downstream code may use. */
  readonly id: string;
}

declare global {
  // Express's own extension point. `user` is optional because it does not exist until this middleware has run.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Narrows `req.user` for handlers that run behind `authenticate`. Reaching the throw means a route was
 * mounted without the middleware, which is a server bug and therefore a 500, never a client error.
 */
export function requireUser(req: Request): AuthenticatedUser {
  if (req.user === undefined) {
    throw new ApiError('INTERNAL', 500, 'Something went wrong.');
  }
  return req.user;
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export interface AuthConfig {
  jwksUri: string;
  issuer: string;
  audience: string;
  clockToleranceSeconds: number;
}

const AuthEnvSchema = z.object({
  AUTH_JWKS_URI: z
    .string()
    .url()
    .refine((u) => new URL(u).protocol === 'https:', { message: 'must use https' }),
  AUTH_ISSUER: z.string().trim().min(1).max(512),
  AUTH_AUDIENCE: z.string().trim().min(1).max(512),
  AUTH_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(60).default(30),
});

/**
 * Validates configuration once at startup. The error names the offending variables and never their values,
 * so a misconfigured secret or URL cannot end up in a crash log.
 */
export function loadAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env): AuthConfig {
  const parsed = AuthEnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].sort().join(', ');
    throw new Error(`Invalid auth configuration: ${names}`);
  }
  return {
    jwksUri: parsed.data.AUTH_JWKS_URI,
    issuer: parsed.data.AUTH_ISSUER,
    audience: parsed.data.AUTH_AUDIENCE,
    clockToleranceSeconds: parsed.data.AUTH_CLOCK_TOLERANCE_SECONDS,
  };
}

/* ------------------------------------------------------------------ */
/* Signing keys                                                        */
/* ------------------------------------------------------------------ */

export type KeyFailureKind = 'unknown_kid' | 'unavailable';

/** Distinguishes "this token names a key we do not have" (the caller's fault) from "we could not ask" (ours). */
export class KeyLookupError extends Error {
  readonly kind: KeyFailureKind;
  constructor(kind: KeyFailureKind, cause?: unknown) {
    super(kind, cause === undefined ? undefined : { cause });
    this.name = 'KeyLookupError';
    this.kind = kind;
  }
}

/** Resolves a `kid` to a PEM public key, or throws KeyLookupError. */
export type SigningKeyProvider = (kid: string) => Promise<string>;

export interface JwksKeyProvider extends SigningKeyProvider {
  /** Loads the key set now so the first real request does not depend on the identity provider being reachable. */
  warm(): Promise<void>;
}

export interface JwksProviderOptions {
  jwksUri: string;
  /** How long a loaded key set is used without asking the identity provider again. */
  freshMs?: number;
  /** How long a key may keep being used after refreshes start failing. Bounds how long a revoked key can linger during an outage. */
  staleIfErrorMs?: number;
  now?: () => number;
}

/**
 * Caches the whole key set (one fetch fills every kid) and refreshes it:
 *   - when it is older than `freshMs`, or
 *   - when a token names a kid that is not in it (this is how key rotation is picked up).
 * Concurrent refreshes share one request, and fetches are capped at 10 per minute, so unknown-kid traffic
 * cannot turn this service into a request amplifier against the identity provider. A key already in the
 * set keeps verifying while that limit is exhausted.
 */
export function createJwksKeyProvider(options: JwksProviderOptions): JwksKeyProvider {
  const freshMs = options.freshMs ?? 10 * 60 * 1000;
  const staleIfErrorMs = options.staleIfErrorMs ?? 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  const client = jwksRsa({
    jwksUri: options.jwksUri,
    cache: false, // caching is done below, per key set, so one fetch serves every kid
    rateLimit: false, // jwks-rsa only limits getSigningKey(); getSigningKeys() is limited by `attempts` below
    timeout: 5_000,
  });

  const attempts: number[] = [];

  let keys = new Map<string, string>();
  let loadedAt = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    if (inFlight !== null) return inFlight;
    const t = now();
    while (attempts.length > 0 && t - (attempts[0] ?? t) >= 60_000) attempts.shift();
    if (attempts.length >= MAX_JWKS_FETCHES_PER_MINUTE) return Promise.reject(new Error('jwks refresh rate limited'));
    attempts.push(t);
    inFlight = (async () => {
      const signingKeys = await client.getSigningKeys();
      const next = new Map<string, string>();
      for (const key of signingKeys) {
        if (typeof key.kid === 'string' && key.kid.length > 0 && key.kid.length <= MAX_KID_CHARS) next.set(key.kid, key.getPublicKey());
      }
      keys = next; // replaced, not merged: a key removed upstream stops verifying at the next refresh
      loadedAt = now();
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const lookup: SigningKeyProvider = async (kid) => {
    const cached = keys.get(kid);
    if (cached !== undefined && now() - loadedAt < freshMs) return cached;
    try {
      await refresh();
    } catch (cause) {
      const stale = keys.get(kid);
      if (stale !== undefined && now() - loadedAt < staleIfErrorMs) return stale;
      throw new KeyLookupError('unavailable', cause);
    }
    const found = keys.get(kid);
    if (found === undefined) throw new KeyLookupError('unknown_kid');
    return found;
  };

  return Object.assign(lookup, {
    async warm(): Promise<void> {
      await refresh();
    },
  });
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

const MAX_TOKEN_CHARS = 4_096;
const MAX_KID_CHARS = 128;
const MAX_JWKS_FETCHES_PER_MINUTE = 10;
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const BEARER = /^Bearer ([^\s]+)$/i;

// Printable ASCII only. Rejects control characters, whitespace and non-ASCII before the id reaches a
// database parameter, a log line or a rate-limit key.
const SubjectSchema = z.string().min(1).max(128).regex(/^[\x21-\x7E]+$/);

export function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined || header.length > MAX_TOKEN_CHARS + 16) return null;
  const match = BEARER.exec(header);
  const token = match?.[1];
  if (token === undefined || token.length > MAX_TOKEN_CHARS || !COMPACT_JWS.test(token)) return null;
  return token;
}

type FailureReason =
  | 'missing_credentials'
  | 'malformed_token'
  | 'expired'
  | 'not_yet_valid'
  | 'bad_header'
  | 'unknown_kid'
  | 'invalid_claims'
  | 'invalid_token';

// jsonwebtoken's messages are fixed strings that may echo our own configuration but never token content.
// Mapping them to a closed set keeps attacker-controlled text out of the logs entirely.
function reasonFromError(err: unknown): FailureReason {
  if (err instanceof jwt.TokenExpiredError) return 'expired';
  if (err instanceof jwt.NotBeforeError) return 'not_yet_valid';
  if (err instanceof jwt.JsonWebTokenError) {
    if (err.message.startsWith('jwt malformed')) return 'malformed_token';
    if (err.message.startsWith('jwt audience invalid') || err.message.startsWith('jwt issuer invalid')) return 'invalid_claims';
  }
  return 'invalid_token';
}

class TokenRejected extends Error {
  readonly reason: FailureReason;
  constructor(reason: FailureReason) {
    super(reason);
    this.name = 'TokenRejected';
    this.reason = reason;
  }
}

/** Resolves to the verified subject, throws TokenRejected for a bad token or KeyLookupError for an unreachable IdP. */
function verifySubject(token: string, config: AuthConfig, getKey: SigningKeyProvider): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let keyFailure: KeyFailureKind | null = null;

    // jsonwebtoken wraps whatever this callback reports in a generic JsonWebTokenError, which would erase
    // the difference between a bad token and an unreachable key server. The cause is captured here instead.
    const keyResolver = (header: JwtHeader, callback: SigningKeyCallback): void => {
      const kid = header.kid;
      if (header.alg !== 'RS256' || typeof kid !== 'string' || kid.length === 0 || kid.length > MAX_KID_CHARS) {
        reject(new TokenRejected('bad_header'));
        callback(new Error('bad header'));
        return;
      }
      void (async () => {
        let pem: string;
        try {
          pem = await getKey(kid);
        } catch (cause) {
          keyFailure = cause instanceof KeyLookupError ? cause.kind : 'unavailable';
          callback(new Error('key lookup failed'));
          return;
        }
        callback(null, pem);
      })().catch(reject);
    };

    jwt.verify(
      token,
      keyResolver,
      {
        algorithms: ['RS256'],
        issuer: config.issuer,
        audience: config.audience,
        clockTolerance: config.clockToleranceSeconds,
      },
      (err, decoded) => {
        if (err) {
          if (keyFailure === 'unavailable') reject(new KeyLookupError('unavailable', err));
          else if (keyFailure === 'unknown_kid') reject(new TokenRejected('unknown_kid'));
          else reject(new TokenRejected(reasonFromError(err)));
          return;
        }
        if (decoded === undefined || typeof decoded === 'string') {
          reject(new TokenRejected('invalid_claims'));
          return;
        }
        // A token without `exp` never expires. jsonwebtoken allows that, so it is refused here.
        if (typeof decoded.exp !== 'number') {
          reject(new TokenRejected('invalid_claims'));
          return;
        }
        const subject = SubjectSchema.safeParse(decoded.sub);
        if (!subject.success) {
          reject(new TokenRejected('invalid_claims'));
          return;
        }
        resolve(subject.data);
      },
    );
  });
}

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

const UNAUTHENTICATED = (withError: boolean): ApiError =>
  new ApiError('UNAUTHENTICATED', 401, 'Authentication is required.', {
    headers: { 'WWW-Authenticate': withError ? 'Bearer realm="api", error="invalid_token"' : 'Bearer realm="api"' },
  });

const AUTH_UNAVAILABLE = (): ApiError =>
  new ApiError('AUTH_UNAVAILABLE', 503, 'The service is unavailable. Try again shortly.', {
    retryable: true,
    headers: { 'Retry-After': '5' },
  });

export interface AuthDeps {
  logger: Pick<Logger, 'warn' | 'error'>;
  /** Defaults to a cached, rate-limited jwks-rsa client for `config.jwksUri`. Injected in tests. */
  getSigningKey?: SigningKeyProvider;
}

/**
 * Verifies `Authorization: Bearer <RS256 JWT>`. On any failure the response is sent here and the request
 * never reaches the next handler. On success `req.user.id` is the verified `sub`.
 */
export function createAuthMiddleware(config: AuthConfig, deps: AuthDeps): RequestHandler {
  let getKey: SigningKeyProvider;
  if (deps.getSigningKey === undefined) {
    const provider = createJwksKeyProvider(config);
    // Fetching at construction means a cold instance is not at the mercy of unknown-kid traffic exhausting
    // the fetch limit before the first valid token arrives. A failure here is not fatal: lookups retry.
    provider.warm().catch(() => {
      deps.logger.warn({ reason: 'jwks_warmup_failed' }, 'could not preload signing keys');
    });
    getKey = provider;
  } else {
    getKey = deps.getSigningKey;
  }

  const handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = requestIdOf(res);
    const header = req.headers.authorization;
    if (header === undefined) {
      deps.logger.warn({ requestId, reason: 'missing_credentials' satisfies FailureReason }, 'authentication failed');
      sendApiError(res, UNAUTHENTICATED(false));
      return;
    }
    const token = extractBearerToken(header);
    if (token === null) {
      deps.logger.warn({ requestId, reason: 'malformed_token' satisfies FailureReason }, 'authentication failed');
      sendApiError(res, UNAUTHENTICATED(true));
      return;
    }

    let id: string;
    try {
      id = await verifySubject(token, config, getKey);
    } catch (err) {
      if (err instanceof KeyLookupError) {
        deps.logger.error({ requestId, reason: 'jwks_unavailable' }, 'signing keys unavailable');
        sendApiError(res, AUTH_UNAVAILABLE());
        return;
      }
      if (err instanceof TokenRejected) {
        deps.logger.warn({ requestId, reason: err.reason }, 'authentication failed');
        sendApiError(res, UNAUTHENTICATED(true));
        return;
      }
      throw err;
    }

    req.user = Object.freeze({ id });
    next();
  };

  return (req, res, next) => {
    // Express 4 does not observe a rejected promise from an async middleware, so every path ends in
    // next(err) or a response.
    handle(req, res, next).catch(next);
  };
}
