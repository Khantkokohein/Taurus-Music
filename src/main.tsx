import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppStudio from './AppStudio.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStudio />
  </StrictMode>,
);
