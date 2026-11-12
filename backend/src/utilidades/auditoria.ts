// =============================================================================
// auditoria.ts (utilidad)
// Qué hace:     función auditLog() que registra un evento en la bitácora SIN
//               nunca hacer fallar la operación que se está registrando.
// Requerimiento: bitácora de auditoría (sección 10 del documento de diseño).
// Depende de:   modelos/auditoria.ts.
// Lo usan:      todos los controladores y utilidades que dejan huella.
//
// Por qué se traga los errores: la auditoría es secundaria respecto a la acción
// que registra. Si crear un paciente funcionó pero el registro de auditoría
// falló un instante, el usuario no debe ver un error de "crear paciente". El
// fallo se escribe en la consola del servidor para que se pueda investigar.
//
// EXCEPCIÓN consciente: las operaciones donde la auditoría ES el requisito
// (por ejemplo, negar acceso a un paciente) deben tratar el fallo como error y
// llamar directamente a createAuditEntry.
// =============================================================================
import { createAuditEntry, type CreateAuditInput } from '../modelos/auditoria';

// Registra un evento de auditoría de forma tolerante a fallos.
// Recibe: los datos del evento.
// Devuelve: nada. Nunca lanza error.
export async function auditLog(input: CreateAuditInput): Promise<void> {
  try {
    await createAuditEntry(input);
  } catch (error) {
    console.error('[auditoría] no se pudo escribir la entrada:', error, input);
  }
}

export type { CreateAuditInput } from '../modelos/auditoria';
