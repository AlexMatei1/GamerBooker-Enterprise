import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { QuotesService } from './quotes.service';
import type { CreateHoldInput, HoldResult, HoldRow } from './holds.types';
import type { QuoteItem } from './quotes.types';

/** Subset of a locked `products` row used while reserving a package. */
interface PackageProductRow {
  id: string;
  title: string;
  inventory_tracking: boolean;
  stock_on_hand: string | number;
  stock_reserved: string | number;
}

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
      package_id: row.package_id || null,
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

    const requestedResourceIds = quote.items
      .map((it: QuoteItem) => it.resource_id)
      .filter((id): id is string => Boolean(id));
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
           tenant_id, venue_id, customer_id, quote_id, package_id, idempotency_key,
           status, resource_ids, atomic_resource_ids, starts_at, ends_at, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          tenantId,
          quote.venue_id,
          customerId,
          quote.quote_id,
          quote.package_id || null,
          idempotencyKey || null,
          requestedResourceIds,
          atomicResourceIds,
          quote.starts_at,
          quote.ends_at,
          expiresAt,
        ],
      );
      const holdRow = holdRes.rows[0];

      // 9b. If package hold, atomically reserve package consumable products
      if (quote.package_id) {
        const pkgItemsRes = await client.query<{ product_id: string; quantity: number }>(
          'SELECT product_id, quantity FROM package_items WHERE package_id = $1 ORDER BY product_id ASC',
          [quote.package_id],
        );
        const prodIds = pkgItemsRes.rows.map((p) => p.product_id);
        if (prodIds.length > 0) {
          const prodsRes = await client.query<PackageProductRow>(
            'SELECT * FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
            [prodIds],
          );
          const prodsMap = new Map<string, PackageProductRow>(
            prodsRes.rows.map((p) => [p.id, p]),
          );

          for (const item of pkgItemsRes.rows) {
            const prod = prodsMap.get(item.product_id);
            if (!prod) {
              throw new AuthHttpError(
                HttpStatus.BAD_REQUEST,
                'PACKAGE_PRODUCT_NOT_FOUND',
                'Product in package not found.',
              );
            }
            if (prod.inventory_tracking) {
              const available = Number(prod.stock_on_hand) - Number(prod.stock_reserved);
              if (available < item.quantity) {
                throw new AuthHttpError(
                  HttpStatus.BAD_REQUEST,
                  'INSUFFICIENT_STOCK',
                  `Insufficient stock for package product '${prod.title}'. Available: ${available}, required: ${item.quantity}.`,
                );
              }

              await client.query(
                'UPDATE products SET stock_reserved = stock_reserved + $1, updated_at = now() WHERE id = $2',
                [item.quantity, item.product_id],
              );

              await client.query(
                `INSERT INTO stock_movements (
                   tenant_id, venue_id, product_id, movement_type, quantity_delta,
                   balance_after, actor_id, actor_role, reference, notes
                 ) VALUES ($1, $2, $3, 'RESERVATION_HOLD', $4, $5, $6, 'CUSTOMER', $7, 'Package hold reservation')`,
                [
                  tenantId,
                  quote.venue_id,
                  item.product_id,
                  item.quantity,
                  prod.stock_on_hand,
                  customerId,
                  holdRow.id,
                ],
              );
            }
          }
        }
      }

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
      } catch (err: unknown) {
        // PostgreSQL error code 23P01 is exclusion_violation
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23P01') {
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

      // If package hold, release reserved stock
      if (row.package_id) {
        const pkgItemsRes = await client.query<{ product_id: string; quantity: number }>(
          'SELECT product_id, quantity FROM package_items WHERE package_id = $1',
          [row.package_id],
        );
        for (const item of pkgItemsRes.rows) {
          const qty = Number(item.quantity);
          await client.query(
            'UPDATE products SET stock_reserved = GREATEST(0, stock_reserved - $1), updated_at = now() WHERE id = $2',
            [qty, item.product_id],
          );
          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             )
             SELECT p.tenant_id, p.venue_id, p.id, 'RESERVATION_RELEASE', $1, p.stock_on_hand, $2, 'CUSTOMER', $3, 'Package hold released'
               FROM products p WHERE p.id = $4`,
            [-qty, customerId || row.customer_id, holdId, item.product_id],
          );
        }
      }

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

      const expiredBatchRes = await client.query<{ id: string; tenant_id: string; package_id: string | null }>(`
        SELECT id, tenant_id, package_id FROM holds
         WHERE status = 'ACTIVE' AND expires_at <= now()
         FOR UPDATE SKIP LOCKED
      `);

      if (expiredBatchRes.rows.length === 0) {
        await client.query('COMMIT');
        return { expired_count: 0 };
      }

      const holdIds = expiredBatchRes.rows.map((r) => r.id);

      await client.query(
        `UPDATE holds SET status = 'EXPIRED', updated_at = now() WHERE id = ANY($1::uuid[])`,
        [holdIds],
      );

      await client.query(
        `UPDATE resource_claims SET state = 'RELEASED', updated_at = now() WHERE hold_id = ANY($1::uuid[])`,
        [holdIds],
      );

      // Release package items stock for expired holds
      for (const row of expiredBatchRes.rows) {
        if (row.package_id) {
          const pkgItemsRes = await client.query<{ product_id: string; quantity: number }>(
            'SELECT product_id, quantity FROM package_items WHERE package_id = $1',
            [row.package_id],
          );
          for (const item of pkgItemsRes.rows) {
            const qty = Number(item.quantity);
            await client.query(
              'UPDATE products SET stock_reserved = GREATEST(0, stock_reserved - $1), updated_at = now() WHERE id = $2',
              [qty, item.product_id],
            );
            await client.query(
              `INSERT INTO stock_movements (
                 tenant_id, venue_id, product_id, movement_type, quantity_delta,
                 balance_after, actor_id, actor_role, reference, notes
               )
               SELECT p.tenant_id, p.venue_id, p.id, 'RESERVATION_RELEASE', $1, p.stock_on_hand, NULL, 'SYSTEM', $2, 'Package hold expired'
                 FROM products p WHERE p.id = $3`,
              [-qty, row.id, item.product_id],
            );
          }
        }
      }

      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload)
         SELECT h.tenant_id, 'HOLD', h.id, 'HoldExpired', jsonb_build_object('hold_id', h.id)
           FROM holds h WHERE h.id = ANY($1::uuid[])`,
        [holdIds],
      );

      await client.query('COMMIT');
      return { expired_count: holdIds.length };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
