# Check-in și operațiuni la locație — fără agent PC

## Regula centrală
Toate rezervările sunt inițiate de client în aplicația mobilă. Staff poate verifica și administra rezervări existente, nu crea rezervări walk-in în numele clienților. O persoană sosită fără rezervare scanează codul de la recepție → instalează aplicația → rezervă singură → plătește → check-in.

## Flow check-in
1. Clientul deschide rezervarea confirmată și arată QR/cod.
2. Staff se autentifică în Venue Dashboard, scanează cod sau introduce booking code.
3. Server validează venue, booking, status, interval, token unspent/expired și permisiunea rolului.
4. Staff confirmă identitatea rezonabilă, stația liberă, serviciile incluse; efectuează `CHECKED_IN`.
5. Clientul vede session timer calculat din `start_at/end_at` contractual; nu este pornire PC automată.

## Check-out
- Staff eliberează fizic stația, apasă „Încheie sesiunea”, confirmă eventual sold rămas/plăți la recepție.
- Dacă un PC încă este ocupat fizic după end_at, staff poate bloca vânzarea viitoare/declanșa incident; nu există detectare automată.
- Clientul poate solicita prelungire prin app; staff poate consulta/confirmă, nu inventează gratuit interval fără quote.

## Offline recepție vs app online
- Dashboard poate arăta **cached view**, dar nu poate emite o rezervare confirmată fără server; check-in poate fi introdus temporar într-o coadă locală doar dacă politica de risc o permite și este reconciliat, cu warning vizibil [PROPOSED: off by default].
- Pentru securitate financiară, marcarea plăților offline ca achitate necesită conectivitate și actor autorizat.

## Queue operațională
- Azi: Upcoming / Arrived / Checked-in / Due balance / End soon / Overdue / Completed / No-show candidate.
- Acțiuni: scan QR, check-in, confirm payment, mark maintenance, order handoff, check-out, request manager override.
- Filtre per room/zone/resource și accesibilitate keyboard/scanner.

## Excepții
- QR invalid sau din alt venue → deny.
- App nu poate fi instalată → explicăm imposibilitatea rezervării conform deciziei produsului; notăm fricțiunea pentru pilot; staff nu ocolește sistemul.
- Staff scanează cod deja used → răspuns `ALREADY_CHECKED_IN` și audit, fără nouă tranzacție.
- Booking cancelled/expired prezentat la recepție → refuză check-in, afișează ajutor și politica.
- Diferență rămasă neplătită → încasare online sau recepție dacă politicile locației permit, status acces separabil după regula publicată.

## KPI
Check-in completion rate, median scan duration, late arrivals, overdue sessions, post-session outstanding balance, manual maintenance blocks, disputes physical occupancy.
