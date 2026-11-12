import { COMPANY_TABS, SETUP_TABS, type AccessContext, type CompanyTab, type SetupTab } from '../types/access/company';

export function companyRoute(path: string): { tab: CompanyTab; setup: SetupTab; path: string } {
  const parts = path.split('/').filter(Boolean);
  const tab = COMPANY_TABS.find(item => item.id === parts[1])?.id ?? 'today';
  const setup = SETUP_TABS.find(item => item.id === parts[2])?.id ?? 'profile';
  return { tab, setup, path: tab === 'setup' ? '/dashboard/setup/' + setup : '/dashboard/' + tab };
}
export function landingPath(context: AccessContext, requested: string): string {
  if (context.platform_admin) return '/admin';
  if (context.venues.length === 0) return '/dashboard';
  return companyRoute(requested.startsWith('/dashboard') ? requested : '/dashboard').path;
}
/** Selection is always constrained to the server context; query strings confer no role. */
export function activeCompanyVenue(context: AccessContext, selected: string) {
  if (context.platform_admin) return undefined;
  return context.venues.find(venue => venue.id === selected) ?? context.venues[0];
}

/** Used by every pane load to invalidate delayed results on retry/route/venue change. */
export class LoadEpoch {
  private value = 0;
  next() { return ++this.value; }
  current(value: number) { return value === this.value; }
  invalidate() { ++this.value; }
}
