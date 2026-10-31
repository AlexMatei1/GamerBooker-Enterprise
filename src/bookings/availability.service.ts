import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { SchedulesService } from './schedules.service';

export interface TimeWindow {
  start: string; // ISO-8601 UTC
  end: string;   // ISO-8601 UTC
}

export interface ResourceAvailability {
  resourceId: string;
  resourceName: string;
  resourceType: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
  availableWindows: TimeWindow[];
}

interface Interval {
  start: number; // epoch ms
  end: number;   // epoch ms
}

function subtractIntervals(open: Interval[], blocked: Interval[]): Interval[] {
  let result = [...open];

  for (const b of blocked) {
    const next: Interval[] = [];
    for (const cur of result) {
      if (b.end <= cur.start || b.start >= cur.end) {
        // No overlap
        next.push(cur);
      } else {
        // Overlap exists
        if (b.start > cur.start) {
          next.push({ start: cur.start, end: b.start });
        }
        if (b.end < cur.end) {
          next.push({ start: b.end, end: cur.end });
        }
      }
    }
    result = next;
  }

  return result.filter((i) => i.start < i.end);
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly schedulesService: SchedulesService) {}

  async getAvailability(
    venueId: string,
    from: Date,
    to: Date,
    resourceType?: string,
  ): Promise<{ venueId: string; from: string; to: string; resources: ResourceAvailability[] }> {
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'AVAILABILITY_INVALID_RANGE',
        "'from' and 'to' must be valid ISO-8601 dates.",
      );
    }

    if (from >= to) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'AVAILABILITY_INVALID_RANGE',
        "'from' must be strictly before 'to'.",
      );
    }

    const maxWindowMs = 14 * 24 * 60 * 60 * 1000; // 14 days
    if (to.getTime() - from.getTime() > maxWindowMs) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'AVAILABILITY_RANGE_TOO_LARGE',
        'Availability query range cannot exceed 14 days.',
      );
    }

    const pool = getPool();

    // 1. Check venue exists and publication_state
    const venueRes = await pool.query<{ publication_state: string; timezone: string }>(
      'SELECT publication_state, timezone FROM venues WHERE id = $1',
      [venueId],
    );
    if (venueRes.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Venue not found.',
      );
    }

    // 2. Load operating schedules & exceptions
    const weekly = await this.schedulesService.getWeeklySchedule(venueId);
    const exceptions = await this.schedulesService.getExceptions(venueId);
    const weeklyByDay = new Map(weekly.map((w) => [w.day_of_week, w]));
    const exceptionsByDate = new Map(
      exceptions.map((e) => [
        typeof e.date === 'string' ? e.date.slice(0, 10) : new Date(e.date).toISOString().slice(0, 10),
        e,
      ]),
    );

    // 3. Load active bookable resources
    let resourceSql =
      'SELECT id, name, type, status, bookable FROM resources WHERE venue_id = $1 AND bookable = true';
    const resourceParams: unknown[] = [venueId];
    if (resourceType) {
      resourceSql += ' AND type = $2';
      resourceParams.push(resourceType);
    }
    resourceSql += ' ORDER BY name ASC';

    const resourcesRes = await pool.query<{
      id: string;
      name: string;
      type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
      status: string;
      bookable: boolean;
    }>(resourceSql, resourceParams);

    // 4. Load DAG components (parents and children)
    const componentsRes = await pool.query<{
      parent_resource_id: string;
      child_resource_id: string;
    }>('SELECT parent_resource_id, child_resource_id FROM resource_components WHERE venue_id = $1', [
      venueId,
    ]);

    const childrenByParent = new Map<string, Set<string>>();
    const parentsByChild = new Map<string, Set<string>>();

    for (const c of componentsRes.rows) {
      if (!childrenByParent.has(c.parent_resource_id)) {
        childrenByParent.set(c.parent_resource_id, new Set());
      }
      childrenByParent.get(c.parent_resource_id)?.add(c.child_resource_id);

      if (!parentsByChild.has(c.child_resource_id)) {
        parentsByChild.set(c.child_resource_id, new Set());
      }
      parentsByChild.get(c.child_resource_id)?.add(c.parent_resource_id);
    }

    // 5. Load active claims intersecting [from, to)
    const claimsRes = await pool.query<{
      resource_id: string;
      slot_start: Date;
      slot_end: Date;
    }>(
      `SELECT resource_id, lower(slot) as slot_start, upper(slot) as slot_end
         FROM resource_claims
        WHERE state IN ('ACTIVE_HOLD', 'CONFIRMED')
          AND slot && tstzrange($1::timestamptz, $2::timestamptz, '[)')`,
      [from.toISOString(), to.toISOString()],
    );

    const claimsByResource = new Map<string, Interval[]>();
    for (const claim of claimsRes.rows) {
      if (!claimsByResource.has(claim.resource_id)) {
        claimsByResource.set(claim.resource_id, []);
      }
      claimsByResource.get(claim.resource_id)?.push({
        start: new Date(claim.slot_start).getTime(),
        end: new Date(claim.slot_end).getTime(),
      });
    }

    // 6. Generate baseline operating windows across the query range
    const baseOperatingWindows: Interval[] = [];
    const curDate = new Date(from);
    curDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(to);
    endDate.setUTCHours(23, 59, 59, 999);

    while (curDate <= endDate) {
      const dateKey = curDate.toISOString().slice(0, 10);
      const dayOfWeek = curDate.getUTCDay();

      let openTimeStr: string | null = null;
      let closeTimeStr: string | null = null;
      let isClosed = false;

      const exception = exceptionsByDate.get(dateKey);
      if (exception) {
        if (exception.is_closed) {
          isClosed = true;
        } else {
          openTimeStr = exception.open_time;
          closeTimeStr = exception.close_time;
        }
      } else {
        const schedule = weeklyByDay.get(dayOfWeek);
        if (!schedule || schedule.is_closed) {
          isClosed = true;
        } else {
          openTimeStr = schedule.open_time;
          closeTimeStr = schedule.close_time;
        }
      }

      if (!isClosed && openTimeStr && closeTimeStr) {
        const [oH, oM] = openTimeStr.split(':').map(Number);
        const [cH, cM] = closeTimeStr.split(':').map(Number);

        const openEpoch = new Date(curDate);
        openEpoch.setUTCHours(oH, oM, 0, 0);

        const closeEpoch = new Date(curDate);
        if (cH < oH || (cH === oH && cM <= oM)) {
          // Cross-midnight: closes the next UTC day
          closeEpoch.setUTCDate(closeEpoch.getUTCDate() + 1);
        }
        closeEpoch.setUTCHours(cH, cM, 0, 0);

        // Clamp to query range [from, to)
        const winStart = Math.max(openEpoch.getTime(), from.getTime());
        const winEnd = Math.min(closeEpoch.getTime(), to.getTime());

        if (winStart < winEnd) {
          baseOperatingWindows.push({ start: winStart, end: winEnd });
        }
      }

      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    // 7. Compute availability per resource
    const availabilityResults: ResourceAvailability[] = [];

    for (const res of resourcesRes.rows) {
      // If resource is MAINTENANCE or TEMP_BLOCKED, no available windows
      if (res.status !== 'AVAILABLE') {
        availabilityResults.push({
          resourceId: res.id,
          resourceName: res.name,
          resourceType: res.type,
          availableWindows: [],
        });
        continue;
      }

      // Collect all blocked intervals for this resource (direct + DAG relations)
      const blocked: Interval[] = [...(claimsByResource.get(res.id) ?? [])];

      // If PRIVATE_ROOM: any claim on a component child also blocks the room
      const children = childrenByParent.get(res.id);
      if (children) {
        for (const childId of children) {
          const childClaims = claimsByResource.get(childId) ?? [];
          blocked.push(...childClaims);
        }
      }

      // If child component: any claim on a containing parent also blocks the child
      const parents = parentsByChild.get(res.id);
      if (parents) {
        for (const parentId of parents) {
          const parentClaims = claimsByResource.get(parentId) ?? [];
          blocked.push(...parentClaims);
        }
      }

      const availableIntervals = subtractIntervals(baseOperatingWindows, blocked);

      availabilityResults.push({
        resourceId: res.id,
        resourceName: res.name,
        resourceType: res.type,
        availableWindows: availableIntervals.map((i) => ({
          start: new Date(i.start).toISOString(),
          end: new Date(i.end).toISOString(),
        })),
      });
    }

    return {
      venueId,
      from: from.toISOString(),
      to: to.toISOString(),
      resources: availabilityResults,
    };
  }
}
