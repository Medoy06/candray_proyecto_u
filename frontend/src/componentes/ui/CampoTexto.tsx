// =============================================================================
// CampoTexto.tsx
// Qué hace:     un campo de formulario con su etiqueta, ya unidos para que el
//               lector de pantalla y el clic en la etiqueta funcionen.
// Lo usan:      los formularios (inicio de sesión, usuarios, sucursales...).
//
// Acepta todas las propiedades normales de <input> (type, value, onChange,
// autoComplete...). Usa el mismo estilo de campo que FormField (inputClass).
// =============================================================================
import { useId, type InputHTMLAttributes } from 'react';
import { inputClass } from './FormField';

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
        className={`${inputClass} ${className}`}
        {...inputProps}
      />
    </div>
  );
}
