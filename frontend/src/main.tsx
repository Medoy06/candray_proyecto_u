// =============================================================================
// main.tsx
// Qué hace:     punto de entrada: monta la aplicación en la página y la envuelve
//               con el router (direcciones) y el proveedor de sesión.
// Depende de:   App.tsx, contexto/SesionProvider.tsx e index.css.
//
// Las tipografías se importan aquí: vienen de paquetes de npm, así que la
// aplicación no depende de internet para verse bien (importa en una demo).
// =============================================================================
import '@fontsource-variable/inter'; // texto de tablas y formularios
import '@fontsource/barlow/500.css'; // títulos
import '@fontsource/barlow/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SesionProvider } from './contexto/SesionProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <App />
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);
