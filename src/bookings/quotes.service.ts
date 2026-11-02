import { HttpStatus, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { PoliciesService } from './policies.service';
import { PricingService } from './pricing.service';
import { validateBookingInterval } from './policy.validator';
import { validateTimezoneSlot } from './timezone.validator';
import type {
  CreateQuoteInput,
  PriceQuote,
  QuoteItem,
} from './quotes.types';
import type { PolicySnapshot } from './policy.types';

export const DEFAULT_QUOTE_SECRET = 'gamerbooker-quote-signature-key-0123456789abcdef';

export interface PriceQuoteRow {
  id: string;
  venue_id: string;
  customer_id: string;
  package_id?: string | null;
  starts_at: Date;
  ends_at: Date;
  items_snapshot: QuoteItem[];
  policy_snapshot: PolicySnapshot;
  total_minor: string;
  due_now_minor: string;
  balance_minor: string;
  currency: string;
  signature: string;
  expires_at: Date;
  created_at: Date;
}

@Injectable()
export class QuotesService {
  private readonly secret: string;

  constructor(
    private readonly pricingService: PricingService,
    private readonly policiesService: PoliciesService,
  ) {
    this.secret = process.env.QUOTE_SECRET || DEFAULT_QUOTE_SECRET;
  }

  signCanonical(canonical: string): string {
    return createHmac('sha256', this.secret).update(canonical).digest('hex');
  }

  computeCanonicalString(
    quoteId: string,
    totalMinor: number,
    dueNowMinor: number,
    expiresAt: string,
  ): string {
    return `${quoteId}:${totalMinor}:${dueNowMinor}:${expiresAt}`;
  }

  async createQuote(
    venueId: string,
    customerId: string,
    input: CreateQuoteInput,
  ): Promise<PriceQuote> {
    const start = new Date(input.starts_at);
    const end = new Date(input.ends_at);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'QUOTE_INVALID_INTERVAL',
        'starts_at and ends_at must be valid ISO-8601 timestamps.',
      );
    }

    if (start >= end) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'QUOTE_INVALID_INTERVAL',
        'starts_at must be strictly before ends_at.',
      );
    }

    if (!input.resource_ids || input.resource_ids.length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'QUOTE_MISSING_RESOURCES',
        'At least one resource_id must be provided.',
      );
    }

    const pool = getPool();

    // 1. Check venue existence
    const venueCheck = await pool.query<{ id: string; publication_state: string; timezone?: string }>(
      'SELECT id, publication_state, timezone FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueCheck.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Venue not found.');
    }

    const venueTz = venueCheck.rows[0].timezone || 'Europe/Bucharest';
    validateTimezoneSlot(input.starts_at, venueTz);
    validateTimezoneSlot(input.ends_at, venueTz);

    // 2. Resolve Effective Policy and validate booking duration
    const effectivePolicy = await this.policiesService.resolveEffectivePolicy(
      venueId,
      input.resource_ids[0],
    );
    validateBookingInterval(start, end, effectivePolicy.settings);

    // 3. Load requested resources
    const resourcesRes = await pool.query<{
      id: string;
      name: string;
      type: string;
      bookable: boolean;
      status: string;
    }>(
      'SELECT id, name, type, bookable, status FROM resources WHERE venue_id = $1 AND id = ANY($2::uuid[])',
      [venueId, input.resource_ids],
    );

    if (resourcesRes.rows.length !== input.resource_ids.length) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'One or more requested resources do not exist in this venue.',
      );
    }

    for (const r of resourcesRes.rows) {
      if (!r.bookable || r.status !== 'AVAILABLE') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'RESOURCE_NOT_AVAILABLE',
          `Resource '${r.name}' is currently not bookable or in maintenance.`,
        );
      }
    }

    // 4. Calculate exact integer minor-unit pricing per item
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const items: QuoteItem[] = [];
    let totalMinor = 0;

    for (const r of resourcesRes.rows) {
      const hourlyRate = await this.pricingService.resolveHourlyRate(venueId, r.id);
      const amountMinor = Math.round((hourlyRate * durationMinutes) / 60);

      items.push({
        resource_id: r.id,
        resource_name: r.name,
        resource_type: r.type,
        amount_minor: amountMinor,
        hourly_rate_minor: hourlyRate,
      });

      totalMinor += amountMinor;
    }

    // 5. Calculate deposit and balance with strict integer equality
    let dueNowMinor = totalMinor;
    let balanceMinor = 0;

    if (effectivePolicy.settings.prepaid_mode === 'DEPOSIT') {
      dueNowMinor = Math.ceil((totalMinor * effectivePolicy.settings.deposit_percentage) / 100);
      balanceMinor = totalMinor - dueNowMinor;
    }

    // Strict accounting equality check
    if (dueNowMinor + balanceMinor !== totalMinor) {
      throw new Error('ACCOUNTING_INVARIANT_VIOLATION: dueNowMinor + balanceMinor !== totalMinor');
    }

    // 6. Generate immutable policy snapshot & TTL
    const policySnapshot = this.policiesService.createSnapshot(effectivePolicy);
    const quoteId = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15m TTL

    // 7. Compute cryptographic server signature
    const canonical = this.computeCanonicalString(quoteId, totalMinor, dueNowMinor, expiresAt);
    const signature = this.signCanonical(canonical);

    // 8. Persist into price_quotes
    await pool.query(
      `INSERT INTO price_quotes
        (id, venue_id, customer_id, package_id, starts_at, ends_at, items_snapshot, policy_snapshot,
         total_minor, due_now_minor, balance_minor, currency, signature, expires_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11, 'RON', $12, $13::timestamptz)`,
      [
        quoteId,
        venueId,
        customerId,
        input.package_id || null,
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
      package_id: input.package_id || null,
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

  async getQuote(quoteId: string): Promise<PriceQuote> {
    const pool = getPool();
    const res = await pool.query<PriceQuoteRow>(
      'SELECT * FROM price_quotes WHERE id = $1',
      [quoteId],
    );
    if (res.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'QUOTE_NOT_FOUND', 'Quote not found.');
    }

    const row = res.rows[0];
    return {
      quote_id: row.id,
      venue_id: row.venue_id,
      customer_id: row.customer_id,
      package_id: row.package_id || null,
      starts_at: new Date(row.starts_at).toISOString(),
      ends_at: new Date(row.ends_at).toISOString(),
      currency: 'RON',
      total_minor: Number(row.total_minor),
      due_now_minor: Number(row.due_now_minor),
      balance_minor: Number(row.balance_minor),
      policy: row.policy_snapshot,
      items: row.items_snapshot,
      signature: row.signature,
      expires_at: new Date(row.expires_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  verifyQuote(quote: PriceQuote): { valid: boolean; reason?: string } {
    // 1. Expiry check
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      return { valid: false, reason: 'QUOTE_EXPIRED' };
    }

    // 2. Cryptographic signature check
    const canonical = this.computeCanonicalString(
      quote.quote_id,
      quote.total_minor,
      quote.due_now_minor,
      quote.expires_at,
    );
    const expectedSig = this.signCanonical(canonical);

    const sigBuf = Buffer.from(quote.signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'QUOTE_SIGNATURE_INVALID' };
    }

    return { valid: true };
  }
}
