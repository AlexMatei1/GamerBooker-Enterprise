# Aplicația mobilă — ecrane, navigație, fluxuri UX

## Distribuție [CONFIRMED]
Clientul rezervă exclusiv din aplicația instalată prin App Store / Google Play. Landing web din QR poate afișa informații și deep-link către store, dar **nu** trebuie să permită checkout web paralel.

## Information architecture
```text
Home / Venues
├── Search & Filters
├── Venue Details
│   ├── Photos / Specs / Amenities
│   ├── Select Date + Duration
│   ├── Public Layout (Rooms / Zones)
│   ├── Resource Details
│   └── Booking Checkout
│       ├── Solo / Group
│       ├── Optional Consumables
│       ├── Review Price & Policy
│       ├── PSP Payment / Split-Pay Invites
│       └── Booking Confirmation / QR
├── My Bookings
│   ├── Upcoming / Active / Past
│   ├── Payment Balance
│   ├── Modify / Cancel / Extend
│   └── Consumables Orders
└── Account / Privacy / Support
```

## Screen inventory
| Screen ID | Ecran | Date/Acțiuni | Edge states |
|---|---|---|---|
| MOB-01 | Welcome/Login | email/phone verification, privacy, T&Cs | offline, code expired |
| MOB-02 | Discover Venues | search, filters PC/console/private, location, map/link | empty, permission denied |
| MOB-03 | Venue Details | photos, schedule, amenities, policy summary, pricing | closed, unpublished |
| MOB-04 | Date & Duration | timezone-aware calendar, start, duration, group size | no slots, DST |
| MOB-05 | Floor Map | published 2D layout, room switch, seat selections/status legend | stale, maintenance |
| MOB-06 | Resource Detail | PC specs, console controllers, room capacity | unavailable |
| MOB-07 | Checkout | quote, due-now, balance method, cancellation terms, optional products | quote expired |
| MOB-08 | Group Payment | contributors, amount owed, secure invitation/payment progress | split timeout |
| MOB-09 | Payment | PSP UI + server polling for final state | declined/pending |
| MOB-10 | Booking QR | unique code, instructions, interval, terms | cancelled/no-show |
| MOB-11 | My Bookings | current/upcoming/completed, payment balance | no bookings |
| MOB-12 | Order Menu | menu, cart, handoff target, pay | stock gone |
| MOB-13 | Modify/Extend | alternatives, difference amount, policies | blocked |
| MOB-14 | Help/Account | privacy, deletion, contact, receipts | account restricted |

## Booking UI details
- Visual seat colors must not be exclusive communication: text/icon and aria labels; legend `AVAILABLE, SELECTED, BOOKED, MAINTENANCE`.
- Status price disclosure: booking total, due-now, balance, payment method, refund/cancel policy, vendor, fees and taxes if applicable.
- User can decline unsuitable alternatives; no silent reassignment PC/room.
- Group invite flows are **payment/attendance logistics only**, not social profiles.
- `Payment confirmed` only after backend `CONFIRMED`; provider UI return success alone este insuficient.

## On-site QR onboarding
1. QR static conține `venue_id` și optional recommended zone; nu poate rezerva implicit.
2. Deep link resolver recunoaște platforma; dacă app absentă, redirect store; deferred deep link trebuie testat pe ambele OS.
3. User login, venue open, slot/seat selection, payment, check-in QR distinct. Static venue QR nu este check-in token.

## Accessibility/localization
- Romanian initial, architecture pregătită engleză; texte legal/terms locale-aware.
- Dynamic type/font scale, voiceover/talkback, errors in text, large touch targets, keyboard navigation pe web dashboard.
- Semnificație de culoare dublată de text; map selectable resource fallback list view pentru accesibilitate.

## Prototip existent ca referință
Prototipul HTML avea listă săli, tabs standard/VIP, Team 5v5, consumabile, ticket și Firestore add. V1 extinde cu timp, autentificare, quote, true availability, PSP, stări și rollback; nu reutilizăm frontend demo ca atare.
