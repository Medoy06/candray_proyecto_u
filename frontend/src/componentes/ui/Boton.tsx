// =============================================================================
// Boton.tsx
// Qué hace:     el botón de toda la aplicación, con tres estilos:
//                 primario   -> la acción principal (rojo de la marca, relleno)
//                 secundario -> acciones normales (borde gris azulado)
//                 peligro    -> acciones destructivas (borde rojo, sin relleno)
// Lo usan:      diálogos, formularios y páginas.
//
// Reglas del diseño: como máximo UN botón primario por pantalla o diálogo, y lo
// destructivo nunca va relleno (se distingue de la acción principal y siempre
// pide confirmación). Si no se indica type, es "button": así un botón dentro de
// un formulario no lo envía sin querer.
// =============================================================================
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primario' | 'secundario' | 'peligro';
// "icono": botón cuadrado solo con un icono. Debe llevar aria-label (y title para el cursor).
type Size = 'md' | 'sm' | 'icono';

const VARIANTS: Record<Variant, string> = {
  primario: 'bg-marca text-white hover:bg-marca-oscuro',
  secundario: 'border border-borde-fuerte bg-superficie text-titulo hover:bg-apoyo',
  peligro: 'border border-marca bg-superficie text-marca hover:bg-error-fondo',
};

const SIZES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-sm',
  icono: 'size-8',
};

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Boton({ variant = 'secundario', size = 'md', type = 'button', className = '', ...props }: BotonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
