export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export async function secureRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/v1' + path, { method, credentials: 'same-origin', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', 'X-GamerBooker-CSRF': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('API_UNAVAILABLE', 'Serviciul nu este disponibil. Verifică legătura cu API și reîncearcă.');
  }
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new ApiError(data?.error?.code ?? 'API_UNAVAILABLE', data?.error?.message ?? 'Serviciul nu este disponibil.');
  if (response.status !== 204 && (data === undefined || data === null)) throw new ApiError('INVALID_API_RESPONSE', 'Răspunsul serverului nu poate fi citit.');
  return data as T;
}
export function expectArray<T>(data: Record<string, unknown>, key: string): T[] {
  if (!data || !Array.isArray(data[key])) throw new ApiError('INVALID_API_RESPONSE', 'Datele primite sunt incomplete.');
  return data[key] as T[];
}
