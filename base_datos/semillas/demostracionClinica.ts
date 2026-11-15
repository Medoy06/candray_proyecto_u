// =============================================================================
// demostracionClinica.ts (semilla)
// Qué hace:     inserta los datos FICTICIOS clínicos de la demostración:
//               pacientes, horarios semanales de los médicos y citas.
// Requerimiento: demostración reproducible (sección 11 del documento de diseño).
// Depende de:   backend/src/configuracion/baseDatos.ts y de las tablas creadas
//               por las migraciones 03, 04 y 05.
// Lo usa:       demostracion.ts (seedDemo), después de crear sucursales y usuarios.
//
// Las citas se generan RELATIVAS A HOY: así la agenda siempre tiene citas
// pasadas, de hoy y próximas, sin importar cuándo se reinicie la demostración.
// Todos los nombres, teléfonos, DUI y correos son inventados.
// =============================================================================
import { pool } from '../../backend/src/configuracion/baseDatos';

interface DemoPatient {
  full_name: string;
  birth_date: string;
  phone: string;
  dui: string | null;
  email: string | null;
}

// Un bloque semanal: el médico atiende en esa sucursal esos días, de start a end.
interface DemoSchedule {
  doctorEmail: string;
  branchCode: string;
  weekdays: number[]; // 1 = lunes ... 7 = domingo
  start: string;
  end: string;
}

// Quién agenda las citas de cada sucursal.
const RECEPTIONIST_BY_BRANCH: Record<string, string> = {
  CENTRAL: 'recepcion.central@candray.test',
  ESCALON: 'recepcion.escalon@candray.test',
};

export const DEMO_PATIENTS: DemoPatient[] = [
  { full_name: 'María Fernanda Guzmán', birth_date: '1985-03-12', phone: '7012-3456', dui: '04567891-2', email: 'maria.guzman@correo.test' },
  { full_name: 'Carlos Eduardo Ramírez', birth_date: '1972-11-02', phone: '7123-4567', dui: '01234567-8', email: null },
  { full_name: 'Ana Patricia Orellana', birth_date: '1999-07-25', phone: '7234-5678', dui: null, email: 'ana.orellana@correo.test' },
  { full_name: 'José Luis Menjívar', birth_date: '1960-01-30', phone: '7345-6789', dui: '00987654-3', email: null },
  { full_name: 'Gabriela Alexandra Cruz', birth_date: '2012-09-14', phone: '7456-7890', dui: null, email: null }, // menor: sin DUI
  { full_name: 'Roberto Antonio Henríquez', birth_date: '1978-05-08', phone: '7567-8901', dui: '03456789-0', email: 'roberto.henriquez@correo.test' },
  { full_name: 'Karla Beatriz Méndez', birth_date: '1991-12-19', phone: '7678-9012', dui: null, email: null },
  { full_name: 'Miguel Ángel Palacios', birth_date: '1955-04-03', phone: '7789-0123', dui: '02345678-9', email: null },
  { full_name: 'Sandra Elizabeth Pineda', birth_date: '1983-08-21', phone: '7890-1234', dui: null, email: 'sandra.pineda@correo.test' },
  { full_name: 'Jorge Alberto Cáceres', birth_date: '2005-02-27', phone: '7901-2345', dui: null, email: null },
];

// Horarios semanales. El Dr. Mejía es itinerante: reparte la semana entre las
// dos sucursales y nunca tiene dos bloques que se crucen.
export const DEMO_SCHEDULES: DemoSchedule[] = [
  { doctorEmail: 'dr.mejia@candray.test', branchCode: 'CENTRAL', weekdays: [1, 3, 5], start: '08:00', end: '12:00' },
  { doctorEmail: 'dr.mejia@candray.test', branchCode: 'ESCALON', weekdays: [1, 2, 4], start: '14:00', end: '18:00' },
  { doctorEmail: 'dra.rivas@candray.test', branchCode: 'CENTRAL', weekdays: [1, 2, 3, 4, 5], start: '08:00', end: '12:00' },
  { doctorEmail: 'dra.rivas@candray.test', branchCode: 'CENTRAL', weekdays: [1, 2, 3, 4, 5], start: '14:00', end: '17:00' },
  { doctorEmail: 'dr.portillo@candray.test', branchCode: 'ESCALON', weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '13:00' },
];

const REASONS = [
  'Examen de la vista', 'Control anual', 'Dolor de cabeza frecuente', 'Visión borrosa',
  'Revisión de graduación', 'Molestia en los ojos', 'Primera consulta',
];

// Cuántas citas se generan al inicio de cada bloque, por día. Así la agenda se
// ve ocupada al principio y con espacios libres después, para poder agendar.
const APPOINTMENTS_PER_BLOCK = 3;
const PAST_BUSINESS_DAYS = 3;
const FUTURE_BUSINESS_DAYS = 6; // incluye hoy si es día hábil

export interface ClinicalSummary {
  patients: number;
  schedules: number;
  appointments: number;
}

// Día de la semana ISO (1 = lunes ... 7 = domingo) de una fecha 'AAAA-MM-DD'.
function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// Suma días a una fecha 'AAAA-MM-DD' sin pasar por la zona horaria del equipo.
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

// Horas de inicio de las citas de un bloque: cada 30 minutos desde su inicio.
function slotStarts(start: string, count: number): string[] {
  const [hours, minutes] = start.split(':').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const total = hours * 60 + minutes + index * 30;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
}

// Siembra pacientes, horarios y citas.
// `branchIds`: id de cada sucursal por su código. `userIds`: id de cada usuario por su correo.
// Si una restricción de la base se rompe, el error se propaga: la semilla debe fallar fuerte.
export async function seedClinicalDemo(
  branchIds: Map<string, string>,
  userIds: Map<string, string>,
): Promise<ClinicalSummary> {
  const idOf = (map: Map<string, string>, key: string): string => {
    const id = map.get(key);
    if (id === undefined) throw new Error(`La semilla clínica no encontró "${key}".`);
    return id;
  };

  // 1) Pacientes
  const patientIds: string[] = [];
  for (const patient of DEMO_PATIENTS) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO patients (full_name, birth_date, phone, dui, email)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [patient.full_name, patient.birth_date, patient.phone, patient.dui, patient.email],
    );
    patientIds.push(result.rows[0].id);
  }

  // 2) Horarios: un renglón por cada día de cada bloque
  let scheduleCount = 0;
  for (const block of DEMO_SCHEDULES) {
    for (const weekday of block.weekdays) {
      await pool.query(
        `INSERT INTO doctor_schedules (doctor_id, branch_id, weekday, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [idOf(userIds, block.doctorEmail), idOf(branchIds, block.branchCode), weekday, block.start, block.end],
      );
      scheduleCount += 1;
    }
  }

  // 3) Citas. "Hoy" se toma de la base, en la hora de El Salvador.
  const today = (
    await pool.query<{ today: string }>(
      `SELECT ((now() AT TIME ZONE 'America/El_Salvador')::date)::text AS today`,
    )
  ).rows[0].today;

  const businessDay = (date: string) => isoWeekday(date) <= 5;
  const candidates = Array.from({ length: 21 }, (_, index) => addDays(today, index - 10));
  const pastDays = candidates.filter((day) => day < today && businessDay(day)).slice(-PAST_BUSINESS_DAYS);
  const futureDays = candidates.filter((day) => day >= today && businessDay(day)).slice(0, FUTURE_BUSINESS_DAYS);

  let appointmentCount = 0;
  let turn = 0; // se avanza con cada cita para rotar pacientes y estados
  for (const day of [...pastDays, ...futureDays]) {
    const isPast = day < today;
    for (const block of DEMO_SCHEDULES) {
      if (!block.weekdays.includes(isoWeekday(day))) continue;
      for (const time of slotStarts(block.start, APPOINTMENTS_PER_BLOCK)) {
        // Citas pasadas: la mayoría atendidas, algunas ausencias y cancelaciones.
        // Citas próximas: agendadas, y de vez en cuando una cancelada (deja el horario libre).
        const status = isPast
          ? (['completed', 'completed', 'no_show', 'cancelled'] as const)[turn % 4]
          : turn % 7 === 6 ? 'cancelled' : 'scheduled';
        await pool.query(
          `INSERT INTO appointments
             (patient_id, doctor_id, branch_id, starts_at, ends_at, status,
              reason, cancellation_reason, created_by)
           VALUES ($1, $2, $3, $4::timestamp, $4::timestamp + interval '30 minutes',
                   $5, $6, $7, $8)`,
          [
            patientIds[turn % patientIds.length],
            idOf(userIds, block.doctorEmail),
            idOf(branchIds, block.branchCode),
            `${day} ${time}`,
            status,
            REASONS[turn % REASONS.length],
            status === 'cancelled' ? 'El paciente avisó que no podía asistir' : null,
            idOf(userIds, RECEPTIONIST_BY_BRANCH[block.branchCode]),
          ],
        );
        appointmentCount += 1;
        turn += 1;
      }
    }
  }

  return { patients: patientIds.length, schedules: scheduleCount, appointments: appointmentCount };
}
