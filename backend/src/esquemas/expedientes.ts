// =============================================================================
// expedientes.ts (esquema)
// Qué hace:     define la forma de lo que el cliente envía al consultar el
//               expediente de un paciente, al escribir una nota y al enmendarla.
// Depende de:   zod.
// Lo usan:      rutas/expedientes.ts (a través de validate y validateQuery).
//
// Quién escribe la nota, en qué sucursal y cuándo NO se envía: sale del token y
// de la sucursal activa, nunca del cuerpo de la petición. Zod descarta lo que
// el esquema no declara, así que un cuerpo con doctor_id o branch_id falsos
// simplemente se ignora.
// =============================================================================
import { z } from 'zod';

// Un texto vacío o solo espacios significa "sin dato" en los campos opcionales.
const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

// Los límites coinciden con los de la tabla medical_records (migración 06).
const diagnosisSchema = z.string().trim().min(1, 'El diagnóstico es obligatorio').max(2000, 'Máximo 2000 caracteres');
const treatmentSchema = z.preprocess(emptyToNull, z.string().trim().max(2000, 'Máximo 2000 caracteres').nullable());
const notesSchema = z.preprocess(emptyToNull, z.string().trim().max(4000, 'Máximo 4000 caracteres').nullable());

// Nota original: nace de una consulta, por eso lleva el id de la cita.
export const CreateRecordSchema = z.object({
  appointment_id: z.string().uuid('La cita no es válida'),
  diagnosis: diagnosisSchema,
  treatment: treatmentSchema.optional(),
  notes: notesSchema.optional(),
});

// Enmienda: corrige o completa una nota anterior. Repite los campos completos
// (no es un parche), porque la enmienda se lee como una nota más del historial.
export const AmendRecordSchema = z.object({
  diagnosis: diagnosisSchema,
  treatment: treatmentSchema.optional(),
  notes: notesSchema.optional(),
});

// Paginación del historial (viene en la URL, como texto).
export const ListRecordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateRecordInput = z.infer<typeof CreateRecordSchema>;
export type AmendRecordInput = z.infer<typeof AmendRecordSchema>;
export type ListRecordsQuery = z.infer<typeof ListRecordsQuerySchema>;
