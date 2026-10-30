# Catalog de reguli de business (source of truth)

| ID | Regulă | Tip |
|---|---|---|
| BR-001 | Numai clientul creează rezervarea din aplicația mobilă, inclusiv on-site prin QR; staff nu o creează în numele lui. | CONFIRMED |
| BR-002 | PC, console setup și private room sunt resurse rezervabile; VR și sim racing după V1. | CONFIRMED |
| BR-003 | Clientul poate selecta exact stația și intervalul doar din inventarul publicat și eligibil. | CONFIRMED |
| BR-004 | Solo: un plătitor achită integral obligația de la booking (avans sau 100%). | CONFIRMED |
| BR-005 | Grup: plata unică de către organizator sau contribuții separate de participanți. | CONFIRMED |
| BR-006 | Sala alege modul prepaid: full sau avans fix/procentual, în limitele platformei. | CONFIRMED |
| BR-007 | Sala alege cum se achită restul: online, recepție sau ambele. | CONFIRMED |
| BR-008 | Avansul se scade din obligațiile eligibile, niciodată dublu. | CONFIRMED design intent |
| BR-009 | Politici exemplu: 40% avans, 3h free cancel, 60 min minim; editabile de sală. | CONFIRMED configurable example |
| BR-010 | Preț/policy snapshot este imuabil pentru rezervarea confirmată; fără schimbări retroactive. | INTEGRITY |
| BR-011 | Resursele nu pot avea alocări active suprapuse în același interval. | INTEGRITY |
| BR-012 | O cameră rezervată integral blochează toate resursele incluse; invers, un copil rezervat blochează rezervarea exclusivă a camerei. | INTEGRITY |
| BR-013 | Hold-urile au termen-limită și expiră automat; politica de expirare e independentă de sesiunile confirmate. | INTEGRITY |
| BR-014 | Split-pay produce confirmare numai când suma totală cerută la booking este acoperită; altfel expire/refund. | INTEGRITY |
| BR-015 | Prelungirea verifică noile intervale și plățile înainte de confirmare. | INTEGRITY |
| BR-016 | Check-in efectiv și eliberare fizică sunt declarate de staff; fără agent PC. | CONFIRMED |
| BR-017 | Comenzi consumabile: legate de booking, înainte/durante, plătite, cu predare la stație/bar configurabilă. | CONFIRMED |
| BR-018 | Stocul se rezervă tranzacțional la comandă; nu se vând produse epuizate. | INTEGRITY |
| BR-019 | Sala poate crea layout liber: pereți, decor, mai multe camere și private rooms. | CONFIRMED |
| BR-020 | Layout draft nu modifică layout published; publicarea validează referințele și impactul asupra rezervărilor viitoare. | INTEGRITY |
| BR-021 | Personalul poate bloca fizic resurse, dar nu poate trece o rezervare ca plătită fără eveniment/probă corespunzătoare. | INTEGRITY |
| BR-022 | Anulare și no-show respectă politica acceptată la checkout și normele legale; penalitatea nu e implicit 100%. | LEGAL-REVIEW |
| BR-023 | Produsele reglementate pot solicita control vârstă și validare la predare; nu se livrează minorilor cele interzise. | LEGAL-REVIEW |
| BR-024 | Proprietarul configurează majoritatea regulilor, dar nu poate dezactiva audit, anti-overlap, fraud checks, accesul și drepturile obligatorii. | INTEGRITY |
| BR-025 | Personalul introduce încasări la recepție doar după confirmarea reală a încasării; reconciliere zilnică. | INTEGRITY |

## Exemplu de evaluare policy
Venue: avans `40%`; free cancel `3h`; minim `60m`; rest `ONLINE_OR_RECEPTION`.
Booking: PC-A1, 18:00–20:00, total 100 RON → due at booking 40 RON → rest 60 RON. Clientul poate achita 60 RON ulterior în aplicație ori la recepție; soldul scade doar după operațiune validă. Dacă admin-ul schimbă avansul la 50%, rezervarea existentă rămâne la 40 RON.

## Precedență setări (propunere)
`resource override > zone > room policy > venue default`, doar pentru câmpuri explicit overridable. Platform constraints sunt evaluate **după** rezolvarea policy și au prioritate juridică / de securitate. Nu se permite aplicare tăcută a două politici contradictorii. Quote-ul afișează policy efectiva.

## Aprobare și excepții
- Override uman trebuie să aibă actor, motiv, timestamp, vechea/noua valoare, booking id și approval dacă impactează bani.
- Override nu poate forța double booking și nu poate șterge o datorie fără adjustment financiar auditat.
- Proprietarul poate scoate temporar stații din vânzare, dar bookings confirmate intră în workflow de relocare sau refund.
