import { HttpStatus, Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';

export interface OperatingScheduleRow {
  id: string;
  venue_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OperatingScheduleInput {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed?: boolean;
}

export interface ScheduleExceptionRow {
  id: string;
  venue_id: string;
  date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleExceptionInput {
  date: string; // YYYY-MM-DD
  isClosed?: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  reason?: string | null;
}

@Injectable()
export class SchedulesService {
  async getWeeklySchedule(venueId: string): Promise<OperatingScheduleRow[]> {
    const pool = getPool();
    const res = await pool.query<OperatingScheduleRow>(
      'SELECT * FROM operating_schedules WHERE venue_id = $1 ORDER BY day_of_week ASC',
      [venueId],
    );
    return res.rows;
  }

  async setWeeklySchedule(
    venueId: string,
    schedules: OperatingScheduleInput[],
  ): Promise<OperatingScheduleRow[]> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const item of schedules) {
        if (item.dayOfWeek < 0 || item.dayOfWeek > 6) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'SCHEDULE_INVALID_DAY',
            'dayOfWeek must be between 0 (Sunday) and 6 (Saturday).',
          );
        }

        const isClosed = Boolean(item.isClosed);
        await client.query(
          `INSERT INTO operating_schedules
            (venue_id, day_of_week, open_time, close_time, is_closed, updated_at)
           VALUES ($1, $2, $3::time, $4::time, $5, now())
           ON CONFLICT (venue_id, day_of_week) DO UPDATE SET
            open_time = EXCLUDED.open_time,
            close_time = EXCLUDED.close_time,
            is_closed = EXCLUDED.is_closed,
            updated_at = now()`,
          [venueId, item.dayOfWeek, item.openTime, item.closeTime, isClosed],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    return this.getWeeklySchedule(venueId);
  }

  async getExceptions(venueId: string): Promise<ScheduleExceptionRow[]> {
    const pool = getPool();
    const res = await pool.query<ScheduleExceptionRow>(
      'SELECT id, venue_id, date::text as date, is_closed, open_time, close_time, reason, created_at, updated_at FROM schedule_exceptions WHERE venue_id = $1 ORDER BY date ASC',
      [venueId],
    );
    return res.rows;
  }

  async addException(
    venueId: string,
    input: ScheduleExceptionInput,
  ): Promise<ScheduleExceptionRow> {
    const pool = getPool();
    const isClosed = Boolean(input.isClosed);
    const openTime = input.openTime || null;
    const closeTime = input.closeTime || null;
    const reason = input.reason || null;

    const res = await pool.query<ScheduleExceptionRow>(
      `INSERT INTO schedule_exceptions
        (venue_id, date, is_closed, open_time, close_time, reason, updated_at)
       VALUES ($1, $2::date, $3, $4::time, $5::time, $6, now())
       ON CONFLICT (venue_id, date) DO UPDATE SET
        is_closed = EXCLUDED.is_closed,
        open_time = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        reason = EXCLUDED.reason,
        updated_at = now()
       RETURNING id, venue_id, date::text as date, is_closed, open_time, close_time, reason, created_at, updated_at`,
      [venueId, input.date, isClosed, openTime, closeTime, reason],
    );

    return res.rows[0];
  }

  async deleteException(venueId: string, exceptionId: string): Promise<boolean> {
    const pool = getPool();
    const res = await pool.query(
      'DELETE FROM schedule_exceptions WHERE id = $1 AND venue_id = $2',
      [exceptionId, venueId],
    );
    if (res.rowCount === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'SCHEDULE_EXCEPTION_NOT_FOUND',
        'Schedule exception not found.',
      );
    }
    return true;
  }
}
