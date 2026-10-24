import type { NextFunction, Request, Response } from 'express';

import type { Logger } from './logger.ts';

export interface ApiErrorOptions {
  retryable?: boolean;
  cause?: unknown;
  /** Extra response headers, e.g. Retry-After or WWW-Authenticate. Values must not contain user data. */
  headers?: Readonly<Record<string, string>>;
}

/**
 * The only error type allowed to carry a response to a client. Its `message` is the code, so nothing user-,
 * model- or database-derived can reach a log line through it. `publicMessage` is fixed text.
 */
export class ApiError<C extends string = string> extends Error {
  readonly code: C;
  readonly httpStatus: number;
  readonly publicMessage: string;
  readonly retryable: boolean;
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: C, httpStatus: number, publicMessage: string, options: ApiErrorOptions = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.publicMessage = publicMessage;
    this.retryable = options.retryable ?? false;
    this.headers = options.headers ?? {};
  }
}

export interface ErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

export function sendApiError(res: Response, err: ApiError): void {
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(err.headers)) res.setHeader(name, value);
  res.status(err.httpStatus).json(errorBody(err.code, err.publicMessage, err.retryable));
}

export function errorBody(code: string, message: string, retryable: boolean): ErrorBody {
  return { error: { code, message, retryable } };
}

function errorName(e: unknown): string {
  return e instanceof Error ? e.constructor.name : typeof e;
}

/**
 * Terminal Express error middleware. Register it last. It is the single place where an error becomes a
 * response, and it only ever emits fixed text.
 */
export function apiErrorMiddleware(logger: Pick<Logger, 'error'>) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof ApiError) {
      sendApiError(res, err);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    logger.error({ errorName: errorName(err), method: req.method }, 'unhandled error');
    res.status(500).json(errorBody('INTERNAL', 'Something went wrong.', false));
  };
}
