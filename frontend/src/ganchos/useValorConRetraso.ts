// =============================================================================
// useValorConRetraso.ts
// Qué hace:     devuelve el mismo valor, pero SOLO después de que deje de
//               cambiar durante unos milisegundos.
// Lo usan:      los buscadores (paginas/usuarios/PaginaUsuarios.tsx): así no se
//               hace una consulta al servidor por cada letra que se escribe,
//               sino una cuando la persona hace una pausa.
// =============================================================================
import { useEffect, useState } from 'react';

export function useValorConRetraso<T>(value: T, delayMs: number): T {
  const [delayed, setDelayed] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDelayed(value), delayMs);
    return () => clearTimeout(timer); // si el valor cambia antes, se cancela y se espera de nuevo
  }, [value, delayMs]);

  return delayed;
}
