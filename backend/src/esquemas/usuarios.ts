// =============================================================================
// usuarios.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al administrar
//               usuarios (crear, modificar, sucursales, contraseña, filtros).
// Depende de:   zod, configuracion/roles.ts y negocio.ts.
// Lo usan:      rutas/usuarios.ts (a través de validate / validateQuery).
//
// Zod elimina los campos que no se declaran: aunque el cliente mande
// "password_hash" o "failed_login_attempts", nunca llegan al controlador.
// =============================================================================
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../configuracion/negocio';
import { ROLES } from '../configuracion/roles';

const roleSchema = z.enum(ROLES);

// Máximo 128: bcrypt solo usa 72 bytes y no conviene aceptar textos enormes.
const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(128, 'La contraseña es demasiado larga');

// Lista de ids de sucursal: máximo 50 (nadie trabaja en más) y sin repetir.
const branchIdsSchema = z
  .array(z.string().uuid('Id de sucursal inválido'))
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, 'Hay sucursales repetidas');

// Comprueba que la sucursal predeterminada esté en la lista.
function defaultBranchIsInList(data: { branch_ids: string[]; default_branch_id?: string }): boolean {
  if (data.default_branch_id === undefined) return true;
  return data.branch_ids.includes(data.default_branch_id);
}
const DEFAULT_BRANCH_MESSAGE = {
  message: 'La sucursal predeterminada debe estar entre las asignadas',
  path: ['default_branch_id'],
};

export const CreateUserSchema = z
  .object({
    full_name: z.string().trim().min(2, 'El nombre es muy corto').max(255),
    email: z.string().trim().email('Correo electrónico inválido').max(255),
    password: passwordSchema,
    role: roleSchema,
    branch_ids: branchIdsSchema.default([]),
    default_branch_id: z.string().uuid().optional(),
  })
  .refine(defaultBranchIsInList, DEFAULT_BRANCH_MESSAGE);

export const UpdateUserSchema = z
  .object({
    full_name: z.string().trim().min(2, 'El nombre es muy corto').max(255).optional(),
    role: roleSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Indique al menos un campo para modificar',
  });

export const SetUserBranchesSchema = z
  .object({
    branch_ids: branchIdsSchema,
    default_branch_id: z.string().uuid().optional(),
  })
  .refine(defaultBranchIsInList, DEFAULT_BRANCH_MESSAGE);

export const ResetPasswordSchema = z.object({ password: passwordSchema });

// Filtros del listado (vienen en la URL, así que todo llega como texto).
export const ListUsersQuerySchema = z.object({
  role: roleSchema.optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type SetUserBranchesInput = z.infer<typeof SetUserBranchesSchema>;
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
