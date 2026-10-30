# User stories și criterii verificabile de acceptare

## US-01 Rezervare individuală cu avans
**Ca** utilizator, **vreau** să selectez un PC la data/ora dorite și să plătesc avansul solicitat **ca să** știu că stația este rezervată.
- GIVEN PC-A1 disponibil 18:00–20:00 și 40% avans, WHEN checkout server quote 100 RON, THEN due-now este 40 RON și sold 60 RON.
- GIVEN PSP confirmă plata, WHEN webhook idempotent, THEN booking CONFIRMED și PC exclus din disponibilitate.
- GIVEN PSP respinge plata, THEN booking nu poate deveni CONFIRMED.

## US-02 Grup cu plăți individuale
- GIVEN 5 PC-uri libere și due-now total 200 RON, WHEN 5 participanți sunt atașați cu share-uri care însumează 200 RON, THEN fiecare vede share-ul său.
- GIVEN 4/5 shares achitate și hold expiră, THEN nimeni nu primește booking CONFIRMED, resursele se eliberează și plățile capturate se rambursează/gestionează ca obligații de refund.
- Organizatorul poate plăti soldul rămas înainte de expirare, prevenind eșecul; nu poate cheltui share-ul altcuiva fără confirmare explicită.

## US-03 Consolă multi-player
- GIVEN PS5-S1 capacity 4, WHEN booking de 3 persoane, THEN consumă o resursă pentru interval, nu 3 console; UI arată 3/4 persoane și 4 controllere.

## US-04 Cameră privată exclusivă
- GIVEN private room PR-1 cu PC-1..PC-5, WHEN rezervată 19:00–21:00, THEN toate cele cinci resurse sunt indisponibile pentru rezervări individuale.
- GIVEN PC-3 rezervat 20:00–21:00, WHEN client încearcă PR-1 19:00–21:00, THEN quote/hold respins cu alternativa disponibilă; nu se vinde camera.

## US-05 Layout free-form
- GIVEN owner editează draft cu doi rooms, pereți și 20 PC-uri, WHEN `Publish`, THEN se verifică poziții și referințe; doar noua revision vizibilă clienților.
- GIVEN pending booking PC-4, WHEN owner încearcă ștergerea resource ID, THEN publish blocat și recomandat disable/migration workflow.

## US-06 Comandă consumabile în sesiune
- GIVEN confirmed booking în interval permis, WHEN client comandă 2 băuturi din stoc și plătește, THEN order PLACED cu PC/station target, payment id și rezervare de stoc.
- GIVEN cantitatea rămasă 1, WHEN două comenzi concurente încearcă ultimul produs, THEN cel mult una confirmată.

## US-07 Rest la recepție
- GIVEN booking cu 60 RON rămași și venue allows RECEPTION, WHEN staff autorizat marchează plată CASH cu referință bon/chitanță, THEN remaining balance scade cu 60 RON, evenimentul este auditabil.

## US-08 Anulare gratuită
- GIVEN free-cancel cutoff 3h snapshot, WHEN client anulează cu 4h înainte, THEN suma eligibilă plătită este rambursată integral; WHEN cu 2h înainte, THEN UI prezintă penalitatea definită înainte de confirmare.

## US-09 Check-in
- GIVEN booking CONFIRMED, WHEN codul valid și recepționerul din aceeași sală îl scanează, THEN status CHECKED_IN, codul nu poate fi reutilizat pentru check-in fals; staff vede interval și resurse.

## US-10 On-site booking
- GIVEN client intră în sală și scanează QR, WHEN nu are app, THEN este trimis în store; după instalare poate deschide contextul venue; personalul nu poate crea booking pe contul său.

## US-11 Izolare tenant
- GIVEN owner Venue-A, WHEN trimite ID de booking Venue-B, THEN API refuză fără a scurge detalii. Test obligatoriu pentru toate endpoint-urile de date.

## US-12 Modificare oră
- GIVEN mutare propusă fără suprapuneri, WHEN quote diferență + plată necesară confirmate, THEN resursele noi sunt deținute și cele vechi eliberate tranzacțional; în caz de eșec se păstrează vechea rezervare.

## Definition of Done
Fiecare user story include teste unit + integration + E2E, observabilitate, pagini UI mobile + dashboard relevante, localizare RO, authorization și documentarea erorilor; P0 nu se consideră DONE fără testele de concurență.
