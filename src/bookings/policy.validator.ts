import { HttpStatus } from '@nestjs/common';
import { AuthHttpError } from '../auth/auth-error';
import {
  DEFAULT_PLATFORM_POLICY,
  type PolicySettings,
} from './policy.types';

export function validatePolicySettings(
  partial: Partial<PolicySettings>,
  base: PolicySettings = DEFAULT_PLATFORM_POLICY,
): PolicySettings {
  const merged: PolicySettings = { ...base, ...partial };

  if (merged.prepaid_mode !== 'FULL' && merged.prepaid_mode !== 'DEPOSIT') {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      "prepaid_mode must be 'FULL' or 'DEPOSIT'.",
    );
  }

  if (
    typeof merged.deposit_percentage !== 'number' ||
    merged.deposit_percentage < 10 ||
    merged.deposit_percentage > 100
  ) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      'deposit_percentage must be an integer between 10 and 100.',
    );
  }

  const validSettlementModes = ['ONLINE_ONLY', 'RECEPTION_ONLY', 'ONLINE_OR_RECEPTION'];
  if (!validSettlementModes.includes(merged.deposit_mode_settlement)) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      `deposit_mode_settlement must be one of: ${validSettlementModes.join(', ')}.`,
    );
  }

  if (
    typeof merged.min_duration_minutes !== 'number' ||
    merged.min_duration_minutes < 15 ||
    typeof merged.max_duration_minutes !== 'number' ||
    merged.max_duration_minutes < merged.min_duration_minutes
  ) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      'min_duration_minutes must be >= 15 and max_duration_minutes must be >= min_duration_minutes.',
    );
  }

  if (
    typeof merged.slot_granularity_minutes !== 'number' ||
    ![15, 30, 60].includes(merged.slot_granularity_minutes)
  ) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      'slot_granularity_minutes must be 15, 30, or 60.',
    );
  }

  if (
    typeof merged.buffer_after_minutes !== 'number' ||
    merged.buffer_after_minutes < 0 ||
    merged.buffer_after_minutes > 120
  ) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      'buffer_after_minutes must be between 0 and 120.',
    );
  }

  if (
    typeof merged.free_cancellation_hours !== 'number' ||
    merged.free_cancellation_hours < 0
  ) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      'free_cancellation_hours must be >= 0.',
    );
  }

  if (
    typeof merged.late_cancellation_penalty_percent !== 'number' ||
    merged.late_cancellation_penalty_percent < 0 ||
    merged.late_cancellation_penalty_percent > 100
  ) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_INVALID_SETTINGS',
      'late_cancellation_penalty_percent must be between 0 and 100.',
    );
  }

  return merged;
}

export function validateBookingInterval(
  startAt: Date,
  endAt: Date,
  policy: PolicySettings,
): void {
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'BOOKING_INVALID_DATES',
      'startAt and endAt must be valid dates.',
    );
  }

  if (startAt >= endAt) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'BOOKING_INVALID_INTERVAL',
      'startAt must be strictly before endAt.',
    );
  }

  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

  if (durationMinutes < policy.min_duration_minutes) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_DURATION_OUT_OF_BOUNDS',
      `Booking duration (${durationMinutes}m) is less than the minimum required (${policy.min_duration_minutes}m).`,
      { durationMinutes, minDuration: policy.min_duration_minutes },
    );
  }

  if (durationMinutes > policy.max_duration_minutes) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_DURATION_OUT_OF_BOUNDS',
      `Booking duration (${durationMinutes}m) exceeds the maximum allowed (${policy.max_duration_minutes}m).`,
      { durationMinutes, maxDuration: policy.max_duration_minutes },
    );
  }

  if (durationMinutes % policy.slot_granularity_minutes !== 0) {
    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'POLICY_DURATION_NOT_ALIGNED',
      `Booking duration (${durationMinutes}m) must be a multiple of slot granularity (${policy.slot_granularity_minutes}m).`,
      { durationMinutes, granularity: policy.slot_granularity_minutes },
    );
  }
}
