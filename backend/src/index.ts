// =============================================================================
// index.ts
// Qué hace:     punto de entrada del servidor: crea la aplicación, la pone a
//               escuchar en el puerto configurado y cierra todo ordenadamente
//               al apagarse.
// Depende de:   app.ts, configuracion/entorno.ts y baseDatos.ts.
// Se ejecuta:   con  npm run dev  (desarrollo) o  npm start  (producción).
// =============================================================================
import { createApp } from './app';
import { closeDatabase } from './configuracion/baseDatos';
import { env } from './configuracion/entorno';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API de Candray escuchando en el puerto ${env.PORT} (perfil de permisos: ${env.PERFIL_PERMISOS})`);
});

// Al recibir Ctrl+C o una orden de apagado: deja de aceptar peticiones, cierra
// las conexiones a la base de datos y termina.
function shutdown(signal: string): void {
  console.log(`\nRecibido ${signal}: apagando el servidor...`);
  server.close(() => {
    void closeDatabase().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
