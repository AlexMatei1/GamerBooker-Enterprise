import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type { PriceRuleRow, SetPriceRuleInput } from './quotes.types';

export const PLATFORM_DEFAULT_HOURLY_RATE_MINOR = 2000; // 20.00 RON/h

@Injectable()
export class PricingService {
  async setPriceRule(
    venueId: string,
    input: SetPriceRuleInput,
  ): Promise<PriceRuleRow> {
    if (!input.hourlyRateMinor || input.hourlyRateMinor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'PRICING_INVALID_RATE',
        'hourlyRateMinor must be an integer greater than 0.',
      );
    }

    const pool = getPool();
    const targetType = input.targetType;
    const targetId = targetType === 'VENUE_DEFAULT' ? null : input.targetId || null;

    if (targetType !== 'VENUE_DEFAULT' && !targetId) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'PRICING_MISSING_TARGET',
        `targetId is required when targetType is '${targetType}'.`,
      );
    }

    let query: string;
    let params: unknown[];

    if (targetType === 'VENUE_DEFAULT') {
      query = `INSERT INTO price_rules (venue_id, target_type, target_id, hourly_rate_minor, currency, updated_at)
               VALUES ($1, 'VENUE_DEFAULT', NULL, $2, 'RON', now())
               ON CONFLICT (venue_id) WHERE target_type = 'VENUE_DEFAULT'
               DO UPDATE SET hourly_rate_minor = EXCLUDED.hourly_rate_minor, updated_at = now()
               RETURNING *`;
      params = [venueId, input.hourlyRateMinor];
    } else {
      query = `INSERT INTO price_rules (venue_id, target_type, target_id, hourly_rate_minor, currency, updated_at)
               VALUES ($1, $2, $3, $4, 'RON', now())
               ON CONFLICT (venue_id, target_type, target_id) WHERE target_id IS NOT NULL
               DO UPDATE SET hourly_rate_minor = EXCLUDED.hourly_rate_minor, updated_at = now()
               RETURNING *`;
      params = [venueId, targetType, targetId, input.hourlyRateMinor];
    }

    const res = await pool.query<PriceRuleRow>(query, params);
    return res.rows[0];
  }

  async listPriceRules(venueId: string): Promise<PriceRuleRow[]> {
    const pool = getPool();
    const res = await pool.query<PriceRuleRow>(
      'SELECT * FROM price_rules WHERE venue_id = $1 ORDER BY target_type ASC',
      [venueId],
    );
    return res.rows;
  }

  async resolveHourlyRate(venueId: string, resourceId: string): Promise<number> {
    const pool = getPool();

    // 1. Check direct RESOURCE price rule
    const resRule = await pool.query<{ hourly_rate_minor: string }>(
      `SELECT hourly_rate_minor FROM price_rules
        WHERE venue_id = $1 AND target_type = 'RESOURCE' AND target_id = $2`,
      [venueId, resourceId],
    );
    if (resRule.rows.length > 0) {
      return Number(resRule.rows[0].hourly_rate_minor);
    }

    // 2. Check ZONE price rule (if resource belongs to a zone)
    const resourceRow = await pool.query<{ zone_id: string | null }>(
      'SELECT zone_id FROM resources WHERE id = $1 AND venue_id = $2',
      [resourceId, venueId],
    );
    const zoneId = resourceRow.rows[0]?.zone_id;

    if (zoneId) {
      const zoneRule = await pool.query<{ hourly_rate_minor: string }>(
        `SELECT hourly_rate_minor FROM price_rules
          WHERE venue_id = $1 AND target_type = 'ZONE' AND target_id = $2`,
        [venueId, zoneId],
      );
      if (zoneRule.rows.length > 0) {
        return Number(zoneRule.rows[0].hourly_rate_minor);
      }
    }

    // 3. Check VENUE_DEFAULT price rule
    const venueDefaultRule = await pool.query<{ hourly_rate_minor: string }>(
      `SELECT hourly_rate_minor FROM price_rules
        WHERE venue_id = $1 AND target_type = 'VENUE_DEFAULT'`,
      [venueId],
    );
    if (venueDefaultRule.rows.length > 0) {
      return Number(venueDefaultRule.rows[0].hourly_rate_minor);
    }

    // 4. Platform fallback
    return PLATFORM_DEFAULT_HOURLY_RATE_MINOR;
  }
}
