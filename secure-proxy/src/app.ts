import express from 'express';
import type { Express } from 'express';
import { ApiError, apiErrorMiddleware } from './http/api-error.ts';
import type { Logger } from './http/logger.ts';
import { assignRequestId } from './http/request-id.ts';
import { createRoutineRouter } from './routes/routine.ts';
import type { RoutineRouterDeps } from './routes/routine.ts';

export interface AppDeps extends RoutineRouterDeps {
  logger: Logger;
}

/**
 * No global body parser: parsing is mounted per route, behind authentication and the rate limiter.
 * Registration order matters: request id, routes, 404, then the single terminal error handler.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');

  app.use(assignRequestId);
  app.use(createRoutineRouter(deps));
  app.use((_req, _res, next) => {
    next(new ApiError('NOT_FOUND', 404, 'Not found.'));
  });
  app.use(apiErrorMiddleware(deps.logger));
  return app;
}
