// =============================================================================
// usuarios.ts (controlador)
// Qué hace:     recibe las peticiones de administración de usuarios, llama al
//               servicio y arma la respuesta HTTP.
// Depende de:   servicios/gestionUsuarios.ts y modelos/gestionUsuarios.ts.
// Lo usa:       rutas/usuarios.ts.
//
// Aquí no hay reglas de negocio (están en el servicio) ni SQL (está en el
// modelo). Quién hace la acción (req.user) sale SIEMPRE del token, nunca del
// cuerpo de la petición. Todas las respuestas llevan { success, data }.
// =============================================================================
import type { Request, Response } from 'express';
import type { ListUsersQuery } from '../esquemas/usuarios';
import { listManagedUsers } from '../modelos/gestionUsuarios';
import { pool } from '../configuracion/baseDatos';
import {
  createManagedUser,
  getUser,
  resetManagedUserPassword,
  setManagedUserBranches,
  unlockManagedUser,
  updateManagedUser,
} from '../servicios/gestionUsuarios';

// GET /api/usuarios?role=&is_active=&search=
export async function listUsers(_req: Request, res: Response): Promise<void> {
  // validateQuery dejó los filtros ya limpios en res.locals.query.
  const filters = res.locals.query as ListUsersQuery;
  res.json({ success: true, data: await listManagedUsers(pool, filters) });
}

// GET /api/usuarios/:id
export async function getUserById(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getUser(String(req.params.id)) });
}

// POST /api/usuarios
export async function createUserHandler(req: Request, res: Response): Promise<void> {
  const user = await createManagedUser(req.body, req.user!.userId);
  res.status(201).json({ success: true, data: user });
}

// PATCH /api/usuarios/:id   (nombre, rol y/o estado)
export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const user = await updateManagedUser(String(req.params.id), req.body, req.user!.userId);
  res.json({ success: true, data: user });
}

// PUT /api/usuarios/:id/sucursales   (reemplaza la lista completa)
export async function setUserBranchesHandler(req: Request, res: Response): Promise<void> {
  const user = await setManagedUserBranches(String(req.params.id), req.body, req.user!.userId);
  res.json({ success: true, data: user });
}

// POST /api/usuarios/:id/desbloquear
export async function unlockUserHandler(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await unlockManagedUser(String(req.params.id), req.user!.userId) });
}

// PUT /api/usuarios/:id/contrasena
export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  await resetManagedUserPassword(String(req.params.id), req.body.password, req.user!.userId);
  res.json({ success: true, message: 'Contraseña actualizada.' });
}
