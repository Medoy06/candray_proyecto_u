// =============================================================================
// gestionUsuarios.ts (servicio)
// Qué hace:     las REGLAS de la administración de usuarios: qué se puede y qué
//               no se puede hacer, y que cada cambio quede en la auditoría.
// Requerimiento: capacidad users_manage (sección 7 del documento de diseño).
// Depende de:   modelos/gestionUsuarios.ts, utilidades/transaccion.ts y
//               utilidades/auditoria.ts.
// Lo usa:       controladores/usuarios.ts.
//
// Reglas que se aplican aquí (el modelo solo ejecuta SQL):
//   1. Nadie puede cambiarse su propio rol ni desactivarse a sí mismo
//      (evita que un administrador se quite el acceso por accidente).
//   2. Siempre debe quedar al menos un administrador activo.
//   3. Los roles que trabajan en una sucursal (todos menos administrador y
//      directivo) necesitan al menos una sucursal asignada.
//   4. Las contraseñas nunca se guardan en la auditoría.
//
// Cada función que modifica datos usa una transacción: si algo falla a la
// mitad, no queda un usuario a medio crear.
// =============================================================================
import type { Role } from '../configuracion/roles';
import type {
  CreateUserInput,
  SetUserBranchesInput,
  UpdateUserInput,
} from '../esquemas/usuarios';
import { seesAllBranches } from '../intermediarios/alcanceSucursal';
import { AppError } from '../intermediarios/errores';
import { pool } from '../configuracion/baseDatos';
import {
  clearAccountLock,
  countExistingBranches,
  countUserBranches,
  findManagedUser,
  hashPassword,
  insertUser,
  listActiveAdminIds,
  lockUser,
  replaceUserBranches,
  setPasswordHash,
  updateUserFields,
  type ManagedUser,
} from '../modelos/gestionUsuarios';
import { auditLog } from '../utilidades/auditoria';
import { withTransaction } from '../utilidades/transaccion';

// Número del candado que serializa los cambios que pueden quitar un
// administrador. Distinto del de las migraciones (727001).
const ADMIN_GUARD_LOCK_KEY = 727002;

// ¿Este rol necesita sucursales asignadas para poder trabajar?
// Es lo contrario de "ve todas las sucursales" (administrador y directivo).
export function requiresBranchAssignment(role: Role): boolean {
  return !seesAllBranches(role);
}

// Regla 2: no se puede quitar al último administrador activo.
// Recibe: ids de los administradores activos y el id de quien dejaría de serlo.
// Lanza error 409 si, sin esa persona, no quedaría ninguno.
// Es una función pura (sin base de datos) para poder probarla sola.
export function assertAdminRemains(activeAdminIds: string[], leavingId: string): void {
  const remaining = activeAdminIds.filter((id) => id !== leavingId);
  if (remaining.length === 0) {
    throw new AppError('Debe quedar al menos un administrador activo.', 409);
  }
}

// Comprueba que las sucursales indicadas existan, para dar un mensaje claro en
// lugar del error genérico de la base de datos.
async function assertBranchesExist(branchIds: string[]): Promise<void> {
  if (branchIds.length === 0) return;
  if ((await countExistingBranches(pool, branchIds)) !== branchIds.length) {
    throw new AppError('Alguna de las sucursales indicadas no existe.', 400);
  }
}

// Devuelve un usuario o lanza 404.
async function getUserOr404(userId: string): Promise<ManagedUser> {
  const user = await findManagedUser(pool, userId);
  if (!user) throw new AppError('Usuario no encontrado.', 404);
  return user;
}

export { getUserOr404 as getUser };

// Crea un usuario con sus sucursales.
// Recibe: los datos validados y el id de quien lo crea (para la auditoría).
// Devuelve: el usuario creado. Lanza 409 si el correo ya está registrado.
export async function createManagedUser(
  input: CreateUserInput,
  actorId: string,
): Promise<ManagedUser> {
  if (requiresBranchAssignment(input.role) && input.branch_ids.length === 0) {
    throw new AppError('Este rol necesita al menos una sucursal asignada.', 400);
  }
  await assertBranchesExist(input.branch_ids);

  // El hash se calcula ANTES de abrir la transacción: bcrypt es lento a
  // propósito y no conviene mantener una conexión de la base ocupada mientras.
  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    userId = await withTransaction(async (tx) => {
      const id = await insertUser(tx, {
        full_name: input.full_name,
        email: input.email,
        password_hash: passwordHash,
        role: input.role,
      });
      await replaceUserBranches(tx, id, input.branch_ids, input.default_branch_id);
      return id;
    });
  } catch (error) {
    // 23505 = valor único repetido: aquí solo puede ser el correo.
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('Ya existe un usuario con ese correo.', 409);
    }
    throw error;
  }

  await auditLog({
    entityType: 'user',
    action: 'user_created',
    entityId: userId,
    actorId,
    detail: { email: input.email.toLowerCase(), role: input.role, branch_ids: input.branch_ids },
  });
  return getUserOr404(userId);
}

// Modifica nombre, rol y/o estado (activo/inactivo) de un usuario.
// Recibe: id del usuario, los cambios y el id de quien los hace.
// Devuelve: el usuario ya modificado.
export async function updateManagedUser(
  userId: string,
  changes: UpdateUserInput,
  actorId: string,
): Promise<ManagedUser> {
  const applied = await withTransaction(async (tx) => {
    // Candado: dos cambios simultáneos que podrían quitar administradores se
    // atienden uno por uno. Sin él, dos administradores que se desactivan entre
    // sí al mismo tiempo podrían dejar el sistema sin ninguno. Se suelta solo al
    // terminar la transacción.
    await tx.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_GUARD_LOCK_KEY]);

    const current = await lockUser(tx, userId);
    if (!current) throw new AppError('Usuario no encontrado.', 404);

    const newRole = changes.role ?? current.role;
    const newActive = changes.is_active ?? current.is_active;
    const roleChanged = newRole !== current.role;
    const activeChanged = newActive !== current.is_active;
    const nameChanged = changes.full_name !== undefined && changes.full_name !== current.full_name;

    // Regla 1: ni rol propio ni auto-desactivación.
    if (userId === actorId && (roleChanged || (activeChanged && !newActive))) {
      throw new AppError('No puede cambiar su propio rol ni desactivar su propia cuenta.', 403);
    }

    // Regla 2: no quitar al último administrador activo.
    const stopsBeingActiveAdmin =
      current.role === 'admin' && current.is_active && (roleChanged || !newActive);
    if (stopsBeingActiveAdmin) {
      assertAdminRemains(await listActiveAdminIds(tx), userId);
    }

    // Regla 3: un rol que trabaja en sucursales no puede quedar sin ninguna.
    if (roleChanged && requiresBranchAssignment(newRole) && (await countUserBranches(tx, userId)) === 0) {
      throw new AppError('Asigne al menos una sucursal al usuario antes de darle ese rol.', 400);
    }

    if (!nameChanged && !roleChanged && !activeChanged) return null; // nada que cambiar

    await updateUserFields(tx, userId, {
      full_name: nameChanged ? changes.full_name : undefined,
      role: roleChanged ? newRole : undefined,
      is_active: activeChanged ? newActive : undefined,
    });

    // Solo se registra lo que realmente cambió, con el valor anterior y el nuevo.
    const detail: Record<string, unknown> = {};
    if (nameChanged) detail.full_name = { from: current.full_name, to: changes.full_name };
    if (roleChanged) detail.role = { from: current.role, to: newRole };
    if (activeChanged) detail.is_active = { from: current.is_active, to: newActive };
    return detail;
  });

  if (applied) {
    await auditLog({ entityType: 'user', action: 'user_updated', entityId: userId, actorId, detail: applied });
  }
  return getUserOr404(userId);
}

// Reemplaza las sucursales asignadas a un usuario.
// Recibe: id del usuario, la nueva lista (con la predeterminada) y quién lo hace.
// Devuelve: el usuario con sus sucursales nuevas.
export async function setManagedUserBranches(
  userId: string,
  input: SetUserBranchesInput,
  actorId: string,
): Promise<ManagedUser> {
  await assertBranchesExist(input.branch_ids);

  await withTransaction(async (tx) => {
    const current = await lockUser(tx, userId);
    if (!current) throw new AppError('Usuario no encontrado.', 404);
    if (requiresBranchAssignment(current.role) && input.branch_ids.length === 0) {
      throw new AppError('Este rol necesita al menos una sucursal asignada.', 400);
    }
    await replaceUserBranches(tx, userId, input.branch_ids, input.default_branch_id);
  });

  await auditLog({
    entityType: 'user',
    action: 'user_branches_updated',
    entityId: userId,
    actorId,
    detail: { branch_ids: input.branch_ids, default_branch_id: input.default_branch_id ?? input.branch_ids[0] ?? null },
  });
  return getUserOr404(userId);
}

// Quita el bloqueo de una cuenta (por ejemplo, tras demasiados intentos fallidos).
export async function unlockManagedUser(userId: string, actorId: string): Promise<ManagedUser> {
  await getUserOr404(userId);
  await clearAccountLock(pool, userId);
  await auditLog({ entityType: 'user', action: 'user_unlocked', entityId: userId, actorId });
  return getUserOr404(userId);
}

// Asigna una contraseña nueva a un usuario (también levanta su bloqueo).
// La contraseña NO se registra en la auditoría, solo el hecho de que cambió.
export async function resetManagedUserPassword(
  userId: string,
  password: string,
  actorId: string,
): Promise<void> {
  await getUserOr404(userId);
  await setPasswordHash(pool, userId, await hashPassword(password));
  await auditLog({ entityType: 'user', action: 'user_password_reset', entityId: userId, actorId });
}
