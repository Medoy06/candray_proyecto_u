// =============================================================================
// vite.config.ts
// Qué hace:     configura el servidor de desarrollo (Vite) y las pruebas.
// Cómo se usa:  npm run dev  -> http://localhost:5173
//
// El proxy reenvía todo lo que empiece con /api al backend (puerto 3000). Así
// el navegador cree que frontend y API son el mismo sitio: no hay problemas de
// CORS y el código usa rutas cortas como "/api/auth/login".
// =============================================================================
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  test: {
    include: ['pruebas/**/*.prueba.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./pruebas/ayudas/preparar.ts'],
    css: false,
  },
});
