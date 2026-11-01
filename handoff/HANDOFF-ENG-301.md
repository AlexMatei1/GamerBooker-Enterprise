# HANDOFF-ENG-301: Group Booking Split Allocation and Invitation Tokens

## 1. Goal & Architectural Scope
Delivers the core group booking engine for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-301)
- `docs/04-customer-flow/03-group-bookings-and-split-payments.md`

Implements:
1. Exact integer penny-accurate split arithmetic (`calculateEqualShares`) with deterministic penny remainder distribution (accounting invariant: sum of shares == total minor and sum of due-now == quote due-now).
2. Group booking initialization with single-use cryptographically secure invitation tokens for invited participants.
3. Support for both `SPLIT_BY_PARTICIPANT` and `ORGANIZER_PAYS_ALL` modes.
4. Custom share adjustment by the organizer subject to strict total minor and due-now minor equality invariants.
5. Invitation token lifecycle (accept, decline, duplicate redemption guard, expired token check).
6. Zero-social masking and privacy boundaries: participants can only view their own invitation tokens; tokens of others are masked (`null`).

## 2. Domain Invariants & Rules
1. **Integer Arithmetic Invariance**:
   - Quotes, totals, due now, balances, and shares are denominated in integer minor currency units (bani / cents).
   - Division remainders (e.g., 100 RON / 3 participants = 33.33 RON rem 1 ban) are deterministically allocated +1 ban to the earliest participants (`index < remainder`).
   - `sum(participants.share_total_minor) === quote.total_minor`
   - `sum(participants.share_due_now_minor) === quote.due_now_minor`
   - `sum(participants.share_balance_minor) === quote.balance_minor`
2. **Quote Ownership & Binding**:
   - Only the customer who generated the price quote can create a group booking from it (`403 NOT_QUOTE_OWNER`).
   - Group booking expiration timestamp mirrors or bounds the quote expiration window.
3. **Invitation Token Security**:
   - Single-use cryptographically random tokens (32 bytes hex, 64 chars).
   - Acceptance binds the participant record to the authenticated user ID (`user_id`).
   - Acceptance of already accepted token is rejected with `409 INVITATION_ALREADY_ACCEPTED`.
   - Accepting an invitation when the user is already in the group is rejected with `409 USER_ALREADY_IN_GROUP`.
   - Declining sets status to `'DECLINED'` and prevents future redemption (`409 INVITATION_DECLINED`).
4. **Privacy & Zero-Social Masking**:
   - Organizer can view all participants and unredeemed invitation tokens for dissemination.
   - Non-organizer participants can only view their own invitation token; all other tokens are masked to `null`.
   - Strangers cannot view or access group booking details (`403 FORBIDDEN_GROUP_ACCESS`).
5. **Auditing & Outbox**:
   - Emits transactional `audit_events` (`GROUP_BOOKING_CREATED`, `GROUP_SHARES_ADJUSTED`, `GROUP_INVITATION_ACCEPTED`, `GROUP_INVITATION_DECLINED`).
   - Emits transactional `outbox_events` (`GroupBookingCreated`, `GroupSharesAdjusted`, `GroupInvitationAccepted`, `GroupInvitationDeclined`).

## 3. Database Schema
Defined in `migrations/0020_group_bookings.sql`:
- `group_bookings`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
  - `organizer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `quote_id uuid NOT NULL REFERENCES price_quotes(id) ON DELETE RESTRICT`
  - `hold_id uuid REFERENCES holds(id) ON DELETE SET NULL`
  - `booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL`
  - `mode text NOT NULL CHECK (mode IN ('ORGANIZER_PAYS_ALL', 'SPLIT_BY_PARTICIPANT'))`
  - `status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_PAYMENTS', 'CONFIRMED', 'CANCELLED', 'EXPIRED'))`
  - `total_minor bigint NOT NULL CHECK (total_minor > 0)`
  - `due_now_minor bigint NOT NULL CHECK (due_now_minor > 0)`
  - `balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0)`
  - `currency text NOT NULL DEFAULT 'RON'`
  - `expires_at timestamptz NOT NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
- `group_participants`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `group_booking_id uuid NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE`
  - `user_id uuid REFERENCES users(id) ON DELETE SET NULL`
  - `invited_email text`
  - `invitation_token text UNIQUE`
  - `is_organizer boolean NOT NULL DEFAULT false`
  - `assigned_resource_id uuid REFERENCES resources(id) ON DELETE SET NULL`
  - `share_total_minor bigint NOT NULL CHECK (share_total_minor >= 0)`
  - `share_due_now_minor bigint NOT NULL CHECK (share_due_now_minor >= 0)`
  - `share_balance_minor bigint NOT NULL DEFAULT 0 CHECK (share_balance_minor >= 0)`
  - `share_paid_minor bigint NOT NULL DEFAULT 0 CHECK (share_paid_minor >= 0)`
  - `status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACCEPTED', 'PAYING', 'PAID', 'DECLINED', 'EXPIRED'))`
  - `token_expires_at timestamptz NOT NULL`
  - `accepted_at timestamptz`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
- Permissions granted to least-privilege `gamerbooker_app` role.

## 4. API Specification
- `POST /v1/group-bookings`
  - Creates a group booking from an unexpired customer quote with split mode and invited participants.
  - Returns `{ group_booking: GroupBookingDetail }`.
- `GET /v1/group-bookings/:id`
  - Retrieves group booking and participant details with privacy token masking.
  - Allowed for organizer and participating members.
- `PATCH /v1/group-bookings/:id/shares`
  - Custom share adjustment by the organizer. Revalidates sum invariant.
  - Returns updated group booking.
- `POST /v1/group-bookings/invitations/accept`
  - Accepts invitation token and binds authenticated participant.
- `POST /v1/group-bookings/invitations/decline`
  - Declines invitation token, setting status to `'DECLINED'`.

## 5. Acceptance Verification Plan
Suite `tests/eng301-group-split-allocation.spec.ts` (16/16 passed):
1. Integer penny-exact arithmetic splits total minor and due now equally with deterministic penny remainder.
2. Distributes remainder cleanly across uneven participant counts.
3. Creates `SPLIT_BY_PARTICIPANT` group booking with single-use invitation tokens and equal splits.
4. Creates `ORGANIZER_PAYS_ALL` group booking assigning 100% due-now to organizer.
5. Rejects creating group booking with another customer quote (`403 NOT_QUOTE_OWNER`).
6. Organizer can adjust shares as long as exact sum invariant holds.
7. Rejects share adjustment if sum does not match group total (`400 INVALID_SHARE_SUM`).
8. Prevents non-organizer from adjusting shares (`403 NOT_GROUP_ORGANIZER`).
9. Friend can accept invitation token and binds user ID.
10. Rejects duplicate redemption of token (`409 INVITATION_ALREADY_ACCEPTED`).
11. Rejects accepting invitation when user is already in group (`409 USER_ALREADY_IN_GROUP`).
12. Friend can decline invitation and marks status as `'DECLINED'`.
13. Rejects accepting a declined invitation token (`409 INVITATION_DECLINED`).
14. Rejects invalid or non-existent token with `404 INVITATION_NOT_FOUND`.
15. Allows participant to view group booking but masks invitation tokens of others.
16. Prohibits unrelated user from accessing group booking (`403 FORBIDDEN_GROUP_ACCESS`).
