// =============================================================================
// TablaSucursales.tsx
// Qué hace:     define las columnas de la tabla de sucursales (nombre y código,
//               contacto, horario, óptica, usuarios, estado y acciones) y las
//               dibuja con el componente genérico Tabla.
// Depende de:   componentes/ui (Tabla, Boton, Etiqueta) y utilidades/formatoFecha.ts.
// Lo usa:       paginas/sucursales/PaginaSucursales.tsx.
//
// No decide nada: avisa a la página cuando se pulsa una acción.
// El punto de color es decorativo (aria-hidden): el nombre ya identifica la sucursal.
// =============================================================================
import { Pencil } from 'lucide-react';
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { ManagedBranch } from '../../servicios/sucursales';
import { formatTime } from '../../utilidades/formatoFecha';

interface TablaSucursalesProps {
  branches: ManagedBranch[];
  onEdit: (branch: ManagedBranch) => void;
  onToggleActive: (branch: ManagedBranch) => void;
}

export function TablaSucursales({ branches, onEdit, onToggleActive }: TablaSucursalesProps) {
  const columns: TablaColumna<ManagedBranch>[] = [
    {
      id: 'branch',
      header: 'Sucursal',
      cell: (branch) => (
        <>
          <p className="flex items-center gap-2 font-medium text-texto">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full border border-borde-fuerte"
              style={{ backgroundColor: branch.theme_color }}
            />
            {branch.name}
          </p>
          <p className="text-xs text-texto-suave">{branch.code}</p>
        </>
      ),
    },
    {
      id: 'contact',
      header: 'Dirección y teléfono',
      cell: (branch) => (
        <>
          <p>{branch.address ?? 'Sin dirección'}</p>
          <p className="text-xs text-texto-suave">{branch.phone ?? 'Sin teléfono'}</p>
        </>
      ),
    },
    {
      id: 'schedule',
      header: 'Horario',
      noWrap: true,
      cell: (branch) => `${formatTime(branch.opening_time)} – ${formatTime(branch.closing_time)}`,
    },
    { id: 'optical', header: 'Óptica', cell: (branch) => (branch.has_optical_counter ? 'Sí' : 'No') },
    {
      id: 'users',
      header: 'Usuarios',
      cell: (branch) => branch.user_count,
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (branch) => (
        <Etiqueta tone={branch.is_active ? 'exito' : 'neutro'}>{branch.is_active ? 'Activa' : 'Inactiva'}</Etiqueta>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      align: 'right',
      cell: (branch) => (
        <div className="flex items-center justify-end gap-2">
          <Boton size="icono" onClick={() => onEdit(branch)} aria-label={`Editar ${branch.name}`} title="Editar">
            <Pencil className="size-4" aria-hidden="true" />
          </Boton>
          <Boton
            size="sm"
            variant={branch.is_active ? 'peligro' : 'secundario'}
            onClick={() => onToggleActive(branch)}
            aria-label={`${branch.is_active ? 'Desactivar' : 'Activar'} ${branch.name}`}
          >
            {branch.is_active ? 'Desactivar' : 'Activar'}
          </Boton>
        </div>
      ),
    },
  ];

  return <Tabla label="Lista de sucursales" columns={columns} rows={branches} rowKey={(branch) => branch.id} />;
}
