// =============================================================================
// app.ts
// Qué hace:     construye la aplicación Express (seguridad, límites, rutas y
//               manejo de errores) SIN ponerla a escuchar en un puerto.
// Requerimiento: servidor de la API; límites de peticiones y de tamaño (sección 8).
// Depende de:   las rutas, los intermediarios y la configuración.
// Lo usan:      index.ts (que sí la pone a escuchar) y las pruebas (supertest
//               la usa directamente, sin abrir ningún puerto).
//
// Por qué está separada de index.ts: para poder probar la API entera sin
// levantar un servidor, y para poder crear varias aplicaciones con ajustes
// distintos (por ejemplo, un límite de login muy bajo para probar el 429).
// =============================================================================
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './configuracion/entorno';
import { JSON_BODY_LIMIT } from './configuracion/negocio';
import { errorHandler } from './intermediarios/errores';
import auditRoutes from './rutas/auditoria';
import authRoutes from './rutas/autenticacion';
import branchRoutes from './rutas/sucursales';
import userRoutes from './rutas/usuarios';
import { createLoginRateLimitHandler } from './utilidades/limitadorInicioSesion';

// Dirección desde la que el navegador carga el frontend (Vite en desarrollo).
// Solo esa dirección puede llamar a la API desde un navegador.
const FRONTEND_ORIGIN = 'http://localhost:5173';

// Ventana del limitador de inicio de sesión por IP.
const LOGIN_WINDOW_MINUTES = 15;

export interface AppOptions {
  // Intentos FALLIDOS de inicio de sesión permitidos por IP en la ventana.
  // Si no se indica: AUTH_RATE_LIMIT_MAX del entorno, o 5 en producción y 100
  // en desarrollo (para no bloquearse mientras se prueba).
  authRateLimitMax?: number;
}

// Crea la aplicación.
// Recibe: opciones (opcional). Devuelve: la aplicación Express lista para usar.
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const isProduction = env.NODE_ENV === 'production';

  // Cabeceras de seguridad estándar (X-Content-Type-Options, X-Frame-Options...).
  app.use(helmet());

  // Solo el frontend de Candray puede llamar a la API desde un navegador.
  app.use(cors({ origin: FRONTEND_ORIGIN }));

  // Limita el tamaño del cuerpo: ver docs/decisiones/001-auditoria-dependencias.md.
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Limitador general por IP: una red de seguridad amplia para toda la API.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: isProduction ? 1000 : 100000,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Limitador del inicio de sesión por IP. Cuenta solo intentos FALLIDOS
  // (skipSuccessfulRequests): si contara todos, cinco empleados que entran al
  // empezar el turno desde la misma IP bloquearían al sexto sin que hubiera
  // ningún atacante. Es la primera barrera; la principal es el bloqueo por cuenta.
  const loginMax = options.authRateLimitMax ?? env.AUTH_RATE_LIMIT_MAX ?? (isProduction ? 5 : 100);
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: LOGIN_WINDOW_MINUTES * 60 * 1000,
      limit: loginMax,
      skipSuccessfulRequests: true,
      message: {
        success: false,
        message: `Demasiados intentos de inicio de sesión. Intente de nuevo en ${LOGIN_WINDOW_MINUTES} minutos.`,
      },
      handler: createLoginRateLimitHandler(LOGIN_WINDOW_MINUTES),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Rutas de la API. Cada módulo nuevo se agrega aquí.
  app.use('/api/auth', authRoutes);
  app.use('/api/usuarios', userRoutes);
  app.use('/api/sucursales', branchRoutes);
  app.use('/api/auditoria', auditRoutes);

  // Comprobación de que el servidor está vivo.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', message: 'API de Candray en funcionamiento' });
  });

  // Cualquier ruta que no exista.
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
  });

  // El manejador de errores va SIEMPRE al final.
  app.use(errorHandler);

  return app;
}
