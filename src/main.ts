import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  // Stripe signs the exact bytes it sent. Without raw-body capture Nest re-parses
  // the JSON, so even a genuine signature could never match. The webhook handler
  // verifies req.rawBody and refuses to fall back to a re-serialisation.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.enableShutdownHooks();

  // Request id, /v1 prefix and the global error envelope. Shared with the
  // acceptance tests so both run the same wiring (see app.setup.ts).
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GamerBooker Enterprise API')
    .setDescription('Enterprise Gaming Center Booking, F&B Orders, and Floor Layout Platform API')
    .setVersion('1.0.0')
    .addCookieAuth('session')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
  SwaggerModule.setup('api-docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    // Fail fast: a NaN port would surface as an opaque listen() error.
    throw new Error(`PORT must be an integer between 1 and 65535, got "${process.env.PORT}"`);
  }
  const development = process.env.NODE_ENV === 'development';
  const host = process.env.API_HOST ?? (development ? '127.0.0.1' : '0.0.0.0');
  if (development && !['127.0.0.1','::1'].includes(host)) {
    throw new Error('Development verification endpoints require a loopback API_HOST.');
  }
  await app.listen(port,host);
}

void bootstrap();
