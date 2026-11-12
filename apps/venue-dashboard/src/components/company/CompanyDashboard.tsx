import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Aperture,
  Banknote,
  CalendarDays,
  ClipboardList,
  KeyRound,
  LogOut,
  Map,
  RefreshCw,
  Settings2,
  ShoppingBag,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { ApiError, secureRequest } from '../../api/secure-client';

/* ------------------------------------------------------------------ types */

type Venue = { id: string; tenant_id: string; name: string; timezone: string; role: string };
type Tab = 'today' | 'reservations' | 'floor' | 'orders' | 'financials' | 'setup';
type SetupTab = 'profile' | 'layout' | 'hours' | 'pricing' | 'menu' | 'staff';

type Overview = {
  venue: { id: string; name: string; timezone: string; publication_state: string };
  role: string;
  rooms: Array<{ id: string; name: string }>;
  resources: Array<{ id: string; name: string; type: string; status: string; bookable: boolean }>;
  bookings: Array<{ id: string; status: string; starts_at: string; ends_at: string }>;
};
type Floor = {
  summary: {
    total_resources: number;
    available: number;
    booked: number;
    occupied: number;
    maintenance: number;
    temp_blocked: number;
  };
  resources: Array<{
    resource_id: string;
    name: string;
    type: string;
    room_name?: string | null;
    current_status: string;
    active_booking?: { public_code: string; ends_at: string } | null;
  }>;
};
type CheckinItem = {
  booking_id: string;
  public_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  customer: { email_masked: string };
  resources: Array<{ id: string; name: string; type: string }>;
  balance_minor: number;
  is_paid_in_full: boolean;
  is_ready_for_checkin: boolean;
};
type CalendarBooking = {
  booking_id: string;
  public_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  resource_names: string[];
  customer: { email_masked: string };
  total_minor: number;
  balance_minor: number;
};
type CalendarResult = {
  from: string;
  to: string;
  summary: {
    total_bookings: number;
    confirmed_count: number;
    checked_in_count: number;
    completed_count: number;
    cancelled_count: number;
    no_show_count: number;
    total_revenue_minor: number;
    outstanding_balance_minor: number;
  };
  bookings: CalendarBooking[];
};
type OrderLine = { id: string; title: string; quantity: number };
type Order = {
  id: string;
  public_code: string;
  status: string;
  total_minor: number;
  currency: string;
  target_resource_name?: string | null;
  pickup_code?: string | null;
  sla_status?: 'ON_TIME' | 'OVERDUE';
  age_minutes?: number;
  items: OrderLine[];
};
type BarBoard = {
  placed_count: number;
  accepted_count: number;
  preparing_count: number;
  ready_count: number;
  overdue_count: number;
  queue: Order[];
};
type Receipt = {
  id: string;
  booking_public_code?: string;
  amount_minor: number;
  payment_method: string;
  staff_name?: string;
  reference: string;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};
type ReceiptsResult = {
  receipts: Receipt[];
  total_count: number;
  summary: {
    total_collected_minor: number;
    cash_collected_minor: number;
    card_collected_minor: number;
    voided_count: number;
  };
};
type MaintenanceBlock = {
  id: string;
  resource_id: string;
  resource_name: string;
  reason: string;
  starts_at: string;
  ends_at: string;
  status: string;
};
type VenueDetail = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  timezone: string;
  publication_state: string;
};
type PublishGates = {
  can_publish: boolean;
  current_state: string;
  gates: {
    has_bookable_resource: boolean;
    has_operating_schedule: boolean;
    has_policy_profile: boolean;
    has_price_rule: boolean;
    has_staff: boolean;
  };
  missing_requirements: string[];
};
type Room = { id: string; name: string };
type Zone = { id: string; room_id: string; name: string };
type Resource = {
  id: string;
  room_id: string | null;
  zone_id: string | null;
  type: string;
  name: string;
  status: string;
  bookable: boolean;
};
type Schedule = { day_of_week: number; open_time: string; close_time: string; is_closed: boolean };
type PriceRule = {
  id: string;
  target_type: 'VENUE_DEFAULT' | 'ZONE' | 'RESOURCE';
  target_id: string | null;
  hourly_rate_minor: string | number;
  currency: string;
};
type PolicySettings = {
  prepaid_mode: 'FULL' | 'DEPOSIT';
  deposit_percentage: number;
  deposit_mode_settlement: 'ONLINE_ONLY' | 'RECEPTION_ONLY' | 'ONLINE_OR_RECEPTION';
  min_duration_minutes: number;
  max_duration_minutes: number;
  slot_granularity_minutes: number;
  buffer_after_minutes: number;
  free_cancellation_hours: number;
  late_cancellation_penalty_percent: number;
  no_show_grace_minutes: number;
};
type Policy = { id: string; name: string; is_default: boolean; version: number; settings: PolicySettings };
type Category = { id: string; name: string; description: string | null; sort_order: number; active: boolean };
type Product = {
  id: string;
  category_id: string | null;
  title: string;
  price_minor: number;
  currency: string;
  active: boolean;
  inventory_tracking: boolean;
  stock_on_hand: number;
  stock_available: number;
};
type Membership = { id: string; user_id: string; role: string; active: boolean; user_email?: string };
type Invitation = { id: string; email: string; role: string; status: string; expires_at: string };

/* --------------------------------------------------------------- helpers */

const OPERATIONAL_ROLES = ['OWNER', 'VENUE_MANAGER', 'RECEPTION'];
const WRITE_ROLES = ['OWNER', 'VENUE_MANAGER'];
const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Luni' },
  { value: 2, label: 'Marți' },
  { value: 3, label: 'Miercuri' },
  { value: 4, label: 'Joi' },
  { value: 5, label: 'Vineri' },
  { value: 6, label: 'Sâmbătă' },
  { value: 0, label: 'Duminică' },
];
const roleLabel: Record<string, string> = {
  OWNER: 'Proprietar',
  VENUE_MANAGER: 'Manager',
  RECEPTION: 'Recepție',
  BAR_STAFF: 'Bar',
};
const statusLabel: Record<string, string> = {
  AVAILABLE: 'Disponibil',
  BOOKED: 'Rezervat',
  OCCUPIED: 'În sesiune',
  MAINTENANCE: 'Mentenanță',
  TEMP_BLOCKED: 'Blocat',
  PLACED: 'Nouă',
  ACCEPTED: 'Acceptată',
  PREPARING: 'Se prepară',
  READY: 'Gata',
  HANDED_OFF: 'Predată',
  CONFIRMED: 'Confirmată',
  PENDING: 'În așteptare',
  CHECKED_IN: 'Check-in',
  COMPLETED: 'Finalizată',
  CANCELLED: 'Anulată',
  NO_SHOW: 'Neprezentare',
  DRAFT: 'Ciornă',
  PUBLISHED: 'Publicată',
  SUSPENDED: 'Suspendată',
  ACTIVE: 'Activ',
  PENDING_ACCEPTANCE: 'În așteptare',
  EXPIRED: 'Expirat',
  REVOKED: 'Revocat',
};

const money = (amount: number | string, currency = 'RON') =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency }).format((Number(amount) || 0) / 100);
const datetime = (value: string, zone: string) =>
  new Date(value).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short', timeZone: zone });
const dateOnly = (value: string, zone: string) =>
  new Date(value).toLocaleDateString('ro-RO', { dateStyle: 'medium', timeZone: zone });
const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '').trim();
const checked = (form: HTMLFormElement, name: string) => new FormData(form).get(name) !== null;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
      case 'AUTH_MFA_REQUIRED':
        return 'Sesiunea a expirat. Autentifică-te din nou.';
      case 'AUTH_ROLE_NOT_PERMITTED':
        return 'Rolul tău nu permite această acțiune.';
      case 'AUTH_CSRF_REQUIRED':
        return 'Cererea nu a fost acceptată de server. Reîncarcă pagina.';
      case 'PUBLISH_GATE_FAILED':
        return error.message;
      case 'VALIDATION_FAILED':
        return error.message;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Operația nu a reușit.';
}

/** Fetch one dashboard endpoint. `version` forces a refetch from a parent button. */
function useEndpoint<T>(path: string | null, onAuthFailure: () => void, version = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await secureRequest<T>(path));
      setError('');
    } catch (caught) {
      if (caught instanceof ApiError && (caught.code === 'AUTH_REQUIRED' || caught.code === 'AUTH_MFA_REQUIRED')) {
        onAuthFailure();
        return;
      }
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [path, onAuthFailure, version]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, load };
}

function useLiveRefresh(refresh: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(refresh, 25000);
    return () => window.clearInterval(id);
  }, [refresh, enabled]);
}

function Tag({ status }: { status: string }) {
  return <span className={`company-role-tag company-role-${status.toLowerCase()}`}>{statusLabel[status] ?? status}</span>;
}

function ChangePasswordModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError('');

    if (newPassword.length < 12) {
      setLocalError('Noua parolă trebuie să aibă cel puțin 12 caractere.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Parolele noi introduse nu se potrivesc.');
      return;
    }
    if (newPassword === currentPassword) {
      setLocalError('Noua parolă trebuie să fie diferită de parola curentă/temporară.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await secureRequest<{ status: string; message: string }>(
        '/auth/change-password',
        'POST',
        {
          current_password: currentPassword,
          new_password: newPassword,
        },
      );
      onSuccess(res.message || 'Parola a fost schimbată cu succes! Te poți conecta de acum înainte cu noua ta parolă.');
      onClose();
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : 'Eroare la schimbarea parolei.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="company-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="company-modal-card" onClick={e => e.stopPropagation()}>
        <div className="company-modal-header">
          <div className="company-modal-title">
            <KeyRound size={20} className="access-icon-gold" />
            <span>Schimbare Parolă Cont</span>
          </div>
          <button type="button" className="company-modal-close" onClick={onClose} aria-label="Închide">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="company-modal-body">
            {localError && <div className="notice" role="alert">{localError}</div>}

            <p className="access-muted" style={{ margin: 0, fontSize: '12.5px' }}>
              Dacă te-ai conectat cu parola temporară furnizată de administrator, introdu-o la „Parola curentă” și alege o parolă nouă de cel puțin 12 caractere.
            </p>

            <div className="company-form-group">
              <label htmlFor="cur-pass">Parolă curentă (sau temporară)</label>
              <input
                id="cur-pass"
                type="password"
                required
                className="company-input"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Introdu parola curentă"
                autoComplete="current-password"
              />
            </div>

            <div className="company-form-group">
              <label htmlFor="new-pass">Parolă nouă (minim 12 caractere)</label>
              <input
                id="new-pass"
                type="password"
                required
                minLength={12}
                className="company-input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minim 12 caractere"
                autoComplete="new-password"
              />
            </div>

            <div className="company-form-group">
              <label htmlFor="conf-pass">Confirmă noua parolă</label>
              <input
                id="conf-pass"
                type="password"
                required
                minLength={12}
                className="company-input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Reintrodu noua parolă"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="company-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Anulează
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Se salvează…' : 'Actualizează Parola'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- dashboard */

export function CompanyDashboard({
  venue,
  venues,
  onSelectVenue,
  onLogout,
  onAuthFailure,
}: {
  venue: Venue;
  venues: Venue[];
  onSelectVenue: (id: string) => void;
  onLogout: () => Promise<void>;
  onAuthFailure: () => void;
}) {
  const [tab, setTab] = useState<Tab>('today');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const canOperate = OPERATIONAL_ROLES.includes(venue.role);
  const canConfigure = WRITE_ROLES.includes(venue.role);

  const report = useCallback((message: string, tone: 'error' | 'notice' = 'notice') => {
    if (tone === 'error') {
      setError(message);
      setNotice('');
    } else {
      setNotice(message);
      setError('');
    }
  }, []);

  const refresh = useCallback(() => {
    setError('');
    setVersion(value => value + 1);
  }, []);

  const nav = useMemo(() => {
    const items: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number | string }> }> = [
      { id: 'today', label: 'Astăzi', icon: Aperture },
      { id: 'reservations', label: 'Rezervări', icon: CalendarDays },
      { id: 'floor', label: 'Sala', icon: Map },
      { id: 'orders', label: 'Comenzi', icon: ShoppingBag },
      { id: 'financials', label: 'Încasări', icon: Banknote },
    ];
    if (canConfigure) items.push({ id: 'setup', label: 'Configurare', icon: Settings2 });
    return items;
  }, [canConfigure]);

  if (!canOperate) {
    return (
      <div className="dashboard-app company-dashboard">
        <aside className="venue-rail">
          <button className="wordmark company-wordmark" onClick={() => undefined} aria-label="GamerBooker">
            <Aperture size={29} />
            <span>Gamer<br />Booker<span className="brand-dot">.</span></span>
          </button>
          <div className="rail-venue">{venue.name}<span>{venue.timezone}</span></div>
          <div className="rail-bottom">
            <span>{roleLabel[venue.role] ?? venue.role}</span>
            <button type="button" className="company-change-password" onClick={() => setShowPasswordModal(true)}>
              <KeyRound size={15} /> Schimbă parola
            </button>
            <button className="company-logout" onClick={() => void onLogout()}><LogOut size={15} /> Deconectare</button>
          </div>
        </aside>
        <main className="venue-main">
          {error && <div className="notice" role="alert">{error}</div>}
          {notice && <div className="access-notice" role="status">{notice}</div>}
          <section className="company-lock">
            <ShieldAlert size={30} aria-hidden="true" />
            <h1>Acces operațional restricționat</h1>
            <p className="company-muted">
              Rolul <strong>{roleLabel[venue.role] ?? venue.role}</strong> nu are acces la panourile de
              operare. Cere unui proprietar sau manager să îți acorde rolul potrivit.
            </p>
            <button className="btn-secondary" onClick={() => void onLogout()}><LogOut size={16} /> Deconectare</button>
          </section>
        </main>
        {showPasswordModal && (
          <ChangePasswordModal
            onClose={() => setShowPasswordModal(false)}
            onSuccess={msg => report(msg, 'notice')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-app company-dashboard">
      <aside className="venue-rail">
        <button className="wordmark company-wordmark" onClick={() => setTab('today')} aria-label="Pagina principală GamerBooker">
          <Aperture size={29} />
          <span>Gamer<br />Booker<span className="brand-dot">.</span></span>
        </button>
        <div className="rail-venue">{venue.name}<span>{venue.timezone}</span></div>
        <nav aria-label="Navigație operațională">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''}>
              <Icon size={19} />
              {label}
              <span>↗</span>
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <span>{roleLabel[venue.role] ?? venue.role}</span>
          <button type="button" className="company-change-password" onClick={() => setShowPasswordModal(true)}>
            <KeyRound size={15} /> Schimbă parola
          </button>
          <button className="company-logout" onClick={() => void onLogout()}><LogOut size={15} /> Deconectare</button>
        </div>
      </aside>

      <header className="venue-topbar">
        <div>
          <strong>{venue.name}</strong>
          <span>{roleLabel[venue.role] ?? venue.role} · {venue.timezone}</span>
        </div>
        <div className="topbar-actions">
          {venues.length > 1 && (
            <label>
              Locație
              <select value={venue.id} onChange={event => onSelectVenue(event.target.value)}>
                {venues.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="btn-change-password" onClick={() => setShowPasswordModal(true)}>
            <KeyRound size={16} /><span>Schimbă parola</span>
          </button>
          <button onClick={refresh} disabled={!canOperate}><RefreshCw size={17} /><span>Actualizează</span></button>
        </div>
      </header>

      <main className="venue-main">
        {error && <div className="notice" role="alert">{error}</div>}
        {notice && <div className="access-notice" role="status">{notice}</div>}

        {tab === 'today' && (
          <TodayTab venueId={venue.id} zone={venue.timezone} role={venue.role} version={version} onAuthFailure={onAuthFailure} onOpenTab={setTab} report={report} />
        )}
        {tab === 'reservations' && (
          <ReservationsTab venueId={venue.id} zone={venue.timezone} role={venue.role} version={version} onAuthFailure={onAuthFailure} report={report} />
        )}
        {tab === 'floor' && (
          <FloorTab venueId={venue.id} zone={venue.timezone} role={venue.role} version={version} onAuthFailure={onAuthFailure} report={report} />
        )}
        {tab === 'orders' && (
          <OrdersTab venueId={venue.id} version={version} onAuthFailure={onAuthFailure} report={report} />
        )}
        {tab === 'financials' && (
          <FinancialsTab venueId={venue.id} zone={venue.timezone} role={venue.role} version={version} onAuthFailure={onAuthFailure} report={report} />
        )}
        {tab === 'setup' && canConfigure && (
          <SetupTab venueId={venue.id} zone={venue.timezone} role={venue.role} version={version} onAuthFailure={onAuthFailure} report={report} />
        )}
      </main>

      <footer className="venue-footer">GamerBooker · v1.0.0</footer>

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={msg => report(msg, 'notice')}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- today */

function TodayTab({
  venueId,
  zone,
  role,
  version,
  onAuthFailure,
  onOpenTab,
  report,
}: {
  venueId: string;
  zone: string;
  role: string;
  version: number;
  onAuthFailure: () => void;
  onOpenTab: (tab: Tab) => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const overview = useEndpoint<Overview>(`${base}/overview`, onAuthFailure, version);
  const floor = useEndpoint<Floor>(`${base}/live-floor`, onAuthFailure, version);
  const queue = useEndpoint<{ items: CheckinItem[] }>(`${base}/checkin-queue`, onAuthFailure, version);
  const bar = useEndpoint<BarBoard>(`${base}/bar-board`, onAuthFailure, version);

  const { load: loadOverview } = overview;
  const { load: loadFloor } = floor;
  const { load: loadQueue } = queue;
  const { load: loadBar } = bar;
  const refreshAll = useCallback(() => {
    void loadOverview();
    void loadFloor();
    void loadQueue();
    void loadBar();
  }, [loadOverview, loadFloor, loadQueue, loadBar]);
  useLiveRefresh(refreshAll, true);

  const loading = overview.loading && !overview.data;
  const problem = overview.error || floor.error || queue.error || bar.error;
  const stats = floor.data?.summary;
  const arrivals = queue.data?.items ?? [];
  const activeOrders = (bar.data?.queue ?? []).filter(order => ['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status));

  if (loading) return (
      <div className="empty-state">
        <p className="company-muted">Se încarcă…</p>
      </div>
    );

  return (
    <>
      <div className="page-title">
        <h1>Astăzi</h1>
        <div className="page-actions">
          <button className="btn-secondary" onClick={refreshAll} disabled={overview.loading}><RefreshCw size={16} /> Reîmprospătează</button>
        </div>
      </div>

      {problem && <div className="notice" role="alert">{problem}</div>}

      {overview.data && overview.data.venue.publication_state !== 'PUBLISHED' && (
        <div className="company-draft">
          <p>
            <strong>{statusLabel[overview.data.venue.publication_state] ?? overview.data.venue.publication_state}</strong>
            {' '}· clienții nu pot rezerva.
          </p>
          {WRITE_ROLES.includes(role) && (
            <button className="btn-secondary" onClick={() => onOpenTab('setup')}>Deschide configurarea</button>
          )}
        </div>
      )}

      <div className="summary-line">
        <span><strong>{stats?.available ?? '—'}</strong> disponibile</span>
        <span><strong>{stats?.occupied ?? '—'}</strong> în sesiune</span>
        <span><strong>{arrivals.length}</strong> sosiri în așteptare</span>
        <span><strong>{activeOrders.length}</strong> comenzi active</span>
        <small>{overview.data ? `${overview.data.bookings.length} rezervări în următoarele șapte zile` : '—'}</small>
      </div>

      <div className="operations-grid">
        <section className="panel company-panel">
          <div className="company-section-head"><h2>Următoarele rezervări</h2><span>{overview.data?.bookings.length ?? 0} înregistrări</span></div>
          {!overview.data?.bookings.length ? (
            <p className="company-muted">Fără rezervări.</p>
          ) : (
            <div className="company-table">
              <table>
                <thead><tr><th>Început</th><th>Sfârșit</th><th>Stare</th></tr></thead>
                <tbody>
                  {overview.data.bookings.slice(0, 8).map(booking => (
                    <tr key={booking.id}>
                      <td>{datetime(booking.starts_at, zone)}</td>
                      <td>{datetime(booking.ends_at, zone)}</td>
                      <td><Tag status={booking.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="company-inline-form">
            <button className="btn-secondary" onClick={() => onOpenTab('reservations')}>Vezi toate rezervările</button>
            <button className="btn-secondary" onClick={() => onOpenTab('orders')}>Deschide comenzile</button>
          </div>
        </section>

        <aside className="attention-queue">
          <div className="attention-title"><h2>Sosiri</h2><span>{arrivals.length}</span></div>
          {!arrivals.length ? <p className="company-muted">Fără sosiri.</p> : arrivals.slice(0, 5).map(item => (
            <article key={item.booking_id}>
              <div>
                <strong>{item.public_code}</strong>
                <span>{item.is_ready_for_checkin ? 'Pregătit' : 'Necesită verificare'}</span>
              </div>
              <p>{item.customer.email_masked} · {item.resources.map(resource => resource.name).join(', ')}</p>
              <small>{datetime(item.starts_at, zone)} · {money(item.balance_minor)}</small>
            </article>
          ))}
        </aside>
      </div>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Comenzi în lucru</h2><span>{activeOrders.length} comenzi</span></div>
        {!activeOrders.length ? (
          <p className="company-muted">Fără comenzi.</p>
        ) : (
          <div className="company-list">
            {activeOrders.slice(0, 5).map(order => (
              <div className="company-list-row" key={order.id}>
                <div>
                  <strong>{order.public_code} · {money(order.total_minor, order.currency)}</strong>
                  <small>{order.items.map(line => `${line.quantity}× ${line.title}`).join(', ') || 'Fără produse'}{order.target_resource_name ? ` · ${order.target_resource_name}` : ''}</small>
                </div>
                <Tag status={order.status} />
              </div>
            ))}
          </div>
        )}
        <div className="company-inline-form">
          <button className="btn-secondary" onClick={() => onOpenTab('orders')}>Gestionează coada comenzilor</button>
          <button className="btn-secondary" onClick={() => { report('Datele au fost reîmprospătate.'); refreshAll(); }}>Reîncarcă datele</button>
        </div>
      </section>
    </>
  );
}

/* --------------------------------------------------------- reservations */

function ReservationsTab({
  venueId,
  zone,
  role,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  zone: string;
  role: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const calendar = useEndpoint<CalendarResult>(
    `${base}/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    onAuthFailure,
    version,
  );
  const queue = useEndpoint<{ items: CheckinItem[] }>(`${base}/checkin-queue`, onAuthFailure, version);

  const canCheckin = OPERATIONAL_ROLES.includes(role);
  const summary = calendar.data?.summary;

  async function submitCheckin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = field(form, 'code');
    if (!value) return;
    try {
      const result = await secureRequest<{ public_code: string }>(
        `${base}/checkin`,
        'POST',
        value.length >= 100 ? { qr_token: value } : { public_code: value },
      );
      form.reset();
      report(`Check-in confirmat pentru ${result.public_code}.`);
      await Promise.all([calendar.load(), queue.load()]);
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>Rezervări</h1>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => void calendar.load()} disabled={calendar.loading}><RefreshCw size={16} /> Reîncarcă</button>
        </div>
      </div>

      {calendar.error && <div className="notice" role="alert">{calendar.error}</div>}

      <div className="company-stat-grid">
        <div><strong>{summary?.total_bookings ?? '—'}</strong><span>rezervări</span></div>
        <div><strong>{summary?.confirmed_count ?? '—'}</strong><span>confirmate</span></div>
        <div><strong>{summary?.checked_in_count ?? '—'}</strong><span>check-in</span></div>
        <div><strong>{summary?.no_show_count ?? '—'}</strong><span>neprezentări</span></div>
        <div><strong>{summary ? money(summary.outstanding_balance_minor) : '—'}</strong><span>sold de încasat</span></div>
      </div>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Programări</h2><span>{calendar.data?.bookings.length ?? 0} înregistrări</span></div>
        {calendar.loading && !calendar.data ? (
          <p className="company-muted">Se încarcă…</p>
        ) : !calendar.data?.bookings.length ? (
          <div className="empty-state">Nu există rezervări în intervalul selectat.</div>
        ) : (
          <div className="company-table">
            <table>
              <thead><tr><th>Cod</th><th>Client</th><th>Resurse</th><th>Interval</th><th>Total</th><th>Sold</th><th>Stare</th></tr></thead>
              <tbody>
                {calendar.data.bookings.map(booking => (
                  <tr key={booking.booking_id}>
                    <td>{booking.public_code}</td>
                    <td>{booking.customer.email_masked}</td>
                    <td>{booking.resource_names.join(', ') || '—'}</td>
                    <td>{datetime(booking.starts_at, zone)} – {datetime(booking.ends_at, zone)}</td>
                    <td>{money(booking.total_minor)}</td>
                    <td>{money(booking.balance_minor)}</td>
                    <td><Tag status={booking.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="operations-grid">
        <section className="panel company-panel">
          <div className="company-section-head"><h2>Coada de check-in</h2><span>{queue.data?.items.length ?? 0} sosiri</span></div>
          {!queue.data?.items.length ? (
            <p className="company-muted">Nicio rezervare nu a intrat în coada de check-in.</p>
          ) : (
            <div className="company-table">
              <table>
                <thead><tr><th>Cod</th><th>Client</th><th>Resurse</th><th>Sold</th><th>Pregătit</th></tr></thead>
                <tbody>
                  {queue.data.items.map(item => (
                    <tr key={item.booking_id}>
                      <td>{item.public_code}</td>
                      <td>{item.customer.email_masked}</td>
                      <td>{item.resources.map(resource => resource.name).join(', ')}</td>
                      <td>{money(item.balance_minor)}</td>
                      <td>{item.is_ready_for_checkin ? 'Da' : 'Nu'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {canCheckin && (
          <section className="panel company-panel">
            <h2>Check-in</h2>
            <form className="checkin-form" onSubmit={submitCheckin}>
              <label htmlFor="company-checkin-code">Token din QR sau codul permisului</label>
              <div>
                <input id="company-checkin-code" name="code" autoComplete="off" placeholder="Cod sau token QR" />
                <button className="btn-primary" type="submit">Confirmă</button>
              </div>
            </form>
          </section>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- floor */

function FloorTab({
  venueId,
  zone,
  role,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  zone: string;
  role: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const floor = useEndpoint<Floor>(`${base}/live-floor`, onAuthFailure, version);
  const blocks = useEndpoint<{ maintenance_blocks: MaintenanceBlock[] }>(`${base}/maintenance-blocks`, onAuthFailure, version);
  const canWrite = WRITE_ROLES.includes(role);

  const { load: loadFloor } = floor;
  useLiveRefresh(useCallback(() => void loadFloor(), [loadFloor]), true);

  async function reloadAll() {
    await Promise.all([floor.load(), blocks.load()]);
  }

  async function createBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const resourceId = field(form, 'resource_id');
    const reason = field(form, 'reason');
    const starts = field(form, 'starts_at');
    const ends = field(form, 'ends_at');
    if (!resourceId || !reason || !starts || !ends) {
      report('Completează resursa, motivul și intervalul blocajului.', 'error');
      return;
    }
    try {
      await secureRequest(`${base}/resources/${resourceId}/maintenance-blocks`, 'POST', {
        reason,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
      });
      form.reset();
      report('Blocajul de mentenanță a fost programat.');
      await reloadAll();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  async function cancelBlock(id: string) {
    try {
      await secureRequest(`${base}/maintenance-blocks/${id}/cancel`, 'POST');
      report('Blocajul a fost anulat.');
      await reloadAll();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  const summary = floor.data?.summary;

  return (
    <>
      <div className="page-title">
        <h1>Sala</h1>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => void reloadAll()} disabled={floor.loading}><RefreshCw size={16} /> Reîncarcă</button>
        </div>
      </div>

      {(floor.error || blocks.error) && <div className="notice" role="alert">{floor.error || blocks.error}</div>}

      <div className="summary-line">
        <span><strong>{summary?.total_resources ?? '—'}</strong> resurse</span>
        <span><strong>{summary?.available ?? '—'}</strong> disponibile</span>
        <span><strong>{summary?.booked ?? '—'}</strong> rezervate</span>
        <span><strong>{summary?.occupied ?? '—'}</strong> în sesiune</span>
        <span><strong>{(summary?.maintenance ?? 0) + (summary?.temp_blocked ?? 0)}</strong> indisponibile</span>
      </div>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Resurse</h2><span>{floor.data?.resources.length ?? 0} afișate</span></div>
        {!floor.data?.resources.length ? (
          <p className="company-muted">Nicio resursă configurată.</p>
        ) : (
          <div className="company-resource-grid">
            {floor.data.resources.map(resource => (
              <article key={resource.resource_id} className={`company-resource company-resource-${resource.current_status.toLowerCase()}`}>
                <strong>{resource.name}</strong>
                <span>{resource.room_name ?? resource.type}</span>
                <b>{statusLabel[resource.current_status] ?? resource.current_status}</b>
                {resource.active_booking && <small>Rezervare {resource.active_booking.public_code} · până la {datetime(resource.active_booking.ends_at, zone)}</small>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Blocaje de mentenanță</h2><span>{blocks.data?.maintenance_blocks.length ?? 0} înregistrări</span></div>
        {!blocks.data?.maintenance_blocks.length ? (
          <p className="company-muted">Nu există blocaje programate.</p>
        ) : (
          <div className="company-list">
            {blocks.data.maintenance_blocks.map(block => (
              <div className="company-list-row" key={block.id}>
                <div>
                  <strong>{block.resource_name} · {statusLabel[block.status] ?? block.status}</strong>
                  <small>{block.reason} · {datetime(block.starts_at, zone)} – {datetime(block.ends_at, zone)}</small>
                </div>
                {canWrite && (
                  <button className="btn-secondary" onClick={() => void cancelBlock(block.id)}>Anulează blocajul</button>
                )}
              </div>
            ))}
          </div>
        )}

        {canWrite && (
          <form className="company-form-grid" onSubmit={createBlock}>
            <label>
              Resursă
              <select name="resource_id" required defaultValue="">
                <option value="" disabled>Alege resursa</option>
                {(floor.data?.resources ?? []).map(resource => (
                  <option key={resource.resource_id} value={resource.resource_id}>{resource.name}</option>
                ))}
              </select>
            </label>
            <label>
              Motiv
              <input name="reason" required minLength={2} maxLength={200} placeholder="Ex: revizie tehnică" />
            </label>
            <label>
              Început
              <input name="starts_at" type="datetime-local" required />
            </label>
            <label>
              Sfârșit
              <input name="ends_at" type="datetime-local" required />
            </label>
            <div className="company-form-actions">
              <button className="btn-primary" type="submit">Programează blocaj</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- orders */

function OrdersTab({
  venueId,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const board = useEndpoint<BarBoard>(`${base}/bar-board`, onAuthFailure, version);
  const [acting, setActing] = useState('');
  const { load } = board;
  useLiveRefresh(useCallback(() => void load(), [load]), true);

  async function call(action: string, order: Order, body?: unknown, message = 'Comanda a fost actualizată.') {
    setActing(order.id);
    try {
      await secureRequest(`${base}/orders/${order.id}/${action}`, 'POST', body);
      report(message);
      await board.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    } finally {
      setActing('');
    }
  }

  async function handoff(event: React.FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    const form = event.currentTarget;
    await call('handoff', order, {
      pickup_code: order.pickup_code ?? undefined,
      age_verified: checked(form, 'age_verified'),
    }, `Comanda ${order.public_code} a fost predată.`);
  }

  async function reject(event: React.FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    const reason = field(event.currentTarget, 'reason');
    if (!reason) {
      report('Scrie motivul refuzului.', 'error');
      return;
    }
    await call('reject', order, { reason }, `Comanda ${order.public_code} a fost refuzată.`);
  }

  const queue = board.data?.queue ?? [];

  return (
    <>
      <div className="page-title">
        <h1>Comenzi bar</h1>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => void board.load()} disabled={board.loading}><RefreshCw size={16} /> Reîncarcă</button>
        </div>
      </div>

      {board.error && <div className="notice" role="alert">{board.error}</div>}

      <div className="summary-line">
        <span><strong>{board.data?.placed_count ?? '—'}</strong> noi</span>
        <span><strong>{board.data?.accepted_count ?? '—'}</strong> acceptate</span>
        <span><strong>{board.data?.preparing_count ?? '—'}</strong> în preparare</span>
        <span><strong>{board.data?.ready_count ?? '—'}</strong> gata</span>
        <span><strong>{board.data?.overdue_count ?? '—'}</strong> întârziate</span>
      </div>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Coada activă</h2><span>{queue.length} comenzi</span></div>
        {!queue.length ? (
          <p className="company-muted">Nicio comandă activă.</p>
        ) : (
          <div className="company-order-grid">
            {queue.map(order => (
              <article key={order.id} className="company-order">
                <div>
                  <strong>{order.public_code}</strong>
                  <span className="company-status">{statusLabel[order.status] ?? order.status}</span>
                </div>
                <p>{order.items.map(line => `${line.quantity}× ${line.title}`).join(', ') || 'Fără produse'}</p>
                <small>
                  {order.target_resource_name ?? 'Ridicare la bar'} · {money(order.total_minor, order.currency)}
                  {order.sla_status === 'OVERDUE' && <strong className="company-void"> · întârziată</strong>}
                </small>

                <div className="company-order-actions">
                  {order.status === 'PLACED' && (
                    <button className="btn-primary" disabled={acting === order.id} onClick={() => void call('accept', order, undefined, 'Comanda a fost acceptată.')}>
                      {acting === order.id ? 'Se actualizează…' : 'Acceptă'}
                    </button>
                  )}
                  {order.status === 'ACCEPTED' && (
                    <button className="btn-primary" disabled={acting === order.id} onClick={() => void call('prepare', order, undefined, 'Prepararea a început.')}>
                      {acting === order.id ? 'Se actualizează…' : 'Începe prepararea'}
                    </button>
                  )}
                  {order.status === 'PREPARING' && (
                    <button className="btn-primary" disabled={acting === order.id} onClick={() => void call('ready', order, undefined, 'Comanda este gata.')}>
                      {acting === order.id ? 'Se actualizează…' : 'Marchează gata'}
                    </button>
                  )}
                  {order.status === 'READY' && (
                    <form onSubmit={event => void handoff(event, order)}>
                      <label className="company-checkbox">
                        <input type="checkbox" name="age_verified" /> Vârstă verificată
                      </label>
                      <button className="btn-primary" type="submit" disabled={acting === order.id}>
                        {acting === order.id ? 'Se predă…' : 'Predă comanda'}
                      </button>
                    </form>
                  )}
                  {['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status) && (
                    <form onSubmit={event => void reject(event, order)}>
                      <input name="reason" required minLength={2} maxLength={200} placeholder="Motiv refuz" />
                      <button className="btn-danger" type="submit" disabled={acting === order.id}>Refuză</button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------- financials */

function FinancialsTab({
  venueId,
  zone,
  role,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  zone: string;
  role: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const [includeVoided, setIncludeVoided] = useState(false);
  const path = `${base}/receipts${includeVoided ? '?include_voided=1' : ''}`;
  const ledger = useEndpoint<ReceiptsResult>(path, onAuthFailure, version);
  const canVoid = WRITE_ROLES.includes(role);
  const summary = ledger.data?.summary;

  async function voidReceipt(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const reason = field(event.currentTarget, 'reason');
    if (!reason) {
      report('Scrie motivul anulării.', 'error');
      return;
    }
    try {
      await secureRequest(`${base}/receipts/${id}/void`, 'POST', { reason });
      report('Încasarea a fost anulată; soldul rezervării a fost recalculat.');
      await ledger.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>Încasări</h1>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => void ledger.load()} disabled={ledger.loading}><RefreshCw size={16} /> Reîncarcă</button>
        </div>
      </div>

      {ledger.error && <div className="notice" role="alert">{ledger.error}</div>}

      <div className="company-stat-grid">
        <div><strong>{summary ? money(summary.total_collected_minor) : '—'}</strong><span>total încasat</span></div>
        <div><strong>{summary ? money(summary.cash_collected_minor) : '—'}</strong><span>numerar</span></div>
        <div><strong>{summary ? money(summary.card_collected_minor) : '—'}</strong><span>card</span></div>
        <div><strong>{summary?.voided_count ?? '—'}</strong><span>anulări</span></div>
      </div>

      <section className="panel company-panel">
        <div className="company-section-head">
          <h2>Încasări</h2>
          <label className="company-checkbox">
            <input type="checkbox" checked={includeVoided} onChange={event => setIncludeVoided(event.target.checked)} /> Include anulările
          </label>
        </div>
        {ledger.loading && !ledger.data ? (
          <p className="company-muted">Se încarcă…</p>
        ) : !ledger.data?.receipts.length ? (
          <p className="company-muted">Nicio încasare înregistrată.</p>
        ) : (
          <div className="company-table">
            <table>
              <thead><tr><th>Data</th><th>Rezervare</th><th>Metodă</th><th>Sumă</th><th>Operator</th><th>Stare</th><th /></tr></thead>
              <tbody>
                {ledger.data.receipts.map(receipt => (
                  <tr key={receipt.id}>
                    <td>{datetime(receipt.created_at, zone)}</td>
                    <td>{receipt.booking_public_code ?? '—'}</td>
                    <td>{receipt.payment_method}</td>
                    <td>{money(receipt.amount_minor)}</td>
                    <td>{receipt.staff_name ?? '—'}</td>
                    <td>{receipt.voided_at ? <span className="company-void">Anulată</span> : 'Valabilă'}</td>
                    <td>
                      {canVoid && !receipt.voided_at && (
                        <details className="access-secret">
                          <summary>Anulează</summary>
                          <form onSubmit={event => void voidReceipt(event, receipt.id)}>
                            <label>
                              Motiv
                              <input name="reason" required minLength={2} maxLength={200} />
                            </label>
                            <button className="btn-danger" type="submit">Confirmă anularea</button>
                          </form>
                        </details>
                      )}
                      {receipt.voided_at && receipt.void_reason && <small>{receipt.void_reason}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="company-muted">Anularea este definitivă și se înregistrează în audit.</p>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ setup */

function SetupTab({
  venueId,
  zone,
  role,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  zone: string;
  role: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const [section, setSection] = useState<SetupTab>('profile');
  const sections: Array<{ id: SetupTab; label: string }> = [
    { id: 'profile', label: 'Profil și publicare' },
    { id: 'layout', label: 'Săli și resurse' },
    { id: 'hours', label: 'Program' },
    { id: 'pricing', label: 'Tarife și politici' },
    { id: 'menu', label: 'Meniu și stoc' },
    { id: 'staff', label: 'Echipă' },
  ];

  return (
    <>
      <div className="page-title">
        <h1>Configurare</h1>
      </div>

      <nav className="company-setup-tabs" aria-label="Secțiuni de configurare">
        {sections.map(item => (
          <button key={item.id} className={section === item.id ? 'selected' : ''} onClick={() => setSection(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {section === 'profile' && <ProfilePanel venueId={venueId} role={role} version={version} onAuthFailure={onAuthFailure} report={report} />}
      {section === 'layout' && <LayoutPanel venueId={venueId} version={version} onAuthFailure={onAuthFailure} report={report} />}
      {section === 'hours' && <HoursPanel venueId={venueId} version={version} onAuthFailure={onAuthFailure} report={report} />}
      {section === 'pricing' && <PricingPanel venueId={venueId} version={version} onAuthFailure={onAuthFailure} report={report} />}
      {section === 'menu' && <MenuPanel venueId={venueId} version={version} onAuthFailure={onAuthFailure} report={report} />}
      {section === 'staff' && <StaffPanel venueId={venueId} role={role} zone={zone} version={version} onAuthFailure={onAuthFailure} report={report} />}
    </>
  );
}

function ProfilePanel({
  venueId,
  role,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  role: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const detail = useEndpoint<{ venue: VenueDetail }>(base, onAuthFailure, version);
  const gates = useEndpoint<PublishGates>(`${base}/publish-gates`, onAuthFailure, version);
  const canPublish = role === 'OWNER';

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await secureRequest(base, 'PATCH', {
        name: field(form, 'name'),
        slug: field(form, 'slug'),
        timezone: field(form, 'timezone'),
      });
      report('Profilul locației a fost salvat.');
      await Promise.all([detail.load(), gates.load()]);
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  async function publish(action: 'publish' | 'unpublish') {
    try {
      await secureRequest(`${base}/${action}`, 'POST');
      report(action === 'publish' ? 'Locația este publicată.' : 'Locația a fost retrasă din publicare.');
      await Promise.all([detail.load(), gates.load()]);
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  if (detail.loading && !detail.data) return <p className="company-muted">Se încarcă…</p>;
  if (detail.error) return <div className="notice" role="alert">{detail.error}</div>;
  if (!detail.data) return null;

  const venue = detail.data.venue;

  return (
    <div className="operations-grid">
      <section className="panel company-panel">
        <div className="company-section-head"><h2>Profil</h2><Tag status={venue.publication_state} /></div>
        <form className="company-form-grid" onSubmit={save}>
          <label>
            Numele locației
            <input name="name" defaultValue={venue.name} required minLength={2} maxLength={120} />
          </label>
          <label>
            Identificator public
            <input name="slug" defaultValue={venue.slug} required minLength={2} maxLength={80} />
          </label>
          <label>
            Fus orar
            <input name="timezone" defaultValue={venue.timezone} required maxLength={80} />
          </label>
          <div className="company-form-actions">
            <button className="btn-primary" type="submit">Salvează profilul</button>
          </div>
        </form>
      </section>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Publicare</h2><span>{gates.data?.can_publish ? 'Condiții îndeplinite' : 'Condiții lipsă'}</span></div>
        {gates.error && <div className="notice" role="alert">{gates.error}</div>}
        {!gates.data ? (
          <p className="company-muted">Se încarcă…</p>
        ) : (
          <>
            <div className="company-gate-list">
              <div><span>Resursă rezervabilă</span><b className={gates.data.gates.has_bookable_resource ? 'company-gate-ok' : 'company-gate-missing'}>{gates.data.gates.has_bookable_resource ? 'Îndeplinită' : 'Lipsă'}</b></div>
              <div><span>Program de lucru</span><b className={gates.data.gates.has_operating_schedule ? 'company-gate-ok' : 'company-gate-missing'}>{gates.data.gates.has_operating_schedule ? 'Îndeplinită' : 'Lipsă'}</b></div>
              <div><span>Politică implicită</span><b className={gates.data.gates.has_policy_profile ? 'company-gate-ok' : 'company-gate-missing'}>{gates.data.gates.has_policy_profile ? 'Îndeplinită' : 'Lipsă'}</b></div>
              <div><span>Tarif configurat</span><b className={gates.data.gates.has_price_rule ? 'company-gate-ok' : 'company-gate-missing'}>{gates.data.gates.has_price_rule ? 'Îndeplinită' : 'Lipsă'}</b></div>
              <div><span>Echipă activă</span><b className={gates.data.gates.has_staff ? 'company-gate-ok' : 'company-gate-missing'}>{gates.data.gates.has_staff ? 'Îndeplinită' : 'Lipsă'}</b></div>
            </div>
            {gates.data.missing_requirements.length > 0 && (
              <ul className="company-muted">
                {gates.data.missing_requirements.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}
            <div className="company-inline-form">
              <button className="btn-primary" disabled={!canPublish || !gates.data.can_publish || gates.data.current_state === 'PUBLISHED'} onClick={() => void publish('publish')}>
                Publică locația
              </button>
              <button className="btn-secondary" disabled={!canPublish || gates.data.current_state !== 'PUBLISHED'} onClick={() => void publish('unpublish')}>
                Retrage din publicare
              </button>
            </div>
            {!canPublish && <p className="company-muted">Doar proprietarul poate schimba starea de publicare.</p>}
          </>
        )}
      </section>
    </div>
  );
}

function LayoutPanel({
  venueId,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const rooms = useEndpoint<{ rooms: Room[] }>(`${base}/rooms`, onAuthFailure, version);
  const zones = useEndpoint<{ zones: Zone[] }>(`${base}/zones`, onAuthFailure, version);
  const resources = useEndpoint<{ resources: Resource[] }>(`${base}/resources`, onAuthFailure, version);

  async function reloadAll() {
    await Promise.all([rooms.load(), zones.load(), resources.load()]);
  }

  async function create(event: React.FormEvent<HTMLFormElement>, kind: 'room' | 'zone' | 'resource') {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      if (kind === 'room') {
        await secureRequest(`${base}/rooms`, 'POST', { name: field(form, 'name') });
      } else if (kind === 'zone') {
        await secureRequest(`${base}/zones`, 'POST', { roomId: field(form, 'room_id'), name: field(form, 'name') });
      } else {
        const roomId = field(form, 'room_id');
        const zoneId = field(form, 'zone_id');
        await secureRequest(`${base}/resources`, 'POST', {
          name: field(form, 'name'),
          type: field(form, 'type'),
          roomId: roomId || null,
          zoneId: zoneId || null,
          bookable: checked(form, 'bookable'),
        });
      }
      form.reset();
      report(kind === 'room' ? 'Sala a fost creată.' : kind === 'zone' ? 'Zona a fost creată.' : 'Resursa a fost creată.');
      await reloadAll();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  const roomName = (id: string | null) => rooms.data?.rooms.find(room => room.id === id)?.name ?? '—';
  const zoneName = (id: string | null) => zones.data?.zones.find(zone => zone.id === id)?.name ?? '—';

  return (
    <>
      {(rooms.error || zones.error || resources.error) && (
        <div className="notice" role="alert">{rooms.error || zones.error || resources.error}</div>
      )}

      <div className="operations-grid">
        <section className="panel company-panel">
          <div className="company-section-head"><h2>Săli</h2><span>{rooms.data?.rooms.length ?? 0}</span></div>
          <div className="company-list">
            {(rooms.data?.rooms ?? []).map(room => <div className="company-list-row" key={room.id}><div><strong>{room.name}</strong><small>{room.id}</small></div></div>)}
            {!rooms.data?.rooms.length && <p className="company-muted">Nu există săli.</p>}
          </div>
          <form className="company-inline-form" onSubmit={event => void create(event, 'room')}>
            <label>Nume sală<input name="name" required minLength={2} maxLength={120} placeholder="Ex: Sala principală" /></label>
            <button className="btn-primary" type="submit">Adaugă sală</button>
          </form>
        </section>

        <section className="panel company-panel">
          <div className="company-section-head"><h2>Zone</h2><span>{zones.data?.zones.length ?? 0}</span></div>
          <div className="company-list">
            {(zones.data?.zones ?? []).map(zone => (
              <div className="company-list-row" key={zone.id}>
                <div><strong>{zone.name}</strong><small>{roomName(zone.room_id)}</small></div>
              </div>
            ))}
            {!zones.data?.zones.length && <p className="company-muted">Nu există zone.</p>}
          </div>
          <form className="company-inline-form" onSubmit={event => void create(event, 'zone')}>
            <label>
              Sală
              <select name="room_id" required defaultValue="">
                <option value="" disabled>Alege sala</option>
                {(rooms.data?.rooms ?? []).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select>
            </label>
            <label>Nume zonă<input name="name" required minLength={2} maxLength={120} placeholder="Ex: Zona VIP" /></label>
            <button className="btn-primary" type="submit">Adaugă zonă</button>
          </form>
        </section>
      </div>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Resurse</h2><span>{resources.data?.resources.length ?? 0}</span></div>
        <div className="company-table">
          <table>
            <thead><tr><th>Nume</th><th>Tip</th><th>Sală</th><th>Zonă</th><th>Stare</th><th>Rezervabilă</th></tr></thead>
            <tbody>
              {(resources.data?.resources ?? []).map(resource => (
                <tr key={resource.id}>
                  <td>{resource.name}</td>
                  <td>{resource.type}</td>
                  <td>{roomName(resource.room_id)}</td>
                  <td>{zoneName(resource.zone_id)}</td>
                  <td><Tag status={resource.status} /></td>
                  <td>{resource.bookable ? 'Da' : 'Nu'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="company-form-grid" onSubmit={event => void create(event, 'resource')}>
          <label>Nume resursă<input name="name" required minLength={2} maxLength={120} placeholder="Ex: PC 01" /></label>
          <label>
            Tip
            <select name="type" defaultValue="PC">
              <option value="PC">PC</option>
              <option value="CONSOLE_SETUP">Consolă</option>
              <option value="PRIVATE_ROOM">Cameră privată</option>
            </select>
          </label>
          <label>
            Sală
            <select name="room_id" defaultValue="">
              <option value="">Fără sală</option>
              {(rooms.data?.rooms ?? []).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          <label>
            Zonă
            <select name="zone_id" defaultValue="">
              <option value="">Fără zonă</option>
              {(zones.data?.zones ?? []).map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </label>
          <label className="company-checkbox"><input type="checkbox" name="bookable" defaultChecked /> Rezervabilă</label>
          <div className="company-form-actions"><button className="btn-primary" type="submit">Adaugă resursă</button></div>
        </form>
      </section>
    </>
  );
}

function HoursPanel({
  venueId,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const schedule = useEndpoint<{ schedules: Schedule[] }>(`${base}/schedule`, onAuthFailure, version);
  const [rows, setRows] = useState<Schedule[]>(DAYS.map(day => ({ day_of_week: day.value, open_time: '10:00', close_time: '22:00', is_closed: false })));

  useEffect(() => {
    if (!schedule.data) return;
    setRows(DAYS.map(day => {
      const existing = schedule.data?.schedules.find(item => item.day_of_week === day.value);
      return existing
        ? { day_of_week: existing.day_of_week, open_time: existing.open_time.slice(0, 5), close_time: existing.close_time.slice(0, 5), is_closed: existing.is_closed }
        : { day_of_week: day.value, open_time: '10:00', close_time: '22:00', is_closed: true };
    }));
  }, [schedule.data]);

  function update(day: number, patch: Partial<Schedule>) {
    setRows(previous => previous.map(row => row.day_of_week === day ? { ...row, ...patch } : row));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await secureRequest(`${base}/schedule`, 'PUT', {
        schedules: rows.map(row => ({
          dayOfWeek: row.day_of_week,
          openTime: row.open_time,
          closeTime: row.close_time,
          isClosed: row.is_closed,
        })),
      });
      report('Programul săptămânal a fost salvat.');
      await schedule.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  return (
    <section className="panel company-panel">
      <div className="company-section-head"><h2>Program săptămânal</h2><span>{rows.filter(row => !row.is_closed).length} zile deschise</span></div>
      {schedule.error && <div className="notice" role="alert">{schedule.error}</div>}
      <form onSubmit={save}>
        {DAYS.map(day => {
          const row = rows.find(item => item.day_of_week === day.value);
          if (!row) return null;
          return (
            <div className="company-schedule-row" key={day.value}>
              <strong>{day.label}</strong>
              <input type="time" value={row.open_time} disabled={row.is_closed} onChange={event => update(day.value, { open_time: event.target.value })} />
              <input type="time" value={row.close_time} disabled={row.is_closed} onChange={event => update(day.value, { close_time: event.target.value })} />
              <label><input type="checkbox" checked={row.is_closed} onChange={event => update(day.value, { is_closed: event.target.checked })} /> Închis</label>
            </div>
          );
        })}
        <div className="company-inline-form">
          <button className="btn-primary" type="submit">Salvează programul</button>
        </div>
      </form>
    </section>
  );
}

function PricingPanel({
  venueId,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const pricing = useEndpoint<{ rules: PriceRule[] }>(`${base}/pricing`, onAuthFailure, version);
  const policies = useEndpoint<{ policies: Policy[] }>(`${base}/policies`, onAuthFailure, version);
  const resources = useEndpoint<{ resources: Resource[] }>(`${base}/resources`, onAuthFailure, version);
  const zones = useEndpoint<{ zones: Zone[] }>(`${base}/zones`, onAuthFailure, version);

  async function saveRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const targetType = field(form, 'target_type') as 'VENUE_DEFAULT' | 'ZONE' | 'RESOURCE';
    const targetId = field(form, 'target_id');
    const rate = Number(field(form, 'rate'));
    if (!Number.isFinite(rate) || rate < 0) {
      report('Introdu un tarif valid în RON.', 'error');
      return;
    }
    try {
      await secureRequest(`${base}/pricing`, 'PUT', {
        targetType,
        targetId: targetType === 'VENUE_DEFAULT' ? null : targetId,
        hourlyRateMinor: Math.round(rate * 100),
      });
      form.reset();
      report('Tariful a fost salvat.');
      await pricing.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  async function savePolicy(event: React.FormEvent<HTMLFormElement>, policy: Policy) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await secureRequest(`${base}/policies/${policy.id}`, 'PATCH', {
        name: field(form, 'name'),
        settings: {
          prepaid_mode: field(form, 'prepaid_mode') as PolicySettings['prepaid_mode'],
          deposit_percentage: Number(field(form, 'deposit_percentage')),
          min_duration_minutes: Number(field(form, 'min_duration_minutes')),
          max_duration_minutes: Number(field(form, 'max_duration_minutes')),
          slot_granularity_minutes: Number(field(form, 'slot_granularity_minutes')),
          buffer_after_minutes: Number(field(form, 'buffer_after_minutes')),
          free_cancellation_hours: Number(field(form, 'free_cancellation_hours')),
          late_cancellation_penalty_percent: Number(field(form, 'late_cancellation_penalty_percent')),
          no_show_grace_minutes: Number(field(form, 'no_show_grace_minutes')),
        },
      });
      report('Politica a fost actualizată.');
      await policies.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  const targetName = (rule: PriceRule) => {
    if (rule.target_type === 'VENUE_DEFAULT') return 'Implicit locație';
    if (rule.target_type === 'ZONE') return zones.data?.zones.find(zone => zone.id === rule.target_id)?.name ?? 'Zonă';
    return resources.data?.resources.find(resource => resource.id === rule.target_id)?.name ?? 'Resursă';
  };

  return (
    <>
      {(pricing.error || policies.error) && <div className="notice" role="alert">{pricing.error || policies.error}</div>}

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Tarife orare</h2><span>{pricing.data?.rules.length ?? 0} reguli</span></div>
        <div className="company-list">
          {(pricing.data?.rules ?? []).map(rule => (
            <div className="company-list-row" key={rule.id}>
              <div><strong>{targetName(rule)}</strong><small>{rule.target_type}</small></div>
              <strong>{money(Number(rule.hourly_rate_minor), rule.currency)} / oră</strong>
            </div>
          ))}
          {!pricing.data?.rules.length && <p className="company-muted">Niciun tarif. Fără tarif, locația nu poate fi publicată.</p>}
        </div>

        <form className="company-form-grid" onSubmit={saveRate}>
          <label>
            Se aplică la
            <select name="target_type" defaultValue="VENUE_DEFAULT">
              <option value="VENUE_DEFAULT">Toată locația</option>
              <option value="ZONE">O zonă</option>
              <option value="RESOURCE">O resursă</option>
            </select>
          </label>
          <label>
            Zonă sau resursă
            <select name="target_id" defaultValue="">
              <option value="">—</option>
              {(zones.data?.zones ?? []).map(zone => <option key={zone.id} value={zone.id}>Zonă: {zone.name}</option>)}
              {(resources.data?.resources ?? []).map(resource => <option key={resource.id} value={resource.id}>Resursă: {resource.name}</option>)}
            </select>
          </label>
          <label>Tarif (RON/oră)<input name="rate" type="number" min="0" step="0.01" required placeholder="25.00" /></label>
          <div className="company-form-actions"><button className="btn-primary" type="submit">Salvează tariful</button></div>
        </form>
      </section>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Politici de rezervare</h2><span>{policies.data?.policies.length ?? 0} profiluri</span></div>
        {(policies.data?.policies ?? []).map(policy => (
          <form key={policy.id} onSubmit={event => void savePolicy(event, policy)}>
            <div className="company-section-head">
              <h3>{policy.name} {policy.is_default && <Tag status="ACTIVE" />}</h3>
              <span>versiunea {policy.version}</span>
            </div>
            <div className="company-form-grid">
              <label>Nume<input name="name" defaultValue={policy.name} required minLength={2} maxLength={120} /></label>
              <label>
                Mod plată
                <select name="prepaid_mode" defaultValue={policy.settings.prepaid_mode}>
                  <option value="DEPOSIT">Avans</option>
                  <option value="FULL">Plată integrală</option>
                </select>
              </label>
              <label>Avans (%)<input name="deposit_percentage" type="number" min="10" max="100" defaultValue={policy.settings.deposit_percentage} /></label>
              <label>Durată minimă (min)<input name="min_duration_minutes" type="number" min="15" defaultValue={policy.settings.min_duration_minutes} /></label>
              <label>Durată maximă (min)<input name="max_duration_minutes" type="number" min="15" defaultValue={policy.settings.max_duration_minutes} /></label>
              <label>Granularitate (min)<input name="slot_granularity_minutes" type="number" min="5" defaultValue={policy.settings.slot_granularity_minutes} /></label>
              <label>Pauză după (min)<input name="buffer_after_minutes" type="number" min="0" defaultValue={policy.settings.buffer_after_minutes} /></label>
              <label>Anulare gratuită (h)<input name="free_cancellation_hours" type="number" min="0" defaultValue={policy.settings.free_cancellation_hours} /></label>
              <label>Penalizare anulare (%)<input name="late_cancellation_penalty_percent" type="number" min="0" max="100" defaultValue={policy.settings.late_cancellation_penalty_percent} /></label>
              <label>Gratie neprezentare (min)<input name="no_show_grace_minutes" type="number" min="0" defaultValue={policy.settings.no_show_grace_minutes} /></label>
            </div>
            <div className="company-inline-form">
              <button className="btn-primary" type="submit">Salvează politica</button>
            </div>
          </form>
        ))}
        {!policies.data?.policies.length && (
          <p className="company-muted">Nicio politică. Fără una implicită, locația nu poate fi publicată.</p>
        )}
      </section>
    </>
  );
}

function MenuPanel({
  venueId,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const categories = useEndpoint<Category[]>(`${base}/menu/categories`, onAuthFailure, version);
  const products = useEndpoint<Product[]>(`${base}/menu/products`, onAuthFailure, version);

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await secureRequest(`${base}/menu/categories`, 'POST', { name: field(form, 'name'), sort_order: Number(field(form, 'sort_order')) || 0 });
      form.reset();
      report('Categoria a fost creată.');
      await categories.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const price = Number(field(form, 'price'));
    if (!Number.isFinite(price) || price < 0) {
      report('Introdu un preț valid în RON.', 'error');
      return;
    }
    try {
      await secureRequest(`${base}/menu/products`, 'POST', {
        title: field(form, 'title'),
        price_minor: Math.round(price * 100),
        category_id: field(form, 'category_id') || undefined,
        initial_stock: Number(field(form, 'initial_stock')) || 0,
        inventory_tracking: checked(form, 'inventory_tracking'),
      });
      form.reset();
      report('Produsul a fost creat.');
      await products.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  return (
    <>
      {(categories.error || products.error) && <div className="notice" role="alert">{categories.error || products.error}</div>}

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Categorii</h2><span>{categories.data?.length ?? 0}</span></div>
        <div className="company-list">
          {(categories.data ?? []).map(category => (
            <div className="company-list-row" key={category.id}>
              <div><strong>{category.name}</strong><small>Ordine {category.sort_order} · {category.active ? 'activă' : 'inactivă'}</small></div>
            </div>
          ))}
          {!categories.data?.length && <p className="company-muted">Nu există categorii.</p>}
        </div>
        <form className="company-inline-form" onSubmit={createCategory}>
          <label>Nume categorie<input name="name" required minLength={2} maxLength={120} placeholder="Ex: Băuturi răcoritoare" /></label>
          <label>Ordine<input name="sort_order" type="number" min="0" defaultValue={0} /></label>
          <button className="btn-primary" type="submit">Adaugă categoria</button>
        </form>
      </section>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Produse</h2><span>{products.data?.length ?? 0}</span></div>
        <div className="company-table">
          <table>
            <thead><tr><th>Produs</th><th>Categorie</th><th>Preț</th><th>Stoc</th><th>Urmărire stoc</th><th>Stare</th></tr></thead>
            <tbody>
              {(products.data ?? []).map(product => (
                <tr key={product.id}>
                  <td>{product.title}</td>
                  <td>{categories.data?.find(category => category.id === product.category_id)?.name ?? '—'}</td>
                  <td>{money(product.price_minor, product.currency)}</td>
                  <td>{product.inventory_tracking ? product.stock_available : '—'}</td>
                  <td>{product.inventory_tracking ? 'Da' : 'Nu'}</td>
                  <td>{product.active ? 'Activ' : 'Inactiv'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="company-form-grid" onSubmit={createProduct}>
          <label>Nume produs<input name="title" required minLength={2} maxLength={120} placeholder="Ex: Cola 0.33" /></label>
          <label>Preț (RON)<input name="price" type="number" min="0" step="0.01" required placeholder="7.00" /></label>
          <label>
            Categorie
            <select name="category_id" defaultValue="">
              <option value="">Fără categorie</option>
              {(categories.data ?? []).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>Stoc inițial<input name="initial_stock" type="number" min="0" defaultValue={0} /></label>
          <label className="company-checkbox"><input type="checkbox" name="inventory_tracking" /> Urmărește stocul</label>
          <div className="company-form-actions"><button className="btn-primary" type="submit">Adaugă produs</button></div>
        </form>
      </section>
    </>
  );
}

function StaffPanel({
  venueId,
  role,
  zone,
  version,
  onAuthFailure,
  report,
}: {
  venueId: string;
  role: string;
  zone: string;
  version: number;
  onAuthFailure: () => void;
  report: (message: string, tone?: 'error' | 'notice') => void;
}) {
  const base = `/dashboard/venues/${venueId}`;
  const memberships = useEndpoint<{ memberships: Membership[] }>(`${base}/memberships`, onAuthFailure, version);
  const invitations = useEndpoint<{ invitations: Invitation[] }>(`${base}/staff/invitations`, onAuthFailure, version);
  const [token, setToken] = useState('');

  const invitablRoles = role === 'OWNER'
    ? ['VENUE_MANAGER', 'RECEPTION', 'BAR_STAFF']
    : ['RECEPTION', 'BAR_STAFF'];

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await secureRequest<{ invitation: { token: string } }>(`${base}/staff/invitations`, 'POST', {
        email: field(form, 'email'),
        role: field(form, 'role'),
      });
      setToken(result.invitation.token);
      form.reset();
      report('Invitația a fost creată. Tokenul este afișat o singură dată.');
      await invitations.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  async function revoke(id: string) {
    try {
      await secureRequest(`${base}/staff/invitations/${id}/revoke`, 'POST');
      report('Invitația a fost revocată.');
      await invitations.load();
    } catch (caught) {
      report(errorMessage(caught), 'error');
    }
  }

  return (
    <>
      {(memberships.error || invitations.error) && <div className="notice" role="alert">{memberships.error || invitations.error}</div>}

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Echipă</h2><span>{memberships.data?.memberships.length ?? 0} membri</span></div>
        <div className="company-list">
          {(memberships.data?.memberships ?? []).map(member => (
            <div className="company-list-row" key={member.id}>
              <div><strong>{member.user_email ?? member.user_id}</strong><small>Membru din {member.id.slice(0, 8)}</small></div>
              <div>
                <span className="company-role-tag">{roleLabel[member.role] ?? member.role}</span>
                {!member.active && <span className="company-role-tag">Inactiv</span>}
              </div>
            </div>
          ))}
          {!memberships.data?.memberships.length && <p className="company-muted">Nu există membri activi.</p>}
        </div>
      </section>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Invitații</h2><span>{invitations.data?.invitations.length ?? 0}</span></div>
        <div className="company-list">
          {(invitations.data?.invitations ?? []).map(invitation => (
            <div className="company-list-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <small>{roleLabel[invitation.role] ?? invitation.role} · expiră {datetime(invitation.expires_at, zone)}</small>
              </div>
              <div>
                <Tag status={invitation.status} />
                {['PENDING', 'PENDING_ACCEPTANCE'].includes(invitation.status) && (
                  <button className="btn-secondary" onClick={() => void revoke(invitation.id)}>Revocă</button>
                )}
              </div>
            </div>
          ))}
          {!invitations.data?.invitations.length && <p className="company-muted">Nu există invitații trimise.</p>}
        </div>

        <form className="company-form-grid" onSubmit={invite}>
          <label>Email<input name="email" type="email" required maxLength={254} placeholder="nume@cafenea.ro" /></label>
          <label>
            Rol
            <select name="role" defaultValue={invitablRoles[0]}>
              {invitablRoles.map(item => <option key={item} value={item}>{roleLabel[item] ?? item}</option>)}
            </select>
          </label>
          <div className="company-form-actions"><button className="btn-primary" type="submit">Creează invitația</button></div>
        </form>

        {token && (
          <div className="access-notice" role="status">
            <strong>Token de invitație (o singură afișare)</strong>
            <code className="company-token">{token}</code>
            <p className="company-muted">Trimite-l pe un canal sigur.</p>
          </div>
        )}
      </section>

      <section className="panel company-panel">
        <div className="company-section-head"><h2>Roluri</h2><Users size={18} /></div>
        <div className="company-gate-list">
          <div><span>Proprietar</span><b>Configurare, publicare, încasări, echipă</b></div>
          <div><span>Manager</span><b>Operare, configurare, încasări, invitații</b></div>
          <div><span>Recepție</span><b>Rezervări, check-in, sală, comenzi</b></div>
          <div><span>Bar</span><b>Fără acces la panourile operaționale</b></div>
        </div>
      </section>
    </>
  );
}
