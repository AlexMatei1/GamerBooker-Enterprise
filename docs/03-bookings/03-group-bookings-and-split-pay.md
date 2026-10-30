# Rezervări de grup și split-pay

## Scope
Group booking **nu** înseamnă funcție socială: nu există prieteni, chat, profil de echipă sau matchmaking. Este un checkout comun pentru mai multe resurse/participanți.

## Modele
- `ORGANIZER_PAYS_ALL`: organizatorul plătește întreaga obligație due-now într-o tranzacție; ceilalți participanți primesc detalii de rezervare doar dacă sunt indicați/autentificați.
- `SPLIT_BY_PARTICIPANT`: organizatorul creează grupul, invită participanți la plata share-ului lor printr-un token de invitație scurt expirabil; fiecare plătește doar share-ul propriu.
- Fiecare participant trebuie să dețină cont în aplicație pentru a-și achita share-ul; linkul nu creează social graph.

## Exemplu 5 PC-uri
Total 5×2h×20 RON=200 RON. Sală cere 40% avans → `due-now=80 RON`; dacă împărțit egal → 16 RON/persoană due-now și obligație ulterioară 24 RON/persoană (sau 120 RON colectați conform politicii salii). Dacă sala cere plata integrală → 40 RON/persoană due-now.

## Alocări
- Fiecare `participant` are `share_total_minor`, `share_due_now_minor`, `share_paid_minor`, `status=INVITED|ACCEPTED|PAYING|PAID|DECLINED|EXPIRED`.
- Organizatorul poate personaliza alocările doar înainte de crearea payment intents; validăm `sum(shares) == totals` și nonnegative.
- Pentru console multi-player în același setup, plata poate fi împărțită între persoane chiar dacă o singură resursă este rezervată.
- Calculul restului se face pe componentă de obligație: share de gaming, share suplimentar de produse doar dacă plătitorul acceptă explicit.

## Protocol safe split-pay [PROPOSED]
1. Organizatorul alege locurile și intervalul, quote și share allocation.
2. Participanții acceptă invitația, fără blocare înainte de `Ready Check`.
3. La checkout, backend aplică hold atomic tuturor atomilor; TTL propus 15min.
4. Creează payment intents pentru shares. PSP webhook validează fiecare încasare și idempotency.
5. `all_paid_due_now` → confirmare în tranzacție; altfel expiry → release + reversals/refunds la orice shares deja capturate.
6. Dacă un participant nu plătește, organizatorul poate achita **diferența neplătită** înainte de TTL, cu consimțământ propriu și breakdown clar.
7. Schimbarea participantului/share în timpul unui hold activ necesită recalcul și recreare sigură a payment intents; nu modificăm o sumă deja capturată în loc.

## Participant nu participă la sesiune
- Participanții nu sunt automat răspunzători pentru plata altora.
- După confirmare, schimbarea componenței este o cerere de modificare/anulare conform policy snapshot și business logic pentru refund per line/share.
- Refund individual poate modifica balanța grupului; booking rămâne confirmat numai dacă obligația pentru resursele active este în continuare garantată.
- Dacă sala nu permite reducerea numărului de locuri, refund-ul poate fi limitat contractual; clientului i se explică înainte.

## Security/fraud
- Invitation token: random, single booking scoped, expiry, max redemption, nu expune email-ul altor participanți.
- Organizatorul nu poate vedea datele de card sau istoric plăți personale; doar `paid/unpaid` și suma necesară.
- Rate-limit invitații/plăți/retries; protecție împotriva adresei reintroduse arbitrar.
- Participantul plătește doar după login și explicit quote consent.

## Teste P0
- exact 5 paid -> 1 booking; duplicate webhook -> no duplicate capture;
- 4 paid + expired -> 0 booking și 4 refund tasks;
- organizer coverage înainte TTL -> booking confirmed;
- PSP confirm after TTL -> refund fără resurrection;
- currency rounding 5 shares pentru 1 ban extra → remainder deterministic la primii participanți, sum exactă;
- duplicate invitation token use / attempts from user diferit -> denied.
