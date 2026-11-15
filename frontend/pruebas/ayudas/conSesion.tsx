// =============================================================================
// conSesion.tsx
// Qué hace:     dibuja un componente DENTRO de una sesión ya iniciada (sin pasar
//               por el login) y dentro de un router en memoria. Sirve para
//               probar el menú, el encabezado y las páginas con distintos roles
//               y capacidades.
// Lo usan:      las pruebas de componentes/estructura, paginas y navegacion.
// =============================================================================
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { Capability } from '../../src/configuracion/capacidades';
import type { Role } from '../../src/configuracion/roles';
import { SessionContext, type SessionContextValue } from '../../src/contexto/SesionContext';
import type { Branch } from '../../src/servicios/tiposSesion';
import { MemoryRouter } from 'react-router-dom';
import { CENTRAL, ESCALON } from './datosSesion';

interface Opciones {
  role?: Role;
  capabilities?: Capability[];
  branches?: Branch[];
  activeBranch?: Branch;
  route?: string; // dirección en la que arranca el router
}

export function renderConSesion(ui: ReactElement, options: Opciones = {}) {
  const {
    role = 'doctor',
    capabilities = [],
    branches = [CENTRAL, ESCALON],
    activeBranch = branches[0],
    route = '/',
  } = options;
  const granted = new Set(capabilities);
  const logout = vi.fn();
  const selectBranch = vi.fn();

  const value: SessionContextValue = {
    status: 'authenticated',
    user: { id: 'u1', full_name: 'Alejandro Mejía', email: 'dr.mejia@candray.test', role },
    branches,
    activeBranch,
    login: vi.fn(),
    logout,
    selectBranch,
    can: (capability) => granted.has(capability),
  };

  const result = render(
    <SessionContext.Provider value={value}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </SessionContext.Provider>,
  );
  return { ...result, logout, selectBranch };
}
