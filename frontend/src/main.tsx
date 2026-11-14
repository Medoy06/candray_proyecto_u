// =============================================================================
// main.tsx
// Qué hace:     punto de entrada: monta la aplicación en la página y la envuelve
//               con el proveedor de sesión.
// Depende de:   App.tsx, contexto/SesionProvider.tsx e index.css.
// =============================================================================
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SesionProvider } from './contexto/SesionProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SesionProvider>
      <App />
    </SesionProvider>
  </StrictMode>,
);
