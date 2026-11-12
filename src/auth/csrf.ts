import { AuthHttpError } from './auth-error';

export function trustedOrigins(): string[] {
  return (process.env.DASHBOARD_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean);
}

/** Custom header cannot be submitted by a cross-origin HTML form. CORS is closed. */
export function assertCookieMutation(req: { method?: string; headers: Record<string,string|string[]|undefined> }): void {
  if (['GET','HEAD','OPTIONS'].includes(req.method ?? 'GET')) return;
  const origin = req.headers.origin;
  if (req.headers['x-gamerbooker-csrf'] !== '1' || (origin && (typeof origin !== 'string' || !trustedOrigins().includes(origin)))) {
    throw new AuthHttpError(403,'AUTH_CSRF_REQUIRED','A trusted dashboard request is required.');
  }
}
