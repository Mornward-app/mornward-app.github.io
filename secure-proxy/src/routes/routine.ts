import express, { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../http/api-error.ts';
import { assignRequestId, requestIdOf } from '../http/request-id.ts';
import { requireUser } from '../middleware/auth.ts';
import { RoutineError } from '../routine-handler.ts';
import type { Routine, RoutineCall } from '../routine-handler.ts';

export const GENERATE_PATH = '/v1/routines/generate';
export const MAX_BODY = '10kb';

export interface RoutineRouterDeps {
  /** Verifies the bearer token and sets `req.user`. Must run first. */
  authenticate: RequestHandler;
  /** Per-user limiter. Needs `req.user`, so it runs second. */
  rateLimit: RequestHandler;
  /** The handler returned by `createRoutineHandler`. */
  generate: (call: RoutineCall) => Promise<Routine>;
}

// `.strict()` rejects any extra key. A client that sends `userId` gets a 400 instead of a silently ignored
// field that someone later mistakes for the identity in use.
const GenerateBodySchema = z.object({ input: z.string() }).strict();

/**
 * Express 4 never observes a rejected promise from an async handler, and Node terminates the process on an
 * unhandled rejection. This wrapper routes every rejection into next(err), where the terminal error
 * middleware turns it into a response.
 */
export function asyncRoute(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function requireJsonContentType(req: Request, _res: Response, next: NextFunction): void {
  // req.is() returns null when the request has no body, and false for another media type. Both are refused.
  if (req.is('application/json') !== 'application/json') {
    next(new ApiError('UNSUPPORTED_MEDIA_TYPE', 415, 'Send the request as application/json.'));
    return;
  }
  next();
}

interface BodyParserError {
  type?: unknown;
  status?: unknown;
  expose?: unknown;
}

/**
 * Converts body-parser failures into ApiError. The original message is dropped on purpose: for a parse
 * failure it quotes a fragment of the request body.
 */
function bridgeBodyParserErrors(err: unknown, _req: Request, _res: Response, next: NextFunction): void {
  if (typeof err !== 'object' || err === null || err instanceof ApiError) {
    next(err);
    return;
  }
  const { type, status, expose } = err as BodyParserError;
  switch (type) {
    case 'entity.too.large':
      next(new ApiError('PAYLOAD_TOO_LARGE', 413, 'The request body is too large.', { cause: err }));
      return;
    case 'encoding.unsupported':
    case 'charset.unsupported':
      next(new ApiError('UNSUPPORTED_MEDIA_TYPE', 415, 'Send the request as UTF-8 application/json.', { cause: err }));
      return;
    case 'entity.parse.failed':
    case 'entity.verify.failed':
    case 'request.aborted':
    case 'request.size.invalid':
    case 'stream.encoding.set':
      next(new ApiError('INVALID_INPUT', 400, 'The request could not be processed.', { cause: err }));
      return;
    default:
      if (expose === true && typeof status === 'number' && status >= 400 && status < 500) {
        next(new ApiError('INVALID_INPUT', 400, 'The request could not be processed.', { cause: err }));
        return;
      }
      next(err);
  }
}

function generateRoute(generate: RoutineRouterDeps['generate']): RequestHandler {
  return asyncRoute(async (req, res) => {
    const user = requireUser(req);

    const body = GenerateBodySchema.safeParse(req.body);
    if (!body.success) throw new RoutineError('INVALID_INPUT');

    // If the client disconnects before the response is written, stop paying for the upstream call.
    const controller = new AbortController();
    const onClose = (): void => {
      if (!res.writableFinished) controller.abort();
    };
    res.once('close', onClose);

    let routine: Routine;
    try {
      routine = await generate({
        userId: user.id,
        requestId: requestIdOf(res),
        rawUserInput: body.data.input,
        signal: controller.signal,
      });
    } finally {
      res.off('close', onClose);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ routine });
  });
}

/**
 * Order is the security design:
 *   authenticate -> rateLimit -> content type -> size-limited parse -> validate -> handler
 * An unauthenticated caller never reaches the parser, and a throttled caller never costs a parsed body.
 */
export function createRoutineRouter(deps: RoutineRouterDeps): Router {
  const router = Router();

  router.post(
    GENERATE_PATH,
    assignRequestId,
    deps.authenticate,
    deps.rateLimit,
    requireJsonContentType,
    express.json({ limit: MAX_BODY, strict: true, type: 'application/json' }),
    generateRoute(deps.generate),
  );

  // Registered after the route, so it only sees errors raised by the layers above.
  router.use(bridgeBodyParserErrors);
  return router;
}
