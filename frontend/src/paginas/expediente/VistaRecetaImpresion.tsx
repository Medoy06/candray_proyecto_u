// =============================================================================
// VistaRecetaImpresion.tsx
// Qué hace:     la receta tal como sale en papel: encabezado de la clínica, datos
//               del paciente, las medidas, quién la emitió y cuándo, y una línea
//               para la firma del médico.
// Depende de:   paginas/expediente/MedidasReceta.tsx y servicios/*.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx.
//
// Igual que el expediente impreso: en pantalla está oculto (hidden) y solo se ve
// al imprimir (print:block); al imprimir, el resto de la aplicación se oculta.
// =============================================================================
import type { Patient } from '../../servicios/pacientes';
import type { Prescription } from '../../servicios/recetas';
import { formatDate, formatDateTime } from '../../utilidades/formatoFecha';
import { MedidasReceta } from './MedidasReceta';

interface VistaRecetaImpresionProps {
  patient: Patient;
  prescription: Prescription;
}

export function VistaRecetaImpresion({ patient, prescription }: VistaRecetaImpresionProps) {
  return (
    <section aria-label="Receta para imprimir" className="hidden print:block">
      <header className="mb-4 border-b border-borde-fuerte pb-3">
        <p className="font-titulo text-sm font-semibold uppercase tracking-wide text-texto-suave">Clínicas y Ópticas Candray</p>
        <h1 className="font-titulo text-2xl font-semibold text-titulo">Receta óptica</h1>
        <p className="text-sm text-texto">
          {patient.full_name} · Expediente N.º {patient.record_number} · Nacimiento {formatDate(patient.birth_date)}
        </p>
        <p className="text-xs text-texto-suave">
          Emitida el {formatDateTime(prescription.created_at)} · {prescription.branch_name}
        </p>
      </header>
      <MedidasReceta measures={prescription} />
      <div className="mt-16 w-64 border-t border-borde-fuerte pt-1 text-sm text-texto">
        {prescription.doctor_name}
        <p className="text-xs text-texto-suave">Firma del médico</p>
      </div>
    </section>
  );
}
