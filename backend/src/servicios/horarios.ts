// =============================================================================
// horarios.ts (servicio)
// Qué hace:     las REGLAS de los bloques del horario semanal de los médicos y
//               su auditoría.
// Requerimiento: capacidades availability_read y schedules_manage (sección 7).
// Depende de:   modelos/horarios.ts, modelos/usuarios.ts, modelos/gestionSucursales.ts,
//               utilidades/transaccion.ts y utilidades/auditoria.ts.
// Lo usa:       controladores/horarios.ts.
//
// Reglas al crear o modificar un bloque:
//   - La persona debe ser un MÉDICO activo, y estar asignado a esa sucursal.
//   - La sucursal debe estar activa y el bloque dentro de su horario.
//   - El inicio debe ser anterior al fin.
//   - No puede cruzarse con otro bloque del mismo médico, ni en otra sucursal
//     (lo garantiza la base; aquí se traduce el error a un mensaje claro).
//   - No se puede cambiar ni borrar un bloque si hay citas agendadas futuras
//     que quedarían fuera: antes hay que reprogramarlas o cancelarlas.
// =============================================================================
import type { CreateScheduleInput, ListSchedulesQuery, UpdateScheduleInput } from '../esquemas/horarios';
import { AppError } from '../intermediarios/errores';
import { findManagedBranch } from '../modelos/gestionSucursales';
import {
  countUncoveredAppointments,
  deleteSchedule,
  findSchedule,
  insertSchedule,
  isDoctorAssignedToBranch,
  listSchedules,
  updateScheduleFields,
  type ScheduleBlock,
  type ScheduleFields,
} from '../modelos/horarios';
import { findUserById } from '../modelos/usuarios';
import { auditLog } from '../utilidades/auditoria';
import { toMinutes } from '../utilidades/franjas';
import { withTransaction } from '../utilidades/transaccion';

// Convierte el error de cruce de la base (23P01) en un 409 claro.
function translateOverlap(error: unknown): never {
  if ((error as { code?: string }).code === '23P01') {
    throw new AppError('El médico ya tiene un bloque que se cruza con ese horario (en esta u otra sucursal).', 409);
  }
  throw error;
}

// Comprueba todo lo que NO puede revisar la base: que sea un médico activo de esa
// sucursal, que la sucursal esté activa y que el bloque quepa en su horario.
// Lanza 400 con el motivo.
async function assertBlockIsValid(doctorId: string, fields: ScheduleFields): Promise<void> {
  if (toMinutes(fields.start_time) >= toMinutes(fields.end_time)) {
    throw new AppError('La hora de inicio debe ser anterior a la de fin.', 400);
  }

  // findUserById solo devuelve usuarios activos: uno desactivado cuenta como inexistente.
  const doctor = await findUserById(doctorId);
  if (!doctor || doctor.role !== 'doctor') {
    throw new AppError('El usuario indicado no es un médico activo.', 400);
  }

  const branch = await findManagedBranch(fields.branch_id);
  if (!branch || !branch.is_active) {
    throw new AppError('La sucursal indicada no existe o está inactiva.', 400);
  }

  if (!(await isDoctorAssignedToBranch(doctorId, fields.branch_id))) {
    throw new AppError('El médico no está asignado a esa sucursal.', 400);
  }

  if (
    toMinutes(fields.start_time) < toMinutes(branch.opening_time) ||
    toMinutes(fields.end_time) > toMinutes(branch.closing_time)
  ) {
    throw new AppError(
      `El bloque debe estar dentro del horario de la sucursal (${branch.opening_time.slice(0, 5)} a ${branch.closing_time.slice(0, 5)}).`,
      400,
    );
  }
}

// Lista los bloques de las sucursales permitidas (con filtros opcionales).
export async function list(filters: ListSchedulesQuery, allowedBranchIds: string[]): Promise<ScheduleBlock[]> {
  return listSchedules(filters, allowedBranchIds);
}

// Devuelve un bloque o lanza 404.
export async function getSchedule(scheduleId: string): Promise<ScheduleBlock> {
  const block = await findSchedule(scheduleId);
  if (!block) throw new AppError('Bloque de horario no encontrado.', 404);
  return block;
}

// Crea un bloque. Devuelve el bloque creado.
export async function createSchedule(input: CreateScheduleInput, actorId: string): Promise<ScheduleBlock> {
  const fields: ScheduleFields = {
    branch_id: input.branch_id,
    weekday: input.weekday,
    start_time: input.start_time,
    end_time: input.end_time,
  };
  await assertBlockIsValid(input.doctor_id, fields);

  let scheduleId: string;
  try {
    scheduleId = await insertSchedule(input.doctor_id, fields);
  } catch (error) {
    translateOverlap(error);
  }

  await auditLog({
    entityType: 'doctor_schedule',
    action: 'schedule_created',
    entityId: scheduleId,
    actorId,
    branchId: input.branch_id,
    detail: { doctor_id: input.doctor_id, ...fields },
  });
  return getSchedule(scheduleId);
}

// Modifica un bloque (solo los campos enviados). Devuelve el bloque ya modificado.
export async function updateSchedule(
  scheduleId: string,
  changes: UpdateScheduleInput,
  actorId: string,
): Promise<ScheduleBlock> {
  let detail: Record<string, unknown> | null;
  try {
    detail = await withTransaction(async (tx) => {
      const current = await findSchedule(scheduleId, tx); // con la fila bloqueada
      if (!current) throw new AppError('Bloque de horario no encontrado.', 404);

      // Valor final de cada campo: el enviado, o el que ya tenía.
      const next: ScheduleFields = {
        branch_id: changes.branch_id ?? current.branch_id,
        weekday: changes.weekday ?? current.weekday,
        start_time: changes.start_time ?? current.start_time,
        end_time: changes.end_time ?? current.end_time,
      };
      await assertBlockIsValid(current.doctor_id, next);

      // Se registran solo los campos que de verdad cambiaron (las horas se
      // comparan como HH:MM, porque la base devuelve HH:MM:SS).
      const changed: Record<string, unknown> = {};
      for (const key of Object.keys(next) as (keyof ScheduleFields)[]) {
        const before = key.endsWith('_time') ? String(current[key]).slice(0, 5) : current[key];
        const after = key.endsWith('_time') ? String(next[key]).slice(0, 5) : next[key];
        if (before !== after) changed[key] = { from: before, to: after };
      }
      if (Object.keys(changed).length === 0) return null;

      await assertNoUncoveredAppointments(tx, current, next);
      await updateScheduleFields(tx, scheduleId, next);
      return { doctor_id: current.doctor_id, ...changed };
    });
  } catch (error) {
    translateOverlap(error);
  }

  if (detail) {
    await auditLog({
      entityType: 'doctor_schedule',
      action: 'schedule_updated',
      entityId: scheduleId,
      actorId,
      branchId: changes.branch_id ?? (await getSchedule(scheduleId)).branch_id,
      detail,
    });
  }
  return getSchedule(scheduleId);
}

// Borra un bloque, si no quedan citas agendadas futuras dentro de él.
export async function removeSchedule(scheduleId: string, actorId: string): Promise<void> {
  const removed = await withTransaction(async (tx) => {
    const current = await findSchedule(scheduleId, tx);
    if (!current) throw new AppError('Bloque de horario no encontrado.', 404);
    await assertNoUncoveredAppointments(tx, current, null);
    await deleteSchedule(tx, scheduleId);
    return current;
  });

  await auditLog({
    entityType: 'doctor_schedule',
    action: 'schedule_deleted',
    entityId: scheduleId,
    actorId,
    branchId: removed.branch_id,
    detail: {
      doctor_id: removed.doctor_id,
      weekday: removed.weekday,
      start_time: removed.start_time.slice(0, 5),
      end_time: removed.end_time.slice(0, 5),
    },
  });
}

// Lanza 409 si el cambio dejaría citas agendadas futuras fuera de todo bloque.
async function assertNoUncoveredAppointments(
  tx: Parameters<typeof countUncoveredAppointments>[0],
  current: ScheduleBlock,
  replacement: ScheduleFields | null,
): Promise<void> {
  const count = await countUncoveredAppointments(tx, current, replacement);
  if (count > 0) {
    throw new AppError(
      `Hay ${count} cita(s) agendada(s) en ese horario. Reprográmelas o cancélelas antes de cambiarlo.`,
      409,
    );
  }
}
