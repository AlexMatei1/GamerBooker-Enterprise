// Hand-rolled request validation.
// class-validator is NOT a dependency of this repository (package.json and
// package-lock.json carry only Nest core / platform-express, argon2, otel, pg,
// prisma and tooling), so it is not used and not added.
//
// Failures feed the standard envelope directly and never echo a secret: the
// password value and any token value stay out of message and details; only the
// field name and a category are reported.

export interface FieldIssue {
  field: string;
  kind: string;
}

/** Thrown by a validator. The controller maps it to 400 VALIDATION_ERROR. */
export class ValidationFailure extends Error {
  constructor(readonly issues: FieldIssue[]) {
    super('validation failed');
    this.name = 'ValidationFailure';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const TOKEN_MAX = 512;

export const SESSION_KINDS = ['mobile', 'dashboard'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  kind: SessionKind;
}

export interface VerifyInput {
  token: string;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function requireString(value: unknown, field: string, issues: FieldIssue[]) {
  if (typeof value !== 'string') {
    issues.push({ field, kind: 'required' });
    return '';
  }
  return value;
}

export function normalizeEmail(raw: unknown, issues: FieldIssue[]): string {
  const value = requireString(raw, 'email', issues);
  if (value.length === 0) {
    return '';
  }
  const email = value.trim().toLowerCase();
  if (email.length === 0) {
    issues.push({ field: 'email', kind: 'required' });
  } else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    issues.push({ field: 'email', kind: 'format' });
  }
  return email;
}

export function checkPassword(raw: unknown, issues: FieldIssue[]): string {
  const value = requireString(raw, 'password', issues);
  if (value.length === 0) {
    issues.push({ field: 'password', kind: 'required' });
  } else if (value.length < PASSWORD_MIN) {
    issues.push({ field: 'password', kind: 'too_short' });
  } else if (value.length > PASSWORD_MAX) {
    issues.push({ field: 'password', kind: 'too_long' });
    // Do not hand an unbounded string to Argon2id.
    return '';
  }
  return value;
}

export function throwIf(issues: FieldIssue[]): void {
  if (issues.length > 0) {
    throw new ValidationFailure(issues);
  }
}

export function validateRegister(body: unknown): RegisterInput & { acceptedTerms: true } {
  const issues: FieldIssue[] = [];
  const record = asRecord(body);
  const email = normalizeEmail(record.email, issues);
  const password = checkPassword(record.password, issues);
  // accepted_terms must be literally true, not merely truthy.
  if (record.accepted_terms !== true) {
    issues.push({ field: 'accepted_terms', kind: 'not_accepted' });
  }
  throwIf(issues);
  return { email, password, acceptedTerms: true };
}

export function validateLogin(body: unknown): LoginInput {
  const issues: FieldIssue[] = [];
  const record = asRecord(body);
  const email = normalizeEmail(record.email, issues);
  // The login path never reports password length: that would be a free oracle
  // on the stored policy. A wrong or absent password is one credentials error.
  const passwordInput = typeof record.password === 'string' ? record.password : '';
  const kind = sessionKindOf(record.kind, issues);
  throwIf(issues);
  return { email, password: passwordInput, kind };
}

export function validateVerify(body: unknown): VerifyInput {
  const issues: FieldIssue[] = [];
  const record = asRecord(body);
  const token = typeof record.token === 'string' ? record.token : '';
  if (token.length === 0) {
    issues.push({ field: 'token', kind: 'required' });
  } else if (token.length > TOKEN_MAX) {
    issues.push({ field: 'token', kind: 'format' });
  }
  throwIf(issues);
  return { token };
}

/** A TOTP code is exactly six digits. No length or shape detail is echoed. */
export const MFA_CODE_RE = /^[0-9]{6}$/;

export interface MfaCodeInput {
  code: string;
}

export function validateMfaCode(body: unknown): MfaCodeInput {
  const issues: FieldIssue[] = [];
  const record = asRecord(body);
  const raw = typeof record.code === 'string' ? record.code.trim() : '';
  if (raw.length === 0) {
    issues.push({ field: 'code', kind: 'required' });
  } else if (!MFA_CODE_RE.test(raw)) {
    issues.push({ field: 'code', kind: 'format' });
  }
  throwIf(issues);
  return { code: raw };
}

export function sessionKindOf(raw: unknown, issues: FieldIssue[]): SessionKind {
  if (raw === undefined || raw === null) {
    return 'dashboard';
  }
  if (raw === 'mobile' || raw === 'dashboard') {
    return raw;
  }
  issues.push({ field: 'kind', kind: 'invalid' });
  return 'dashboard';
}

/**
 * Reasons a person may give for closing their own account.
 *
 * A closed set, not free text, because the reason is copied into an audit row
 * and audit metadata must never carry anything the caller typed: free text is
 * how an email address, a phone number or a name ends up in the audit trail.
 */
export const DELETE_REASONS = [
  'no_longer_needed',
  'privacy',
  'switched_service',
  'other',
] as const;

export type DeleteReason = (typeof DELETE_REASONS)[number] | 'unspecified';

export interface DeleteAccountInput {
  password: string;
  reason: DeleteReason;
}

export function validateDeleteAccount(body: unknown): DeleteAccountInput {
  const issues: FieldIssue[] = [];
  const record = asRecord(body);
  // Re-authentication before a destructive, irreversible action. No length
  // policy here: a length error would tell an attacker what the stored policy
  // is, and the only useful outcome is "correct" or "not correct".
  const password = typeof record.password === 'string' ? record.password : '';
  if (password.length === 0) {
    issues.push({ field: 'password', kind: 'required' });
  }
  let reason: DeleteReason = 'unspecified';
  if (record.reason !== undefined && record.reason !== null) {
    if (typeof record.reason === 'string' && isDeleteReason(record.reason)) {
      reason = record.reason;
    } else {
      issues.push({ field: 'reason', kind: 'invalid' });
    }
  }
  throwIf(issues);
  return { password, reason };
}

function isDeleteReason(value: string): value is (typeof DELETE_REASONS)[number] {
  return (DELETE_REASONS as readonly string[]).includes(value);
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function validateChangePassword(body: unknown): ChangePasswordInput {
  const issues: FieldIssue[] = [];
  const record = asRecord(body);
  const currentPassword = typeof record.current_password === 'string' ? record.current_password : '';
  if (currentPassword.length === 0) {
    issues.push({ field: 'current_password', kind: 'required' });
  }
  const newPassword = checkPassword(record.new_password, issues);
  throwIf(issues);
  return { currentPassword, newPassword };
}


