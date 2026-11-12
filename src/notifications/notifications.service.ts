import { Injectable, HttpStatus } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { TemplatesService } from './templates.service';
import {
  DispatchNotificationInput,
  DispatchNotificationResult,
  NotificationChannel,
  NotificationItem,
  NotificationPreference,
  UpdateNotificationPreferenceInput,
} from './notifications.types';

@Injectable()
export class NotificationsService {
  constructor(private readonly templatesService: TemplatesService) {}

  async getPreferences(userId: string): Promise<NotificationPreference> {
    const pool = getPool();
    const res = await pool.query<NotificationPreference>(
      'SELECT user_id, email_enabled, push_enabled, in_app_enabled, marketing_opt_in, updated_at FROM notification_preferences WHERE user_id = $1',
      [userId],
    );

    if (res.rows.length > 0) {
      return res.rows[0];
    }

    // Initialize defaults
    const insertRes = await pool.query<NotificationPreference>(
      `INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, in_app_enabled, marketing_opt_in)
       VALUES ($1, true, true, true, false)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING user_id, email_enabled, push_enabled, in_app_enabled, marketing_opt_in, updated_at`,
      [userId],
    );
    return insertRes.rows[0];
  }

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferenceInput,
  ): Promise<NotificationPreference> {
    const pool = getPool();
    const current = await this.getPreferences(userId);

    const email = input.email_enabled ?? current.email_enabled;
    const push = input.push_enabled ?? current.push_enabled;
    const inApp = input.in_app_enabled ?? current.in_app_enabled;
    const marketing = input.marketing_opt_in ?? current.marketing_opt_in;

    const res = await pool.query<NotificationPreference>(
      `INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, in_app_enabled, marketing_opt_in, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE
         SET email_enabled = EXCLUDED.email_enabled,
             push_enabled = EXCLUDED.push_enabled,
             in_app_enabled = EXCLUDED.in_app_enabled,
             marketing_opt_in = EXCLUDED.marketing_opt_in,
             updated_at = now()
       RETURNING user_id, email_enabled, push_enabled, in_app_enabled, marketing_opt_in, updated_at`,
      [userId, email, push, inApp, marketing],
    );

    return res.rows[0];
  }

  async dispatch(input: DispatchNotificationInput): Promise<DispatchNotificationResult> {
    const channel: NotificationChannel = input.channel || 'IN_APP';
    const pool = getPool();

    // 1. Check user preferences
    const prefs = await this.getPreferences(input.recipientId);

    // Operational events always bypass channel toggle, marketing strictly checks opt-in
    if (input.isMarketing && !prefs.marketing_opt_in) {
      return {
        deliveryId: 'skipped',
        status: 'SKIPPED',
        channel,
        reason: 'MARKETING_OPT_OUT',
      };
    }

    // 2. Render localized template
    const rendered = this.templatesService.render(input.eventType, input.context);

    // 3. Insert delivery record with unique idempotency check
    const deliveryRes = await pool.query<{ id: string }>(
      `INSERT INTO notification_deliveries (
         event_id, recipient_id, channel, event_type, template_key, status, payload
       )
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
       ON CONFLICT (event_id, recipient_id, channel) DO NOTHING
       RETURNING id`,
      [
        input.eventId,
        input.recipientId,
        channel,
        input.eventType,
        input.templateKey || input.eventType,
        JSON.stringify(input.context),
      ],
    );

    if (deliveryRes.rows.length === 0) {
      // Already processed idempotently
      return {
        deliveryId: 'duplicate',
        status: 'SKIPPED',
        channel,
        title: rendered.subject,
        body: rendered.bodyText,
        reason: 'DUPLICATE_DELIVERY',
      };
    }

    const deliveryId = deliveryRes.rows[0].id;

    // 4. If IN_APP, store in notifications inbox
    if (channel === 'IN_APP') {
      await pool.query(
        `INSERT INTO notifications (
           tenant_id, user_id, event_type, title, body, channel, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.tenantId || null,
          input.recipientId,
          input.eventType,
          rendered.subject,
          rendered.bodyText,
          channel,
          JSON.stringify(input.context),
        ],
      );
    }

    // 5. Mark delivery as SENT
    await pool.query(
      `UPDATE notification_deliveries
          SET status = 'SENT', sent_at = now()
        WHERE id = $1`,
      [deliveryId],
    );

    return {
      deliveryId,
      status: 'SENT',
      channel,
      title: rendered.subject,
      body: rendered.bodyText,
    };
  }

  async listNotifications(
    userId: string,
    query?: { limit?: number; offset?: number; unread_only?: boolean },
  ): Promise<{ items: NotificationItem[]; total: number; unread_count: number }> {
    const pool = getPool();
    const limit = Math.min(Math.max(Number(query?.limit) || 20, 1), 100);
    const offset = Math.max(Number(query?.offset) || 0, 0);
    const unreadOnly = query?.unread_only === true || String(query?.unread_only) === 'true';

    let filterSql = 'WHERE user_id = $1';
    const params: unknown[] = [userId];

    if (unreadOnly) {
      filterSql += ' AND read = false';
    }

    const itemsRes = await pool.query<NotificationItem>(
      `SELECT id, tenant_id, user_id, event_type, title, body, channel, metadata, read, read_at, created_at
         FROM notifications
        ${filterSql}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [...params, limit, offset],
    );

    const countRes = await pool.query<{ total: string; unread: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE read = false)::text AS unread
         FROM notifications
        WHERE user_id = $1`,
      [userId],
    );

    return {
      items: itemsRes.rows,
      total: Number(countRes.rows[0]?.total || 0),
      unread_count: Number(countRes.rows[0]?.unread || 0),
    };
  }

  async markAsRead(userId: string, notificationId: string): Promise<NotificationItem> {
    const pool = getPool();
    const res = await pool.query<NotificationItem>(
      `UPDATE notifications
          SET read = true, read_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, tenant_id, user_id, event_type, title, body, channel, metadata, read, read_at, created_at`,
      [notificationId, userId],
    );

    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'NOTIFICATION_NOT_FOUND',
        'Notification not found or access denied.',
      );
    }

    return res.rows[0];
  }

  async markAllAsRead(userId: string): Promise<{ updated_count: number }> {
    const pool = getPool();
    const res = await pool.query(
      `UPDATE notifications
          SET read = true, read_at = now()
        WHERE user_id = $1 AND read = false`,
      [userId],
    );

    return { updated_count: res.rowCount || 0 };
  }
}
