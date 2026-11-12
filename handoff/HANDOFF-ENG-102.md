# HANDOFF - ENG-102 Policy hierarchy + validator + snapshot

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:15 (ENG-102), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Venue and resource hierarchy with rooms and zones delivered (`ENG-003`).
- Operating schedules and availability delivered (`ENG-101`).

---

## Task Definition
`ENG-102 | Policy hierarchy + validator + snapshot | Venue default policy, zone policy, resource attribute overrides, booking request interval | Hierarchy precedence (resource > zone > venue), immutable policy snapshot (BR-010), non-negative financial bounds (deposit 10-100%), duration clamping | GET /v1/venues/:id/effective-policy, GET/POST/PUT /v1/dashboard/venues/:id/policies | policy_profiles | Venue Policy Settings | POLICY_INVALID_SETTINGS, POLICY_DURATION_OUT_OF_BOUNDS, POLICY_NOT_FOUND | Dashboard: OWNER/VENUE_MANAGER (read/write), RECEPTION (read); Client: public effective preview | Multi-level inheritance, duration validation, deposit bounds, immutable snapshot isolation | policy_created, policy_snapshot_generated, policy_validation_failed | Bookings & Operations Core`

---

## 1. Domain Invariants & Rules

### 1.1 Policy Settings Schema
```ts
export interface PolicySettings {
  prepaid_mode: 'FULL' | 'DEPOSIT';
  deposit_percentage: number; // 10..100
  deposit_mode_settlement: 'ONLINE_ONLY' | 'RECEPTION_ONLY' | 'ONLINE_OR_RECEPTION';
  min_duration_minutes: number; // e.g. 60
  max_duration_minutes: number; // e.g. 480
  slot_granularity_minutes: number; // 15, 30, 60
  buffer_after_minutes: number; // 0, 15, 30
  free_cancellation_hours: number; // e.g. 3
  late_cancellation_penalty_percent: number; // 0..100
  no_show_grace_minutes: number; // e.g. 15
}
```

### 1.2 Hierarchy & Inheritance Precedence (BR-010, Glossary)
Resolution order:
`Resource overrides > Zone Policy Profile > Venue Default Policy Profile > Platform Defaults`
- Platform Defaults provide safe fallbacks if venue has not customized a field.
- If a zone links to a `policy_profile_id`, the zone settings override the venue default settings for any resource in that zone.
- If a resource defines `attributes.policy_override`, individual fields override zone and venue settings.
- Contradictory settings cannot be applied silently: the validator rejects out-of-bounds numbers.

### 1.3 Booking Duration & Interval Validator
- Validates that `(end_at - start_at)` in minutes satisfies `min_duration_minutes <= duration <= max_duration_minutes`.
- Validates that duration is a multiple of `slot_granularity_minutes`.
- Returns detailed issues or throws `POLICY_DURATION_OUT_OF_BOUNDS` / `POLICY_INVALID_SETTINGS`.

### 1.4 Immutable Snapshot (BR-010)
- `createPolicySnapshot(effectivePolicy)` produces a self-contained, frozen copy containing all resolved fields, version, and timestamp.
- Once attached to a quote or confirmed booking, later modifications to venue or zone policies NEVER alter historical or existing booking calculations.

---

## 2. Database Schema (`migrations/0009_policy_profiles.sql`)

### 2.1 `policy_profiles`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- `name text NOT NULL`
- `is_default boolean NOT NULL DEFAULT false`
- `version int NOT NULL DEFAULT 1`
- `settings jsonb NOT NULL`
- `effective_at timestamptz NOT NULL DEFAULT now()`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`

### 2.2 Foreign Key & Constraints
- Unique default constraint: at most one default policy per venue (`CREATE UNIQUE INDEX ON policy_profiles (venue_id) WHERE is_default`).
- `ALTER TABLE zones ADD CONSTRAINT zones_policy_profile_fk FOREIGN KEY (policy_profile_id) REFERENCES policy_profiles(id) ON DELETE SET NULL;`
- Privileges granted to `gamerbooker_app`.

---

## 3. Acceptance Tests (`tests/eng102-policy-hierarchy.spec.ts`)
1. **Policy Hierarchy Resolution**:
   - Resolves venue default policy for resources without zone/resource overrides.
   - Resolves zone-specific policy profile when resource belongs to a zone with `policy_profile_id`.
   - Overrides specific fields when resource has `attributes.policy_override`.
2. **Policy Validator**:
   - Rejects durations shorter than `min_duration_minutes` or longer than `max_duration_minutes`.
   - Rejects unaligned durations (not multiple of `slot_granularity_minutes`).
   - Rejects invalid settings (deposit < 10% or > 100%, negative buffer).
3. **Immutability of Policy Snapshot (BR-010)**:
   - Generating a policy snapshot freezes settings.
   - Changing the venue's default policy afterwards does not alter the generated snapshot.
4. **RBAC & Cross-Tenant Isolation**:
   - OWNER/VENUE_MANAGER can manage policies.
   - RECEPTION cannot update policies (403).
   - Cross-tenant policy access returns 404 (T-018 row ownership).
