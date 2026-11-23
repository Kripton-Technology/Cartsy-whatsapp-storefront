import './polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import { authClient } from './lib/auth-client';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration note:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NeonAuthUIProvider 
      authClient={authClient}
      credentials={false}
      signUp={false}
      social={{
        providers: ['google']
      }}
      redirectTo={window.location.origin + "/auth/success"}
    >
      <App />
    </NeonAuthUIProvider>
  </StrictMode>
);
