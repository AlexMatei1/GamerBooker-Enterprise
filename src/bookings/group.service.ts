import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  CreateGroupBookingDto,
  AdjustSharesDto,
  GroupBookingDetail,
  GroupParticipantDetail,
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
export class GroupService {
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
      const gbRes = await client.query<any>(
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
    const gbRes = await pool.query<any>(
      `SELECT gb.*
       FROM group_bookings gb
       WHERE ${condition}`,
      [idOrQuoteId],
    );

    if (!gbRes.rowCount || gbRes.rowCount === 0) {
      throw notFound('GROUP_BOOKING_NOT_FOUND', 'Group booking not found');
    }

    const gb = gbRes.rows[0];

    const partRes = await pool.query<any>(
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

      const gbRes = await client.query<any>(
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

      const partRes = await client.query<any>(
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

      const partRes = await client.query<any>(
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

      const updRes = await client.query<any>(
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

      const partRes = await client.query<any>(
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
}
