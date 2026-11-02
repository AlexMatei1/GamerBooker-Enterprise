import { Injectable, HttpStatus } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import {
  CreateDeferredLinkInput,
  DeepLinkResolveQuery,
  DeepLinkResolveResult,
  DeferredLinkResult,
  DevicePlatform,
  FunnelAnalyticsSummary,
  RecordFunnelEventInput,
} from './accessibility.types';

export const APP_STORE_URL = 'https://apps.apple.com/app/gamerbooker/id1669876543';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=ro.gamerbooker.app';
export const WEB_BASE_URL = 'https://gamerbooker.ro';

@Injectable()
export class DeepLinkService {
  resolvePlatform(userAgent?: string): DevicePlatform {
    if (!userAgent) return 'OTHER';
    const ua = userAgent.toLowerCase();
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      return 'IOS';
    }
    if (ua.includes('android')) {
      return 'ANDROID';
    }
    if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) {
      return 'DESKTOP_WEB';
    }
    return 'OTHER';
  }

  async resolveDeepLink(
    query: DeepLinkResolveQuery,
    userAgent?: string,
  ): Promise<DeepLinkResolveResult> {
    const pool = getPool();
    const platform = this.resolvePlatform(userAgent);
    const venueId = query.venue_id;

    let venueDetails: { id: string; name: string; timezone: string } | undefined;
    if (venueId) {
      const vRes = await pool.query<{ id: string; name: string; timezone: string }>(
        'SELECT id, name, timezone FROM venues WHERE id = $1',
        [venueId],
      );
      if (vRes.rows.length > 0) {
        venueDetails = vRes.rows[0];
      }
    }

    // Target parameters
    const params = new URLSearchParams();
    if (query.zone_id) params.set('zone_id', query.zone_id);
    if (query.package_id) params.set('package_id', query.package_id);
    if (query.source_tag) params.set('source_tag', query.source_tag);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const appPath = venueId ? `venues/${venueId}${queryString}` : '';
    const appUrl = `gamerbooker://${appPath}`;
    const webLandingUrl = venueId ? `${WEB_BASE_URL}/venues/${venueId}${queryString}` : `${WEB_BASE_URL}/install`;

    let storeUrl = APP_STORE_URL;
    let targetRedirectUrl = webLandingUrl;

    if (platform === 'IOS') {
      storeUrl = APP_STORE_URL;
      targetRedirectUrl = appUrl; // Universal link / scheme
    } else if (platform === 'ANDROID') {
      storeUrl = PLAY_STORE_URL;
      targetRedirectUrl = venueId
        ? `intent://venues/${venueId}${queryString}#Intent;scheme=gamerbooker;package=ro.gamerbooker.app;end`
        : PLAY_STORE_URL;
    } else {
      storeUrl = WEB_BASE_URL;
      targetRedirectUrl = webLandingUrl;
    }

    // Create deferred link token for app install onboarding if venue is targeted
    let deferredToken: string | undefined;
    if (venueId) {
      const deferred = await this.createDeferredLink({
        venue_id: venueId,
        zone_id: query.zone_id,
        package_id: query.package_id,
        metadata: { source_tag: query.source_tag, platform },
        ttl_seconds: 7 * 24 * 3600, // 7 days
      });
      deferredToken = deferred.token;
    }

    // Automatically record scan analytics
    const sessionId = query.session_id || randomBytes(12).toString('hex');
    if (venueId) {
      await this.recordFunnelEvent({
        venue_id: venueId,
        session_id: sessionId,
        milestone: 'SCANNED',
        platform,
        source_tag: query.source_tag,
      });

      if (platform === 'IOS' || platform === 'ANDROID') {
        await this.recordFunnelEvent({
          venue_id: venueId,
          session_id: sessionId,
          milestone: 'STORE_REDIRECTED',
          platform,
          source_tag: query.source_tag,
        });
      }
    }

    return {
      platform,
      app_url: appUrl,
      store_url: storeUrl,
      web_landing_url: webLandingUrl,
      target_redirect_url: targetRedirectUrl,
      deferred_token: deferredToken,
      web_checkout_permitted: false,
      notice:
        'Rezervările se efectuează exclusiv din aplicația mobilă GamerBooker instalată din App Store sau Google Play. Checkout-ul web este interzis pentru securitatea tranzacției și a check-in-ului cu token rotativ.',
      venue_details: venueDetails,
    };
  }

  async createDeferredLink(input: CreateDeferredLinkInput): Promise<DeferredLinkResult> {
    const pool = getPool();
    const token = `dlnk_${randomBytes(16).toString('hex')}`;
    const ttlSeconds = input.ttl_seconds || 7 * 24 * 3600;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const res = await pool.query<any>(
      `INSERT INTO deferred_deeplinks (
         token, venue_id, zone_id, package_id, metadata, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        token,
        input.venue_id,
        input.zone_id || null,
        input.package_id || null,
        JSON.stringify(input.metadata || {}),
        expiresAt,
      ],
    );

    const row = res.rows[0];
    return {
      token: row.token,
      venue_id: row.venue_id,
      zone_id: row.zone_id,
      package_id: row.package_id,
      metadata: row.metadata,
      expires_at: row.expires_at.toISOString(),
      consumed: row.consumed,
    };
  }

  async getDeferredLink(token: string): Promise<DeferredLinkResult> {
    const pool = getPool();
    const res = await pool.query<any>(
      'SELECT * FROM deferred_deeplinks WHERE token = $1',
      [token],
    );

    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'DEFERRED_LINK_NOT_FOUND',
        'Deferred deep link token not found.',
      );
    }

    const row = res.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AuthHttpError(
        HttpStatus.GONE,
        'DEFERRED_LINK_EXPIRED',
        'Deferred deep link has expired.',
      );
    }

    // Mark consumed and record milestone
    await pool.query(
      'UPDATE deferred_deeplinks SET consumed = true, consumed_at = now() WHERE id = $1',
      [row.id],
    );

    await this.recordFunnelEvent({
      venue_id: row.venue_id,
      session_id: token,
      milestone: 'DEFERRED_LINK_RESOLVED',
      source_tag: row.metadata?.source_tag,
    });

    return {
      token: row.token,
      venue_id: row.venue_id,
      zone_id: row.zone_id,
      package_id: row.package_id,
      metadata: row.metadata,
      expires_at: new Date(row.expires_at).toISOString(),
      consumed: true,
    };
  }

  async recordFunnelEvent(input: RecordFunnelEventInput): Promise<{ recorded: boolean }> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO qr_funnel_events (
         venue_id, session_id, milestone, platform, source_tag
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.venue_id,
        input.session_id,
        input.milestone,
        input.platform || 'OTHER',
        input.source_tag || null,
      ],
    );
    return { recorded: true };
  }

  async getFunnelAnalytics(venueId: string): Promise<FunnelAnalyticsSummary> {
    const pool = getPool();
    const countsRes = await pool.query<{ milestone: string; count: string }>(
      `SELECT milestone, count(*)::text as count
         FROM qr_funnel_events
        WHERE venue_id = $1
        GROUP BY milestone`,
      [venueId],
    );

    const countsMap = new Map<string, number>();
    for (const r of countsRes.rows) {
      countsMap.set(r.milestone, Number(r.count));
    }

    const platformRes = await pool.query<{ platform: string; count: string }>(
      `SELECT platform, count(*)::text as count
         FROM qr_funnel_events
        WHERE venue_id = $1
        GROUP BY platform`,
      [venueId],
    );

    const platformMap: Record<string, number> = {};
    for (const r of platformRes.rows) {
      platformMap[r.platform] = Number(r.count);
    }

    const totalScans = countsMap.get('SCANNED') || 0;
    const storeRedirects = countsMap.get('STORE_REDIRECTED') || 0;
    const appOpens = countsMap.get('APP_OPENED') || 0;
    const deferredResolved = countsMap.get('DEFERRED_LINK_RESOLVED') || 0;
    const bookingsStarted = countsMap.get('BOOKING_STARTED') || 0;
    const bookingsCompleted = countsMap.get('BOOKING_COMPLETED') || 0;

    const conversionRate = totalScans > 0 ? Math.round((bookingsCompleted / totalScans) * 1000) / 10 : 0;

    return {
      venue_id: venueId,
      total_scans: totalScans,
      store_redirects: storeRedirects,
      app_opens: appOpens,
      deferred_links_resolved: deferredResolved,
      bookings_started: bookingsStarted,
      bookings_completed: bookingsCompleted,
      conversion_rate_percent: conversionRate,
      by_platform: platformMap,
    };
  }
}
