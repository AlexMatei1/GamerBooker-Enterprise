# Local administrator password mode validation

Lease `LOCAL-ADMIN-PASSWORD-ONLY-20261106`: **CLOSED**, ready for independent review.

- `npm run build` — PASS, backend Nest/TypeScript build.
- `npm --prefix apps/venue-dashboard run build` — PASS, 1,593 modules, Vite 9.07s.
- `npm test -- --runInBand tests/local-admin-password.spec.ts tests/eng002-t01-t02-t05-t06-t08-auth.spec.ts tests/eng002-t04-mfa.spec.ts tests/cafe-access.spec.ts` — PASS: 4 suites, 71 tests, 61.462s. All use unique disposable databases, the application role, and loopback listeners; no working-database fixtures were used.
- `node --check tools/local-auth/start-api.cjs` and `git diff --check` — PASS (existing unrelated CRLF warnings).

The initial test run had one negative test transport defect: fetch did not transmit the deliberately overridden Host as intended. The assertion now uses a raw real HTTP request; the production boundary was not relaxed. The final run also covers a locked unused TOTP factor for local mode while preserving ordinary/company factor lock behavior. Only disposable fixture factor rows were used or removed; no actual owner factor was handled.

Process-local proof is tested through actual HTTP for eligible login and every subsequent guarded request, including no-Origin safe GET, foreign Origin/Host, common forwarded identity headers, mobile/bearer, proof expiry, old database-only sessions, real grant revocation, identity suspension/deletion, active cafe membership, and provider lifecycle proof loss. The lifecycle reset test is simulated via the real provider's destruction hook; it is not an HTTP reset endpoint or a claim of an in-test process restart. Real runtime activation subsequently restarted the API and audibly revoked its prior target session.

Activation used the existing helper's PID/creation/executable/entrypoint-verified stop, followed by hidden independent background start with the explicit ignored config. API PID 46660, launcher 44624, only IPv4 loopback port 3000. Existing HTTPS Vite PID 2044 was untouched. The private MFA key file modification timestamp remained unchanged. Mode config has protected current-user/SYSTEM-only ACLs and is ignored.

Safe live checks, without owner login: API health 200; unauthenticated context 401 AUTH_REQUIRED; Windows Schannel HTTPS portal 200 with normal certificate validation. Read-only audit/count evidence is in `runtime.json`; startup revoked the one prior target session. User/grant/factor counts and restricted runtime role permissions are unchanged. No account creation, grant change, password reset, factor deletion, owner token/code generation, TLS change, public listener, or secret logging occurred.

Owner signs in privately at https://127.0.0.1:5173/. Browser/form inspection was not performed because of the earlier computer-use access-confidence stop. The unfinished shared catalog remains checkpointed and was not continued during this lease.
