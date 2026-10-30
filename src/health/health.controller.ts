import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Response } from 'express';

type ReadinessBody = { status: 'ok' } | { status: 'unavailable' };

@Controller()
export class HealthController {
  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessBody> {
    // Readiness depends on Postgres reachability only.
    // Redis and other caches are deliberately not probed: their outage must
    // not flip /readyz to unavailable. No auth, no tenant data is touched.
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'unavailable' };
    }

    // Throwaway client per probe, never part of the app connection pool.
    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'unavailable' };
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  }
}
