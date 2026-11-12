import React from 'react';
import ReactDOM from 'react-dom/client';
import SecureApp from './SecureApp';
import './styles/theme.css';

const isPassPreview = window.location.origin === 'http://127.0.0.1:8788' && /^[A-Za-z0-9_-]{32,}$/.test(document.querySelector<HTMLMetaElement>('meta[name="preview-staff-capability"]')?.content ?? '');
const PreviewApp = React.lazy(() => import('./App'));

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {isPassPreview ? <React.Suspense fallback={<p>Se ?ncarc? demonstra?ia local??</p>}><PreviewApp /></React.Suspense> : <SecureApp />}
    </React.StrictMode>
  );
}
