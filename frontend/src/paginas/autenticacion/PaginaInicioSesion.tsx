// =============================================================================
// PaginaInicioSesion.tsx
// Qué hace:     la pantalla de acceso: correo y contraseña. Muestra el mensaje
//               del servidor si falla (credenciales incorrectas, cuenta
//               bloqueada 15 minutos, servidor apagado...).
// Depende de:   ganchos/useSesion.ts, utilidades/errorApi.ts y los componentes
//               ui/CampoTexto y ui/AlertaError.
// Lo usa:       App.tsx cuando no hay sesión.
//
// Al iniciar sesión bien, el proveedor de sesión cambia de estado y App.tsx
// reemplaza esta pantalla por la aplicación; aquí no hay que navegar.
// =============================================================================
import { useState, type FormEvent } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { CampoTexto } from '../../componentes/ui/CampoTexto';
import { useSesion } from '../../ganchos/useSesion';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { CuentasDemostracion } from './CuentasDemostracion';

export function PaginaInicioSesion() {
  const { login } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); // evita que el navegador recargue la página
    if (email.trim() === '' || password === '') {
      setError('Por favor ingrese su correo y contraseña.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Éxito: App.tsx ya está mostrando la aplicación; no queda nada que hacer.
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'No se pudo iniciar sesión. Intente de nuevo.'));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-acento">Candray</h1>
          <p className="mt-1 text-sm text-slate-500">Clínicas y Ópticas</p>
          <p className="mt-4 text-sm text-slate-500">Inicie sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error !== '' && <AlertaError message={error} />}
          <CampoTexto
            label="Correo electrónico"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="usuario@candray.test"
          />
          <CampoTexto
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-acento py-2.5 text-sm font-medium text-white transition-colors hover:bg-acento-oscuro disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <CuentasDemostracion
          onPick={(pickedEmail, pickedPassword) => {
            setEmail(pickedEmail);
            setPassword(pickedPassword);
            setError('');
          }}
        />
      </div>
    </div>
  );
}
