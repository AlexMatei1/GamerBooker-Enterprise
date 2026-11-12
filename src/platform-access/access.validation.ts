import { AuthHttpError } from '../auth/auth-error';

export function invalid(message: string): never {
  throw new AuthHttpError(400,'VALIDATION_FAILED',message);
}
export function object(value: unknown, keys: string[]): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('JSON object required.');
  const input=value as Record<string,unknown>;
  if (Object.keys(input).some(key=>!keys.includes(key))) invalid('Unexpected field.');
  return input;
}
export function text(value: unknown, label: string, max=120): string {
  if (typeof value!=='string' || value.trim().length<2 || value.trim().length>max || [...value].some(char=>char.charCodeAt(0)<32)) invalid(label+' is invalid.');
  return value.trim();
}
export function timezone(value: unknown): string {
  const zone=text(value,'timezone',80);
  try { new Intl.DateTimeFormat('en',{timeZone:zone}).format(); } catch { invalid('Invalid timezone.'); }
  return zone;
}
export function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AuthHttpError(404,'RESOURCE_NOT_FOUND','Resource not found.');
  return value;
}
export function applicationInput(value: unknown) {
  const input=object(value,['legal_name','venue_name','timezone','city']);
  return { legal_name:text(input.legal_name,'legal_name',160),venue_name:text(input.venue_name,'venue_name'),timezone:timezone(input.timezone),city:text(input.city,'city') };
}
