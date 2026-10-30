# Multi-tenant RBAC, onboarding și audit

## Roluri
| Capacitate | PLATFORM_ADMIN | OWNER | VENUE_MANAGER | RECEPTION | BAR_STAFF |
|---|:---:|:---:|:---:|:---:|:---:|
| Venue profile create/edit | approve | yes | optional | no | no |
| Layout edit/publish | audit | yes | yes delegated | read only | no |
| Prices and policies | compliance only | yes | delegated | read only | no |
| Staff management | support limited | yes | delegated | no | no |
| Booking view | limited support | yes | yes | yes | order-relevant only |
| Booking create-on-behalf | **no** | **no** | **no** | **no** | **no** |
| QR check-in/out | no | yes | yes | yes | no |
| Mark balance paid offline | no | yes | delegated | delegated with restrictions | no |
| Refund approval | support workflow | yes | threshold | request only | no |
| Product catalog | no | yes | yes | read | delegated |
| Order accept/hand off | no | yes | yes | yes | yes |
| Platform audit | yes | own tenant | own venue | own actions | own actions |

## Onboarding wizard
1. Verify entity/owner authority, venue details, photos, timezone, amenities, legal docs.
2. Create physical room shapes and zones using blank canvas or templates.
3. Create PC/console/private room resources; bulk duplicate, specs, controllers, capacity, component graph.
4. Configure schedules, price calendars, policy profiles; preview checkout calculations.
5. Connect PSP/merchant setup and validate payment readiness, funds ownership and refund config.
6. Add consumables, stock and fulfillment methods; register responsible bar/recepție staff.
7. Staff accounts + least privilege; run synthetic booking/payment in sandbox and preview as customer.
8. Publish venue when all P0 validations pass; platform admin may approve/reject with notes.

## First venue publish gates
- At least one active bookable resource, valid schedule, valid booking policy and pricing, supported currency/payment provider.
- Layout published with stable resource refs; product restrictions configured; staff check-in role assigned.
- Support/contact, refund/cancellation terms and privacy notice visible to user.
- Test PSP credentials never used în production; verified merchant account or approved pilot configuration.

## Audit schema
`event_id, tenant_id, venue_id, actor_id, actor_role, action, target_type/id, before_hash, after_hash, diff_redacted, reason, created_at, request_id, approval_id`. Append-only; access controlled; export by venue and platform limited to authorized scopes.

## Sensitive action controls
- Dual approval [PROPOSED] for large refunds / manual adjustments over threshold defined by finance.
- Deactivating room resource with bookings triggers warning and change workflow; no hard delete.
- Changing payment settings triggers re-validation of PSP connectivity and legal terms.
- Unusual offline receipts/too many manual refunds raise anomaly alerts.

## Multi-location
- Tenant owner views consolidated statistics; venue staff scope single venue unless explicitly authorized for multiple venues.
- Cross-tenant reads denied even for plausible UUIDs; platform support uses audited just-in-time access with scope, reason and expiry.
