import type { INestApplication } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { trustedOrigins } from './auth/csrf';

/**
 * The HTTP wiring shared by main.ts and the acceptance tests, so a test cannot
 * pass against a configuration the real server does not use.
 *
 * Order matters: the request-id middleware runs before Nest routing and before
 * the exception filter, so the id is already on the response when a filter has
 * to build an envelope.
 */
export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: trustedOrigins(),
    credentials: true,
  });
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('v1', { exclude: ['healthz', 'readyz'] });
  app.useGlobalFilters(new GlobalExceptionFilter());
}
