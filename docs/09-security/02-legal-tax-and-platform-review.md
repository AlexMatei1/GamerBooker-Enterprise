# Checklist juridic, fiscal, App Store/Play — NECESITĂ VALIDARE

Acest document reprezintă checklist de implementare, **nu consultanță juridică**. Controlorul de produs trebuie să obțină aviz juridic/fiscal înainte de lansare comercială.

## Comercianți și termeni
- [ ] Identificați merchant of record pentru fiecare booking/order; cine facturează, cine emite bon fiscal, cine percepe comision, cine are obligații de retur.
- [ ] Termeni consumator, identitatea comerciantului, preț total cu taxe, restricții de anulare/no-show prezentate înaintea plății.
- [ ] Contract B2B sală, SLA, comisioane, răspundere operațională pentru status fizic, politica de rambursare, chargebacks, dispute.
- [ ] Procedură plată la recepție cash/card și compatibilitate cu cerințele fiscale românești; dashboard nu substituie echipament fiscal.
- [ ] Contract și eligibilitate PSP pentru marketplace / transfer de fonduri / KYC; fără bricolaj de payout.

## Consumatori
- [ ] Analizați OUG 34/2014 și excepția art. 16 alin.(1) lit. l) pentru activități de agrement cu dată/perioadă specifică; aplicabilitate exactă serviciilor GamerBooker trebuie verificată.
- [ ] Politici de anulare gratuită configurabile (40% / 3h / 60m sunt numai setări exemplificative), penalități clare/proporționale, fără confiscări automate netransparente.
- [ ] Păstrarea policy snapshot, customer acceptance timestamp/version, precontract info, mesaje confirmare și evidențe dispute.
- [ ] Procedură dacă sala nu prestează serviciul: relocare acceptată sau rambursare corespunzătoare.

## Produse / minori
- [ ] Restricții la vânzarea energizantelor către minori conform Legii 42/2024; verificare act la predare, training angajați, filtre catalog.
- [ ] Aplicabilitatea regulilor pentru alte produse reglementate, alimente, alergeni, autorizații bar/catering și fiscalitate conform regimului fiecărei locații.
- [ ] Age of digital consent, condiții de contractare cu minorii, colectare date, parental approvals dacă necesar.

## GDPR & securitate
- [ ] Privacy notice, temeiuri și scopuri; roluri controller/processor, DPA, registru prelucrări și subprocesatori.
- [ ] Retenție pentru booking/payment/tax records vs ștergere cont, export date, rectificare, privacy by design.
- [ ] DPA și transferuri internaționale pentru procesator, hosting, email/push.
- [ ] DPIA dacă evaluarea riscului o cere, breach response, cookies SDK analytics și consimțământ după caz.

## Mobile stores
- [ ] Apple App Review 3.1.3(e): servicii fizice consumate în afara aplicației folosesc plăți externe IAP; verificați politica actuală la submission.
- [ ] Google Play Payments: bunuri/servicii fizice în afara Play Billing; verificați politica actuală la submission.
- [ ] Digital add-ons viitoare (dacă apar) re-evaluate separat pentru store billing; nu sunt în V1.
- [ ] Account deletion in-app, review credentials, app privacy labels, refund and support contact, content ratings, deep links.

## Surse primare consultate la proiectare (30 octombrie 2026)
- România OUG 34/2014: https://legislatie.just.ro/Public/DetaliiDocument/158913
- România Legea 42/2024: https://legislatie.just.ro/public/DetaliiDocument/279914
- GDPR: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- Apple: https://developer.apple.com/app-store/review/guidelines/
- Google Play: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en

**Gate:** fără aprobare juridică/fiscală scrisă pentru fluxul de plăți și termenii de anulare, nu intră în producție.
