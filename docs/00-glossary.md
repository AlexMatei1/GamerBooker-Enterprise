# Glosar și limbaj de domeniu

| Termen | Definiție operațională |
|---|---|
| Tenant | Persoană juridică / organizație care administrează una sau mai multe locații. |
| Venue | Sală fizică, cu fus orar, meniu, tarife, program și setări proprii. |
| Room | Cameră fizică desenată în layout. Poate fi doar container sau resursă privată rezervabilă. |
| Zone | Grup logic pentru politici și clasificarea resurselor, independent de geometrie. |
| Resource | Element rezervabil: PC, CONSOLE_SETUP sau PRIVATE_ROOM. |
| Component resource | PC/console inclus în camera privată; blocarea camerei rezervă implicit toate componentele pentru interval. |
| Layout scene | Model geometric (pereți/mobilier/coord.) cu referințe la resource IDs stabili. |
| Layout revision | Versiune imuabilă, publicabilă separat de draft. |
| Price quote | Ofertă calculată de server pentru timp/resurse, cu valabilitate și snapshot politicilor. |
| Hold | Blocare tranzacțională temporară de resurse, cu expirare. |
| Booking | Contract de rezervare; include toate resource allocations și prețul snapshot. |
| Group booking | O rezervare cu mai multe locuri/participanți și plăți individuale sau centralizate. Nu presupune rețea socială. |
| Deposit | Sumă plătită în avans, alocată obligațiilor eligibile conform politicii. |
| Due at booking | Suma de achitat pentru a confirma; 100% sau avans per sală. |
| Remaining balance | Obligație reziduală după sumele deja alocate; se poate plăti online/recepție. |
| PSP | Payment Service Provider / procesatorul de plăți. |
| Payment intent | Încercare de autorizare/captură procesată extern. |
| Payment ledger | Jurnal append-only de evenimente monetare și alocare de sume. |
| Check-in | Confirmare la recepție că utilizatorul a sosit pentru rezervare. |
| No-show | Rezervare fără check-in până la pragul configurat, procesată conform politicii snapshot. |
| Consumable order | Comandă de produse fizice legată de o rezervare. |
| Order handoff | Livrare fizică la stație sau predare la bar. |
| Effective policy | Set de reguli rezultat prin moștenire și excepții, salvat ca snapshot la confirmare. |
| Idempotency key | Token pentru prevenirea execuției duble a aceleiași comenzi/cereri. |
| Admin override | Modificare permisă doar actorului autorizat, cu justificare și audit. |
