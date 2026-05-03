import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppLite from './AppLite.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLite />
  </StrictMode>,
);
