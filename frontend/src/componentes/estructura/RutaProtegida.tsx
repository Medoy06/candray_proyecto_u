// =============================================================================
// RutaProtegida.tsx
// Qué hace:     envuelve una página y solo la muestra si la persona tiene la
//               capacidad que esa pantalla pide. Si no, muestra "Sin acceso".
// Depende de:   ganchos/useSesion.ts y paginas/comunes/PaginaSinAcceso.tsx.
// Lo usa:       navegacion/RutasAplicacion.tsx (una por cada pantalla del mapa).
//
// Sirve para que alguien que escriba a mano la dirección de una pantalla ajena
// (por ejemplo /usuarios siendo recepcionista) vea un aviso claro en lugar de
// una pantalla rota. El backend igual rechazaría cada petición (403).
// =============================================================================
import type { ReactNode } from 'react';
import type { Capability } from '../../configuracion/capacidades';
import { useSesion } from '../../ganchos/useSesion';
import { PaginaSinAcceso } from '../../paginas/comunes/PaginaSinAcceso';

interface RutaProtegidaProps {
  capability: Capability | null; // null = cualquier persona con sesión
  children: ReactNode;
}

export function RutaProtegida({ capability, children }: RutaProtegidaProps) {
  const { can } = useSesion();
  if (capability !== null && !can(capability)) return <PaginaSinAcceso />;
  return <>{children}</>;
}
