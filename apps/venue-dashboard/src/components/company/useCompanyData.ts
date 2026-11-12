import { useEffect, useRef, useState } from 'react';
import { LoadEpoch } from '../../router/access-router';
import { ApiError } from '../../api/secure-client';

export function useCompanyData<T>(key: string, load: (signal: AbortSignal) => Promise<T>, onAuthFailure: () => void) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
  const [version, setVersion] = useState(0);
  const epoch = useRef(new LoadEpoch());
  useEffect(() => {
    const operation = epoch.current; const generation = operation.next();
    const controller = new AbortController(); setState({ key });
    void load(controller.signal).then(data => {
      if (operation.current(generation)) setState({ key, data });
    }).catch(error => {
      if (!operation.current(generation) || controller.signal.aborted) return;
      setState({ key, error: error instanceof Error ? error.message : 'Datele nu pot fi încărcate.' });
      if (error instanceof ApiError && ['AUTH_REQUIRED', 'AUTH_MFA_REQUIRED'].includes(error.code)) onAuthFailure();
    });
    return () => { operation.invalidate(); controller.abort(); };
  }, [key, version]);
  // Hide old data immediately, before the effect runs for a new context key.
  return { ...(state.key === key ? state : { key }), retry: () => setVersion(value => value + 1) };
}
