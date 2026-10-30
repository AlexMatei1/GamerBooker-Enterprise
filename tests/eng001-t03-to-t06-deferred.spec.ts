// ENG-001 deferred acceptance cases.
//
// These four cases from handoff/HANDOFF-ENG-001.md cannot be executed in this
// repository because the infrastructure each one observes does not exist yet.
// They are recorded as todos with an explicit blocking reason, never as passes.
//
// Source: docs/10-testing/01-test-strategy-and-acceptance.md (level 6, gates);
// docs/01-product/03-business-rules.md BR-024.
describe('ENG-001 deferred acceptance cases (infrastructure not yet present)', () => {
  // The eight metrics named by
  // docs/02-architecture/04-nonfunctional-and-reliability.md are booking_hold_created,
  // hold_expired, confirmed, payment_failed, refund_pending_age, stock_reserved,
  // layout_publish_failed and qr_redeem_denied. No emitter, registry or scrape
  // endpoint exists in src/, and no booking or order code path exists to
  // increment them, so a test would only assert against its own mock.
  test.todo(
    'ENG001-T03 the eight telemetry metrics emit - blocked: no metrics emitter or scrape endpoint in src/',
  );

  // docs/02-architecture/04-nonfunctional-and-reliability.md requires backups
  // with PITR and a restore test. There is no managed PostgreSQL with PITR, no
  // backup artifact store and no restore target. The local cluster on
  // 127.0.0.1:5433 is not the environment this drill measures, so a dump and
  // restore against it would not prove the production recovery path.
  test.todo(
    'ENG001-T04 backup/restore drill passes before M0 exit - blocked: no PITR, no backup store, no restore target',
  );

  // docs/09-security/01-security-and-privacy.md requires least-privilege DB and
  // service accounts and a secret manager. There is no IaC, no environment
  // config directory, no secret manager wiring and no staging or prod
  // deployment in this repository.
  test.todo(
    'ENG001-T05 staging and prod configs are distinct and least-privilege - blocked: no IaC, no env config, no secret manager',
  );

  // BR-024: the owner configures most rules but cannot disable audit,
  // anti-overlap, fraud checks or mandatory access rights. There is no
  // configuration loader, policy resolver or feature-flag surface in src/ to
  // attack. ENG001-T01 proves anti-overlap holds at the database layer, not that
  // no application config path can bypass it.
  test.todo(
    'ENG001-T06 no configuration disables a platform invariant (BR-024) - blocked: no config loader or flag surface exists',
  );
});
