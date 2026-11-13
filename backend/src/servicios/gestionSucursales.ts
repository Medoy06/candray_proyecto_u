// =============================================================================
// gestionSucursales.ts (servicio)
// Qué hace:     las REGLAS de la administración de sucursales y su auditoría.
// Requerimiento: capacidad branches_manage (sección 7 del documento de diseño).
// Depende de:   modelos/gestionSucursales.ts, utilidades/transaccion.ts y
//               utilidades/auditoria.ts.
// Lo usa:       controladores/sucursales.ts.
//
// Reglas:
//   - El horario de apertura debe ser anterior al de cierre. Se revisa también
//     al modificar solo uno de los dos, comparando con el valor guardado.
//   - El código no cambia nunca después de crear la sucursal.
//   - Una sucursal no se borra: se desactiva. Desactivarla la quita del
//     selector de sucursal de todos; las asignaciones de los usuarios se
//     conservan por si se reactiva.
// =============================================================================
import type { CreateBranchInput, UpdateBranchInput } from '../esquemas/sucursales';
import { AppError } from '../intermediarios/errores';
import {
  findManagedBranch,
  insertBranch,
  updateBranchFields,
  type BranchFields,
  type ManagedBranch,
} from '../modelos/gestionSucursales';
import { auditLog } from '../utilidades/auditoria';
import { withTransaction } from '../utilidades/transaccion';

// La base devuelve "08:00:00"; el cliente escribe "08:00". Se comparan como HH:MM.
const toHourMinute = (time: string): string => time.slice(0, 5);

// Lanza 400 si la apertura no es anterior al cierre.
function assertValidSchedule(opening: string, closing: string): void {
  if (toHourMinute(opening) >= toHourMinute(closing)) {
    throw new AppError('La hora de apertura debe ser anterior a la de cierre.', 400);
  }
}

// Devuelve una sucursal o lanza 404.
export async function getBranch(branchId: string): Promise<ManagedBranch> {
  const branch = await findManagedBranch(branchId);
  if (!branch) throw new AppError('Sucursal no encontrada.', 404);
  return branch;
}

// Crea una sucursal. Lanza 409 si el código ya existe.
export async function createBranch(input: CreateBranchInput, actorId: string): Promise<ManagedBranch> {
  assertValidSchedule(input.opening_time, input.closing_time);

  let branchId: string;
  try {
    branchId = await insertBranch(input.code, {
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      opening_time: input.opening_time,
      closing_time: input.closing_time,
      theme_color: input.theme_color,
      has_optical_counter: input.has_optical_counter,
      is_active: input.is_active,
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('Ya existe una sucursal con ese código.', 409);
    }
    throw error;
  }

  await auditLog({
    entityType: 'branch',
    action: 'branch_created',
    entityId: branchId,
    actorId,
    detail: { code: input.code, name: input.name },
  });
  return getBranch(branchId);
}

// Modifica una sucursal (solo los campos enviados).
// Recibe: id, cambios y quién los hace. Devuelve la sucursal ya modificada.
export async function updateBranch(
  branchId: string,
  changes: UpdateBranchInput,
  actorId: string,
): Promise<ManagedBranch> {
  const detail = await withTransaction(async (tx) => {
    const current = await findManagedBranch(branchId, tx); // con la fila bloqueada
    if (!current) throw new AppError('Sucursal no encontrada.', 404);

    // Valor final de cada campo: el enviado, o el que ya tenía.
    const next: BranchFields = {
      name: changes.name ?? current.name,
      address: changes.address !== undefined ? changes.address : current.address,
      phone: changes.phone !== undefined ? changes.phone : current.phone,
      opening_time: changes.opening_time ?? current.opening_time,
      closing_time: changes.closing_time ?? current.closing_time,
      theme_color: changes.theme_color ?? current.theme_color,
      has_optical_counter: changes.has_optical_counter ?? current.has_optical_counter,
      is_active: changes.is_active ?? current.is_active,
    };
    assertValidSchedule(next.opening_time, next.closing_time);

    // Se registran solo los campos que de verdad cambiaron.
    const changed: Record<string, unknown> = {};
    for (const key of Object.keys(next) as (keyof BranchFields)[]) {
      const before = key.endsWith('_time') ? toHourMinute(String(current[key])) : current[key];
      const after = key.endsWith('_time') ? toHourMinute(String(next[key])) : next[key];
      if (before !== after) changed[key] = { from: before, to: after };
    }
    if (Object.keys(changed).length === 0) return null;

    await updateBranchFields(tx, branchId, next);
    return changed;
  });

  if (detail) {
    await auditLog({ entityType: 'branch', action: 'branch_updated', entityId: branchId, actorId, detail });
  }
  return getBranch(branchId);
}
