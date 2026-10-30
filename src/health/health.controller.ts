import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import { connect } from 'node:net';
import type { Response } from 'express';
import { buildError, type ErrorEnvelope } from '../common/error-envelope';
import { getRequestId } from '../common/request-context';

const READY_MESSAGE = 'Database is not reachable.';
const PROBE_TIMEOUT_MS = 1500;

/**
 * Liveness and readiness.
 *
 * Liveness (`/healthz`) reports only that the process is serving requests.
 *
 * Readiness (`/readyz`) depends on Postgres reachability ONLY. Redis is cache
 * and rate-limit storage, never booking or balance truth (ADR-002), so a Redis
 * outage must not flip this endpoint or remove an instance from rotation.
 *
 * The check is a TCP reachability probe against the host and port in
 * DATABASE_URL. It deliberately does not use an ORM client:
 *  - no per-probe client allocation, so no connection-pool growth under load;
 *  - no dependency on Prisma client generation, which cannot succeed until the
 *    first domain model exists and would otherwise pin this endpoint to 503;
 *  - no credential handling here, so a driver error can never echo the DSN.
 *
 * Limitation, tracked for ENG-003: TCP reachability proves the listener
 * accepts connections, not that this role may execute a query. Once the first
 * real model lands, this must become a query-level probe.
 *
 * Neither endpoint authenticates or touches tenant data.
 */
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'ok' } | ErrorEnvelope<'READY_DB_UNAVAILABLE'>> {
    const target = parseDatabaseTarget(process.env.DATABASE_URL);

    if (!target) {
      // Missing or malformed configuration fails closed: an instance that
      // cannot locate its database must never be reported ready.
      this.logger.warn('readiness probe: DATABASE_URL is missing or malformed');
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return buildError(
        'READY_DB_UNAVAILABLE',
        READY_MESSAGE,
        getRequestId() ?? '',
        { retryable: true },
      );
    }

    if (!(await probeTcp(target.host, target.port))) {
      // Fixed category only. The DSN and any driver detail stay out of both
      // the response and the log.
      this.logger.error('readiness probe: database unreachable', {
        category: 'tcp_unreachable',
      });
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return buildError(
        'READY_DB_UNAVAILABLE',
        READY_MESSAGE,
        getRequestId() ?? '',
        { retryable: true },
      );
    }

    return { status: 'ok' };
  }
}

/** Extracts host and port from a postgres:// DSN, or undefined if unusable. */
export function parseDatabaseTarget(
  raw: string | undefined,
): { host: string; port: number } | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      return undefined;
    }
    if (!url.hostname) {
      return undefined;
    }
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return undefined;
    }
    return { host: url.hostname, port };
  } catch {
    return undefined;
  }
}

function probeTcp(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port });
    let settled = false;

    const finish = (reachable: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
