# Surse, referințe și ce NU pretinde această documentație

## Inputs interne
1. Conversație de Product Discovery GamerBooker și decizii confirmate, 29–30 octombrie 2026.
2. Prototip `odsasda.html` (titlu HTML „GamerBooker - Full Experience”), fișier furnizat în conversație: home cards, map statică PC/VIP, Team 5v5, consumabile, total, ticket, Firebase Firestore `rezervari.add`.
3. Concept OCUPAT anterior: prepaid consumabil și reguli de anulare configurabile. **Arhiva completă de documentație OCUPAT nu a fost disponibilă pentru comparare integrală.** Nu se afirmă compatibilitate schema/API cu OCUPAT.

## Referințe externe oficiale — verificate pentru design pe 30 octombrie 2026
- Regulamentul General privind Protecția Datelor, EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- OUG nr. 34/2014, Portal Legislativ România: https://legislatie.just.ro/Public/DetaliiDocument/158913
- Legea nr. 42/2024 (băuturi energizante și minori), Portal Legislativ: https://legislatie.just.ro/public/DetaliiDocument/279914
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- OWASP API Security Top 10 2023: https://api-security.owasp.org/editions/2023/en/0x11-t10/

## Limitări
- Documentele externe se pot modifica; revalidați înainte de depunere store/lansare.
- Tehnologiile PostgreSQL/NestJS/Next/React Native/PSP adaptor sunt **propuneri tehnice**, nu decizii comerciale deja aprobate.
- Datele, timpii, taxele și exemplele din test sunt illustrative; nu reprezintă tarife contractuale reale sau disponibilitate reală.
- Fișierul HTML demonstrațional are un `firebaseConfig` client-side: acesta nu trebuie să fie reutilizat ca dovadă de securitate. Reguli DB, app auth, access și config de producție trebuie analizate separat.
