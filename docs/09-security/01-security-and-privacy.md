# Security, privacy, anti-abuz și conformitate tehnică

## Trust boundaries
- Mobile UI/browser are neîncredere implicită; nu pot seta status de plată, preț, discount eligibil sau sold.
- API server validează JWT, rol, tenant scope, ownership pentru fiecare ID (`booking`, `resource`, `order`, `venue`, `layout revision`).
- PSP webhooks sunt singura dovadă online de plată, după semnătură și reconciliation.
- Frontend dashboard nu e autorizare: fiecare endpoint face RBAC + ABAC/venue check.

## OWASP API Security
Testăm explicit Broken Object Level Authorization, Broken Authentication, Broken Object Property Level Authorization și unsafe business flows conform OWASP API Security Top 10 (2023). Toate ID-urile enumerate în resurse trebuie verificate în accesul efectiv, nu doar `venue_id` transmis de client.

## Protecții P0
- Rate limit auth, quotes, holds, split invites, checkout, orders, QR redemption, refund actions.
- CSRF pentru dashboard dacă cookies; mobile token scoping, secure storage, TLS, secret rotation.
- Sanitizare HTML rich text și fișiere; scanare uploads; signed URLs pe imagini private.
- WAF/abuse alerts pentru scraping masiv, programmatic holds, multi-account spam, promo exploit.
- MFA obligatoriu pentru owner/manager/platform admin; obligatoriu la operațiuni financiare sensibile [PROPOSED].
- Least privilege DB accounts/service accounts; secret manager, no raw credentials în repo/mobile.
- Audit append-only pentru refund, policy, layout publish, staff role, offline receipt.

## PII și GDPR
- Data minimization: nume/contact și booking details strict necesare; interzicem social graph nesolicitat.
- Separăm date de identitate, contract și analiză; folosim date agregate pentru rapoarte.
- Definim controller/processor roles între platformă și sală prin contract, acorduri prelucrare și mapping of purposes.
- Policy publică, baze legale pentru prelucrare, management consimțământ marketing, export/delete request, retention schedule și drepturile persoanelor.
- Cereri de ștergere nu anulează automat obligații financiare de păstrare legală: se face restriction/anonymization în limitele permise.
- Incident response, breach assessment și proceduri notificare potrivit GDPR, după evaluarea DPO/juristului.

## Protecția minorilor și produse
- Minorii pot fi utilizatori ai rezervărilor doar în condițiile juridice/contractuale validate și cu măsurile de consimțământ necesare.
- Legea 42/2024 interzice vânzarea anumitor energizante minorilor: restriction flag, eligibility gate și verificare identitate la predare.
- Nu stocăm poze ale actelor fără necesitate, bază legală, evaluare proporționalitate și măsuri speciale.

## PCI/PSP
- Card PAN/CVV nu intră în backend/logs. PSP SDK/hosted fields reduc, nu elimină automat, obligațiile de securitate.
- Merchant accounts, KYC, payouts, chargebacks și facturare necesită validare contractuală/fiscală.
- Test webhook signatures, replay protection, TLS, credential rotation, PSP disconnect.

## Security acceptance
- Pentest auth/authorization, wallet/deposit bypass, cross-tenant IDs, duplicate webhook, client tampering amount, QR replay.
- Vulnerability management, dependency scan, SAST/DAST, secure CI, backups encrypted, restoration exercise.

## Referințe oficiale (revizuire la lansare)
- GDPR — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- OWASP API Security Top 10 — https://api-security.owasp.org/editions/2023/en/0x11-t10/
- Legea nr. 42/2024 — https://legislatie.just.ro/public/DetaliiDocument/279914
