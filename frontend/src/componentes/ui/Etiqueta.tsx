// =============================================================================
// Etiqueta.tsx
// Qué hace:     una etiqueta pequeña de estado ("Activo", "Bloqueado"...).
// Lo usan:      las tablas y fichas.
//
// El estado se entiende por el TEXTO; el color solo lo refuerza. Los tonos
// vienen de index.css. El rojo no se usa aquí: es el color de la marca y de
// los errores, y un estado normal no debe confundirse con un error.
// =============================================================================
import type { ReactNode } from 'react';

type Tone = 'exito' | 'aviso' | 'info' | 'neutro';

const TONES: Record<Tone, string> = {
  exito: 'bg-exito-fondo text-exito-texto',
  aviso: 'bg-aviso-fondo text-aviso-texto',
  info: 'bg-info-fondo text-info-texto',
  neutro: 'bg-neutro-fondo text-neutro-texto',
};

export function Etiqueta({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
  );
}
