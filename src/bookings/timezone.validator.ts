import { HttpStatus } from '@nestjs/common';
import { AuthHttpError } from '../auth/auth-error';

/**
 * Validates a timestamp string against a venue timezone (e.g. Europe/Bucharest).
 * Enforces:
 * 1. String must be valid ISO-8601 with explicit timezone offset (e.g. 'Z', '+02:00', '+03:00').
 * 2. DST Spring-Forward: If local time falls into the skipped/missing hour (e.g. 03:00-03:59 on spring-forward Sunday in Europe/Bucharest),
 *    the request is rejected with DST_INVALID_LOCAL_TIME.
 * 3. DST Fall-Back: Explicit timezone offset is strictly required so repeated local hours (e.g. 03:00-03:59 on fall-back Sunday)
 *    are unambiguously resolved to the correct UTC instant.
 */
export function validateTimezoneSlot(
  inputStr: string,
  timezone: string = 'Europe/Bucharest',
): Date {
  const d = new Date(inputStr);
  if (isNaN(d.getTime())) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'INVALID_DATETIME',
      `Invalid date/time timestamp: ${inputStr}`,
    );
  }

  // Check if string has explicit offset (Z or +/-HH:MM or +/-HHMM)
  const offsetRegex = /(Z|[+-]\d{2}:?\d{2})$/i;
  const match = inputStr.trim().match(offsetRegex);
  if (!match) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'DST_MISSING_EXPLICIT_OFFSET',
      `Timestamp '${inputStr}' must include an explicit timezone offset (e.g., '+02:00', '+03:00', or 'Z') for timezone ${timezone}.`,
    );
  }

  const offsetStr = match[1].toUpperCase();
  if (offsetStr !== 'Z') {
    const localMatch = inputStr.match(/T(\d{2}):(\d{2})/i);
    if (localMatch) {
      const inputLocalHour = Number(localMatch[1]);
      const inputLocalMin = Number(localMatch[2]);
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(d);
      const tzHour = Number(parts.find((p) => p.type === 'hour')?.value);
      const tzMin = Number(parts.find((p) => p.type === 'minute')?.value);

      if (tzHour !== inputLocalHour || tzMin !== inputLocalMin) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'DST_INVALID_LOCAL_TIME',
          `The requested time '${inputStr}' does not exist in timezone '${timezone}' due to daylight saving spring-forward transition (clocks jumped from 03:00 to 04:00).`,
        );
      }
    }
  }

  return d;
}
