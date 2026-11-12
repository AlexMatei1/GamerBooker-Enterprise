# Local HTTPS files — 2026-11-06

Lease `LOCAL-AUTH-TLS-FILES-2026-11-06`: **CLOSED**. Files only; no Windows certificate-store import, Vite restart, API change, account/password/grant operation, or mail delivery was performed.

Generated with the existing Git OpenSSL, without downloads:

- Vite public certificate: `.local-auth/tls/server-cert.pem`.
- Private key: `.local-auth/tls/server-key.pem` (contents never printed).
- Public DER certificate for a later Windows import: `.local-auth/tls/server-cert.cer`.

Public certificate verification:

- Self-signed leaf; subject and issuer `CN=127.0.0.1`; self-signature and private-key match verified privately.
- SAN is exactly `IP Address:127.0.0.1`; RSA 2048; critical basic constraints `CA:FALSE`; critical key usage Digital Signature + Key Encipherment; EKU TLS Web Server Authentication (`1.3.6.1.5.5.7.3.1`).
- Valid from `2026-11-06 04:42:05 UTC` to `2027-11-06 04:42:05 UTC` (365 days).
- SHA256: `AC:ED:9C:60:E4:68:91:4F:7C:15:2F:BD:5E:89:31:24:DA:C4:00:33:51:AF:C6:37:0D:8A:6E:D4:ED:3D:FB:8F`.
- Windows SHA1 thumbprint: `3D07D83CECE8529D4814ADD8759C1440E334E7F4`.
- DER and PEM fingerprints match. `.local-auth/tls` has protected ACLs allowing only `MATEI\alexm` and SYSTEM, FullControl. The files inherit only these two entries. Git ignores the directory and both certificate/key paths. No previous TLS files existed; no unknown file or key was overwritten.

The first native invocation was interrupted by PowerShell treating OpenSSL's progress on stderr as an error; it created no files. The successful invocation captured process streams privately. No extra helper/source files were added.

## Deferred commands — require owner approval before execution

Trust only this specific public leaf certificate in the current user's Root store; no root CA or private key import is needed. From the workspace root:

```powershell
$localPublicCert = (Resolve-Path '.local-auth/tls/server-cert.cer').Path
$localCertInfo = Get-PfxCertificate -FilePath $localPublicCert
if ($localCertInfo.Thumbprint -ne '3D07D83CECE8529D4814ADD8759C1440E334E7F4') { throw 'Certificate fingerprint mismatch' }
Import-Certificate -FilePath $localPublicCert -CertStoreLocation 'Cert:\CurrentUser\Root'
```

After separately approving a restart of the identified Vite process on port 5173, launch it with these paths. These commands have not been run:

```powershell
$env:DASHBOARD_TLS_CERT = (Resolve-Path '.local-auth/tls/server-cert.pem').Path
$env:DASHBOARD_TLS_KEY = (Resolve-Path '.local-auth/tls/server-key.pem').Path
npm --prefix apps/venue-dashboard run dev
```

The existing Vite configuration already binds `127.0.0.1`, port 5173, strict port, and proxies `/v1` to the existing loopback API. It requires both TLS paths; no configuration edit was needed. Use `https://127.0.0.1:5173`, matching the only SAN and the API's configured dashboard origin. The existing running portal has not been restarted.

## Deferred owner account steps

1. After the approved HTTPS/trust setup, the owner opens the portal and chooses “Creează cont de cafenea” (the existing generic account form). Enter `alexmatei2330@gmail.com`, a personally chosen password of at least 12 characters, and accept the terms. Keep this a dedicated administrator account; do not submit a cafe application or acquire cafe memberships.
2. In development, the existing UI displays the private verification token locally. The owner copies it into “Verifică emailul”. No mail or token was sent during this task.
3. After the account is verified and its active identity and absence of cafe memberships are reviewed, a separately approved privileged local operator can grant platform access with an operator reference. This lease created no account or grant.
4. On the next sign-in after that grant, the existing administrator MFA gate requires enrollment in an authenticator app and confirmation of its six-digit code. The owner retains the TOTP secret/recovery codes privately.

Certificate/key/ACL and ignore checks passed. No HTTPS runtime, browser rendering, or account-flow test was performed.
