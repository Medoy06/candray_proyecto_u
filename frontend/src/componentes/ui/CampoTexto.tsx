// =============================================================================
// CampoTexto.tsx
// Qué hace:     un campo de formulario con su etiqueta, ya unidos para que el
//               lector de pantalla y el clic en la etiqueta funcionen.
// Lo usan:      los formularios (inicio de sesión, usuarios, sucursales...).
//
// Acepta todas las propiedades normales de <input> (type, value, onChange,
// autoComplete...). Al enfocarlo, el borde y el anillo usan el color de la marca.
// =============================================================================
import { useId, type InputHTMLAttributes } from 'react';

interface CampoTextoProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function CampoTexto({ label, className = '', ...inputProps }: CampoTextoProps) {
  const id = useId(); // id único para unir la etiqueta con su campo
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-texto">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-md border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-texto placeholder:text-texto-suave focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/30 ${className}`}
        {...inputProps}
      />
    </div>
  );
}
