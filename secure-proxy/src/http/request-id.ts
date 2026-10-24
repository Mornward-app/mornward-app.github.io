import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const KEY = 'requestId';

/**
 * Always server-generated. A client-supplied id is never trusted: it would let a caller forge or
 * collide log correlation ids. Idempotent, so it is safe to mount at both the app and the router.
 */
export function assignRequestId(_req: Request, res: Response, next: NextFunction): void {
  if (typeof res.locals[KEY] !== 'string') {
    const id = randomUUID();
    res.locals[KEY] = id;
    res.setHeader('X-Request-Id', id);
  }
  next();
}

export function requestIdOf(res: Response): string {
  const id: unknown = res.locals[KEY];
  return typeof id === 'string' ? id : 'unassigned';
}
