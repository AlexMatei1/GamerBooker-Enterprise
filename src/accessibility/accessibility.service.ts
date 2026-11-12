import { Injectable, HttpStatus } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { PricingService } from '../bookings/pricing.service';
import {
  AccessibleLayoutView,
  AccessibleResourceItem,
  AccessibleRoom,
  AccessibleZone,
} from './accessibility.types';

@Injectable()
export class AccessibilityService {
  constructor(private readonly pricingService: PricingService) {}

  async getAccessibleLayout(venueId: string): Promise<AccessibleLayoutView> {
    const pool = getPool();

    // 1. Fetch venue
    const venueRes = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
    }
    const venue = venueRes.rows[0];

    // 2. Fetch rooms
    const roomsRes = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM rooms WHERE venue_id = $1 ORDER BY name ASC',
      [venueId],
    );

    // 3. Fetch zones
    const zonesRes = await pool.query<{
      id: string;
      room_id: string;
      name: string;
    }>('SELECT id, room_id, name FROM zones WHERE venue_id = $1 ORDER BY name ASC', [
      venueId,
    ]);

    // 4. Fetch resources
    const resRes = await pool.query<{
      id: string;
      room_id: string;
      zone_id: string;
      type: string;
      name: string;
      status: string;
      bookable: boolean;
      attributes?: Record<string, unknown> | null;
    }>(
      `SELECT id, room_id, zone_id, type, name, status, bookable, attributes
         FROM resources
        WHERE venue_id = $1
        ORDER BY name ASC`,
      [venueId],
    );

    // Group resources by zone
    const resourcesByZone = new Map<string, typeof resRes.rows>();
    let totalStations = 0;
    let availableStations = 0;

    for (const r of resRes.rows) {
      totalStations++;
      if (r.bookable && r.status === 'AVAILABLE') {
        availableStations++;
      }
      const list = resourcesByZone.get(r.zone_id) || [];
      list.push(r);
      resourcesByZone.set(r.zone_id, list);
    }

    // Group zones by room
    const zonesByRoom = new Map<string, typeof zonesRes.rows>();
    for (const z of zonesRes.rows) {
      const list = zonesByRoom.get(z.room_id) || [];
      list.push(z);
      zonesByRoom.set(z.room_id, list);
    }

    // Build accessible hierarchy
    const accessibleRooms: AccessibleRoom[] = [];

    for (const room of roomsRes.rows) {
      const roomZones = zonesByRoom.get(room.id) || [];
      const accessibleZones: AccessibleZone[] = [];

      for (const zone of roomZones) {
        const zoneResources = resourcesByZone.get(zone.id) || [];
        const accessibleResources: AccessibleResourceItem[] = [];
        let zoneAvailableCount = 0;

        for (const r of zoneResources) {
          const hourlyRate = await this.pricingService.resolveHourlyRate(venueId, r.id);
          const formattedPrice = `${(hourlyRate / 100).toFixed(2)} RON/h`;

          let statusToken: AccessibleResourceItem['status_token'] = 'OUT_OF_ORDER';
          let statusLabel = 'Indisponibil temporar';
          let contrastColorToken = '#424242'; // Charcoal

          if (r.status === 'MAINTENANCE') {
            statusToken = 'UNDER_MAINTENANCE';
            statusLabel = 'În mentenanță tehnică';
            contrastColorToken = '#E65100'; // Amber/Orange
          } else if (r.status === 'OUT_OF_ORDER' || !r.bookable) {
            statusToken = 'OUT_OF_ORDER';
            statusLabel = 'Indisponibil temporar';
            contrastColorToken = '#424242';
          } else if (r.status === 'BOOKED' || r.status === 'OCCUPIED') {
            statusToken = 'CURRENTLY_BOOKED';
            statusLabel = 'Momentan ocupat / rezervat';
            contrastColorToken = '#B71C1C'; // Red
          } else if (r.status === 'AVAILABLE') {
            statusToken = 'AVAILABLE_FOR_BOOKING';
            statusLabel = 'Disponibil pentru rezervare';
            contrastColorToken = '#1B5E20'; // Green
            zoneAvailableCount++;
          }

          const typeName =
            r.type === 'PC'
              ? 'Stație Gaming PC'
              : r.type === 'CONSOLE_SETUP'
                ? 'Consolă Gaming'
                : 'Sală Privată VIP';

          const specs = r.attributes || {};
          const specParts: string[] = [];
          if (specs.cpu) specParts.push(`Procesor ${specs.cpu}`);
          if (specs.gpu) specParts.push(`Placă video ${specs.gpu}`);
          if (specs.ram) specParts.push(`RAM ${specs.ram}`);
          if (specs.monitor) specParts.push(`Monitor ${specs.monitor}`);
          const specText = specParts.length > 0 ? `. Specificații: ${specParts.join(', ')}` : '';

          const ariaLabel = `${r.name}, ${typeName}, Sala ${room.name}, Zona ${zone.name}. Stare: ${statusLabel}. Tarif: ${(hourlyRate / 100).toFixed(2)} RON pe oră (${formattedPrice})${specText}.`;
          const voiceoverText = `${r.name}, ${typeName}. ${statusLabel}. ${formattedPrice}.`;

          accessibleResources.push({
            id: r.id,
            name: r.name,
            type: r.type,
            status: r.status,
            status_label: statusLabel,
            status_token: statusToken,
            contrast_color_token: contrastColorToken,
            hourly_rate_minor: hourlyRate,
            formatted_price: formattedPrice,
            hardware_specs: specs,
            aria_label: ariaLabel,
            voiceover_text: voiceoverText,
          });
        }

        accessibleZones.push({
          id: zone.id,
          name: zone.name,
          description: undefined,
          resource_count: zoneResources.length,
          available_count: zoneAvailableCount,
          resources: accessibleResources,
        });
      }

      accessibleRooms.push({
        id: room.id,
        name: room.name,
        zones: accessibleZones,
      });
    }

    return {
      venue_id: venue.id,
      venue_name: venue.name,
      total_stations: totalStations,
      available_stations: availableStations,
      rooms: accessibleRooms,
      accessibility_statement:
        'Vedere accesibilă GamerBooker conform EN 301 549 și WCAG 2.1 AA/AAA. Structură lineară fără dependență de coordonate vizuale sau coduri de culoare exclusive.',
    };
  }
}
