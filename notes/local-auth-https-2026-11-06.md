# Local HTTPS activation — 2026-11-06

Lease `LOCAL-AUTH-HTTPS-ACTIVATE-2026-11-06`: **CLOSED**. Owner explicitly approved the public certificate trust import and local Vite restart.

- Portal: **https://127.0.0.1:5173/**. Vite PID **2044**, hidden independent background process; API PID **31076**, unchanged. Sole portal listener is `127.0.0.1:5173`; API remains `127.0.0.1:3000`. Both were present across independent commands after startup; neither is configured as a boot/logon service.
- Imported only `.local-auth/tls/server-cert.cer` into `Cert:\CurrentUser\Root` after checking exact DER SHA256 and SHA1 thumbprint. The stored certificate has no private key. `Cert:\LocalMachine\Root` before/after thumbprint snapshots were identical (52 entries); no LocalMachine import occurred.
- SHA256: `AC:ED:9C:60:E4:68:91:4F:7C:15:2F:BD:5E:89:31:24:DA:C4:00:33:51:AF:C6:37:0D:8A:6E:D4:ED:3D:FB:8F`.
- Windows thumbprint: `3D07D83CECE8529D4814ADD8759C1440E334E7F4`. Sole SAN IP `127.0.0.1`; `CA:FALSE`. Private key remains in ignored `.local-auth/tls/server-key.pem`; its contents were never printed or imported.
- Before stopping Vite PID 12576, verified its loopback listener, Node executable, workspace Vite entrypoint, and process creation timestamp. Started the existing Vite entrypoint hidden with the existing certificate/key path environment variables and existing configuration. No source/config edit was needed. Private logs: `.local-auth/vite.stdout.log` and `.local-auth/vite.stderr.log`.

Actual checks passed using normal Windows certificate validation:

- `Invoke-WebRequest` GET portal `/` returned **200**.
- A default .NET `SslStream.AuthenticateAsClient('127.0.0.1')` handshake validated trust/name and returned the exact expected peer SHA256 fingerprint.
- Windows system curl `8.21.0`, using **Schannel**, GET HTTPS `/v1/access/context` returned **401 AUTH_REQUIRED** through the Vite proxy.
- API GET `http://127.0.0.1:3000/healthz` returned **200**, `{"status":"ok"}`.
- No `-k`, skipped verification, custom acceptance callback, or disabled Node TLS validation was used.

Cookie contract was inspected in `src/auth/cookies.ts` and `auth.constants.ts`: the host-prefixed session cookie requires `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, and no Domain. No session was created and no login, registration, token, terms acceptance, password, MFA seed, administrator grant, or mail action was performed. Supplied email `alexmatei2330@gmail.com` remains for later owner-typed UI registration only. Database authentication/network configuration was unchanged.

For a later portal restart, reuse the existing PEM paths as `DASHBOARD_TLS_CERT` and `DASHBOARD_TLS_KEY`, then run the existing Vite command from `apps/venue-dashboard`; identify the current process before stopping it. Trust/key files remain private and ignored. This task did not perform a visual or end-to-end account test.
