// =============================================================================
// TablaPacientes.tsx
// Qué hace:     define las columnas de la tabla de pacientes (expediente,
//               nombre y correo, nacimiento, teléfono, DUI, estado y acciones)
//               y las dibuja con el componente genérico Tabla.
// Depende de:   componentes/ui (Tabla, Boton, Etiqueta), servicios/pacientes.ts
//               y utilidades/formatoFecha.ts.
// Lo usa:       paginas/pacientes/PaginaPacientes.tsx.
//
// No decide nada: avisa a la página cuando se pulsa una acción. La columna de
// acciones solo existe si la persona puede abrir expedientes (médicos), manejar
// consentimientos (médicos y recepción) o modificar pacientes (recepción); quien solo consulta ve la tabla sin botones.
// =============================================================================
import { FileText, Pencil, ShieldCheck } from 'lucide-react';
import { Boton } from '../../componentes/ui/Boton';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tabla, type TablaColumna } from '../../componentes/ui/Tabla';
import type { Patient } from '../../servicios/pacientes';
import { formatDate } from '../../utilidades/formatoFecha';

interface TablaPacientesProps {
  patients: Patient[];
  canManage: boolean;
  canOpenRecord: boolean; // puede abrir el expediente clínico (médicos y administración)
  canConsent: boolean;    // puede registrar y revocar consentimientos (médicos y recepción)
  onOpenRecord: (patient: Patient) => void;
  onConsent: (patient: Patient) => void;
  onEdit: (patient: Patient) => void;
  onToggleActive: (patient: Patient) => void;
}

export function TablaPacientes({
  patients,
  canManage,
  canOpenRecord,
  canConsent,
  onOpenRecord,
  onConsent,
  onEdit,
  onToggleActive,
}: TablaPacientesProps) {
  const columns: TablaColumna<Patient>[] = [
    { id: 'record', header: 'Expediente', noWrap: true, cell: (patient) => patient.record_number },
    {
      id: 'patient',
      header: 'Paciente',
      cell: (patient) => (
        <>
          <p className="font-medium text-texto">{patient.full_name}</p>
          <p className="text-xs text-texto-suave">{patient.email ?? 'Sin correo'}</p>
        </>
      ),
    },
    { id: 'birth', header: 'Nacimiento', noWrap: true, cell: (patient) => formatDate(patient.birth_date) },
    { id: 'phone', header: 'Teléfono', noWrap: true, cell: (patient) => patient.phone },
    { id: 'dui', header: 'DUI', noWrap: true, cell: (patient) => patient.dui ?? 'Sin DUI' },
    {
      id: 'status',
      header: 'Estado',
      cell: (patient) => (
        <Etiqueta tone={patient.is_active ? 'exito' : 'neutro'}>{patient.is_active ? 'Activo' : 'Desactivado'}</Etiqueta>
      ),
    },
  ];

  // La columna existe si la persona puede hacer algo en ella: abrir el expediente
  // (médicos), manejar el consentimiento (médicos y recepción) o modificar al
  // paciente (recepción). Quien solo consulta no la ve.
  if (canManage || canOpenRecord || canConsent) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      align: 'right',
      cell: (patient) => (
        <div className="flex items-center justify-end gap-2">
          {canOpenRecord && (
            <Boton size="sm" onClick={() => onOpenRecord(patient)} aria-label={`Abrir el expediente de ${patient.full_name}`}>
              <FileText className="size-4" aria-hidden="true" />
              Expediente
            </Boton>
          )}
          {canConsent && (
            <Boton
              size="sm"
              variant="secundario"
              onClick={() => onConsent(patient)}
              aria-label={`Consentimiento de ${patient.full_name}`}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              Consentimiento
            </Boton>
          )}
          {canManage && (
            <>
              <Boton size="icono" onClick={() => onEdit(patient)} aria-label={`Editar a ${patient.full_name}`} title="Editar">
                <Pencil className="size-4" aria-hidden="true" />
              </Boton>
              <Boton
                size="sm"
                variant={patient.is_active ? 'peligro' : 'secundario'}
                onClick={() => onToggleActive(patient)}
                aria-label={`${patient.is_active ? 'Desactivar' : 'Activar'} a ${patient.full_name}`}
              >
                {patient.is_active ? 'Desactivar' : 'Activar'}
              </Boton>
            </>
          )}
        </div>
      ),
    });
  }

  return <Tabla label="Lista de pacientes" columns={columns} rows={patients} rowKey={(patient) => patient.id} />;
}
