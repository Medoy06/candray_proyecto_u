// =============================================================================
// datosClinicos.ts
// Qué hace:     funciones para crear pacientes, bloques de horario y citas de
//               prueba directamente con SQL, para probar las reglas de la base
//               de datos sin pasar por la API.
// Depende de:   configuracion/baseDatos.ts.
// Lo usan:      las pruebas de pruebas/base_datos/ (y las de la API clínica).
//
// Cada función devuelve el resultado de la inserción; si la base rechaza la fila
// (por una restricción), el error llega a la prueba, que comprueba su código.
// Los datos son ficticios y únicos para que las pruebas no se estorben.
// =============================================================================
import { randomUUID } from 'crypto';
import { pool } from '../../src/configuracion/baseDatos';

export interface TestPatient {
  id: string;
  record_number: number;
}

// Crea un paciente. `overrides` cambia columnas (por ejemplo { dui: '...' }).
// Devuelve: su id y su número de expediente.
export async function createTestPatient(
  overrides: Partial<Record<'full_name' | 'birth_date' | 'phone' | 'dui' | 'email', string | null>> = {},
): Promise<TestPatient> {
  const values = {
    full_name: `Paciente ${randomUUID().slice(0, 8)}`,
    birth_date: '1990-05-17',
    phone: '7000-0000',
    dui: null,
    email: null,
    ...overrides,
  };
  const result = await pool.query<TestPatient>(
    `INSERT INTO patients (full_name, birth_date, phone, dui, email)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, record_number`,
    [values.full_name, values.birth_date, values.phone, values.dui, values.email],
  );
  return result.rows[0];
}

export interface ScheduleInput {
  doctorId: string;
  branchId: string;
  weekday: number;
  start: string; // 'HH:MM'
  end: string;
}

// Inserta un bloque del horario semanal de un médico.
export async function insertSchedule(input: ScheduleInput) {
  return pool.query(
    `INSERT INTO doctor_schedules (doctor_id, branch_id, weekday, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.doctorId, input.branchId, input.weekday, input.start, input.end],
  );
}

export interface AppointmentInput {
  patientId: string;
  doctorId: string;
  branchId: string;
  createdBy: string;
  startsAt: string; // 'AAAA-MM-DD HH:MM'
  status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  reason?: string | null;
  cancellationReason?: string | null;
  endsAt?: string; // por defecto, 30 minutos después del inicio
}

// Inserta una cita. Si no se indica endsAt, termina 30 minutos después.
export async function insertAppointment(input: AppointmentInput) {
  return pool.query<{ id: string }>(
    `INSERT INTO appointments
       (patient_id, doctor_id, branch_id, created_by, starts_at, ends_at,
        status, reason, cancellation_reason)
     VALUES ($1, $2, $3, $4, $5::timestamp,
             COALESCE($6::timestamp, $5::timestamp + interval '30 minutes'),
             COALESCE($7::appointment_status, 'scheduled'), $8, $9)
     RETURNING id`,
    [
      input.patientId, input.doctorId, input.branchId, input.createdBy, input.startsAt,
      input.endsAt ?? null, input.status ?? null, input.reason ?? null, input.cancellationReason ?? null,
    ],
  );
}

export interface MedicalRecordInput {
  patientId: string;
  doctorId: string;
  branchId: string;
  appointmentId?: string | null; // nota original: la cita de la consulta
  amendsId?: string | null;      // enmienda: la nota que corrige
  diagnosis?: string;
  treatment?: string | null;
  notes?: string | null;
}

// Inserta una nota del expediente. Si no se indica diagnóstico, usa uno de prueba.
export async function insertMedicalRecord(input: MedicalRecordInput) {
  return pool.query<{ id: string }>(
    `INSERT INTO medical_records
       (patient_id, doctor_id, branch_id, appointment_id, amends_id, diagnosis, treatment, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.patientId, input.doctorId, input.branchId, input.appointmentId ?? null,
      input.amendsId ?? null, input.diagnosis ?? 'Miopía leve', input.treatment ?? null, input.notes ?? null,
    ],
  );
}

export interface ReferralInput {
  patientId: string;
  providerId: string;
  grantedBy: string;
  reason?: string;
  expiresAt?: string; // 'AAAA-MM-DD HH:MM'; por defecto, dentro de 7 días
}

// Inserta una interconsulta.
export async function insertReferral(input: ReferralInput) {
  return pool.query<{ id: string }>(
    `INSERT INTO referrals (patient_id, provider_id, granted_by, reason, expires_at)
     VALUES ($1, $2, $3, $4,
             COALESCE($5::timestamp, (now() AT TIME ZONE 'America/El_Salvador') + interval '7 days'))
     RETURNING id`,
    [input.patientId, input.providerId, input.grantedBy, input.reason ?? 'Segunda opinión', input.expiresAt ?? null],
  );
}
