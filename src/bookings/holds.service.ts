import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { QuotesService } from './quotes.service';
import type { CreateHoldInput, HoldResult, HoldRow } from './holds.types';
import type { QuoteItem } from './quotes.types';

@Injectable()
export class HoldsService {
  constructor(private readonly quotesService: QuotesService) {}

  private mapHoldRow(row: HoldRow): HoldResult {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      venue_id: row.venue_id,
      customer_id: row.customer_id,
      quote_id: row.quote_id,
      idempotency_key: row.idempotency_key,
      status: row.status,
      resource_ids: row.resource_ids,
      atomic_resource_ids: row.atomic_resource_ids,
      starts_at: new Date(row.starts_at).toISOString(),
      ends_at: new Date(row.ends_at).toISOString(),
      expires_at: new Date(row.expires_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  async createHold(
    customerId: string,
    input: CreateHoldInput,
    idempotencyKey?: string | null,
  ): Promise<HoldResult> {
    const pool = getPool();

    // 1. Idempotency key check
    if (idempotencyKey) {
      const existing = await pool.query<HoldRow>(
        'SELECT * FROM holds WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      if (existing.rows.length > 0) {
        return this.mapHoldRow(existing.rows[0]);
      }
    }

    // 2. Fetch and verify quote
    const quote = await this.quotesService.getQuote(input.quote_id);
    if (!quote) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'QUOTE_NOT_FOUND',
        'Price quote not found',
      );
    }

    if (quote.customer_id !== customerId) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Quote does not belong to this customer',
      );
    }

    const verification = this.quotesService.verifyQuote(quote);
    if (!verification.valid) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        verification.reason || 'QUOTE_INVALID',
        'Price quote is invalid or expired',
      );
    }

    const requestedResourceIds = quote.items.map((it: QuoteItem) => it.resource_id);
    if (requestedResourceIds.length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_QUOTE_RESOURCES',
        'Price quote contains no resources',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 3. Defensive cleanup of expired holds and active claims
      await client.query(`
        UPDATE holds
           SET status = 'EXPIRED', updated_at = now()
         WHERE status = 'ACTIVE' AND expires_at <= now()
      `);
      await client.query(`
        UPDATE resource_claims
           SET state = 'RELEASED', updated_at = now()
         WHERE state = 'ACTIVE_HOLD'
           AND hold_id IN (SELECT id FROM holds WHERE status = 'EXPIRED')
      `);

      // 4. Validate venue publication status
      const venueRes = await client.query<{ tenant_id: string; publication_state: string }>(
        'SELECT tenant_id, publication_state FROM venues WHERE id = $1',
        [quote.venue_id],
      );
      if (venueRes.rows.length === 0 || venueRes.rows[0].publication_state !== 'PUBLISHED') {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'VENUE_NOT_FOUND',
          'Venue not found or not published',
        );
      }
      const tenantId = venueRes.rows[0].tenant_id;

      // 5. Load and validate requested resources
      const resResources = await client.query<{
        id: string;
        status: string;
        bookable: boolean;
        type: string;
      }>(
        'SELECT id, status, bookable, type FROM resources WHERE id = ANY($1::uuid[]) AND venue_id = $2',
        [requestedResourceIds, quote.venue_id],
      );

      if (resResources.rows.length !== requestedResourceIds.length) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'RESOURCE_NOT_FOUND',
          'One or more requested resources do not exist in this venue',
        );
      }

      for (const r of resResources.rows) {
        if (!r.bookable || r.status === 'MAINTENANCE' || r.status === 'TEMP_BLOCKED') {
          throw new AuthHttpError(
            HttpStatus.CONFLICT,
            'RESOURCE_UNAVAILABLE',
            `Resource ${r.id} is currently under maintenance or not bookable`,
          );
        }
      }

      // 6. Expand atomic component closure (Private room includes room itself + all child PCs)
      const componentsRes = await client.query<{
        parent_resource_id: string;
        child_resource_id: string;
      }>(
        'SELECT parent_resource_id, child_resource_id FROM resource_components WHERE venue_id = $1',
        [quote.venue_id],
      );

      const childrenByParent = new Map<string, string[]>();
      for (const c of componentsRes.rows) {
        const list = childrenByParent.get(c.parent_resource_id) || [];
        list.push(c.child_resource_id);
        childrenByParent.set(c.parent_resource_id, list);
      }

      const atomicResourceSet = new Set<string>();
      for (const id of requestedResourceIds) {
        atomicResourceSet.add(id);
        const children = childrenByParent.get(id);
        if (children) {
          for (const ch of children) {
            atomicResourceSet.add(ch);
          }
        }
      }
      const atomicResourceIds = Array.from(atomicResourceSet).sort();

      // 7. Lock rows in sorted order to prevent deadlocks
      await client.query(
        'SELECT id FROM resources WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [atomicResourceIds],
      );

      // 8. Determine hold expiration (15 minutes or quote expiry, whichever is sooner)
      const holdExpiryMs = Math.min(
        Date.now() + 15 * 60 * 1000,
        new Date(quote.expires_at).getTime(),
      );
      const expiresAt = new Date(holdExpiryMs);

      // 9. Insert hold record
      const holdRes = await client.query<HoldRow>(
        `INSERT INTO holds (
           tenant_id, venue_id, customer_id, quote_id, idempotency_key,
           status, resource_ids, atomic_resource_ids, starts_at, ends_at, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tenantId,
          quote.venue_id,
          customerId,
          quote.quote_id,
          idempotencyKey || null,
          requestedResourceIds,
          atomicResourceIds,
          quote.starts_at,
          quote.ends_at,
          expiresAt,
        ],
      );
      const holdRow = holdRes.rows[0];

      // 10. Insert claims per atomic resource (protected by GiST exclusion constraint)
      try {
        for (const resId of atomicResourceIds) {
          await client.query(
            `INSERT INTO resource_claims (
               resource_id, tenant_id, holder_id, hold_id, claim_type, state, slot
             )
             VALUES ($1, $2, $3, $4, 'HOLD', 'ACTIVE_HOLD', tstzrange($5::timestamptz, $6::timestamptz, '[)'))`,
            [
              resId,
              tenantId,
              customerId,
              holdRow.id,
              quote.starts_at,
              quote.ends_at,
            ],
          );
        }
      } catch (err: any) {
        // PostgreSQL error code 23P01 is exclusion_violation
        if (err && err.code === '23P01') {
          throw new AuthHttpError(
            HttpStatus.CONFLICT,
            'RESOURCE_UNAVAILABLE',
            'One or more requested resources are already booked or held for this interval',
          );
        }
        throw err;
      }

      // 11. Transactional outbox event
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'HOLD', $2, 'HoldCreated', $3)`,
        [
          tenantId,
          holdRow.id,
          JSON.stringify({
            hold_id: holdRow.id,
            venue_id: quote.venue_id,
            customer_id: customerId,
            resource_ids: requestedResourceIds,
            atomic_resource_ids: atomicResourceIds,
            starts_at: quote.starts_at,
            ends_at: quote.ends_at,
            expires_at: expiresAt.toISOString(),
          }),
        ],
      );

      await client.query('COMMIT');
      return this.mapHoldRow(holdRow);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getHoldById(holdId: string, customerId?: string): Promise<HoldResult> {
    const pool = getPool();
    const res = await pool.query<HoldRow>(
      'SELECT * FROM holds WHERE id = $1',
      [holdId],
    );

    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'HOLD_NOT_FOUND',
        'Hold not found',
      );
    }

    const row = res.rows[0];
    if (customerId && row.customer_id !== customerId) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Hold belongs to another customer',
      );
    }

    // Dynamic expiry reflection
    if (row.status === 'ACTIVE' && new Date(row.expires_at).getTime() <= Date.now()) {
      row.status = 'EXPIRED';
    }

    return this.mapHoldRow(row);
  }

  async releaseHold(holdId: string, customerId?: string): Promise<HoldResult> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const res = await client.query<HoldRow>(
        'SELECT * FROM holds WHERE id = $1 FOR UPDATE',
        [holdId],
      );

      if (res.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'HOLD_NOT_FOUND',
          'Hold not found',
        );
      }

      const row = res.rows[0];
      if (customerId && row.customer_id !== customerId) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'Hold belongs to another customer',
        );
      }

      // If already released or expired, idempotent return
      if (row.status !== 'ACTIVE') {
        await client.query('COMMIT');
        return this.mapHoldRow(row);
      }

      // Transition to RELEASED and free claims
      const updatedRes = await client.query<HoldRow>(
        `UPDATE holds
            SET status = 'RELEASED', updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [holdId],
      );

      await client.query(
        `UPDATE resource_claims
            SET state = 'RELEASED', updated_at = now()
          WHERE hold_id = $1`,
        [holdId],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ($1, 'HOLD', $2, 'HoldReleased', $3)`,
        [
          row.tenant_id,
          holdId,
          JSON.stringify({ hold_id: holdId, released_at: new Date().toISOString() }),
        ],
      );

      await client.query('COMMIT');
      return this.mapHoldRow(updatedRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async cleanupExpiredHolds(): Promise<{ expired_count: number }> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const res = await client.query<{ id: string; tenant_id: string }>(`
        WITH expired_batch AS (
          SELECT id, tenant_id FROM holds
           WHERE status = 'ACTIVE' AND expires_at <= now()
           FOR UPDATE SKIP LOCKED
        ),
        updated_holds AS (
          UPDATE holds h
             SET status = 'EXPIRED', updated_at = now()
            FROM expired_batch eb
           WHERE h.id = eb.id
          RETURNING h.id, h.tenant_id
        ),
        updated_claims AS (
          UPDATE resource_claims rc
             SET state = 'RELEASED', updated_at = now()
            FROM updated_holds uh
           WHERE rc.hold_id = uh.id
        )
        INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
        SELECT uh.tenant_id, 'HOLD', uh.id, 'HoldExpired', jsonb_build_object('hold_id', uh.id)
          FROM updated_holds uh
        RETURNING aggregate_id;
      `);

      await client.query('COMMIT');
      return { expired_count: res.rowCount || 0 };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
