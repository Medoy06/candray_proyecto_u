// =============================================================================
// CampoTexto.tsx
// Qué hace:     un campo de formulario con su etiqueta, ya unidos para que el
//               lector de pantalla y el clic en la etiqueta funcionen.
// Lo usan:      los formularios (inicio de sesión, usuarios, sucursales...).
//
// Acepta todas las propiedades normales de <input> (type, value, onChange,
// autoComplete...). El borde de enfoque usa el color de acento de la sucursal.
// =============================================================================
import { useId, type InputHTMLAttributes } from 'react';

interface CampoTextoProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function CampoTexto({ label, className = '', ...inputProps }: CampoTextoProps) {
  const id = useId(); // id único para unir la etiqueta con su campo
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-acento ${className}`}
        {...inputProps}
      />
    </div>
  );
}
