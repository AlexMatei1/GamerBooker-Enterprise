import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { HoldsService } from './holds.service';
import { BookingsService } from './bookings.service';
import { PaymentsService, type PaymentIntentRow } from '../payments/payments.service';
import type {
  CreateGroupBookingDto,
  AdjustSharesDto,
  GroupBookingDetail,
  GroupParticipantDetail,
  GroupBookingRow,
  GroupParticipantRow,
  GroupParticipantWithGroupRow,
  GroupParticipantInvitationRow,
  InitiateCheckoutResult,
  GroupPaymentIntentResult,
  PaymentCaptureResult,
  ExpireGroupBookingResult,
  DifferenceSummaryResult,
  DifferenceSummaryParticipant,
  PayDifferenceResult,
} from './group.types';

function notFound(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, code, message);
}

function badRequest(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.BAD_REQUEST, code, message, details);
}

function conflict(code: string, message: string, details?: Record<string, unknown>): AuthHttpError {
  return new AuthHttpError(HttpStatus.CONFLICT, code, message, details);
}

function forbidden(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.FORBIDDEN, code, message);
}

function gone(code: string, message: string): AuthHttpError {
  return new AuthHttpError(HttpStatus.GONE, code, message);
}

export function calculateEqualShares(
  totalMinor: number,
  dueNowMinor: number,
  participantCount: number,
): Array<{ share_total_minor: number; share_due_now_minor: number; share_balance_minor: number }> {
  if (participantCount <= 0) {
    return [];
  }

  const baseTotal = Math.floor(totalMinor / participantCount);
  const remTotal = totalMinor % participantCount;

  const baseDueNow = Math.floor(dueNowMinor / participantCount);
  const remDueNow = dueNowMinor % participantCount;

  const result = [];
  for (let i = 0; i < participantCount; i++) {
    const shareTotal = baseTotal + (i < remTotal ? 1 : 0);
    const shareDueNow = baseDueNow + (i < remDueNow ? 1 : 0);
    const shareBalance = shareTotal - shareDueNow;
    result.push({
      share_total_minor: shareTotal,
      share_due_now_minor: shareDueNow,
      share_balance_minor: shareBalance,
    });
  }
  return result;
}

@Injectable()
export class GroupService implements OnModuleInit {
  constructor(
    private readonly holdsService: HoldsService,
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit() {
    this.paymentsService.onPaymentCaptured(async (intent) => {
      if (intent.group_booking_id) {
        await this.handlePaymentCaptured(intent.provider_ref);
      }
    });
  }
  // ---------------------------------------------------------------------------
  // Create Group Booking & Share Allocation
  // ---------------------------------------------------------------------------

  async createGroupBooking(
    organizerId: string,
    dto: CreateGroupBookingDto,
    requestId: string,
  ): Promise<GroupBookingDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch and validate quote
      const quoteRes = await client.query<{
        id: string;
        venue_id: string;
        customer_id: string;
        total_minor: string;
        due_now_minor: string;
        balance_minor: string;
        currency: string;
        expires_at: Date;
      }>('SELECT * FROM price_quotes WHERE id = $1 FOR UPDATE', [dto.quote_id]);

      if (!quoteRes.rowCount || quoteRes.rowCount === 0) {
        throw notFound('QUOTE_NOT_FOUND', 'Price quote not found or expired');
      }
      const quote = quoteRes.rows[0];

      if (quote.customer_id !== organizerId) {
        throw forbidden('NOT_QUOTE_OWNER', 'You are not the owner of this price quote');
      }

      if (new Date(quote.expires_at) < new Date()) {
        throw gone('QUOTE_EXPIRED', 'Price quote has expired. Please generate a new quote.');
      }

      // Fetch tenant_id
      const venueRes = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [quote.venue_id],
      );
      const tenantId = venueRes.rows[0].tenant_id;

      const totalMinor = Number(quote.total_minor);
      const dueNowMinor = Number(quote.due_now_minor);
      const balanceMinor = Number(quote.balance_minor);

      const invited = dto.participants || [];
      const totalParticipants = 1 + invited.length;

      // 2. Insert Group Booking record
      const gbRes = await client.query<GroupBookingRow>(
        `INSERT INTO group_bookings (
          tenant_id, venue_id, organizer_id, quote_id, mode, status,
          total_minor, due_now_minor, balance_minor, currency, expires_at
        ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          tenantId,
          quote.venue_id,
          organizerId,
          quote.id,
          dto.mode,
          totalMinor,
          dueNowMinor,
          balanceMinor,
          quote.currency,
          quote.expires_at,
        ],
      );
      const groupBooking = gbRes.rows[0];

      // 3. Compute Share Allocations
      let shareAllocations: Array<{
        share_total_minor: number;
        share_due_now_minor: number;
        share_balance_minor: number;
      }>;

      if (dto.mode === 'ORGANIZER_PAYS_ALL') {
        // Organizer pays everything; others are logistics/roster with 0 shares
        shareAllocations = [
          {
            share_total_minor: totalMinor,
            share_due_now_minor: dueNowMinor,
            share_balance_minor: balanceMinor,
          },
          ...invited.map(() => ({
            share_total_minor: 0,
            share_due_now_minor: 0,
            share_balance_minor: 0,
          })),
        ];
      } else {
        // SPLIT_BY_PARTICIPANT: deterministic integer split
        shareAllocations = calculateEqualShares(totalMinor, dueNowMinor, totalParticipants);
      }

      // 4. Insert Organizer Participant
      await client.query(
        `INSERT INTO group_participants (
          group_booking_id, user_id, is_organizer, status,
          share_total_minor, share_due_now_minor, share_balance_minor,
          token_expires_at, accepted_at
        ) VALUES ($1, $2, true, 'ACCEPTED', $3, $4, $5, $6, now())`,
        [
          groupBooking.id,
          organizerId,
          shareAllocations[0].share_total_minor,
          shareAllocations[0].share_due_now_minor,
          shareAllocations[0].share_balance_minor,
          quote.expires_at,
        ],
      );

      // 5. Insert Invited Participants
      for (let i = 0; i < invited.length; i++) {
        const inv = invited[i];
        const token = randomBytes(24).toString('hex');
        const share = shareAllocations[i + 1];

        await client.query(
          `INSERT INTO group_participants (
            group_booking_id, invited_email, invitation_token, is_organizer,
            assigned_resource_id, share_total_minor, share_due_now_minor, share_balance_minor,
            status, token_expires_at
          ) VALUES ($1, $2, $3, false, $4, $5, $6, $7, 'INVITED', $8)`,
          [
            groupBooking.id,
            inv.email || null,
            token,
            inv.assigned_resource_id || null,
            share.share_total_minor,
            share.share_due_now_minor,
            share.share_balance_minor,
            quote.expires_at,
          ],
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'GROUP_BOOKING_CREATED', 'GROUP_BOOKING', $5, $6)`,
        [
          tenantId,
          quote.venue_id,
          requestId || randomUUID(),
          organizerId,
          groupBooking.id,
          JSON.stringify({
            mode: dto.mode,
            participant_count: totalParticipants,
            total_minor: totalMinor,
            due_now_minor: dueNowMinor,
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupBookingCreated', $3)`,
        [
          tenantId,
          groupBooking.id,
          JSON.stringify({
            group_booking_id: groupBooking.id,
            venue_id: quote.venue_id,
            organizer_id: organizerId,
            mode: dto.mode,
            total_participants: totalParticipants,
          }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getGroupBooking(organizerId, dto.quote_id, true);
  }

  // ---------------------------------------------------------------------------
  // Get Group Booking Details
  // ---------------------------------------------------------------------------

  async getGroupBooking(
    callerUserId: string,
    idOrQuoteId: string,
    isQuoteId = false,
  ): Promise<GroupBookingDetail> {
    const pool = getPool();

    const condition = isQuoteId ? 'gb.quote_id = $1' : 'gb.id = $1';
    const gbRes = await pool.query<GroupBookingRow>(
      `SELECT gb.*
       FROM group_bookings gb
       WHERE ${condition}`,
      [idOrQuoteId],
    );

    if (!gbRes.rowCount || gbRes.rowCount === 0) {
      throw notFound('GROUP_BOOKING_NOT_FOUND', 'Group booking not found');
    }

    const gb = gbRes.rows[0];

    const partRes = await pool.query<GroupParticipantRow>(
      `SELECT * FROM group_participants
       WHERE group_booking_id = $1
       ORDER BY is_organizer DESC, created_at ASC`,
      [gb.id],
    );

    const isOrganizer = gb.organizer_id === callerUserId;
    const isParticipant = partRes.rows.some((p) => p.user_id === callerUserId);

    if (!isOrganizer && !isParticipant) {
      throw forbidden('FORBIDDEN_GROUP_ACCESS', 'You are not a participant or organizer in this group booking');
    }

    const participants: GroupParticipantDetail[] = partRes.rows.map((p) => {
      // Privacy guard: Only organizer or the participant themselves can see full tokens/emails
      const canSeeToken = isOrganizer || p.user_id === callerUserId;
      return {
        id: p.id,
        user_id: p.user_id,
        invited_email: p.invited_email,
        invitation_token: canSeeToken ? p.invitation_token : null,
        is_organizer: p.is_organizer,
        assigned_resource_id: p.assigned_resource_id,
        share_total_minor: Number(p.share_total_minor),
        share_due_now_minor: Number(p.share_due_now_minor),
        share_balance_minor: Number(p.share_balance_minor),
        share_paid_minor: Number(p.share_paid_minor),
        status: p.status,
        token_expires_at: p.token_expires_at instanceof Date ? p.token_expires_at.toISOString() : p.token_expires_at,
        accepted_at: p.accepted_at ? (p.accepted_at instanceof Date ? p.accepted_at.toISOString() : p.accepted_at) : null,
      };
    });

    const allAccepted = participants.every((p) => p.status === 'ACCEPTED' || p.status === 'PAID');

    return {
      id: gb.id,
      tenant_id: gb.tenant_id,
      venue_id: gb.venue_id,
      organizer_id: gb.organizer_id,
      quote_id: gb.quote_id,
      hold_id: gb.hold_id,
      booking_id: gb.booking_id,
      mode: gb.mode,
      status: gb.status,
      total_minor: Number(gb.total_minor),
      due_now_minor: Number(gb.due_now_minor),
      balance_minor: Number(gb.balance_minor),
      currency: gb.currency,
      expires_at: gb.expires_at instanceof Date ? gb.expires_at.toISOString() : gb.expires_at,
      participants,
      all_participants_accepted: allAccepted,
      created_at: gb.created_at instanceof Date ? gb.created_at.toISOString() : gb.created_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Adjust Custom Shares
  // ---------------------------------------------------------------------------

  async adjustShares(
    organizerId: string,
    groupBookingId: string,
    dto: AdjustSharesDto,
    requestId: string,
  ): Promise<GroupBookingDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const gbRes = await client.query<GroupBookingRow>(
        'SELECT * FROM group_bookings WHERE id = $1 FOR UPDATE',
        [groupBookingId],
      );
      if (!gbRes.rowCount || gbRes.rowCount === 0) {
        throw notFound('GROUP_BOOKING_NOT_FOUND', 'Group booking not found');
      }
      const gb = gbRes.rows[0];

      if (gb.organizer_id !== organizerId) {
        throw forbidden('NOT_GROUP_ORGANIZER', 'Only the group organizer can adjust payment shares');
      }

      if (gb.status !== 'DRAFT') {
        throw conflict('GROUP_NOT_IN_DRAFT', `Cannot adjust shares for a group in "${gb.status}" status`);
      }

      const partRes = await client.query<GroupParticipantRow>(
        'SELECT * FROM group_participants WHERE group_booking_id = $1 FOR UPDATE',
        [groupBookingId],
      );
      const participants = partRes.rows;

      if (!dto.shares || dto.shares.length !== participants.length) {
        throw badRequest(
          'INCOMPLETE_SHARE_ADJUSTMENT',
          `Must provide share adjustments for all ${participants.length} participants in the group`,
        );
      }

      const participantMap = new Map(participants.map((p) => [p.id, p]));

      let sumDueNow = 0;
      let sumTotal = 0;

      for (const share of dto.shares) {
        const p = participantMap.get(share.participant_id);
        if (!p) {
          throw notFound('PARTICIPANT_NOT_FOUND', `Participant "${share.participant_id}" does not belong to group`);
        }
        if (share.share_due_now_minor < 0 || share.share_total_minor < 0) {
          throw badRequest('NEGATIVE_SHARE_PROHIBITED', 'Share amounts cannot be negative');
        }
        if (share.share_due_now_minor > share.share_total_minor) {
          throw badRequest('DUE_NOW_EXCEEDS_TOTAL', 'Due now share cannot exceed total share');
        }

        sumDueNow += share.share_due_now_minor;
        sumTotal += share.share_total_minor;
      }

      // Exact sum invariant check
      if (sumDueNow !== Number(gb.due_now_minor) || sumTotal !== Number(gb.total_minor)) {
        throw badRequest(
          'INVALID_SHARE_SUM',
          `Sum of shares must match group totals exactly. Expected due_now=${gb.due_now_minor}, total=${gb.total_minor}. Got due_now=${sumDueNow}, total=${sumTotal}.`,
          {
            expected_due_now: Number(gb.due_now_minor),
            expected_total: Number(gb.total_minor),
            calculated_due_now: sumDueNow,
            calculated_total: sumTotal,
          },
        );
      }

      // Update shares
      for (const share of dto.shares) {
        const balance = share.share_total_minor - share.share_due_now_minor;
        await client.query(
          `UPDATE group_participants
           SET share_due_now_minor = $1, share_total_minor = $2, share_balance_minor = $3, updated_at = now()
           WHERE id = $4`,
          [share.share_due_now_minor, share.share_total_minor, balance, share.participant_id],
        );
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'GROUP_SHARES_ADJUSTED', 'GROUP_BOOKING', $5, $6)`,
        [
          gb.tenant_id,
          gb.venue_id,
          requestId || randomUUID(),
          organizerId,
          gb.id,
          JSON.stringify({ shares: dto.shares }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupSharesAdjusted', $3)`,
        [
          gb.tenant_id,
          gb.id,
          JSON.stringify({ group_booking_id: gb.id, adjusted_by: organizerId }),
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getGroupBooking(organizerId, groupBookingId, false);
  }

  // ---------------------------------------------------------------------------
  // Invitation Acceptance & Decline
  // ---------------------------------------------------------------------------

  async acceptInvitation(
    userId: string,
    token: string,
    requestId: string,
  ): Promise<GroupParticipantDetail> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const partRes = await client.query<GroupParticipantInvitationRow>(
        `SELECT gp.*, gb.tenant_id, gb.venue_id, gb.expires_at as group_expires_at
         FROM group_participants gp
         JOIN group_bookings gb ON gb.id = gp.group_booking_id
         WHERE gp.invitation_token = $1
         FOR UPDATE`,
        [token],
      );

      if (!partRes.rowCount || partRes.rowCount === 0) {
        throw notFound('INVITATION_NOT_FOUND', 'Invitation token not found');
      }

      const part = partRes.rows[0];

      if (part.status === 'ACCEPTED' || part.user_id !== null) {
        throw conflict('INVITATION_ALREADY_ACCEPTED', 'This invitation has already been accepted');
      }

      if (part.status === 'DECLINED') {
        throw conflict('INVITATION_DECLINED', 'This invitation was previously declined');
      }

      if (new Date(part.token_expires_at) < new Date() || new Date(part.group_expires_at) < new Date()) {
        throw gone('INVITATION_EXPIRED', 'This invitation token has expired');
      }

      // Check if user is already a participant in this group
      const duplicateUserCheck = await client.query(
        'SELECT id FROM group_participants WHERE group_booking_id = $1 AND user_id = $2',
        [part.group_booking_id, userId],
      );
      if (duplicateUserCheck.rowCount && duplicateUserCheck.rowCount > 0) {
        throw conflict('USER_ALREADY_IN_GROUP', 'You are already registered as a participant in this group booking');
      }

      const updRes = await client.query<GroupParticipantRow>(
        `UPDATE group_participants
         SET user_id = $1, status = 'ACCEPTED', accepted_at = now(), updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [userId, part.id],
      );
      const updatedPart = updRes.rows[0];

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'GROUP_INVITATION_ACCEPTED', 'GROUP_PARTICIPANT', $5, $6)`,
        [
          part.tenant_id,
          part.venue_id,
          requestId || randomUUID(),
          userId,
          part.id,
          JSON.stringify({ group_booking_id: part.group_booking_id }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupInvitationAccepted', $3)`,
        [
          part.tenant_id,
          part.group_booking_id,
          JSON.stringify({
            group_booking_id: part.group_booking_id,
            participant_id: part.id,
            user_id: userId,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        id: updatedPart.id,
        user_id: updatedPart.user_id,
        invited_email: updatedPart.invited_email,
        invitation_token: updatedPart.invitation_token,
        is_organizer: updatedPart.is_organizer,
        assigned_resource_id: updatedPart.assigned_resource_id,
        share_total_minor: Number(updatedPart.share_total_minor),
        share_due_now_minor: Number(updatedPart.share_due_now_minor),
        share_balance_minor: Number(updatedPart.share_balance_minor),
        share_paid_minor: Number(updatedPart.share_paid_minor),
        status: updatedPart.status,
        token_expires_at: updatedPart.token_expires_at instanceof Date ? updatedPart.token_expires_at.toISOString() : updatedPart.token_expires_at,
        accepted_at: updatedPart.accepted_at instanceof Date ? updatedPart.accepted_at.toISOString() : updatedPart.accepted_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async declineInvitation(
    token: string,
    requestId: string,
    callerUserId?: string,
  ): Promise<{ declined: boolean }> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const partRes = await client.query<GroupParticipantWithGroupRow>(
        `SELECT gp.*, gb.tenant_id, gb.venue_id
         FROM group_participants gp
         JOIN group_bookings gb ON gb.id = gp.group_booking_id
         WHERE gp.invitation_token = $1
         FOR UPDATE`,
        [token],
      );

      if (!partRes.rowCount || partRes.rowCount === 0) {
        throw notFound('INVITATION_NOT_FOUND', 'Invitation token not found');
      }

      const part = partRes.rows[0];
      if (part.status === 'ACCEPTED') {
        throw conflict('INVITATION_ALREADY_ACCEPTED', 'Cannot decline an invitation that has already been accepted');
      }

      await client.query(
        "UPDATE group_participants SET status = 'DECLINED', updated_at = now() WHERE id = $1",
        [part.id],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'GROUP_INVITATION_DECLINED', 'GROUP_PARTICIPANT', $5, $6)`,
        [
          part.tenant_id,
          part.venue_id,
          requestId || randomUUID(),
          part.user_id || callerUserId || null,
          part.id,
          JSON.stringify({ group_booking_id: part.group_booking_id }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupInvitationDeclined', $3)`,
        [
          part.tenant_id,
          part.group_booking_id,
          JSON.stringify({
            group_booking_id: part.group_booking_id,
            participant_id: part.id,
          }),
        ],
      );

      await client.query('COMMIT');
      return { declined: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // ENG-302: Initiate Group Checkout & Atomic Hold
  // ---------------------------------------------------------------------------

  async initiateCheckout(
    callerUserId: string,
    groupBookingId: string,
    requestId?: string,
  ): Promise<InitiateCheckoutResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const gb = await this.getGroupBooking(callerUserId, groupBookingId, false);

    if (gb.organizer_id !== callerUserId) {
      throw forbidden('NOT_GROUP_ORGANIZER', 'Only the group organizer can initiate checkout');
    }

    if (gb.status === 'CONFIRMED') {
      throw conflict('GROUP_ALREADY_CONFIRMED', 'Group booking has already been confirmed');
    }

    if (gb.status === 'CANCELLED' || gb.status === 'EXPIRED') {
      throw conflict('INVALID_GROUP_STATUS', `Cannot initiate checkout for group booking in status '${gb.status}'`);
    }

    if (gb.mode === 'SPLIT_BY_PARTICIPANT' && !gb.all_participants_accepted) {
      throw badRequest(
        'PENDING_INVITATIONS_EXIST',
        'All invited participants must accept their invitations before checkout can be initiated',
      );
    }

    let holdId = gb.hold_id;
    let expiresAt = gb.expires_at;

    if (!holdId) {
      const holdResult = await this.holdsService.createHold(
        gb.organizer_id,
        { quote_id: gb.quote_id },
        `gb-hold-${gb.id}`,
      );
      holdId = holdResult.id;
      expiresAt = holdResult.expires_at;

      await pool.query(
        `UPDATE group_bookings
         SET hold_id = $1, status = 'PENDING_PAYMENTS', expires_at = $2, updated_at = now()
         WHERE id = $3`,
        [holdId, expiresAt, gb.id],
      );

      await pool.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'GROUP_CHECKOUT_INITIATED', 'GROUP_BOOKING', $5, $6)`,
        [
          gb.tenant_id,
          gb.venue_id,
          reqId,
          callerUserId,
          gb.id,
          JSON.stringify({ hold_id: holdId, expires_at: expiresAt }),
        ],
      );

      await pool.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupCheckoutInitiated', $3)`,
        [
          gb.tenant_id,
          gb.id,
          JSON.stringify({ group_booking_id: gb.id, hold_id: holdId }),
        ],
      );
    }

    const updatedGb = await this.getGroupBooking(callerUserId, groupBookingId, false);
    return {
      group_booking: updatedGb,
      hold_id: holdId,
      expires_at: expiresAt,
    };
  }

  // ---------------------------------------------------------------------------
  // ENG-302: Per-Payer PSP Intent Creation
  // ---------------------------------------------------------------------------

  async createPaymentIntent(
    callerUserId: string,
    groupBookingId: string,
    participantId?: string,
    requestId?: string,
  ): Promise<GroupPaymentIntentResult> {
    const pool = getPool();
    void requestId;
    const gb = await this.getGroupBooking(callerUserId, groupBookingId, false);

    if (gb.status !== 'PENDING_PAYMENTS') {
      throw conflict('INVALID_GROUP_STATUS', `Group booking is in status '${gb.status}', checkout must be initiated first`);
    }

    if (new Date(gb.expires_at).getTime() <= Date.now()) {
      throw conflict('GROUP_BOOKING_EXPIRED', 'Group booking checkout hold has expired');
    }

    let targetParticipant: GroupParticipantDetail | undefined;
    let amountMinor = 0;

    if (gb.mode === 'ORGANIZER_PAYS_ALL') {
      if (gb.organizer_id !== callerUserId) {
        throw forbidden('NOT_GROUP_ORGANIZER', 'Only organizer can create payment intent in ORGANIZER_PAYS_ALL mode');
      }
      targetParticipant = gb.participants.find((p) => p.is_organizer);
      if (!targetParticipant) {
        throw badRequest('ORGANIZER_PARTICIPANT_NOT_FOUND', 'Organizer participant record not found');
      }
      amountMinor = gb.due_now_minor;
    } else {
      if (participantId) {
        targetParticipant = gb.participants.find((p) => p.id === participantId);
        if (!targetParticipant) {
          throw notFound('PARTICIPANT_NOT_FOUND', 'Participant not found in group booking');
        }
        if (targetParticipant.user_id !== callerUserId && gb.organizer_id !== callerUserId) {
          throw forbidden('FORBIDDEN_PAYMENT', 'You cannot create payment intent for another participant');
        }
      } else {
        targetParticipant = gb.participants.find((p) => p.user_id === callerUserId);
        if (!targetParticipant) {
          throw forbidden('FORBIDDEN_PAYMENT', 'You are not a registered participant in this group booking');
        }
      }

      amountMinor = targetParticipant.share_due_now_minor;
    }

    if (targetParticipant.status === 'PAID') {
      throw conflict('SHARE_ALREADY_PAID', 'Participant share is already fully paid');
    }

    if (amountMinor <= 0) {
      throw badRequest('ZERO_DUE_NOW', 'No due-now payment required for this participant');
    }

    const idempotencyKey = `gb-pi-${gb.id}-${targetParticipant.id}-${amountMinor}`;

    const intent = await this.paymentsService.createIntent(
      gb.tenant_id,
      gb.venue_id,
      {
        amountMinor,
        currency: 'RON',
        reference: `GroupBooking:${gb.id}:Participant:${targetParticipant.id}`,
        idempotencyKey,
        metadata: {
          group_booking_id: gb.id,
          group_participant_id: targetParticipant.id,
          participant_user_id: targetParticipant.user_id,
          organizer_id: gb.organizer_id,
        },
      },
      'sandbox',
      gb.id,
      targetParticipant.id,
    );

    if (targetParticipant.status === 'ACCEPTED') {
      await pool.query(
        "UPDATE group_participants SET status = 'PAYING', updated_at = now() WHERE id = $1",
        [targetParticipant.id],
      );
    }

    return {
      intent_id: intent.intentId,
      provider_ref: intent.providerRef,
      client_secret: intent.clientSecret,
      amount_minor: amountMinor,
      currency: 'RON',
      participant_id: targetParticipant.id,
      group_booking_id: gb.id,
      status: intent.status,
    };
  }

  // ---------------------------------------------------------------------------
  // ENG-302: Payment Capture Hook & Atomic Completion Checks
  // ---------------------------------------------------------------------------

  async handlePaymentCaptured(
    providerRef: string,
    requestId?: string,
  ): Promise<PaymentCaptureResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const piRes = await client.query<PaymentIntentRow>(
        'SELECT * FROM payment_intents WHERE provider_ref = $1 FOR UPDATE',
        [providerRef],
      );
      if (piRes.rows.length === 0) {
        throw notFound('PAYMENT_INTENT_NOT_FOUND', 'Payment intent not found');
      }
      const pi = piRes.rows[0];

      if (!pi.group_booking_id) {
        await client.query('COMMIT');
        return {
          confirmed: false,
          group_booking_id: '',
          all_due_paid: false,
          total_paid_minor: 0,
          due_now_minor: 0,
        };
      }

      const gbRes = await client.query<GroupBookingRow>(
        'SELECT * FROM group_bookings WHERE id = $1 FOR UPDATE',
        [pi.group_booking_id],
      );
      if (gbRes.rows.length === 0) {
        throw notFound('GROUP_BOOKING_NOT_FOUND', 'Group booking not found');
      }
      const gb = gbRes.rows[0];

      // TTL Expiry check: PSP confirm after TTL -> refund without resurrection
      const isExpired =
        gb.status === 'EXPIRED' ||
        gb.status === 'CANCELLED' ||
        new Date(gb.expires_at).getTime() <= Date.now();

      if (isExpired) {
        await client.query(
          "UPDATE payment_intents SET status = 'CAPTURED', updated_at = now() WHERE id = $1",
          [pi.id],
        );

        const refundResult = await this.paymentsService.refund({
          providerRef: pi.provider_ref,
          amountMinor: Number(pi.amount_minor),
          idempotencyKey: `refund-post-ttl-${pi.id}`,
          reason: 'PSP_CONFIRM_AFTER_TTL_REFUND',
        });

        const refundInsert = await client.query<{ id: string }>(
          `INSERT INTO refunds (
            tenant_id, venue_id, group_booking_id, payment_intent_id,
            customer_id, amount_minor, currency, status, reason, provider_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, 'RON', 'SUCCEEDED', 'PSP_CONFIRM_AFTER_TTL_REFUND', $7)
          RETURNING id`,
          [
            gb.tenant_id,
            gb.venue_id,
            gb.id,
            pi.id,
            (pi.metadata?.participant_user_id || gb.organizer_id),
            pi.amount_minor,
            refundResult.refundRef,
          ],
        );

        await client.query(
          `INSERT INTO audit_events (
            tenant_id, venue_id, request_id, actor_id, actor_role,
            action, target_type, target_id, metadata
          ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'GROUP_PAYMENT_REFUNDED_AFTER_TTL', 'GROUP_BOOKING', $5, $6)`,
          [
            gb.tenant_id,
            gb.venue_id,
            reqId,
            gb.organizer_id,
            gb.id,
            JSON.stringify({
              payment_intent_id: pi.id,
              refund_id: refundInsert.rows[0].id,
              amount_minor: Number(pi.amount_minor),
            }),
          ],
        );

        await client.query(
          `INSERT INTO outbox_events (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          ) VALUES ($1, 'GroupBooking', $2, 'GroupBookingPaymentRefundedPostExpiry', $3)`,
          [
            gb.tenant_id,
            gb.id,
            JSON.stringify({
              group_booking_id: gb.id,
              payment_intent_id: pi.id,
              amount_minor: Number(pi.amount_minor),
            }),
          ],
        );

        await client.query('COMMIT');
        return {
          confirmed: false,
          group_booking_id: gb.id,
          refunded: true,
          reason: 'GROUP_BOOKING_EXPIRED',
          all_due_paid: false,
          total_paid_minor: 0,
          due_now_minor: Number(gb.due_now_minor),
        };
      }

      if (gb.status === 'CONFIRMED') {
        const bRes = await client.query<{ public_code: string }>(
          'SELECT public_code FROM bookings WHERE id = $1',
          [gb.booking_id],
        );

        if (pi.status !== 'CAPTURED') {
          await client.query(
            "UPDATE payment_intents SET status = 'CAPTURED', updated_at = now() WHERE id = $1",
            [pi.id],
          );

          const refundRes = await this.paymentsService.refund({
            providerRef: pi.provider_ref,
            amountMinor: Number(pi.amount_minor),
            idempotencyKey: `refund-already-covered-${pi.id}`,
            reason: 'SHARE_ALREADY_COVERED_BY_ORGANIZER',
          });

          await client.query(
            `INSERT INTO refunds (
              tenant_id, venue_id, group_booking_id, payment_intent_id,
              customer_id, amount_minor, currency, status, reason, provider_ref
            ) VALUES ($1, $2, $3, $4, $5, $6, 'RON', 'SUCCEEDED', 'SHARE_ALREADY_COVERED_BY_ORGANIZER', $7)`,
            [
              gb.tenant_id,
              gb.venue_id,
              gb.id,
              pi.id,
              (pi.metadata?.participant_user_id || gb.organizer_id),
              pi.amount_minor,
              refundRes.refundRef,
            ],
          );

          await client.query(
            `INSERT INTO audit_events (
              tenant_id, venue_id, request_id, actor_id, actor_role,
              action, target_type, target_id, metadata
            ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'GROUP_PAYMENT_REFUNDED_ALREADY_COVERED', 'GROUP_BOOKING', $5, $6)`,
            [
              gb.tenant_id,
              gb.venue_id,
              reqId,
              gb.organizer_id,
              gb.id,
              JSON.stringify({
                payment_intent_id: pi.id,
                amount_minor: Number(pi.amount_minor),
                reason: 'Booking already confirmed by organizer difference coverage',
              }),
            ],
          );

          await client.query('COMMIT');
          return {
            confirmed: true,
            group_booking_id: gb.id,
            booking_id: gb.booking_id ?? undefined,
            public_code: bRes.rows[0]?.public_code,
            refunded: true,
            reason: 'SHARE_ALREADY_COVERED_BY_ORGANIZER',
            all_due_paid: true,
            total_paid_minor: Number(gb.due_now_minor),
            due_now_minor: Number(gb.due_now_minor),
          };
        }

        await client.query('COMMIT');
        return {
          confirmed: true,
          group_booking_id: gb.id,
          booking_id: gb.booking_id ?? undefined,
          public_code: bRes.rows[0]?.public_code,
          all_due_paid: true,
          total_paid_minor: Number(gb.due_now_minor),
          due_now_minor: Number(gb.due_now_minor),
        };
      }

      const wasAlreadyCaptured = pi.status === 'CAPTURED';
      if (!wasAlreadyCaptured) {
        // Mark participant paid if applicable
        if (pi.group_participant_id) {
          await client.query(
            `UPDATE group_participants
             SET share_paid_minor = share_paid_minor + $1,
                 status = 'PAID',
                 updated_at = now()
             WHERE id = $2`,
            [pi.amount_minor, pi.group_participant_id],
          );
        }

        // Also ensure payment intent status is CAPTURED
        await client.query(
          "UPDATE payment_intents SET status = 'CAPTURED', updated_at = now() WHERE id = $1",
          [pi.id],
        );
      }

      // Check sum of paid shares
      const sumRes = await client.query<{ total_paid: string }>(
        'SELECT COALESCE(SUM(share_paid_minor), 0) as total_paid FROM group_participants WHERE group_booking_id = $1',
        [gb.id],
      );
      const totalPaid = Number(sumRes.rows[0]?.total_paid || 0);
      const dueNow = Number(gb.due_now_minor);

      const allDuePaid = totalPaid >= dueNow;

      if (!allDuePaid) {
        await client.query('COMMIT');
        return {
          confirmed: false,
          group_booking_id: gb.id,
          all_due_paid: false,
          total_paid_minor: totalPaid,
          due_now_minor: dueNow,
        };
      }

      // Confirm booking via BookingsService, inside this transaction: the
      // captured-share proof it checks is only visible to this connection.
      if (!gb.hold_id) {
        throw conflict(
          'GROUP_HOLD_MISSING',
          'Group booking is fully paid but has no hold to confirm; refusing to invent a booking',
        );
      }

      const confirmedBooking = await this.bookingsService.confirmBooking(
        gb.organizer_id,
        { hold_id: gb.hold_id },
        `gb-confirm-${gb.id}`,
        reqId,
        client,
      );

      await client.query(
        `UPDATE group_bookings
         SET status = 'CONFIRMED', booking_id = $1, updated_at = now()
         WHERE id = $2`,
        [confirmedBooking.id, gb.id],
      );

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'GROUP_BOOKING_CONFIRMED', 'GROUP_BOOKING', $5, $6)`,
        [
          gb.tenant_id,
          gb.venue_id,
          reqId,
          gb.organizer_id,
          gb.id,
          JSON.stringify({
            booking_id: confirmedBooking.id,
            public_code: confirmedBooking.public_code,
            total_paid_minor: totalPaid,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupBookingConfirmed', $3)`,
        [
          gb.tenant_id,
          gb.id,
          JSON.stringify({
            group_booking_id: gb.id,
            booking_id: confirmedBooking.id,
            public_code: confirmedBooking.public_code,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        confirmed: true,
        group_booking_id: gb.id,
        booking_id: confirmedBooking.id,
        public_code: confirmedBooking.public_code,
        all_due_paid: true,
        total_paid_minor: totalPaid,
        due_now_minor: dueNow,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // ENG-302: Timeout Compensation / Expiry Reversals
  // ---------------------------------------------------------------------------

  async expireGroupBooking(
    groupBookingId: string,
    requestId?: string,
  ): Promise<ExpireGroupBookingResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const gbRes = await client.query<GroupBookingRow>(
        'SELECT * FROM group_bookings WHERE id = $1 FOR UPDATE',
        [groupBookingId],
      );
      if (gbRes.rows.length === 0) {
        throw notFound('GROUP_BOOKING_NOT_FOUND', 'Group booking not found');
      }
      const gb = gbRes.rows[0];

      if (gb.status === 'CONFIRMED') {
        await client.query('COMMIT');
        return {
          group_booking_id: gb.id,
          expired: false,
          refunded_count: 0,
          refunded_total_minor: 0,
        };
      }

      await client.query(
        "UPDATE group_bookings SET status = 'EXPIRED', updated_at = now() WHERE id = $1",
        [gb.id],
      );

      if (gb.hold_id) {
        await client.query(
          "UPDATE holds SET status = 'EXPIRED', updated_at = now() WHERE id = $1",
          [gb.hold_id],
        );
        await client.query(
          "UPDATE resource_claims SET state = 'RELEASED', updated_at = now() WHERE hold_id = $1",
          [gb.hold_id],
        );
      }

      await client.query(
        "UPDATE group_participants SET status = 'EXPIRED', updated_at = now() WHERE group_booking_id = $1 AND status != 'DECLINED'",
        [gb.id],
      );

      const piRes = await client.query<PaymentIntentRow>(
        "SELECT * FROM payment_intents WHERE group_booking_id = $1 AND status = 'CAPTURED'",
        [gb.id],
      );

      let refundedCount = 0;
      let refundedTotal = 0;

      for (const pi of piRes.rows) {
        const amt = Number(pi.amount_minor);
        const refundRes = await this.paymentsService.refund({
          providerRef: pi.provider_ref,
          amountMinor: amt,
          idempotencyKey: `timeout-refund-${pi.id}`,
          reason: 'GROUP_BOOKING_TIMEOUT_EXPIRED',
        });

        await client.query(
          `INSERT INTO refunds (
            tenant_id, venue_id, group_booking_id, payment_intent_id,
            customer_id, amount_minor, currency, status, reason, provider_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, 'RON', 'SUCCEEDED', 'GROUP_BOOKING_TIMEOUT_EXPIRED', $7)`,
          [
            gb.tenant_id,
            gb.venue_id,
            gb.id,
            pi.id,
            (pi.metadata?.participant_user_id || gb.organizer_id),
            amt,
            refundRes.refundRef,
          ],
        );

        refundedCount++;
        refundedTotal += amt;
      }

      await client.query(
        `INSERT INTO audit_events (
          tenant_id, venue_id, request_id, actor_id, actor_role,
          action, target_type, target_id, metadata
        ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'GROUP_BOOKING_TIMEOUT_EXPIRED', 'GROUP_BOOKING', $5, $6)`,
        [
          gb.tenant_id,
          gb.venue_id,
          reqId,
          gb.organizer_id,
          gb.id,
          JSON.stringify({
            refunded_count: refundedCount,
            refunded_total_minor: refundedTotal,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, 'GroupBooking', $2, 'GroupBookingExpiredRefund', $3)`,
        [
          gb.tenant_id,
          gb.id,
          JSON.stringify({
            group_booking_id: gb.id,
            refunded_count: refundedCount,
            refunded_total_minor: refundedTotal,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        group_booking_id: gb.id,
        expired: true,
        refunded_count: refundedCount,
        refunded_total_minor: refundedTotal,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // ENG-303: Difference Breakdown & Pay-Difference Safety
  // ---------------------------------------------------------------------------

  async getDifferenceSummary(
    callerUserId: string,
    groupBookingId: string,
  ): Promise<DifferenceSummaryResult> {
    const gb = await this.getGroupBooking(callerUserId, groupBookingId, false);
    const pool = getPool();

    const sumRes = await pool.query<{ total_paid: string }>(
      'SELECT COALESCE(SUM(share_paid_minor), 0) as total_paid FROM group_participants WHERE group_booking_id = $1',
      [gb.id],
    );
    const totalPaid = Number(sumRes.rows[0]?.total_paid || 0);
    const dueNow = gb.due_now_minor;
    const outstandingDiff = Math.max(0, dueNow - totalPaid);

    const nowMs = Date.now();
    const expiryMs = new Date(gb.expires_at).getTime();
    const secondsRemaining = Math.max(0, Math.round((expiryMs - nowMs) / 1000));

    const unpaidParticipants: DifferenceSummaryParticipant[] = [];
    const paidParticipants: DifferenceSummaryParticipant[] = [];

    for (const p of gb.participants) {
      const unpaid = Math.max(0, p.share_due_now_minor - p.share_paid_minor);
      const item: DifferenceSummaryParticipant = {
        participant_id: p.id,
        invited_email: p.invited_email,
        is_organizer: p.is_organizer,
        assigned_resource_id: p.assigned_resource_id,
        share_due_now_minor: p.share_due_now_minor,
        share_paid_minor: p.share_paid_minor,
        unpaid_share_minor: unpaid,
        status: p.status,
      };

      if (unpaid > 0) {
        unpaidParticipants.push(item);
      } else {
        paidParticipants.push(item);
      }
    }

    return {
      group_booking_id: gb.id,
      total_minor: gb.total_minor,
      due_now_minor: dueNow,
      total_paid_minor: totalPaid,
      outstanding_difference_minor: outstandingDiff,
      is_fully_paid: outstandingDiff === 0,
      hold_expires_at: gb.hold_id ? gb.expires_at : null,
      seconds_remaining: secondsRemaining,
      unpaid_participants: unpaidParticipants,
      paid_participants: paidParticipants,
    };
  }

  async payDifference(
    callerUserId: string,
    groupBookingId: string,
    requestId?: string,
  ): Promise<PayDifferenceResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const gb = await this.getGroupBooking(callerUserId, groupBookingId, false);

    if (gb.organizer_id !== callerUserId) {
      throw forbidden('NOT_GROUP_ORGANIZER', 'Only the group organizer can pay the remaining difference');
    }

    if (gb.status === 'CONFIRMED') {
      throw conflict('GROUP_ALREADY_CONFIRMED', 'Group booking has already been confirmed');
    }

    if (gb.status !== 'PENDING_PAYMENTS') {
      throw conflict('INVALID_GROUP_STATUS', `Group booking is in status '${gb.status}', must be PENDING_PAYMENTS`);
    }

    if (new Date(gb.expires_at).getTime() <= Date.now()) {
      throw conflict('GROUP_BOOKING_EXPIRED', 'Group booking checkout hold has expired');
    }

    const sumRes = await pool.query<{ total_paid: string }>(
      'SELECT COALESCE(SUM(share_paid_minor), 0) as total_paid FROM group_participants WHERE group_booking_id = $1',
      [gb.id],
    );
    const totalPaid = Number(sumRes.rows[0]?.total_paid || 0);
    const outstandingDiff = Math.max(0, gb.due_now_minor - totalPaid);

    if (outstandingDiff <= 0) {
      throw badRequest('NO_OUTSTANDING_DIFFERENCE', 'All due-now obligations have already been paid');
    }

    const orgParticipant = gb.participants.find((p) => p.is_organizer);
    if (!orgParticipant) {
      throw badRequest('ORGANIZER_PARTICIPANT_NOT_FOUND', 'Organizer participant record not found');
    }

    const idempotencyKey = `gb-paydiff-${gb.id}-${outstandingDiff}`;

    const intent = await this.paymentsService.createIntent(
      gb.tenant_id,
      gb.venue_id,
      {
        amountMinor: outstandingDiff,
        currency: 'RON',
        reference: `GroupBooking:${gb.id}:PayDifference:${callerUserId}`,
        idempotencyKey,
        metadata: {
          group_booking_id: gb.id,
          group_participant_id: orgParticipant.id,
          type: 'PAY_DIFFERENCE',
          covered_by: callerUserId,
          amount_minor: outstandingDiff,
        },
      },
      'sandbox',
      gb.id,
      orgParticipant.id,
    );

    await pool.query(
      `INSERT INTO audit_events (
        tenant_id, venue_id, request_id, actor_id, actor_role,
        action, target_type, target_id, metadata
      ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'GROUP_PAY_DIFFERENCE_INITIATED', 'GROUP_BOOKING', $5, $6)`,
      [
        gb.tenant_id,
        gb.venue_id,
        reqId,
        callerUserId,
        gb.id,
        JSON.stringify({
          difference_amount_minor: outstandingDiff,
          payment_intent_id: intent.intentId,
          provider_ref: intent.providerRef,
        }),
      ],
    );

    return {
      intent_id: intent.intentId,
      provider_ref: intent.providerRef,
      client_secret: intent.clientSecret,
      amount_minor: outstandingDiff,
      currency: 'RON',
      status: intent.status,
      group_booking_id: gb.id,
    };
  }
}
