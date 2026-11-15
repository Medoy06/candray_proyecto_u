// =============================================================================
// FormField.tsx
// Qué hace:     etiqueta + campo + ayuda opcional, y el estilo único de los
//               campos de formulario (inputClass).
// Lo usan:      todos los formularios, y CampoTexto.tsx (que reutiliza inputClass).
// Portado de:   Hospital Mio (components/ui/FormField.tsx), con el estilo de Candray.
//
// El campo va DENTRO del <label>: así quedan unidos para el lector de pantalla
// y para el clic en la etiqueta, sin generar ids. El asterisco de "obligatorio"
// es solo visual (aria-hidden) para que el nombre accesible sea limpio; el campo
// debe llevar su propio atributo "required".
// =============================================================================
import type { ReactNode } from 'react';

// Un solo estilo de campo para toda la aplicación: para cambiarlo, se cambia aquí.
// El foco usa el azul oscuro del título y NO el rojo de la marca: un borde rojo se
// leería como un campo con error.
export const inputClass =
  'w-full rounded-md border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-texto ' +
  'placeholder:text-texto-suave focus:border-titulo focus:outline-none focus:ring-2 focus:ring-titulo/30 ' +
  'disabled:bg-apoyo disabled:text-texto-suave';

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string; // por ejemplo "sm:col-span-2" para ocupar todo el ancho de la cuadrícula
  children: ReactNode; // el control
}

export function FormField({ label, required, hint, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-texto">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </span>
        {children}
      </label>
      {hint !== undefined && <p className="mt-1 text-xs text-texto-suave">{hint}</p>}
    </div>
  );
}
