import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { QuotesService } from './quotes.service';
import { PoliciesService } from './policies.service';
import { validateTimezoneSlot } from './timezone.validator';
import type {
  CreatePackageInput,
  UpdatePackageInput,
  PackageDetail,
  PackageItemDetail,
  PackageQuoteInput,
} from './packages.types';
import type { PriceQuote, QuoteItem } from './quotes.types';

interface PackageRow {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  description: string | null;
  resource_type: string;
  duration_minutes: number | string;
  fixed_price_minor: number | string;
  currency: string;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

interface PackageItemJoinRow {
  id: string;
  product_id: string;
  quantity: number | string;
  allocated_price_minor: number | string | null;
  product_title: string;
  price_minor: number | string | null;
  tax_category: string | null;
  age_verification_required: boolean | null;
  stock_on_hand: number | string | null;
  stock_reserved: number | string | null;
  inventory_tracking: boolean | null;
}

interface PackageResourceRow {
  id: string;
  name: string;
  type: string;
  bookable: boolean;
  status: string;
}

@Injectable()
export class PackagesService {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly policiesService: PoliciesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Package Management (Staff / Dashboard)
  // ---------------------------------------------------------------------------

  async createPackage(
    venueId: string,
    staffId: string,
    staffRole: string,
    input: CreatePackageInput,
    requestId?: string,
  ): Promise<PackageDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input.name || input.name.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_PACKAGE_NAME',
        'Package name is required.',
      );
    }

    if (!input.resource_type || input.resource_type.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_RESOURCE_TYPE',
        'Resource type is required.',
      );
    }

    const duration = Math.floor(Number(input.duration_minutes));
    if (isNaN(duration) || duration <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PACKAGE_DURATION',
        'Package duration must be a positive integer in minutes.',
      );
    }

    const priceMinor = Math.floor(Number(input.fixed_price_minor));
    if (isNaN(priceMinor) || priceMinor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PACKAGE_PRICE',
        'Package price must be a positive integer in minor units.',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const vRes = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (vRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
      }
      const tenantId = vRes.rows[0].tenant_id;

      // Validate products if items provided
      if (input.items && input.items.length > 0) {
        for (const item of input.items) {
          const pRes = await client.query(
            'SELECT id FROM products WHERE id = $1 AND venue_id = $2',
            [item.product_id, venueId],
          );
          if (pRes.rows.length === 0) {
            throw new AuthHttpError(
              HttpStatus.BAD_REQUEST,
              'INVALID_PACKAGE_PRODUCT',
              `Product '${item.product_id}' does not belong to this venue.`,
            );
          }
          if (item.quantity <= 0) {
            throw new AuthHttpError(
              HttpStatus.BAD_REQUEST,
              'INVALID_ITEM_QUANTITY',
              'Package item quantity must be at least 1.',
            );
          }
        }
      }

      const pkgRes = await client.query<PackageRow>(
        `INSERT INTO packages (
           tenant_id, venue_id, name, description, resource_type,
           duration_minutes, fixed_price_minor, currency, active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          tenantId,
          venueId,
          input.name.trim(),
          input.description?.trim() || null,
          input.resource_type.trim().toUpperCase(),
          duration,
          priceMinor,
          input.currency || 'RON',
          input.active !== false,
        ],
      );
      const pkg = pkgRes.rows[0];

      if (input.items && input.items.length > 0) {
        for (const item of input.items) {
          await client.query(
            `INSERT INTO package_items (
               package_id, product_id, quantity, allocated_price_minor
             ) VALUES ($1, $2, $3, $4)`,
            [
              pkg.id,
              item.product_id,
              item.quantity,
              Math.max(0, Math.floor(Number(item.allocated_price_minor || 0))),
            ],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'PACKAGE_CREATED', 'PACKAGE', $6, $7)`,
        [
          tenantId,
          venueId,
          reqId,
          staffId,
          staffRole,
          pkg.id,
          JSON.stringify({ name: pkg.name, price_minor: priceMinor }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'PACKAGE', $2, 'PackageCreated', $3)`,
        [tenantId, pkg.id, JSON.stringify({ package_id: pkg.id, name: pkg.name })],
      );

      await client.query('COMMIT');
      return this.getPackageById(venueId, pkg.id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getPackageById(
    venueId: string,
    packageId: string,
    onlyActive?: boolean,
  ): Promise<PackageDetail> {
    const pool = getPool();
    const query = onlyActive
      ? 'SELECT * FROM packages WHERE id = $1 AND venue_id = $2 AND active = true'
      : 'SELECT * FROM packages WHERE id = $1 AND venue_id = $2';

    const res = await pool.query<PackageRow>(query, [packageId, venueId]);
    if (res.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'PACKAGE_NOT_FOUND', 'Package not found.');
    }
    const pkg = res.rows[0];

    const itemsRes = await pool.query<PackageItemJoinRow>(
      `SELECT pi.*, p.title as product_title, p.price_minor, p.tax_category,
              p.age_verification_required, p.stock_on_hand, p.stock_reserved, p.inventory_tracking
         FROM package_items pi
         JOIN products p ON p.id = pi.product_id
        WHERE pi.package_id = $1
        ORDER BY pi.created_at ASC`,
      [packageId],
    );

    const items: PackageItemDetail[] = itemsRes.rows.map((r) => {
      const onHand = Number(r.stock_on_hand || 0);
      const reserved = Number(r.stock_reserved || 0);
      const available = r.inventory_tracking ? Math.max(0, onHand - reserved) : 999;
      return {
        id: r.id,
        product_id: r.product_id,
        product_title: r.product_title,
        quantity: Number(r.quantity),
        allocated_price_minor: Number(r.allocated_price_minor || 0),
        price_minor: Number(r.price_minor || 0),
        tax_category: r.tax_category || 'STANDARD',
        age_verification_required: Boolean(r.age_verification_required),
        stock_available: available,
      };
    });

    return {
      id: pkg.id,
      tenant_id: pkg.tenant_id,
      venue_id: pkg.venue_id,
      name: pkg.name,
      description: pkg.description || null,
      resource_type: pkg.resource_type,
      duration_minutes: Number(pkg.duration_minutes),
      fixed_price_minor: Number(pkg.fixed_price_minor),
      currency: pkg.currency || 'RON',
      active: Boolean(pkg.active),
      items,
      created_at: new Date(pkg.created_at).toISOString(),
      updated_at: new Date(pkg.updated_at).toISOString(),
    };
  }

  async listPackages(venueId: string, onlyActive?: boolean): Promise<PackageDetail[]> {
    const pool = getPool();
    const query = onlyActive
      ? 'SELECT id FROM packages WHERE venue_id = $1 AND active = true ORDER BY name ASC'
      : 'SELECT id FROM packages WHERE venue_id = $1 ORDER BY name ASC';

    const res = await pool.query<{ id: string }>(query, [venueId]);
    const packages: PackageDetail[] = [];
    for (const row of res.rows) {
      packages.push(await this.getPackageById(venueId, row.id, onlyActive));
    }
    return packages;
  }

  async updatePackage(
    venueId: string,
    packageId: string,
    staffId: string,
    staffRole: string,
    input: UpdatePackageInput,
    requestId?: string,
  ): Promise<PackageDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const pkgRes = await client.query<PackageRow>(
        'SELECT * FROM packages WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [packageId, venueId],
      );
      if (pkgRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'PACKAGE_NOT_FOUND', 'Package not found.');
      }
      const existing = pkgRes.rows[0];

      const name = input.name !== undefined ? input.name.trim() : existing.name;
      const description = input.description !== undefined ? input.description.trim() || null : existing.description;
      const resourceType = input.resource_type !== undefined ? input.resource_type.trim().toUpperCase() : existing.resource_type;
      const duration = input.duration_minutes !== undefined ? Math.floor(Number(input.duration_minutes)) : existing.duration_minutes;
      const priceMinor = input.fixed_price_minor !== undefined ? Math.floor(Number(input.fixed_price_minor)) : existing.fixed_price_minor;
      const active = input.active !== undefined ? Boolean(input.active) : existing.active;

      await client.query(
        `UPDATE packages
            SET name = $1, description = $2, resource_type = $3,
                duration_minutes = $4, fixed_price_minor = $5, active = $6, updated_at = now()
          WHERE id = $7`,
        [name, description, resourceType, duration, priceMinor, active, packageId],
      );

      if (input.items !== undefined) {
        await client.query('DELETE FROM package_items WHERE package_id = $1', [packageId]);
        for (const item of input.items) {
          await client.query(
            `INSERT INTO package_items (
               package_id, product_id, quantity, allocated_price_minor
             ) VALUES ($1, $2, $3, $4)`,
            [
              packageId,
              item.product_id,
              item.quantity,
              Math.max(0, Math.floor(Number(item.allocated_price_minor || 0))),
            ],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'PACKAGE_UPDATED', 'PACKAGE', $6, $7)`,
        [
          existing.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          packageId,
          JSON.stringify({ name, price_minor: priceMinor, active }),
        ],
      );

      await client.query('COMMIT');
      return this.getPackageById(venueId, packageId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async deletePackage(
    venueId: string,
    packageId: string,
    _staffId: string,
    _staffRole: string,
  ): Promise<{ success: boolean }> {
    const pool = getPool();

    // Check future active bookings/holds
    const activeCheck = await pool.query<{ count: string }>(
      `SELECT count(*) as count
         FROM bookings
        WHERE package_id = $1 AND status IN ('CONFIRMED', 'CHECKED_IN') AND ends_at > now()`,
      [packageId],
    );
    if (parseInt(activeCheck.rows[0]?.count || '0', 10) > 0) {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'PACKAGE_HAS_ACTIVE_BOOKINGS',
        'Cannot delete package with future confirmed bookings.',
      );
    }

    const delRes = await pool.query(
      'DELETE FROM packages WHERE id = $1 AND venue_id = $2 RETURNING id',
      [packageId, venueId],
    );
    if (delRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'PACKAGE_NOT_FOUND', 'Package not found.');
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Atomic Availability & Stock Validation on Package Quotes
  // ---------------------------------------------------------------------------

  async createPackageQuote(
    venueId: string,
    customerId: string,
    input: PackageQuoteInput,
  ): Promise<PriceQuote> {
    const pool = getPool();
    const pkg = await this.getPackageById(venueId, input.package_id, true);

    const start = new Date(input.starts_at);
    if (isNaN(start.getTime())) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'QUOTE_INVALID_INTERVAL',
        'starts_at must be a valid ISO-8601 timestamp.',
      );
    }

    const endsAtMs = start.getTime() + pkg.duration_minutes * 60 * 1000;
    const end = new Date(endsAtMs);

    const vRes = await pool.query<{ timezone?: string }>('SELECT timezone FROM venues WHERE id = $1', [venueId]);
    const venueTz = vRes.rows[0]?.timezone || 'Europe/Bucharest';
    validateTimezoneSlot(input.starts_at, venueTz);
    validateTimezoneSlot(end.toISOString(), venueTz);

    // 1. Validate resource
    const resRes = await pool.query<PackageResourceRow>(
      'SELECT * FROM resources WHERE id = $1 AND venue_id = $2',
      [input.resource_id, venueId],
    );
    if (resRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Resource not found.');
    }
    const resource = resRes.rows[0];

    if (!resource.bookable || resource.status === 'MAINTENANCE' || resource.status === 'TEMP_BLOCKED') {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'RESOURCE_UNAVAILABLE',
        `Resource '${resource.name}' is not bookable or under maintenance.`,
      );
    }

    if (resource.type !== pkg.resource_type) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_RESOURCE_FOR_PACKAGE',
        `Resource type '${resource.type}' does not match package required type '${pkg.resource_type}'.`,
      );
    }

    // 2. Validate calendar availability (claims + maintenance)
    const claimRes = await pool.query<{ id: string }>(
      `SELECT id FROM resource_claims
        WHERE resource_id = $1
          AND state IN ('ACTIVE_HOLD', 'CONFIRMED')
          AND slot && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [input.resource_id, start.toISOString(), end.toISOString()],
    );
    if (claimRes.rows.length > 0) {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'RESOURCE_UNAVAILABLE',
        'Resource is already booked or held for this time window.',
      );
    }

    // 3. Atomic stock check for all included consumable products
    for (const item of pkg.items) {
      if (item.stock_available < item.quantity) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'PACKAGE_PRODUCT_OUT_OF_STOCK',
          `Product '${item.product_title}' included in package has insufficient stock (${item.stock_available} available, ${item.quantity} required).`,
        );
      }
    }

    // 4. Resolve effective policy for financial deposit
    const effectivePolicy = await this.policiesService.resolveEffectivePolicy(
      venueId,
      input.resource_id,
    );
    const policySnapshot = this.policiesService.createSnapshot(effectivePolicy);

    const totalMinor = pkg.fixed_price_minor;
    let dueNowMinor = totalMinor;

    if (effectivePolicy.settings.prepaid_mode === 'DEPOSIT') {
      const pct = effectivePolicy.settings.deposit_percentage || 40;
      dueNowMinor = Math.round((totalMinor * pct) / 100);
    }
    const balanceMinor = totalMinor - dueNowMinor;

    // 5. Construct items snapshot
    // Line 1: Workstation time slice
    const totalConsumableAllocated = pkg.items.reduce(
      (sum, i) => sum + i.allocated_price_minor,
      0,
    );
    const resourceAllocatedMinor = Math.max(0, totalMinor - totalConsumableAllocated);

    const items: QuoteItem[] = [
      {
        resource_id: resource.id,
        resource_name: resource.name,
        resource_type: resource.type,
        amount_minor: resourceAllocatedMinor,
        hourly_rate_minor: Math.round((resourceAllocatedMinor * 60) / pkg.duration_minutes),
      },
    ];

    // Consumable product items
    for (const item of pkg.items) {
      items.push({
        product_id: item.product_id,
        product_title: item.product_title,
        quantity: item.quantity,
        amount_minor: item.allocated_price_minor,
        tax_category: item.tax_category,
        age_verification_required: item.age_verification_required,
      });
    }

    // 6. Signature & Expiry
    const quoteId = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const canonical = this.quotesService.computeCanonicalString(
      quoteId,
      totalMinor,
      dueNowMinor,
      expiresAt,
    );
    const signature = this.quotesService.signCanonical(canonical);

    await pool.query(
      `INSERT INTO price_quotes
        (id, venue_id, customer_id, package_id, starts_at, ends_at, items_snapshot, policy_snapshot,
         total_minor, due_now_minor, balance_minor, currency, signature, expires_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11, 'RON', $12, $13::timestamptz)`,
      [
        quoteId,
        venueId,
        customerId,
        pkg.id,
        start.toISOString(),
        end.toISOString(),
        JSON.stringify(items),
        JSON.stringify(policySnapshot),
        totalMinor,
        dueNowMinor,
        balanceMinor,
        signature,
        expiresAt,
      ],
    );

    return {
      quote_id: quoteId,
      venue_id: venueId,
      customer_id: customerId,
      package_id: pkg.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      currency: 'RON',
      total_minor: totalMinor,
      due_now_minor: dueNowMinor,
      balance_minor: balanceMinor,
      policy: policySnapshot,
      items,
      signature,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };
  }
}
