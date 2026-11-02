import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { PricingService } from './pricing.service';
import {
  DEFAULT_PLATFORM_POLICY,
  type EffectivePolicy,
  type PolicySettings,
  type PolicySnapshot,
  type PolicyPreviewResult,
  type PolicyEstimateScenario,
  type ResourcePolicyComparisonItem,
} from './policy.types';
import { validatePolicySettings } from './policy.validator';

export interface PolicyProfileRow {
  id: string;
  venue_id: string;
  name: string;
  is_default: boolean;
  version: number;
  settings: PolicySettings;
  effective_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PoliciesService {
  constructor(private readonly pricingService?: PricingService) {}

  async createProfile(
    venueId: string,
    name: string,
    isDefault: boolean,
    rawSettings: Partial<PolicySettings>,
  ): Promise<PolicyProfileRow> {
    const validated = validatePolicySettings(rawSettings, DEFAULT_PLATFORM_POLICY);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (isDefault) {
        // Demote previous default if setting a new default
        await client.query(
          'UPDATE policy_profiles SET is_default = false, updated_at = now() WHERE venue_id = $1 AND is_default = true',
          [venueId],
        );
      }

      const res = await client.query<PolicyProfileRow>(
        `INSERT INTO policy_profiles
          (venue_id, name, is_default, version, settings, effective_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, now(), now())
         RETURNING *`,
        [venueId, name, isDefault, JSON.stringify(validated)],
      );

      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async updateProfile(
    venueId: string,
    profileId: string,
    updates: {
      name?: string;
      isDefault?: boolean;
      settings?: Partial<PolicySettings>;
    },
  ): Promise<PolicyProfileRow> {
    const current = await this.getProfile(venueId, profileId);
    const validated = updates.settings
      ? validatePolicySettings(updates.settings, current.settings)
      : current.settings;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (updates.isDefault === true) {
        await client.query(
          'UPDATE policy_profiles SET is_default = false, updated_at = now() WHERE venue_id = $1 AND is_default = true',
          [venueId],
        );
      }

      const res = await client.query<PolicyProfileRow>(
        `UPDATE policy_profiles
            SET name = COALESCE($1, name),
                is_default = COALESCE($2, is_default),
                settings = $3,
                version = version + 1,
                updated_at = now()
          WHERE id = $4 AND venue_id = $5
          RETURNING *`,
        [
          updates.name ?? null,
          updates.isDefault ?? null,
          JSON.stringify(validated),
          profileId,
          venueId,
        ],
      );

      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listProfiles(venueId: string): Promise<PolicyProfileRow[]> {
    const pool = getPool();
    const res = await pool.query<PolicyProfileRow>(
      'SELECT * FROM policy_profiles WHERE venue_id = $1 ORDER BY is_default DESC, name ASC',
      [venueId],
    );
    return res.rows;
  }

  async getProfile(venueId: string, profileId: string): Promise<PolicyProfileRow> {
    const pool = getPool();
    const res = await pool.query<PolicyProfileRow>(
      'SELECT * FROM policy_profiles WHERE id = $1 AND venue_id = $2',
      [profileId, venueId],
    );
    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'POLICY_NOT_FOUND',
        'Policy profile not found.',
      );
    }
    return res.rows[0];
  }

  async resolveEffectivePolicy(
    venueId: string,
    resourceId?: string,
  ): Promise<EffectivePolicy> {
    const pool = getPool();

    // 1. Resolve venue default policy
    const venueDefaultRes = await pool.query<PolicyProfileRow>(
      'SELECT * FROM policy_profiles WHERE venue_id = $1 AND is_default = true',
      [venueId],
    );

    let effectiveSettings: PolicySettings = DEFAULT_PLATFORM_POLICY;
    let sourceLevel: EffectivePolicy['source_level'] = 'platform_default';
    let profileId: string | undefined;
    let version = 1;

    if (venueDefaultRes.rows.length > 0) {
      effectiveSettings = venueDefaultRes.rows[0].settings;
      sourceLevel = 'venue_default';
      profileId = venueDefaultRes.rows[0].id;
      version = venueDefaultRes.rows[0].version;
    }

    // 2. If resourceId provided, check Zone policy and Resource override
    if (resourceId) {
      const resQuery = await pool.query<{
        id: string;
        zone_id: string | null;
        attributes: Record<string, unknown>;
      }>('SELECT id, zone_id, attributes FROM resources WHERE id = $1 AND venue_id = $2', [
        resourceId,
        venueId,
      ]);

      if (resQuery.rows.length > 0) {
        const resourceRow = resQuery.rows[0];

        // Check Zone policy profile
        if (resourceRow.zone_id) {
          const zoneQuery = await pool.query<{ policy_profile_id: string | null }>(
            'SELECT policy_profile_id FROM zones WHERE id = $1',
            [resourceRow.zone_id],
          );
          const zoneProfileId = zoneQuery.rows[0]?.policy_profile_id;

          if (zoneProfileId) {
            const zonePolicyRes = await pool.query<PolicyProfileRow>(
              'SELECT * FROM policy_profiles WHERE id = $1',
              [zoneProfileId],
            );
            if (zonePolicyRes.rows.length > 0) {
              effectiveSettings = { ...effectiveSettings, ...zonePolicyRes.rows[0].settings };
              sourceLevel = 'zone_policy';
              profileId = zonePolicyRes.rows[0].id;
              version = zonePolicyRes.rows[0].version;
            }
          }
        }

        // Check Resource override attributes
        const override = resourceRow.attributes?.policy_override as Partial<PolicySettings> | undefined;
        if (override && typeof override === 'object') {
          effectiveSettings = { ...effectiveSettings, ...override };
          sourceLevel = 'resource_override';
        }
      }
    }

    return {
      venue_id: venueId,
      resource_id: resourceId,
      source_level: sourceLevel,
      profile_id: profileId,
      version,
      settings: effectiveSettings,
    };
  }

  createSnapshot(effective: EffectivePolicy): PolicySnapshot {
    return {
      snapshot_version: 1,
      captured_at: new Date().toISOString(),
      source_level: effective.source_level,
      profile_id: effective.profile_id,
      settings: { ...effective.settings },
    };
  }

  async previewPolicyEstimates(
    venueId: string,
    customSettings?: Partial<PolicySettings>,
    resourceId?: string,
  ): Promise<PolicyPreviewResult> {
    const pool = getPool();

    // 1. Resolve effective policy
    const effective = await this.resolveEffectivePolicy(venueId, resourceId);
    const settings: PolicySettings = customSettings
      ? validatePolicySettings(customSettings, effective.settings)
      : effective.settings;

    // 2. Resolve base hourly rate for preview resource or venue default
    let baseRateMinor = 3000; // 30.00 RON fallback
    const defaultRuleRes = await pool.query<{ hourly_rate_minor: string }>(
      "SELECT hourly_rate_minor FROM price_rules WHERE venue_id = $1 AND target_type = 'VENUE_DEFAULT'",
      [venueId],
    );
    if (defaultRuleRes.rows.length > 0) {
      baseRateMinor = Number(defaultRuleRes.rows[0].hourly_rate_minor);
    }

    if (resourceId) {
      if (this.pricingService) {
        baseRateMinor = await this.pricingService.resolveHourlyRate(venueId, resourceId);
      } else {
        const resRule = await pool.query<{ hourly_rate_minor: string }>(
          "SELECT hourly_rate_minor FROM price_rules WHERE venue_id = $1 AND target_type = 'RESOURCE' AND target_id = $2",
          [venueId, resourceId],
        );
        if (resRule.rows.length > 0) {
          baseRateMinor = Number(resRule.rows[0].hourly_rate_minor);
        }
      }
    }

    const formatRon = (minor: number) => `${(minor / 100).toFixed(2)} RON`;

    const calculateScenario = (
      id: string,
      name: string,
      durationMinutes: number,
      playersCount: number,
    ): PolicyEstimateScenario => {
      const hours = durationMinutes / 60;
      const singleTotalMinor = Math.round(hours * baseRateMinor);
      const totalMinor = singleTotalMinor * playersCount;

      let dueNowMinor = totalMinor;
      if (settings.prepaid_mode === 'DEPOSIT') {
        dueNowMinor = Math.round((totalMinor * settings.deposit_percentage) / 100);
      }
      const balanceMinor = Math.max(0, totalMinor - dueNowMinor);

      const penaltyMinor = Math.round(
        (totalMinor * settings.late_cancellation_penalty_percent) / 100,
      );

      const perPlayerShare = Math.round(totalMinor / playersCount);
      const perPlayerDueNow = Math.round(dueNowMinor / playersCount);

      let settlementText = 'Plată integrală online la checkout.';
      if (settings.deposit_mode_settlement === 'ONLINE_ONLY') {
        settlementText = 'Avansul și restul de plată se achită exclusiv online.';
      } else if (settings.deposit_mode_settlement === 'RECEPTION_ONLY') {
        settlementText = 'Avansul se achită online; restul de plată exclusiv la recepția sălii.';
      } else {
        settlementText =
          'Avansul se achită online; restul de plată poate fi achitat online sau la recepție (numerar / card).';
      }

      return {
        scenario_id: id,
        name,
        duration_minutes: durationMinutes,
        players_count: playersCount,
        total_price_minor: totalMinor,
        due_now_minor: dueNowMinor,
        remaining_balance_minor: balanceMinor,
        per_player_share_minor: playersCount > 1 ? perPlayerShare : undefined,
        per_player_due_now_minor: playersCount > 1 ? perPlayerDueNow : undefined,
        cancellation_deadline_hours: settings.free_cancellation_hours,
        penalty_on_late_cancel_minor: penaltyMinor,
        customer_display: {
          price_formatted: formatRon(totalMinor),
          due_now_formatted: formatRon(dueNowMinor),
          balance_formatted: formatRon(balanceMinor),
          free_cancellation_text: `Anulare gratuită cu până la ${settings.free_cancellation_hours} ore înainte de sesiune.`,
          settlement_options_text: settlementText,
        },
      };
    };

    const scenarios: PolicyEstimateScenario[] = [
      calculateScenario('solo_1h', 'Sesiune Solo 1 Oră', 60, 1),
      calculateScenario('solo_2h', 'Sesiune Solo 2 Ore', 120, 1),
      calculateScenario('solo_3h', 'Sesiune Prelungită 3 Ore', 180, 1),
      calculateScenario('group_5p_2h', 'Sesiune Grup 5 Jucători (2 Ore)', 120, 5),
    ];

    // 3. Resource-level comparisons
    const resQuery = await pool.query<{
      id: string;
      name: string;
      type: string;
      room_name: string;
      zone_name: string | null;
      zone_id: string | null;
      attributes: Record<string, unknown>;
    }>(
      `SELECT r.id, r.name, r.type, rm.name as room_name, z.name as zone_name, r.zone_id, r.attributes
         FROM resources r
         JOIN rooms rm ON rm.id = r.room_id
         LEFT JOIN zones z ON z.id = r.zone_id
        WHERE r.venue_id = $1
        ORDER BY rm.name, r.name`,
      [venueId],
    );

    const priceRulesRes = await pool.query<{
      target_type: string;
      target_id: string | null;
      hourly_rate_minor: string;
    }>('SELECT target_type, target_id, hourly_rate_minor FROM price_rules WHERE venue_id = $1', [
      venueId,
    ]);

    const venueDefaultRate =
      Number(
        priceRulesRes.rows.find((pr) => pr.target_type === 'VENUE_DEFAULT')?.hourly_rate_minor,
      ) || 3000;

    const resourceComparisons: ResourcePolicyComparisonItem[] = [];
    for (const r of resQuery.rows) {
      let rRate = venueDefaultRate;
      let rSource = 'VENUE_DEFAULT';

      // Check zone pricing
      if (r.zone_id) {
        const zoneRule = priceRulesRes.rows.find(
          (pr) => pr.target_type === 'ZONE' && pr.target_id === r.zone_id,
        );
        if (zoneRule) {
          rRate = Number(zoneRule.hourly_rate_minor);
          rSource = 'ZONE';
        }
      }

      // Check resource pricing
      const resRule = priceRulesRes.rows.find(
        (pr) => pr.target_type === 'RESOURCE' && pr.target_id === r.id,
      );
      if (resRule) {
        rRate = Number(resRule.hourly_rate_minor);
        rSource = 'RESOURCE';
      }

      let polSource = 'VENUE_DEFAULT';
      if (r.attributes?.policy_override) {
        polSource = 'RESOURCE_OVERRIDE';
      } else if (r.zone_id) {
        polSource = 'ZONE_POLICY';
      }

      resourceComparisons.push({
        resource_id: r.id,
        name: r.name,
        type: r.type,
        room_name: r.room_name,
        zone_name: r.zone_name,
        effective_hourly_rate_minor: rRate,
        rate_source: rSource,
        effective_deposit_percentage: settings.deposit_percentage,
        policy_source: polSource,
        diff_from_venue_default_minor: rRate - venueDefaultRate,
      });
    }

    // 4. Validation and conflict warnings
    const warnings: string[] = [];
    if (!defaultRuleRes.rows.length) {
      warnings.push(
        'MISSING_VENUE_DEFAULT_PRICE_RULE: Nu a fost configurată o regulă de preț implicită pentru sală.',
      );
    }
    if (settings.prepaid_mode === 'DEPOSIT' && settings.deposit_percentage <= 0) {
      warnings.push('INVALID_DEPOSIT_PERCENTAGE: Procentul de avans trebuie să fie de minim 10%.');
    }
    if (settings.free_cancellation_hours > settings.max_duration_minutes / 60) {
      warnings.push(
        'CANCELLATION_WINDOW_EXCEEDS_MAX_DURATION: Termenul de anulare gratuită depășește durata maximă a unei sesiuni.',
      );
    }

    return {
      venue_id: venueId,
      preview_resource_id: resourceId,
      applied_policy_level: customSettings ? 'custom_draft' : effective.source_level,
      effective_settings: settings,
      base_hourly_rate_minor: baseRateMinor,
      currency: 'RON',
      scenarios,
      resource_comparisons: resourceComparisons,
      customer_disclosures: {
        free_cancellation_disclosure: `Clienții pot anula gratuit rezervarea cu până la ${settings.free_cancellation_hours} ore înainte de ora de începere. După expirarea acestui termen, se reține o penalitate de ${settings.late_cancellation_penalty_percent}% din valoarea serviciului.`,
        deposit_disclosure:
          settings.prepaid_mode === 'FULL'
            ? 'Plată integrală la checkout (100%).'
            : `Avans de ${settings.deposit_percentage}% la confirmarea rezervării. Restul sumei se achită prin modalitatea: ${settings.deposit_mode_settlement}.`,
        statutory_notice:
          'Conform OUG 34/2014 Art. 16(l), serviciile de agrement programate la o dată fixă sunt exceptate de la dreptul general de retragere în 14 zile. Conform OUG 28/1999, confirmarea electronică nu înlocuiește bonul fiscal eliberat la sediu.',
      },
      validation_warnings: warnings,
    };
  }
}
