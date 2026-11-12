import React, { useEffect, useRef, useState } from 'react';

type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>;
type Profile = { id: string; name: string; timezone: string; publication_state: string };
type Gates = { can_publish: boolean; current_state: string; missing_requirements: string[] };
const states: Record<string, string> = { DRAFT: 'În configurare', PENDING_APPROVAL: 'În așteptarea aprobării', PUBLISHED: 'Publicată', ARCHIVED: 'Arhivată' };
const requirements: Record<string, string> = {
  'At least one bookable resource with AVAILABLE status is required': 'Este necesară o resursă rezervabilă cu starea disponibilă. Formularul de creare de mai jos nu configurează toate condițiile de rezervare.',
  'At least one active operating schedule is required': 'Este necesar un program de funcționare activ. Configurarea programului nu este încă disponibilă în acest ecran.',
  'A default booking policy profile is required': 'Este necesară o politică implicită de rezervare. Configurarea politicilor nu este încă disponibilă în acest ecran.',
  'At least one price rule is required': 'Este necesară o regulă de preț. Configurarea tarifelor nu este încă disponibilă în acest ecran.',
  'At least one active staff member is required': 'Este necesar un membru activ al echipei. Administrarea echipei nu este încă disponibilă în acest ecran.',
};

export function CompanyVenueSetup({ venueId, role, request, act, busy, onChanged }: {
  venueId: string; role: string; request: Request; act: (work: () => Promise<void>) => Promise<void>;
  busy: boolean; onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<{ profile: Profile; gates: Gates } | null>(null);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const base = '/dashboard/venues/' + encodeURIComponent(venueId);
  async function reload() {
    const current = ++sequence.current;
    setFailure('');
    try {
      const [profile, gates] = await Promise.all([request<{ venue: Profile }>(base), request<Gates>(base + '/publish-gates')]);
      if (current === sequence.current) setData({ profile: profile.venue, gates });
    } catch (error) {
      if (current === sequence.current) { setData(null); setFailure(error instanceof Error ? error.message : 'Configurarea nu poate fi încărcată.'); }
      throw error;
    }
  }
  useEffect(() => {
    setData(null); setFailure(''); setNotice('');
    void reload().catch(() => { /* reload preserves an actionable error for the current venue. */ });
    return () => { sequence.current++; };
  }, [venueId]);
  if (failure) return <section className="access-card" role="alert"><h2>Configurarea locației</h2><p>{failure}</p><button disabled={busy} onClick={() => void act(reload)}>Reîncearcă</button></section>;
  if (!data) return <section className="access-card" role="status">Se încarcă profilul și condițiile de publicare…</section>;
  const { profile, gates } = data;
  async function publish(action: 'publish' | 'unpublish') {
    setNotice('');
    try {
      await request(base + '/' + action, 'POST');
      await reload();
      await onChanged();
    } catch (error) {
      // A failed gate never changes local publication state. Re-read the server.
      try { await reload(); } catch { setData(null); setFailure('Starea nu poate fi confirmată. Reîncarcă înainte de a continua.'); }
      throw error;
    }
  }
  return <section className="access-card access-company"><div className="access-company-heading"><div><h2>Locația din catalog</h2></div><span className="access-tag">{states[gates.current_state] ?? gates.current_state}</span></div>
    <form key={profile.id + ':' + profile.name + ':' + profile.timezone} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget;
      const fields = new FormData(form); const timezone = String(fields.get('timezone') ?? '').trim();
      const timezoneInput = form.elements.namedItem('timezone') as HTMLInputElement;
      try { new Intl.DateTimeFormat('ro-RO', { timeZone: timezone }).format(); }
      catch { timezoneInput.setCustomValidity('Introdu un fus orar IANA valid, de exemplu Europe/Bucharest.'); timezoneInput.reportValidity(); return; }
      timezoneInput.setCustomValidity(''); setNotice('');
      void act(async () => {
        await request(base, 'PATCH', { name: String(fields.get('name') ?? '').trim(), timezone });
        await reload(); setNotice('Profilul a fost salvat pe server.'); await onChanged();
      });
    }}>
      <label>Numele locației<input name="name" defaultValue={profile.name} minLength={2} maxLength={120} required disabled={busy}/></label>
      <label>Fus orar IANA<input name="timezone" defaultValue={profile.timezone} maxLength={80} required disabled={busy} onChange={event => event.currentTarget.setCustomValidity('')}/><span className="access-muted">De exemplu Europe/Bucharest. Apare în catalog după publicare.</span></label>
      <button className="primary" disabled={busy}>Salvează profilul</button>
    </form>
    {notice && <p role="status" className="access-notice">{notice}</p>}
    <div className="access-publication"><h3>Publicare în aplicația pentru clienți</h3><p>{gates.current_state === 'PUBLISHED' ? 'Locația este publicată. Clienții o pot vedea la următoarea actualizare a catalogului.' : 'Locația nu este publicată în catalog.'}</p>
      {gates.can_publish ? <p>Serverul confirmă îndeplinirea condițiilor de publicare.</p> : <><p>Mai sunt necesare următoarele condiții, verificate de server:</p><ul>{gates.missing_requirements.map(requirement => <li key={requirement}>{requirements[requirement] ?? 'Cerință suplimentară raportată de server: ' + requirement}</li>)}</ul></>}
      <p className="access-muted">Acest ecran configurează numele și fusul orar. Condițiile rămân obligatorii chiar dacă nu pot fi configurate aici.</p>
      <div className="access-actions"><button disabled={busy} onClick={() => void act(reload)}>Reverifică pe server</button>{role === 'OWNER' ? gates.current_state === 'PUBLISHED' ? <button disabled={busy} onClick={() => void act(() => publish('unpublish'))}>Retrage din catalog</button> : <button className="primary" disabled={busy || !gates.can_publish} onClick={() => void act(() => publish('publish'))}>Publică locația</button> : <p className="access-muted">Doar proprietarul poate publica sau retrage locația.</p>}</div>
    </div>
  </section>;
}
