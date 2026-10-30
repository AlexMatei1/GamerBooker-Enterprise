# GamerBooker — Documentație enterprise v1.0

**Data:** 30 octombrie 2026  
**Stare:** Product Discovery închis; specificație de implementare propusă  
**Limba:** română  
**Arhitectură:** baseline recomandat, supus verificării tehnice, de securitate și juridice înainte de producție.

## 1. Produsul
GamerBooker este o platformă **exclusiv de rezervări** pentru săli de gaming: stații PC, setup-uri console (PS5/Xbox) și camere private. Clientul rezervă **personal din aplicația mobilă** (App Store / Google Play), plătește suma necesară la rezervare, poate comanda consumabile înainte și în timpul sesiunii și își poate prelungi sau modifica rezervarea conform politicii sălii. Proprietarii folosesc un dashboard web pentru orice configurare permisă, inclusiv o hartă desenată liber de ei.

**Nu este:** rețea socială, matchmaking, chat, turnee, clasamente, streaming sau software de control al PC-urilor. Aplicația nu instalează agenți pe stații.

## 2. Decizii confirmate de proprietarul produsului [CONFIRMED]
1. V1: PC gaming + console; VR/sim racing nu sunt incluse în prima lansare.
2. Rezervări individuale și de grup; grupurile permit plăți separate între participanți și opțional o plată unică de către organizator.
3. Individual: un singur plătitor plătește **toată suma solicitată acum**, care poate fi integralul sau avansul configurat de sală.
4. Fiecare sală configurează politica prepaid: plată integrală ori avans; exemplu preferat: **avans 40%, anulare gratuită până la 3 ore, durată minimă 60 minute**, toate modificabile.
5. Restul după avans: online sau la recepție, configurabil per sală, inclusiv ambele opțiuni.
6. Clienții, inclusiv cei aflați fizic în sală, își fac singuri rezervarea în aplicația mobilă; personalul nu rezervă în numele lor.
7. Comenzile de consumabile fac parte din V1; predare la stație sau ridicare de la bar, după configurarea sălii.
8. Dashboard complet pentru administrare; editor vizual liber pentru pereți, decor/mobilier, zone, **multiple camere**, PC-uri, console și **camere private rezervabile**.
9. Proprietarii pot configura politici, prețuri, layout, inventar, angajați și vizibilitate; regulile tehnice și legale de integritate nu sunt dezactivabile.
10. Nicio funcție socială: fără prieteni, Open Squads, matchmaking, chat, competiții, leaderboard sau comunitate.

## 3. Separarea deciziilor
- **[CONFIRMED]**: decizie de produs aprobată, obligatorie.
- **[PROPOSED]**: opțiune tehnică/valoare operațională recomandată; poate fi schimbată fără redeschiderea conceptului.
- **[LEGAL-REVIEW]**: condiție pentru jurist, fiscalist și furnizorul de plăți.
- **[PILOT-VALIDATE]**: necesită test de utilizabilitate sau validare într-o sală reală.

## 4. Parcurgere recomandată
1. `00-decisions-and-traceability.md`, `01-product/01-scope-and-requirements.md`, `01-product/03-business-rules.md`.
2. `02-architecture/*`, apoi `03-bookings/*` și `04-payments/*`.
3. `05-venue-dashboard/*`, `06-consumables/*`, `07-mobile-app/*`.
4. `08-api/*`, `09-security/*`, `10-testing/*`, `11-delivery/*`.
5. `12-commercial/*` și `99-open-issues-and-approvals.md` pentru prelaunch.

## 5. Convenții
- Monedă de prezentare: **RON**; valorile monetare în backend: **integer minor units (bani)**, nu float.
- Timp stocat în UTC; program/local display cu fusul locației, implicit `Europe/Bucharest`; ora de vară trebuie testată.
- ID-uri UUID; tenant = companie/operator; venue = locație; resource = PC / console setup / private room.
- Operații financiare și disponibilitate: server-authoritative, tranzacționale și idempotente.
- Documentație pregătită pentru implementare, dar **nu reprezintă certificare legală, PCI, fiscală ori de securitate**.

## 6. Originea cerințelor
- Deciziile din conversațiile de Product Discovery GamerBooker, 29–30 octombrie 2026.
- Prototip HTML `odsasda.html`: ecrane de listare, selecție stații, VIP, buton Team 5v5, consumabile și persistare Firestore. Este **un prototip**, fără durată reală, payment processor sau tranzacții anti-double-booking.
- Idei reutilizate din OCUPAT: prepaid legat de consum, politici configurabile, anulări; nu se pretinde că arhiva OCUPAT a fost citită integral.

## 7. Criteriu de finalizare
O lansare este eligibilă numai dacă toate acceptările critice din `10-testing/` trec, pilotul operațional validează fluxul obligatoriu de self-booking, contractele comerciale sunt confirmate, iar fluxurile financiare și legale sunt aprobate.
