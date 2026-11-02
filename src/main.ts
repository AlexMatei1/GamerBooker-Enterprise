import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
  await app.listen(port);
}

void bootstrap();
