# Venue Control Center — module și user workflows

## Dashboard în V1
- Overview: rezervări de azi, confirmed/check-in/outstanding, occupancy contractual, order queue, operational alerts.
- Reservations: calendar zi/săptămână, status, booking detail, individual/group, QR validation, cancel/reschedule assisted numai cu consent/authorization, payments view.
- Live Floor: harta publicată read-only peste care apar statusuri de booking și staff-maintenance; **nu** presupune hardware detection.
- Layout Builder: editor geometric liber multi-room, templates, draft/publish/preview/version history.
- Equipment Catalog: PC, setup console, private room, asset condition, supported games/hardware, availability blocks.
- Pricing & Policy: tarife, intervale, suplimente, avans, anulare, duration, remaining-payment methods, no-show/grace.
- Consumables: produse/categorii, imagini, stoc, price, availability, service methods, fulfillment board.
- Staff/RBAC: invitații angajați, roluri, approvals, audit.
- Reports: bookings/day, online paid, offline paid, balance outstanding, refunds, stock, utilization.
- Venue Profile: fotografii, descriere, localizare, program, publicare, notificări.
- Multi-location: owner schimbă sală; statistici consolidate doar cu rol autorizat.

## Navigație propusă
```text
Venue Control Center
├── Overview
├── Reservations
│   ├── Calendar
│   ├── Check-in Queue
│   └── Balance / Refunds
├── Floor
│   ├── Live Map
│   ├── Layout Builder
│   └── Layout History
├── Catalog & Prices
│   ├── Equipment
│   ├── Policies / Pricing
│   └── Packages
├── Consumables
│   ├── Menu / Inventory
│   └── Orders Board
├── Reports
└── Settings
    ├── Venue Profile / Hours
    ├── Staff / Permissions
    ├── Payments / Payout Setup
    └── Audit
```

## UX pentru staff
- Tabul de rezervări afișează booking id, code, client (date minimizate), interval, resurse, due-now status, remaining, QR.
- Check-in în maximum două acțiuni după scan; orice warning de rest/plată este vizibil.
- Status manual `AVAILABLE|MAINTENANCE|TEMP_BLOCKED`, care nu înlocuiește booked status.
- Meniu comenzi sortat după order age, station, fulfillment, paid status; permisiuni de acceptare/predare.

## Configurare fără schimbări de cod
- Venue configuration este date-driven: validare server-side, schema-versioned, preview before publish.
- Owner poate crea/edita rooms, zones, resources, price policies, products, staff, schedule, images și branding.
- Nu poate edita control plane: fees PSP, storage retention legală, audit, access control, booking overlap guard, subscription entitlements, legal-required restrictions.

## Dashboard nu creează booking
- Toate butoanele de creare rezervare din UI staff sunt **absente**, conform scope.
- Clientul walk-in vede QR la recepție, instalează și rezervă singur; staff ajută verbal fără impersonare sau bypass.
- Platform admin nu poate crea rezervări fictive în producție; test data izolată în sandbox.
