// =============================================================================
// SesionProvider.tsx
// Qué hace:     mantiene la sesión de la aplicación: al abrir la página
//               recupera la sesión guardada, y ofrece iniciar sesión, cerrar
//               sesión y cambiar de sucursal. Al cambiar de sucursal aplica su
//               color a toda la interfaz.
// Depende de:   servicios/autenticacion.ts, almacenSesion.ts, clienteApi.ts y
//               tema/aplicarTema.ts.
// Lo usa:       main.tsx (envuelve toda la aplicación).
//
// Reglas:
//   - Los datos de la sesión (usuario, capacidades, sucursales) SIEMPRE vienen
//     del servidor (/auth/me); lo único que se guarda en el navegador es el
//     token y la última sucursal elegida. Así un usuario desactivado o con otro
//     rol deja de tener su vista vieja en cuanto recarga.
//   - Si el servidor responde 401 en cualquier momento, la sesión se cierra sola.
// =============================================================================
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Capability } from '../configuracion/capacidades';
import { getSession, loginRequest } from '../servicios/autenticacion';
import {
  clearSession,
  clearStoredBranchId,
  getStoredBranchId,
  getStoredToken,
  storeBranchId,
  storeToken,
} from '../servicios/almacenSesion';
import { onUnauthorized } from '../servicios/clienteApi';
import type { SessionData } from '../servicios/tiposSesion';
import { applyBranchTheme } from '../tema/aplicarTema';
import { SessionContext, type SessionContextValue, type SessionStatus } from './SesionContext';

export function SesionProvider({ children }: { children: ReactNode }) {
  // Si hay un token guardado hay que comprobarlo con el servidor antes de decidir.
  const [status, setStatus] = useState<SessionStatus>(() => (getStoredToken() ? 'loading' : 'anonymous'));
  const [session, setSession] = useState<SessionData | null>(null);

  // Deja lista una sesión recibida del servidor. La sucursal activa es la última
  // que la persona eligió en este navegador, si todavía le corresponde; si no,
  // la predeterminada que indica el servidor.
  const startSession = useCallback((data: SessionData) => {
    const stored = getStoredBranchId();
    const activeBranchId =
      stored !== null && data.branches.some((branch) => branch.id === stored)
        ? stored
        : data.activeBranchId;
    storeBranchId(activeBranchId);
    setSession({ ...data, activeBranchId });
    setStatus('authenticated');
    applyBranchTheme(data.branches.find((branch) => branch.id === activeBranchId)?.theme_color ?? null);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setStatus('anonymous');
    applyBranchTheme(null);
  }, []);

  // Al abrir la página: si hay token guardado, se recupera la sesión.
  useEffect(() => {
    onUnauthorized(logout); // un 401 en cualquier petición cierra la sesión
    let cancelled = false;

    async function restore() {
      if (getStoredToken() === null) return;
      try {
        let data: SessionData;
        try {
          data = await getSession();
        } catch (error) {
          // 403 = la sucursal guardada ya no le corresponde (se la quitaron):
          // se olvida y se reintenta con la predeterminada.
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            clearStoredBranchId();
            data = await getSession();
          } else {
            throw error;
          }
        }
        if (!cancelled) startSession(data);
      } catch {
        // 401: el interceptor ya cerró la sesión. Otro error (servidor caído):
        // se muestra el login; el token se conserva por si vuelve el servidor.
        if (!cancelled) setStatus('anonymous');
      }
    }
    void restore();

    return () => {
      cancelled = true;
      onUnauthorized(null);
    };
  }, [logout, startSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await loginRequest(email, password);
      storeToken(data.token);
      startSession(data);
    },
    [startSession],
  );

  const selectBranch = useCallback(
    (branchId: string) => {
      const branch = session?.branches.find((candidate) => candidate.id === branchId);
      if (!session || !branch) return; // una sucursal que no le corresponde se ignora
      storeBranchId(branchId);
      applyBranchTheme(branch.theme_color);
      setSession({ ...session, activeBranchId: branchId });
    },
    [session],
  );

  const value = useMemo<SessionContextValue>(() => {
    const capabilities = new Set<Capability>(session?.capabilities ?? []);
    return {
      status,
      user: session?.user ?? null,
      branches: session?.branches ?? [],
      activeBranch: session?.branches.find((branch) => branch.id === session.activeBranchId) ?? null,
      login,
      logout,
      selectBranch,
      can: (capability) => capabilities.has(capability),
    };
  }, [status, session, login, logout, selectBranch]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
