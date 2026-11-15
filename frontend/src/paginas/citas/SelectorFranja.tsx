// =============================================================================
// SelectorFranja.tsx
// Qué hace:     muestra, por médico, las franjas de 30 minutos de un día y deja
//               elegir una libre. Las ocupadas y las que ya pasaron se ven
//               apagadas, para que se entienda por qué no se pueden elegir.
// Depende de:   servicios/disponibilidad.ts y paginas/citas/formularioCita.ts.
// Lo usa:       paginas/citas/FormularioCita.tsx.
//
// Es un componente "tonto": no consulta nada. El horario elegido (médico + hora)
// vive en el formulario; aquí solo se avisa con onChange.
// =============================================================================
import type { DayAvailability, SlotStatus } from '../../servicios/disponibilidad';
import type { ChosenSlot } from './formularioCita';

const STATUS_HINT: Record<SlotStatus, string> = {
  free: 'Libre',
  booked: 'Ocupada',
  past: 'Ya pasó',
};

interface SelectorFranjaProps {
  availability: DayAvailability;
  value: ChosenSlot | null;
  onChange: (slot: ChosenSlot) => void;
}

export function SelectorFranja({ availability, value, onChange }: SelectorFranjaProps) {
  if (availability.doctors.length === 0) {
    return <p className="text-sm text-texto-suave">Ningún médico atiende ese día en esta sucursal.</p>;
  }
  return (
    <div className="space-y-4">
      {availability.doctors.map((doctor) => (
        <section key={doctor.doctor_id} aria-label={`Horarios de ${doctor.doctor_name}`}>
          <h3 className="mb-1.5 text-sm font-medium text-texto">
            {doctor.doctor_name}{' '}
            <span className="font-normal text-texto-suave">
              ·{' '}
              {doctor.free_count === 0
                ? 'sin horarios libres'
                : `${doctor.free_count} ${doctor.free_count === 1 ? 'libre' : 'libres'}`}
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {doctor.slots.map((slot) => {
              const selected = value?.doctorId === doctor.doctor_id && value.time === slot.time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={slot.status !== 'free'}
                  aria-pressed={selected}
                  aria-label={`${slot.time} con ${doctor.doctor_name} — ${STATUS_HINT[slot.status]}`}
                  title={STATUS_HINT[slot.status]}
                  onClick={() => onChange({ doctorId: doctor.doctor_id, time: slot.time })}
                  className={`rounded-md border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${
                    selected
                      ? 'border-marca bg-marca text-white'
                      : 'border-borde bg-fondo text-texto enabled:hover:border-marca'
                  }`}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
