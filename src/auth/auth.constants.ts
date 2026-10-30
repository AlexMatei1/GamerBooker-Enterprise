// Session and verification lifetimes. Values are the decided numbers in
// handoff/HANDOFF-ENG-002.md, never tunables read from a request.
export const IDLE_TTL_MS = 12 * 60 * 60 * 1000; // 12h idle
export const ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d absolute
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h email link

// __Host- prefix forbids Domain and requires Secure plus Path=/.
export const SESSION_COOKIE = '__Host-gb_session';

// Fixed names so a database error can be classified without matching strings.
export const USERS_EMAIL_CONSTRAINT = 'users_email_lower_active_uniq';
