import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import AppStudio from './AppStudio.tsx';
import './index.css';
import './layout-fix.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider
      manifestUrl="https://taurus-music.vercel.app/tonconnect-manifest.json"
      analytics={{ mode: 'off' }}
      uiPreferences={{ theme: 'DARK' }}
    >
      <AppStudio />
    </TonConnectUIProvider>
  </StrictMode>,
);
