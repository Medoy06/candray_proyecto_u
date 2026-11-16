// =============================================================================
// TablaHorarios.tsx
// Qué hace:     define las columnas de la tabla de bloques de horario (día,
//               sucursal, horario y acciones) y las dibuja con la tabla genérica.
// Depende de:   componentes/ui, paginas/horarios/etiquetasHorarios.ts,
//               servicios/horarios.ts y utilidades/formatoFecha.ts.
// Lo usa:       paginas/horarios/PaginaHorarios.tsx.
//
// No decide nada: avisa a la página cuando se pulsa una acción. Los bloques se
// muestran de lunes a domingo y, dentro del día, por hora de inicio.
// =============================================================================
import { Pencil, Trash2 } from 'lucide-react';
import { Boton } from '../../componentes/ui/Boton';
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { ScheduleBlock } from '../../servicios/horarios';
import { formatTime } from '../../utilidades/formatoFecha';
import { WEEKDAY_LABELS } from './etiquetasHorarios';

interface TablaHorariosProps {
  blocks: ScheduleBlock[];
  onEdit: (block: ScheduleBlock) => void;
  onDelete: (block: ScheduleBlock) => void;
}

// Ordena por día y, dentro del día, por hora de inicio ("HH:MM:SS" se ordena como texto).
function sortBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}

export function TablaHorarios({ blocks, onEdit, onDelete }: TablaHorariosProps) {
  const columns: TablaColumna<ScheduleBlock>[] = [
    { id: 'weekday', header: 'Día', cell: (block) => WEEKDAY_LABELS[block.weekday] ?? String(block.weekday), noWrap: true },
    { id: 'branch', header: 'Sucursal', cell: (block) => block.branch_name },
    {
      id: 'hours',
      header: 'Horario',
      cell: (block) => `${formatTime(block.start_time)} a ${formatTime(block.end_time)}`,
      noWrap: true,
    },
    {
      id: 'actions',
      header: 'Acciones',
      align: 'right',
      cell: (block) => (
        <div className="flex justify-end gap-2">
          <Boton variant="secundario" size="sm" onClick={() => onEdit(block)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar
          </Boton>
          <Boton variant="peligro" size="sm" onClick={() => onDelete(block)}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Eliminar
          </Boton>
        </div>
      ),
    },
  ];

  return <Tabla label="Bloques de horario" columns={columns} rows={sortBlocks(blocks)} rowKey={(block) => block.id} />;
}
