import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Aperture,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  ScanLine,
  Shield,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AdminConsole } from './components/admin/AdminConsole';
import { CompanyDashboard } from './components/company/CompanyDashboard';
import { ApiError, secureRequest } from './api/secure-client';
import './styles/access.css';

type Venue = { id: string; tenant_id: string; name: string; timezone: string; role: string };
type Context = {
  user: { id: string; email: string };
  platform_admin: boolean;
  local_admin_password_only?: boolean;
  venues: Venue[];
};
type Application = {
  id: string;
  legal_name: string;
  venue_name: string;
  city: string;
  timezone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decision_reason?: string | null;
  applicant_email?: string;
  venue_id?: string | null;
  tenant_id?: string | null;
  access_suspended: boolean;
  current_venue_name?: string | null;
  current_timezone?: string | null;
};
type Enrollment = { secret: string; otpauth_uri: string; recovery_codes: string[] };
type LoginResult = {
  user_id: string;
  kind: string;
  expires_at: string;
  mfa_required: boolean;
  mfa_enrollment_required: boolean;
  auth_mode?: string;
};
type Phase = 'boot' | 'anonymous' | 'mfa' | 'ready';

const defaultGoogleFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdJ6LZJWv5qj5yE5n-eow-j_c_i5S2GVzVuiUV1TE7uERFXGg/viewform';
const applicationFormUrl = (import.meta.env.VITE_CAFE_APPLICATION_FORM_URL || defaultGoogleFormUrl).trim();
const formValue = (form: HTMLFormElement, key: string) => String(new FormData(form).get(key) ?? '');

const statusLabel: Record<string, string> = {
  PENDING: 'În evaluare',
  APPROVED: 'Aprobată',
  REJECTED: 'Respinsă',
};

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return 'Emailul sau parola nu sunt corecte.';
      case 'AUTH_MFA_INVALID':
        return 'Codul introdus nu este corect. Verifică aplicația de autentificare și încearcă din nou.';
      case 'AUTH_ACCOUNT_LOCKED':
        return 'Prea multe coduri greșite. Contul este blocat temporar; încearcă din nou mai târziu.';
      case 'AUTH_RATE_LIMITED':
        return 'Prea multe încercări într-un interval scurt. Așteaptă un minut.';
      case 'AUTH_CSRF_REQUIRED':
        return 'Cererea nu a fost acceptată de server. Reîncarcă pagina și încearcă din nou.';
      case 'APPLICATION_EXISTS':
        return 'Există deja o cerere asociată acestui cont.';
      case 'AUTH_MFA_ALREADY_ENROLLED':
        return 'Contul are deja un factor configurat.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Operația nu a reușit.';
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && <div role="alert" className="access-alert">{error}</div>}
      {notice && <div role="status" className="access-notice">{notice}</div>}
    </>
  );
}

function ApplicationLink() {
  const url = applicationFormUrl || 'https://forms.google.com';
  return (
    <a
      className="access-link-button"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
    >
      Solicită cont de partener <span aria-hidden="true">↗</span>
    </a>
  );
}

function ApplicationStatus({
  email,
  onLogout,
  onRefresh,
}: {
  email: string;
  onLogout: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [application, setApplication] = useState<Application | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await secureRequest<{ application: Application | null }>('/cafe/applications/me');
      setApplication(result.application);
      setError('');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const name = application?.current_venue_name ?? application?.venue_name;

  return (
    <section className="access-card access-application">
      <h1>Starea cererii</h1>
      <p className="access-auth-intro">
        Contul <strong>{email}</strong> nu are încă o locație activă.
      </p>

      <Feedback error={error} notice="" />

      {application === undefined && !error && <p className="access-muted">Se încarcă…</p>}

      {application === null && (
        <div className="access-application-empty">
          <h2>Nu există încă o cerere</h2>
          <ApplicationLink />
        </div>
      )}

      {application && (
        <div className="access-application-body">
          <div className="access-application-head">
            <div>
              <span className={`access-tag access-tag-${application.status.toLowerCase()}`}>
                {statusLabel[application.status] ?? application.status}
              </span>
              <h2>{name}</h2>
              <p className="access-muted">{application.legal_name} · {application.city}</p>
            </div>
            <ShieldCheck size={30} aria-hidden="true" />
          </div>

          <dl className="access-definition">
            <div><dt>Fus orar</dt><dd>{application.current_timezone ?? application.timezone}</dd></div>
            <div><dt>Email aplicant</dt><dd>{application.applicant_email ?? email}</dd></div>
            <div><dt>Identificator</dt><dd><code>{application.id}</code></dd></div>
          </dl>

          {application.decision_reason && (
            <p className="access-decision"><strong>Motivul deciziei:</strong> {application.decision_reason}</p>
          )}

          {application.access_suspended ? (
            <div className="access-alert" role="status">
              Accesul pentru această locație este suspendat temporar. Contactează asistența GamerBooker.
            </div>
          ) : application.status === 'APPROVED' ? (
            <div className="access-notice" role="status">
              Locația este aprobată. Reîncarcă panoul pentru a accesa stațiile și rezervările.
            </div>
          ) : application.status === 'REJECTED' ? (
            <div className="access-alert" role="status">
              Cererea necesită informații suplimentare. Contactează echipa de suport pentru detalii.
            </div>
          ) : (
            <div className="access-notice" role="status">Se evaluază cererea. Vei primi confirmare pe email după activare.</div>
          )}

          <div className="access-actions">
            <button className="primary" disabled={busy} onClick={() => void load()}>
              {busy ? 'Se verifică…' : 'Verifică din nou starea'}
            </button>
            {application.status === 'APPROVED' && (
              <button disabled={busy} onClick={() => void onRefresh()}>Reîncarcă accesul</button>
            )}
            <button disabled={busy} onClick={() => void onLogout()}><LogOut size={16} /> Deconectare</button>
          </div>

          {application.status === 'REJECTED' && (
            <div className="access-auth-secondary">
              <p className="access-muted">Trimiterea unei cereri noi se face prin formularul platformei.</p>
              <ApplicationLink />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function SecureApp() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [context, setContext] = useState<Context | null>(null);
  const [venueId, setVenueId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [codeOnly, setCodeOnly] = useState(false);
  const [checkingFactor, setCheckingFactor] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const requestEnrollment = useCallback(async () => {
    setCheckingFactor(true);
    setError('');
    try {
      const res = await secureRequest<Enrollment>('/auth/mfa/enroll', 'POST');
      setEnrollment(res);
      setCodeOnly(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'AUTH_MFA_ALREADY_ENROLLED') {
        setEnrollment(null);
        setCodeOnly(true);
      } else if (caught instanceof ApiError && caught.code === 'AUTH_REQUIRED') {
        setContext(null);
        setPhase('anonymous');
      } else {
        setEnrollment(null);
        setCodeOnly(true);
        setError(messageFor(caught));
      }
    } finally {
      setCheckingFactor(false);
    }
  }, []);

  const loadContext = useCallback(async () => {
    try {
      const next = await secureRequest<Context>('/access/context');
      setContext(next);
      setVenueId(previous => (next.venues.some(venue => venue.id === previous) ? previous : next.venues[0]?.id ?? ''));
      setError('');
      setPhase('ready');
    } catch (caught) {
      setContext(null);
      setEnrollment(null);
      setCodeOnly(false);
      if (caught instanceof ApiError && caught.code === 'AUTH_MFA_REQUIRED') {
        setPhase('mfa');
      } else {
        setPhase('anonymous');
        if (!(caught instanceof ApiError && caught.code === 'AUTH_REQUIRED')) setError(messageFor(caught));
      }
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  // When in MFA phase, fetch fresh factor/QR code for the active session
  useEffect(() => {
    if (phase !== 'mfa') {
      return;
    }
    void requestEnrollment();
  }, [phase, email, requestEnrollment]);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await secureRequest<void>('/auth/logout', 'POST');
    } catch {
      // A session that already expired is still a successful local sign-out.
    } finally {
      setContext(null);
      setEnrollment(null);
      setCodeOnly(false);
      setVenueId('');
      setPhase('anonymous');
      setError('');
      setNotice('Sesiunea a fost închisă.');
      setBusy(false);
    }
  }, []);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const nextEmail = formValue(form, 'email').trim();
    const password = formValue(form, 'password');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await secureRequest<LoginResult>('/auth/login', 'POST', {
        email: nextEmail,
        password,
        kind: 'dashboard',
      });
      setEmail(nextEmail);
      setEnrollment(null);
      if (result.mfa_required || result.mfa_enrollment_required) {
        setCodeOnly(!result.mfa_enrollment_required);
        setPhase('mfa');
      } else {
        await loadContext();
      }
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = formValue(event.currentTarget, 'code').replace(/\D/g, '');
    if (code.length !== 6) {
      setError('Introdu cele șase cifre ale codului de autentificare.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await secureRequest('/auth/mfa/verify', 'POST', { code });
      setEnrollment(null);
      setCodeOnly(false);
      await loadContext();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.recovery_codes.join('\n'));
      setRecoveryCopied(true);
    } catch {
      setRecoveryCopied(false);
      setError('Codurile nu au putut fi copiate automat. Selectează-le și copiază-le manual.');
    }
  }

  const gate = phase === 'boot' || phase === 'anonymous' || phase === 'mfa';
  const selectedVenue = context?.venues.find(venue => venue.id === venueId) ?? context?.venues[0];

  return (
    <div className={gate ? 'access-app access-anonymous' : 'access-app'}>
      <header className="access-header">
        <div className="access-brand">
          <div className="access-brand-icon">
            <Aperture size={22} aria-hidden="true" />
          </div>
          <div className="access-brand-text">
            <strong>GamerBooker</strong>
            <span className="access-brand-badge">ENTERPRISE</span>
          </div>
        </div>
        <div className="access-session">
          <span className="access-session-tag">
            {phase === 'ready'
              ? context?.platform_admin
                ? 'Consolă Platformă'
                : 'Portal Cafenea'
              : 'Conexiune Securizată'}
          </span>
          {phase === 'ready' && context && <strong className="access-user-email">{context.user.email}</strong>}
          {phase === 'ready' && (
            <button className="access-ghost" disabled={busy} onClick={() => void logout()}>
              <LogOut size={15} /> Deconectare
            </button>
          )}
        </div>
      </header>

      <main className="access-main">
        {phase === 'boot' && (
          <section className="access-card access-login">
            <div className="access-card-badge">
              <Sparkles size={14} /> GamerBooker Enterprise
            </div>
            <h1>Se verifică sesiunea</h1>
            <p className="access-auth-intro">Se verifică sesiunea…</p>
          </section>
        )}

        {phase === 'anonymous' && (
          <section className="access-card access-login">
            <div className="access-card-badge">
              <Sparkles size={14} /> Portal Cafenele & Administrare
            </div>
            <h1>Autentificare</h1>

            <Feedback error={error} notice={notice} />

            <form onSubmit={submitLogin} aria-busy={busy}>
              <label>
                <div className="access-label-row">
                  <span>Adresă de email</span>
                </div>
                <div className="access-input-wrap">
                  <Mail className="access-input-icon" size={18} />
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    maxLength={254}
                    defaultValue={email}
                    placeholder="nume@exemplu.ro"
                  />
                </div>
              </label>

              <label>
                <div className="access-label-row">
                  <span>Parolă de acces</span>
                  <span className="access-label-badge">Minim 12 caractere</span>
                </div>
                <div className="access-input-wrap">
                  <Lock className="access-input-icon" size={18} />
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    className="access-input-action"
                    onClick={() => setShowPassword(prev => !prev)}
                    title={showPassword ? 'Ascunde parola' : 'Arată parola'}
                    aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <button className="primary access-submit-btn" disabled={busy}>
                {busy ? 'Se verifică…' : 'Intră în cont'}
                <ChevronRight size={18} />
              </button>
            </form>

            <div className="access-auth-secondary">
              <ApplicationLink />
            </div>
          </section>
        )}

        {phase === 'mfa' && (
          <section className="access-card access-login access-mfa">
            <div className="access-card-badge">
              <ShieldCheck size={14} /> {enrollment ? 'Prima conectare · Securizare cont' : 'Securitate Cont & 2FA'}
            </div>
            <h1>{enrollment ? 'Configurare Autentificare 2FA (TOTP)' : 'Confirmă identitatea'}</h1>

            {checkingFactor && <p className="access-muted">Se pregătește configurarea în doi pași…</p>}

            {!checkingFactor && enrollment && (
              <>
                <p className="access-auth-intro">
                  Scanează codul QR cu aplicația de autentificare.
                </p>
                <div className="access-qr">
                  <QRCodeSVG
                    value={enrollment.otpauth_uri}
                    size={210}
                    marginSize={2}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#09090b"
                    title="Cod QR pentru configurarea autentificării în doi pași"
                  />
                </div>
                <details className="access-secret">
                  <summary><KeyRound size={15} /> Nu poți scana codul? Introdu manual cheia secretă</summary>
                  <p className="access-muted">Introdu cheia de configurare manual în Google Authenticator:</p>
                  <code className="access-secret-key">{enrollment.secret}</code>
                </details>
                <details className="access-secret">
                  <summary><ShieldCheck size={15} /> Coduri de rezervă / recuperare</summary>
                  <ul className="access-recovery">
                    {enrollment.recovery_codes.map(code => <li key={code}><code>{code}</code></li>)}
                  </ul>
                  <button type="button" onClick={() => void copyRecoveryCodes()}>
                    {recoveryCopied ? 'Coduri copiate' : 'Copiază codurile'}
                  </button>
                </details>
              </>
            )}

            {!checkingFactor && codeOnly && (
              <>
                <button
                  type="button"
                  className="access-btn-link"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px' }}
                  onClick={() => void requestEnrollment()}
                >
                  <ScanLine size={14} /> Nu ai scanat încă codul QR? Scanează acum
                </button>
              </>
            )}

            <Feedback error={error} notice="" />

            <form onSubmit={submitMfa} aria-busy={busy}>
              <label>
                <div className="access-label-row">
                  <span>{enrollment ? 'Introdu codul generat de aplicație (6 cifre)' : 'Cod de verificare (6 cifre)'}</span>
                </div>
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  placeholder="000 000"
                  className="access-otp-input"
                />
              </label>
              <button className="primary access-submit-btn" disabled={busy || checkingFactor}>
                {busy ? 'Se verifică…' : enrollment ? 'Confirmă și intră în panou' : 'Confirmă codul'}
                <ChevronRight size={18} />
              </button>
            </form>

            <div className="access-auth-secondary">
              <button className="access-cancel-btn" disabled={busy} onClick={() => void logout()}>
                <ScanLine size={16} /> Anulează și deconectează
              </button>
            </div>
          </section>
        )}

        {phase === 'ready' && context && (
          context.platform_admin ? (
            <AdminConsole userEmail={context.user.email} onLogout={logout} />
          ) : context.venues.length > 0 && selectedVenue ? (
            <CompanyDashboard
              venue={selectedVenue}
              venues={context.venues}
              onSelectVenue={setVenueId}
              onLogout={logout}
              onAuthFailure={loadContext}
            />
          ) : (
            <ApplicationStatus
              email={context.user.email}
              onLogout={logout}
              onRefresh={loadContext}
            />
          )
        )}
      </main>

      {gate && (
        <footer className="access-footer">
          {context?.local_admin_password_only
            ? 'Administrator local: email și parolă. După expirarea sesiunii, autentifică-te din nou.'
            : 'GamerBooker · Accesul, rolul și locația sunt verificate de server la fiecare cerere.'}
        </footer>
      )}
    </div>
  );
}
