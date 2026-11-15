// =============================================================================
// pacientes.ts (servicio)
// Qué hace:     las REGLAS de los pacientes: buscar, ver, registrar y modificar,
//               con su auditoría.
// Requerimiento: capacidades patients_search y patients_manage (sección 7).
// Depende de:   modelos/pacientes.ts, utilidades/transaccion.ts,
//               utilidades/auditoria.ts y utilidades/fechas.ts.
// Lo usa:       controladores/pacientes.ts.
//
// Reglas:
//   - La fecha de nacimiento no puede ser futura.
//   - El DUI no se repite entre pacientes (lo garantiza la base; aquí se
//     traduce el error a un mensaje claro).
//   - Un paciente no se borra: se desactiva.
//   - La auditoría guarda QUÉ campos cambiaron, no sus valores: la bitácora no
//     debe convertirse en una segunda copia de los datos personales.
// =============================================================================
import type { CreatePatientInput, SearchPatientsQuery, UpdatePatientInput } from '../esquemas/pacientes';
import { AppError } from '../intermediarios/errores';
import {
  findPatient,
  insertPatient,
  searchPatients,
  updatePatientFields,
  type Patient,
  type PatientFields,
} from '../modelos/pacientes';
import { auditLog } from '../utilidades/auditoria';
import { todayInElSalvador } from '../utilidades/fechas';
import { withTransaction } from '../utilidades/transaccion';

// Lanza 400 si la fecha de nacimiento es posterior a hoy.
function assertNotFuture(birthDate: string): void {
  if (birthDate > todayInElSalvador()) {
    throw new AppError('La fecha de nacimiento no puede ser futura.', 400);
  }
}

// Convierte el error de DUI repetido de la base (23505) en un 409 claro.
function translateDuplicate(error: unknown): never {
  if ((error as { code?: string }).code === '23505') {
    throw new AppError('Ya existe un paciente con ese DUI.', 409);
  }
  throw error;
}

// Busca pacientes. Devuelve la página y el total.
export async function search(query: SearchPatientsQuery): Promise<{ rows: Patient[]; total: number }> {
  return searchPatients(query);
}

// Devuelve un paciente o lanza 404.
export async function getPatient(patientId: string): Promise<Patient> {
  const patient = await findPatient(patientId);
  if (!patient) throw new AppError('Paciente no encontrado.', 404);
  return patient;
}

// Registra un paciente.
// Recibe: los datos, quién lo registra y en qué sucursal está. Devuelve el paciente creado.
export async function createPatient(
  input: CreatePatientInput,
  actorId: string,
  branchId: string,
): Promise<Patient> {
  assertNotFuture(input.birth_date);

  let patientId: string;
  try {
    patientId = await insertPatient({
      full_name: input.full_name,
      birth_date: input.birth_date,
      phone: input.phone,
      dui: input.dui ?? null,
      email: input.email ?? null,
      is_active: true,
    });
  } catch (error) {
    translateDuplicate(error);
  }

  await auditLog({ entityType: 'patient', action: 'patient_created', entityId: patientId, actorId, branchId });
  return getPatient(patientId);
}

// Modifica un paciente (solo los campos enviados).
// Recibe: id, cambios, quién los hace y su sucursal. Devuelve el paciente ya modificado.
export async function updatePatient(
  patientId: string,
  changes: UpdatePatientInput,
  actorId: string,
  branchId: string,
): Promise<Patient> {
  if (changes.birth_date !== undefined) assertNotFuture(changes.birth_date);

  let changedFields: string[];
  try {
    changedFields = await withTransaction(async (tx) => {
      const current = await findPatient(patientId, tx); // con la fila bloqueada
      if (!current) throw new AppError('Paciente no encontrado.', 404);

      // Valor final de cada campo: el enviado, o el que ya tenía.
      const next: PatientFields = {
        full_name: changes.full_name ?? current.full_name,
        birth_date: changes.birth_date ?? current.birth_date,
        phone: changes.phone ?? current.phone,
        dui: changes.dui !== undefined ? changes.dui : current.dui,
        email: changes.email !== undefined ? changes.email : current.email,
        is_active: changes.is_active ?? current.is_active,
      };

      const changed = (Object.keys(next) as (keyof PatientFields)[]).filter(
        (key) => next[key] !== current[key],
      );
      if (changed.length > 0) await updatePatientFields(tx, patientId, next);
      return changed;
    });
  } catch (error) {
    translateDuplicate(error);
  }

  if (changedFields.length > 0) {
    await auditLog({
      entityType: 'patient',
      action: 'patient_updated',
      entityId: patientId,
      actorId,
      branchId,
      detail: { fields: changedFields },
    });
  }
  return getPatient(patientId);
}
