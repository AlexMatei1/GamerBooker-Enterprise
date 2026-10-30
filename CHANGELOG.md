# Changelog

All notable changes to GamerBooker Enterprise v1.0.
Unreleased entries are newest first. Each entry names its source in brackets.

## Unreleased

- ENG-002: deliver Slice A of the auth core (opaque DB-backed sessions, Argon2id password hashing, /v1 router prefix, global error filter, migrations/0001_auth.sql under a node-postgres migration runner) in 3f126b4, with an acceptance suite for T01/T02/T05/T06/T08 on real HTTP and real PostgreSQL in c250fba; the suite was checked against two deliberately injected regressions before being trusted. D7 records that a +tag subaddress is a separate identity, amending the earlier T02 wording (d3138f3). Verification evidence is recorded in notes/eng-002-slice-a-verification.md. ENG-002 is not complete and not accepted: T03, T04 and T07 are not delivered and belong to Slice B, D1 and D5 remain release blockers for staging and prod, all checks are primary-agent runs, and the reviewer verdict on 3f126b4 is requested but not received. [3f126b4, c250fba, d3138f3, handoff/HANDOFF-ENG-002.md, notes/eng-002-slice-a-verification.md]
- ENG-001: record E0 Foundation delivery state (scaffold, health endpoints, review history, BR-011 proof, open items) as verification notes; full ENG-001 acceptance remains open. [notes/eng-001-verification.md, handoff/HANDOFF-ENG-001.md]
- ENG-001: harden request-id fallback and fail fast on an invalid PORT (afffa85). [afffa85]
- ENG-001: align the error envelope with the documented contract (4adb38e). [4adb38e]
- ENG-001: close the two MAJOR review findings on 54fcb13 (X-Request-Id echo and trace_id propagation, /readyz error envelope); reviewer re-audit returned VERDICT PASS (d345c29). [d345c29]
- ENG-001: scaffold NestJS app with health endpoints on 54fcb13; reviewer audit returned VERDICT HOLD with 2 MAJOR findings. [54fcb13]
- ENG-001: record HANDOFF-ENG-001 from thinker; status proposed, awaiting human acceptance (6b00a8d). [6b00a8d, handoff/HANDOFF-ENG-001.md]
- ENG-001: bootstrap GamerBooker Enterprise v1.0 (docs/ 44 documents, agent roles, opencode.json permissions, .gitignore, .gitattributes LF) (29e2550). [29e2550]
