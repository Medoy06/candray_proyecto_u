// =============================================================================
// PaginaRecordatorios.tsx
// Qué hace:     la bandeja de recordatorios SIMULADOS de la sucursal activa: las
//               citas agendadas de hoy y mañana, con el mensaje que se le
//               enviaría a cada paciente.
// Depende de:   ganchos/useRecordatorios.ts, useSesion.ts, componentes/ui y
//               paginas/recordatorios/TablaRecordatorios.tsx.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "recordatorios", capacidad
//               reminders_read).
//
// El sistema no envía ningún mensaje: la pantalla lo dice con un aviso fijo, para
// que nadie crea que el paciente ya fue avisado. Es solo lectura.
// =============================================================================
import { Info } from 'lucide-react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { Boton } from '../../componentes/ui/Boton';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { useRecordatorios } from '../../ganchos/useRecordatorios';
import { useSesion } from '../../ganchos/useSesion';
import { TablaRecordatorios } from './TablaRecordatorios';

export function PaginaRecordatorios() {
  const { activeBranch } = useSesion();
  const { status, data, error, reload } = useRecordatorios(activeBranch?.id ?? '');

  if (activeBranch === null) return null;

  return (
    <div>
      <EncabezadoPagina
        title="Recordatorios"
        description={`Citas agendadas de hoy y mañana en ${activeBranch.name}.`}
      />

      <p className="mb-4 flex items-start gap-2 rounded-md border border-borde bg-info-fondo p-3 text-sm text-info-texto">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Simulación: el sistema no envía mensajes. Esta bandeja muestra a quién se le enviaría un recordatorio y con
          qué texto.
        </span>
      </p>

      {status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={error ?? 'No se pudieron cargar los recordatorios.'} />
          <Boton variant="secundario" onClick={reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {status === 'loading' && data === null && <p className="text-sm text-texto-suave">Cargando recordatorios...</p>}
      {data !== null && data.length === 0 && (
        <p className="rounded-lg border border-borde bg-superficie p-6 text-center text-sm text-texto-suave">
          No hay citas agendadas para hoy ni mañana en esta sucursal.
        </p>
      )}
      {data !== null && data.length > 0 && <TablaRecordatorios reminders={data} />}
    </div>
  );
}
