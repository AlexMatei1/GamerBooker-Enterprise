import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Link2,
  LogOut,
  MessageSquare,
  Monitor,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ApiError, secureRequest } from '../../api/secure-client';

type Application = {
  id: string;
  applicant_user_id: string;
  applicant_email?: string;
  legal_name: string;
  venue_name: string;
  city: string;
  timezone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decision_reason?: string | null;
  decided_at?: string | null;
  tenant_id?: string | null;
  venue_id?: string | null;
  access_suspended: boolean;
  current_venue_name?: string | null;
  current_timezone?: string | null;
  created_at?: string;
  form_data?: {
    cui?: string;
    address?: string;
    phone?: string;
    stations_count?: string | number;
    rate_standard?: string | number;
    rate_vip?: string | number;
    schedule?: string;
    amenities?: string;
    temporary_password?: string;
    temporary_password_generated_at?: string;
    raw_fields?: Record<string, string>;
  };
};

type IntakeAccount = {
  email: string;
  temporary_password: string | null;
  application_id: string;
  created: boolean;
};

type IntakeResult = {
  configured: boolean;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  accounts: IntakeAccount[];
};

const defaultGoogleFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdJ6LZJWv5qj5yE5n-eow-j_c_i5S2GVzVuiUV1TE7uERFXGg/viewform';
const applicationFormUrl = (import.meta.env.VITE_CAFE_APPLICATION_FORM_URL || defaultGoogleFormUrl).trim();
const formValue = (form: HTMLFormElement, key: string) => String(new FormData(form).get(key) ?? '');
const statusLabel: Record<string, string> = {
  PENDING: 'În evaluare',
  APPROVED: 'Aprobată',
  REJECTED: 'Respinsă',
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'AUTH_ROLE_NOT_PERMITTED') return 'Contul nu are drept de administrare a platformei.';
    if (error.code === 'APPLICATION_DECIDED') return 'Decizia a fost deja înregistrată și nu mai poate fi schimbată.';
    if (error.code === 'APPLICANT_UNAVAILABLE') return 'Aplicantul nu mai este activ și verificat; cererea nu poate fi aprobată.';
    if (error.code === 'INTAKE_NOT_CONFIGURED') return 'Foaia Google Sheets nu este încă conectată. Introduceți linkul foii mai jos.';
    if (error.code === 'INTAKE_FORM_NOT_SHEET') return error.message;
    if (error.code === 'INTAKE_SHEET_NOT_PUBLIC') return error.message;
    if (error.code === 'INTAKE_UNAVAILABLE') return 'Foaia Google nu poate fi descărcată acum. Verificați că foaia este accesibilă public.';
    if (error.code === 'INTAKE_EMPTY') return 'Foaia nu conține încă nicio cerere completată (are doar rândul de antet).';
    if (error.code === 'VALIDATION_FAILED') return error.message;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Operația nu a reușit.';
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="access-copy"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? 'Copiat' : label}
    </button>
  );
}

function FormResponsesSection({ application }: { application: Application }) {
  const [expanded, setExpanded] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const data = application.form_data || {};
  const cui = data.cui || 'Nespecificat';
  const address = data.address || `${application.city} (conform cerere)`;
  const phone = data.phone || 'Nespecificat';
  const stations = data.stations_count || '20';
  const rateStd = data.rate_standard ? `${data.rate_standard} RON/oră` : '25 RON/oră';
  const rateVip = data.rate_vip ? `${data.rate_vip} RON/oră` : 'Nespecificat';
  const schedule = data.schedule || '10:00 - 02:00';
  const amenities = data.amenities || 'Configurație standard PC Gaming';
  const rawFields = data.raw_fields;

  return (
    <div className="access-form-answers-card">
      <div
        className="access-form-answers-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className="access-form-answers-title">
          <FileText size={17} className="access-icon-accent" />
          <div>
            <strong>Răspunsuri formular Google</strong>
            <span className="access-muted-sub">Date extrase din chestionarul completat de companie</span>
          </div>
        </div>
        <button
          type="button"
          className="access-collapse-btn"
          aria-label={expanded ? 'Restrânge răspunsurile' : 'Extinde răspunsurile'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="access-form-answers-body">
          <div className="access-answers-grid">
            <div className="access-answer-group">
              <span className="access-answer-group-title">
                <Building2 size={14} /> Identificare & Fiscalitate
              </span>
              <div className="access-kv">
                <span className="access-k">Firmă (SRL / PFA):</span>
                <span className="access-v"><strong>{application.legal_name}</strong></span>
              </div>
              <div className="access-kv">
                <span className="access-k">CUI / CIF:</span>
                <span className="access-v"><code className="access-code-pill">{cui}</code></span>
              </div>
              <div className="access-kv">
                <span className="access-k">Oraș:</span>
                <span className="access-v">{application.city}</span>
              </div>
              <div className="access-kv">
                <span className="access-k">Adresă completă:</span>
                <span className="access-v">{address}</span>
              </div>
            </div>

            <div className="access-answer-group">
              <span className="access-answer-group-title">
                <Phone size={14} /> Contact & Reprezentant
              </span>
              <div className="access-kv">
                <span className="access-k">Email contact:</span>
                <span className="access-v"><strong>{application.applicant_email || 'fără email'}</strong></span>
              </div>
              <div className="access-kv">
                <span className="access-k">Telefon:</span>
                <span className="access-v">{phone}</span>
              </div>
              <div className="access-kv">
                <span className="access-k">Fus orar:</span>
                <span className="access-v">{application.current_timezone ?? application.timezone}</span>
              </div>
            </div>

            <div className="access-answer-group">
              <span className="access-answer-group-title">
                <Monitor size={14} /> Capacitate & Tarife
              </span>
              <div className="access-kv">
                <span className="access-k">Total stații PC & Console:</span>
                <span className="access-v"><span className="access-station-badge">{stations} stații</span></span>
              </div>
              <div className="access-kv">
                <span className="access-k">Tarif orar Standard:</span>
                <span className="access-v"><strong className="access-price-pill">{rateStd}</strong></span>
              </div>
              <div className="access-kv">
                <span className="access-k">Tarif orar VIP / Bootcamp:</span>
                <span className="access-v"><strong className="access-price-pill vip">{rateVip}</strong></span>
              </div>
            </div>

            <div className="access-answer-group">
              <span className="access-answer-group-title">
                <Clock size={14} /> Program & Dotări
              </span>
              <div className="access-kv">
                <span className="access-k">Program funcționare:</span>
                <span className="access-v">{schedule}</span>
              </div>
              <div className="access-kv full-width">
                <span className="access-k">Dotări speciale & mențiuni:</span>
                <span className="access-v access-amenities-box">{amenities}</span>
              </div>
            </div>
          </div>

          {rawFields && Object.keys(rawFields).length > 0 && (
            <div className="access-raw-fields-toggle">
              <button
                type="button"
                className="access-btn-link"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? 'Ascunde toate întrebările originale din Google Forms' : `Vezi toate cele ${Object.keys(rawFields).length} câmpuri originale din formular`}
              </button>
              {showRaw && (
                <div className="access-raw-table">
                  {Object.entries(rawFields).map(([q, a]) => (
                    <div key={q} className="access-raw-row">
                      <span className="access-raw-q">{q}</span>
                      <span className="access-raw-a">{a || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {application.status === 'PENDING' && (
            <div className="access-automation-banner">
              <Sparkles size={18} className="access-sparkle-icon" />
              <div>
                <strong>Configurare automată la aprobare:</strong>
                <p>
                  La apăsarea butonului de aprobare, sistemul va genera automat tenantul, sala de joc, cele <strong>{stations} stații PC</strong>,
                  tarifele ({rateStd}{data.rate_vip ? ` / ${rateVip} VIP` : ''}), orarul de funcționare și va preda contul către aplicant.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DecisionForm({
  application,
  onDone,
  onError,
}: {
  application: Application;
  onDone: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const decision = formValue(form, 'decision');
    const reason = formValue(form, 'reason').trim();
    setBusy(true);
    try {
      await secureRequest(`/admin/cafe-applications/${application.id}/decision`, 'POST', { decision, reason });
      form.reset();
      await onDone(
        decision === 'APPROVED'
          ? `Cererea a fost aprobată cu succes! Locația a fost configurată automat: ${application.form_data?.stations_count || '20'} stații PC create, tarifele și orarul au fost activate.`
          : 'Cererea a fost respinsă.',
      );
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="access-admin-form" onSubmit={submit} aria-busy={busy}>
      <div className="access-form-row">
        <label>
          Decizie
          <select name="decision" defaultValue="APPROVED">
            <option value="APPROVED">Aprobă cererea & Configurează automat locația</option>
            <option value="REJECTED">Respinge cererea</option>
          </select>
        </label>
        <label>
          Motivul deciziei
          <input name="reason" required minLength={2} maxLength={500} defaultValue="Date verificate și validate conform cererii Google Form" placeholder="Ex: date verificate în formular" />
        </label>
      </div>
      <p className="access-muted">
        Aprobarea creează automat tenantul, locația, sălile de joc, cele <strong>{application.form_data?.stations_count || '20'} stații PC</strong>,
        tarifele ({application.form_data?.rate_standard || '25'} RON/h Standard{application.form_data?.rate_vip ? ` / ${application.form_data.rate_vip} RON/h VIP` : ''})
        și activează rolul OWNER pentru aplicant. Decizia este definitivă.
      </p>
      <button className="primary" disabled={busy}>{busy ? 'Se înregistrează…' : 'Înregistrează decizia'}</button>
    </form>
  );
}

function AccountHandoffSection({
  application,
  onReload,
}: {
  application: Application;
  onReload?: () => Promise<void>;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState('');
  const [resetError, setResetError] = useState('');

  const tempPassword = application.form_data?.temporary_password || 'GamerBooker2026!';
  const portalUrl = window.location.origin;

  const handoffMessage = `Salut! Cererea pentru cafeneaua "${application.venue_name}" a fost aprobată pe platforma GamerBooker.

Iată datele de acces pentru contul tău de administrator:
🔗 Link portal: ${portalUrl}
📧 Email: ${application.applicant_email}
🔑 Parolă temporară: ${tempPassword}

După prima conectare, îți poți schimba parola oricând din panoul de administrare prin opțiunea "Schimbă parola".`;

  async function handleResetPassword() {
    if (
      !window.confirm(
        `Ești sigur că vrei să generezi o parolă temporară nouă pentru ${application.applicant_email}? Parola anterioară va fi invalidată.`,
      )
    ) {
      return;
    }
    setResetting(true);
    setResetNotice('');
    setResetError('');
    try {
      const res = await secureRequest<{ message: string; temporary_password: string }>(
        `/admin/cafe-applications/${application.id}/reset-temporary-password`,
        'POST',
      );
      setResetNotice(`Parolă temporară nouă generată cu succes: ${res.temporary_password}`);
      setShowPassword(true);
      if (onReload) await onReload();
    } catch (caught) {
      setResetError(caught instanceof ApiError ? caught.message : 'Eroare la resetarea parolei.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="access-handoff-box">
      <div className="access-handoff-header">
        <div className="access-handoff-title">
          <KeyRound size={18} className="access-icon-gold" />
          <div>
            <strong>Date de conectare partener (Predare cont)</strong>
            <span className="access-muted-sub">Transmite aceste credențiale reprezentantului cafenelei</span>
          </div>
        </div>
        <span className="access-tag access-tag-approved">Gata de predare</span>
      </div>

      {resetNotice && <div className="access-notice">{resetNotice}</div>}
      {resetError && <div className="access-alert">{resetError}</div>}

      <div className="access-credentials-grid">
        <div className="access-cred-item">
          <span className="access-cred-label">Link Portal GamerBooker:</span>
          <div className="access-cred-val-row">
            <span className="access-cred-val">{portalUrl}</span>
            <CopyButton value={portalUrl} label="Copiază Link" />
          </div>
        </div>

        <div className="access-cred-item">
          <span className="access-cred-label">Email Proprietar (Username):</span>
          <div className="access-cred-val-row">
            <span className="access-cred-val font-bold">{application.applicant_email || 'fără email'}</span>
            <CopyButton value={application.applicant_email || ''} label="Copiază Email" />
          </div>
        </div>

        <div className="access-cred-item">
          <span className="access-cred-label">Parolă Temporară:</span>
          <div className="access-cred-val-row">
            <span className="access-cred-val access-pass-val">
              {showPassword ? tempPassword : '••••••••••••••••'}
            </span>
            <div className="access-cred-btn-group">
              <button
                type="button"
                className="access-btn-icon-subtle"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Ascunde parola' : 'Afișează parola'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <CopyButton value={tempPassword} label="Copiază Parola" />
            </div>
          </div>
        </div>

        {application.venue_id && (
          <div className="access-cred-item">
            <span className="access-cred-label">ID Locație GamerBooker:</span>
            <div className="access-cred-val-row">
              <code className="access-code-pill">{application.venue_id}</code>
              <CopyButton value={application.venue_id} label="Copiază ID" />
            </div>
          </div>
        )}
      </div>

      <div className="access-handoff-message-card">
        <div className="access-handoff-message-header">
          <span className="access-label-small">
            <MessageSquare size={14} /> Mesaj pregătit de trimis pe Email sau WhatsApp:
          </span>
          <CopyButton value={handoffMessage} label="📋 Copiază mesajul complet" />
        </div>
        <pre className="access-handoff-preview">{handoffMessage}</pre>
      </div>

      <div className="access-handoff-actions">
        <button
          type="button"
          disabled={resetting}
          onClick={() => void handleResetPassword()}
          className="access-reset-pass-btn"
        >
          <RefreshCw size={14} className={resetting ? 'access-spin' : ''} />
          {resetting ? 'Se generează…' : 'Generează o parolă temporară nouă'}
        </button>
        <p className="access-muted-micro">
          După prima autentificare, compania are acces complet la sala de joc și își poate schimba parola din panou.
        </p>
      </div>
    </div>
  );
}

function SetupForm({
  application,
  onDone,
  onError,
}: {
  application: Application;
  onDone: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const currentName = application.current_venue_name ?? application.venue_name;
  const currentTimezone = application.current_timezone ?? application.timezone;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const venueName = formValue(form, 'venue_name').trim();
    const timezone = formValue(form, 'timezone').trim();
    const reason = formValue(form, 'reason').trim();
    const suspended = new FormData(form).get('suspended') === 'on';
    const body: Record<string, unknown> = { reason };
    if (venueName !== currentName) body.venue_name = venueName;
    if (timezone !== currentTimezone) body.timezone = timezone;
    if (suspended !== application.access_suspended) body.access_suspended = suspended;
    if (Object.keys(body).length === 1) {
      onError('Nu ai modificat nimic. Ajustează numele, fusul orar sau starea accesului.');
      return;
    }
    setBusy(true);
    try {
      await secureRequest(`/admin/cafe-applications/${application.id}/setup`, 'PATCH', body);
      await onDone('Configurarea locației a fost salvată.');
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access-admin-setup">
      <AccountHandoffSection application={application} onReload={async () => { await onDone('Datele au fost actualizate.'); }} />

      <form className="access-admin-form" onSubmit={submit} aria-busy={busy}>
        <div className="access-form-row">
          <label>
            Numele locației
            <input name="venue_name" defaultValue={currentName} required minLength={2} maxLength={120} />
          </label>
          <label>
            Fus orar
            <input name="timezone" defaultValue={currentTimezone} required maxLength={80} />
          </label>
        </div>
        <label className="access-check">
          <input type="checkbox" name="suspended" defaultChecked={application.access_suspended} />
          Suspendă accesul cafenelei la această locație
        </label>
        <label>
          Motivul modificării
          <input name="reason" required minLength={2} maxLength={500} placeholder="Ex: verificare telefonică" />
        </label>
        <p className="access-muted">
          Suspendarea revocă imediat sesiunile cafenelei. Modificările sunt înregistrate în jurnalul
          de audit.
        </p>
        <button disabled={busy}>{busy ? 'Se salvează…' : 'Salvează configurarea'}</button>
      </form>
    </div>
  );
}

export function AdminConsole({
  userEmail,
  onLogout,
}: {
  userEmail: string;
  onLogout: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'applications' | 'intake'>('applications');
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetStatus, setSheetStatus] = useState<{ configured: boolean; url?: string } | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [sheetResult, setSheetResult] = useState<IntakeResult | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [importingSample, setImportingSample] = useState(false);

  const loadApplications = useCallback(async () => {
    setBusy(true);
    try {
      const result = await secureRequest<{ applications: Application[] }>('/admin/cafe-applications');
      setApplications(result.applications);
      setError('');
    } catch (caught) {
      setApplications(null);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSheetStatus = useCallback(async () => {
    setStatusBusy(true);
    try {
      const result = await secureRequest<{ configured: boolean; url?: string }>('/admin/cafe-applications/intake/google-sheets/status');
      setSheetStatus(result);
      if (result.url) {
        setSheetUrlInput(result.url);
      }
      return result;
    } catch {
      setSheetStatus(null);
      return null;
    } finally {
      setStatusBusy(false);
    }
  }, []);

  const syncAndReload = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const status = await loadSheetStatus();
      if (status?.configured) {
        await secureRequest<IntakeResult>('/admin/cafe-applications/intake/google-sheets', 'POST').catch(() => undefined);
      }
      const result = await secureRequest<{ applications: Application[] }>('/admin/cafe-applications');
      setApplications(result.applications);
      setError('');
    } catch (caught) {
      if (!quiet) setError(errorMessage(caught));
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [loadSheetStatus]);

  useEffect(() => {
    void syncAndReload(true);
  }, [syncAndReload]);

  useEffect(() => {
    if (!sheetStatus?.configured) return;
    const interval = setInterval(() => {
      void syncAndReload(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [sheetStatus?.configured, syncAndReload]);

  async function saveSheetUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrlInput.trim()) return;
    setSavingUrl(true);
    setError('');
    setNotice('');
    try {
      const res = await secureRequest<{ configured: boolean; url: string }>(
        '/admin/cafe-applications/intake/google-sheets/config',
        'POST',
        { url: sheetUrlInput.trim() },
      );
      setSheetStatus(res);
      const intakeRes = await secureRequest<IntakeResult>('/admin/cafe-applications/intake/google-sheets', 'POST');
      setSheetResult(intakeRes);
      setNotice(
        intakeRes.imported > 0
          ? `Google Sheets a fost conectat! S-au importat cu succes ${intakeRes.imported} cereri noi.`
          : `Google Sheets a fost conectat cu succes! Foaia are ${intakeRes.total} rânduri (nicio cerere nouă neprocesată).`,
      );
      await loadApplications();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleInsertQuickTestSample() {
    const sampleSuffix = Date.now().toString().slice(-4);
    const sampleCsv = `Timestamp,Denumire firma (SRL / PFA),Numele salii / cafenelei,CUI / CIF,Oras,Adresa completa a salii,Email reprezentant / administrator,Numar de telefon,Numar total de statii (PC / Console),Tarif orar Standard (RON),Tarif orar VIP / Bootcamp (RON),Program de functionare,Dotari speciale si specificatii hardware
${new Date().toISOString()},Arena Gaming Hub SRL,Arena Gaming Cluj ${sampleSuffix},RO${Date.now().toString().slice(-8)},Cluj-Napoca,Strada Teodor Mihali 4,arena${sampleSuffix}@gamerbooker.demo,+40 733 112 ${sampleSuffix},26,27,42,Luni - Duminica: 10:00 - 03:00,26 x Intel Core i9-14900KF / RTX 4080 Super / Monitoare 280Hz Asus / Sala VIP Bootcamp`;
    setImportingSample(true);
    setError('');
    setNotice('');
    try {
      const res = await secureRequest<IntakeResult>(
        '/admin/cafe-applications/intake/raw-csv',
        'POST',
        { csv: sampleCsv },
      );
      setSheetResult(res);
      setNotice('Cererea demonstrativă Google Form a fost importată! Mergi la tab-ul „Cereri partenere” pentru a o verifica și aproba.');
      await loadApplications();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImportingSample(false);
    }
  }

  async function runIntake() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await secureRequest<IntakeResult>('/admin/cafe-applications/intake/google-sheets', 'POST');
      setSheetResult(result);
      setNotice(
        result.imported > 0
          ? `Import finalizat: ${result.imported} cereri noi, ${result.skipped} rânduri ignorate.`
          : 'Import finalizat, fără cereri noi.',
      );
      await loadApplications();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const pending = applications?.filter(application => application.status === 'PENDING').length ?? 0;
  const approved = applications?.filter(application => application.status === 'APPROVED').length ?? 0;

  return (
    <div className="access-admin">
      <div className="access-admin-head">
        <div>
          <h1>Administrare acces</h1>
        </div>
        <div className="access-actions">
          <button disabled={busy} onClick={() => void syncAndReload(false)}>
            <RefreshCw size={16} /> {busy ? 'Se sincronizează…' : 'Actualizează & Sincronizează'}
          </button>
          <button disabled={busy} onClick={() => void onLogout()}><LogOut size={16} /> Deconectare</button>
        </div>
      </div>

      <div className="access-admin-stats">
        <div><strong>{applications?.length ?? '—'}</strong><span>cereri în total</span></div>
        <div><strong>{pending}</strong><span>în evaluare</span></div>
        <div><strong>{approved}</strong><span>aprobate</span></div>
        <div>
          <strong>{sheetStatus ? (sheetStatus.configured ? 'Activ' : 'Oprit') : '—'}</strong>
          <span>import Google Sheets</span>
        </div>
      </div>

      <nav className="access-admin-tabs" aria-label="Secțiuni administrare">
        <button className={tab === 'applications' ? 'selected' : ''} onClick={() => setTab('applications')}>
          <ClipboardCheck size={17} /> Cereri
        </button>
        <button className={tab === 'intake' ? 'selected' : ''} onClick={() => setTab('intake')}>
          <FileSpreadsheet size={17} /> Import foi
        </button>
      </nav>

      {error && <div role="alert" className="access-alert">{error}</div>}
      {notice && <div role="status" className="access-notice">{notice}</div>}

      {tab === 'applications' && (
        <>
          {applications === null && !error && <p className="access-muted">Se încarcă cererile…</p>}
          {applications !== null && applications.length === 0 && (
            <section className="access-card">
              <h2>Nicio cerere în evaluare</h2>
              <p className="access-muted">
                Apasă pe „Actualizează” sau trimite o cerere nouă pentru a începe verificarea și configurarea automată a sălii.
              </p>
              {applicationFormUrl && (
                <div style={{ marginTop: '12px' }}>
                  <a className="access-link-button" href={applicationFormUrl} target="_blank" rel="noreferrer noopener">
                    Deschide formularul de înscriere Google Form <span aria-hidden="true">↗</span>
                  </a>
                </div>
              )}
            </section>
          )}

          <div className="access-admin-list">
            {applications?.map(application => (
              <article key={application.id} className={`access-admin-card access-admin-card-${application.status.toLowerCase()}`}>
                <header className="access-admin-card-head">
                  <div>
                    <span className={`access-tag access-tag-${application.status.toLowerCase()}`}>
                      {statusLabel[application.status] ?? application.status}
                    </span>
                    <h2>{application.current_venue_name ?? application.venue_name}</h2>
                    <p className="access-muted">
                      <Building2 size={14} aria-hidden="true" /> {application.legal_name} · {application.city}
                    </p>
                  </div>
                  <div className="access-admin-meta">
                    <span>{application.applicant_email ?? 'fără email'}</span>
                    <span>{application.current_timezone ?? application.timezone}</span>
                    <span className="access-mono-line"><code>{application.id}</code><CopyButton value={application.id} label="Copiază ID" /></span>
                  </div>
                </header>

                <FormResponsesSection application={application} />

                {application.decision_reason && (
                  <p className="access-decision"><strong>Motiv:</strong> {application.decision_reason}</p>
                )}

                {application.status === 'PENDING' && (
                  <DecisionForm
                    application={application}
                    onDone={async message => { setNotice(message); setError(''); await loadApplications(); }}
                    onError={setError}
                  />
                )}

                {application.status === 'APPROVED' && (
                  <SetupForm
                    application={application}
                    onDone={async message => { setNotice(message); setError(''); await loadApplications(); }}
                    onError={setError}
                  />
                )}

                {application.status === 'REJECTED' && (
                  <p className="access-muted">
                    Cererea este închisă. Cafeneaua poate trimite o cerere nouă prin formular.
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {tab === 'intake' && (
        <div className="access-admin-intake">
          <section className="access-card">
            <div className="access-admin-card-head">
              <div>
                <span className="access-tag access-tag-approved">
                  Sincronizare activă
                </span>
                <h2>Înregistrare & Import parteneri</h2>
              </div>
              <FileSpreadsheet size={30} aria-hidden="true" />
            </div>

            <p className="access-muted">
              Sincronizare automată a aplicațiilor trimise de parteneri. Cererile noi sunt procesate securizat
              și afișate în lista de evaluare pentru aprobare.
            </p>

            <div className="access-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void runIntake()}
              >
                <RefreshCw size={16} /> {busy ? 'Se sincronizează…' : 'Sincronizează cererile'}
              </button>
              <button disabled={busy} onClick={() => void loadApplications()}>Actualizează lista</button>
            </div>

            {applicationFormUrl && (
              <p className="access-muted">
                Formularul public al cafenelelor:{' '}
                <a href={applicationFormUrl} target="_blank" rel="noreferrer noopener">deschide formularul Google Form ↗</a>
              </p>
            )}
          </section>

          <section className="access-card" style={{ marginTop: '16px' }}>
            <div className="access-admin-card-head">
              <div>
                <span className={`access-tag ${sheetStatus?.configured ? 'access-tag-approved' : 'access-tag-pending'}`}>
                  {sheetStatus?.configured ? 'Sursă Conectată' : 'Neconectat la Google Sheets'}
                </span>
                <h2>Conectare Foaie Google Sheets (CSV Public)</h2>
              </div>
              <Link2 size={24} className="access-icon-gold" />
            </div>

            <p className="access-muted" style={{ margin: '8px 0 16px' }}>
              Pentru ca răspunsurile din formular să ajungă automat în panoul de admin, lipește link-ul CSV public generat din Google Sheets:
            </p>

            <form onSubmit={saveSheetUrl} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="url"
                style={{ flex: '1 1 360px', padding: '10px 14px' }}
                placeholder="Exemplu: https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                value={sheetUrlInput}
                onChange={e => setSheetUrlInput(e.target.value)}
                required
              />
              <button type="submit" className="primary" disabled={savingUrl}>
                {savingUrl ? 'Se salvează…' : 'Salvează URL Foaie'}
              </button>
            </form>

            <details className="access-secret" style={{ marginTop: '14px' }}>
              <summary>Instrucțiuni pas cu pas: Cum obții link-ul CSV din Google Form / Sheets?</summary>
              <ol style={{ paddingLeft: '20px', lineHeight: '1.8', fontSize: '13px', color: '#cbd5e1', margin: '10px 0' }}>
                <li>Deschide formularul tău <strong>Google Form</strong> (în modul de editare).</li>
                <li>Mergi la tab-ul <strong>Răspunsuri (Responses)</strong> și apasă pe pictograma verde <strong>„Trimite în Foi de calcul” (Link to Sheets)</strong> pentru a crea foaia Google Sheets asociată.</li>
                <li>În foaia Google Sheets deschisă, mergi în meniu la: <strong>Fișier (File) ➔ Trimite (Share) ➔ Publică pe web (Publish to web)</strong>.</li>
                <li>La format, selectează din meniul derulant: <strong>Valori separate prin virgulă (.csv)</strong>.</li>
                <li>Apasă butonul <strong>Publică (Publish)</strong>, copiază link-ul generat și lipește-l în căsuța de mai sus, apoi apasă <strong>Salvează URL Foaie</strong>.</li>
              </ol>
            </details>
          </section>

          <section className="access-card" style={{ marginTop: '16px', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: '#e0e7ff', marginBottom: '4px' }}>
                  Testare rapidă: Simulează o cerere Google Form
                </strong>
                <span className="access-muted" style={{ fontSize: '12.5px' }}>
                  Apasă butonul pentru a trimite instant o cerere completă cu toate cele 12 întrebări din formularul tău. Poți verifica direct aprobarea și crearea contului.
                </span>
              </div>
              <button
                type="button"
                className="primary"
                disabled={importingSample}
                onClick={() => void handleInsertQuickTestSample()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Sparkles size={16} /> {importingSample ? 'Se generează…' : 'Inserează cerere de test Google Form'}
              </button>
            </div>
          </section>

          {sheetResult && (
            <>
              <section className="access-card">
                <h2>Rezultatul importului</h2>
                <div className="access-admin-stats access-admin-stats-compact">
                  <div><strong>{sheetResult.total}</strong><span>rânduri citite</span></div>
                  <div><strong>{sheetResult.imported}</strong><span>cereri noi</span></div>
                  <div><strong>{sheetResult.skipped}</strong><span>rânduri ignorate</span></div>
                </div>
                {sheetResult.errors.length > 0 ? (
                  <details className="access-secret">
                    <summary>Rânduri cu probleme ({sheetResult.errors.length})</summary>
                    <ul>{sheetResult.errors.map((item, index) => <li key={index}><code>{item}</code></li>)}</ul>
                  </details>
                ) : (
                  <p className="access-muted">Toate rândurile au fost procesate.</p>
                )}
              </section>

              <section className="access-card">
                <h2>Conturi create</h2>
                <p className="access-alert" role="status">
                  Parolele temporare sunt afișate o singură dată. Copiază-le acum și transmite-le
                  cafenelelor pe un canal sigur.
                </p>
                {sheetResult.accounts.length === 0 ? (
                  <p className="access-muted">Importul nu a creat conturi noi.</p>
                ) : (
                  <div className="access-table">
                    <table>
                      <thead>
                        <tr><th>Email</th><th>Parolă temporară</th><th>Cerere</th><th>Cont</th></tr>
                      </thead>
                      <tbody>
                        {sheetResult.accounts.map(account => (
                          <tr key={account.application_id}>
                            <td>{account.email}</td>
                            <td>
                              <span className="access-mono-line">
                                <code>{account.temporary_password ?? '—'}</code>
                                {account.temporary_password && (
                                  <CopyButton value={account.temporary_password} label="Copiază" />
                                )}
                              </span>
                            </td>
                            <td><code>{account.application_id}</code></td>
                            <td>{account.created ? 'Nou' : 'Există deja'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
