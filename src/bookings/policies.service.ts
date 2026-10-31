import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import {
  DEFAULT_PLATFORM_POLICY,
  type EffectivePolicy,
  type PolicySettings,
  type PolicySnapshot,
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
}
