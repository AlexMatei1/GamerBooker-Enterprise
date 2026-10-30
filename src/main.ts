import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './common/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableShutdownHooks();

  // Correlation id for every request: honored or minted, echoed as
  // X-Request-Id, and exposed to handlers via getRequestId(). Registered on
  // the underlying Express instance so it runs before Nest routes, filters
  // and exception handling. There is deliberately no global /v1 prefix.
  app.use(requestIdMiddleware);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
