// =============================================================================
// ordenesOptica.ts (servicio)
// Qué hace:     las REGLAS de las órdenes de óptica: listarlas, ver una con su
//               historia, crearla desde una receta y avanzarla de estado.
// Requerimiento: RF-07 y capacidades optical_orders_manage y optical_orders_read.
// Depende de:   modelos/ordenesOptica.ts, modelos/recetas.ts, modelos/pacientes.ts,
//               modelos/consentimientos.ts, modelos/auditoria.ts y
//               utilidades/transaccion.ts.
// Lo usa:       controladores/ordenesOptica.ts.
//
// Reglas:
//   - Crear: hace falta una receta que exista, que sea la VIGENTE (no una que el
//     médico ya reemplazó), de un paciente activo y con consentimiento vigente
//     para la óptica. Sin consentimiento se niega (403) y queda en la bitácora.
//     La orden se crea en la sucursal activa de quien la registra.
//   - Estados: pendiente -> en taller -> lista -> entregada. Se puede cancelar
//     mientras no esté entregada (el motivo es obligatorio). Una orden entregada
//     o cancelada ya no cambia. La base de datos vuelve a comprobar este mapa.
//   - Ver y avanzar: solo las órdenes de las sucursales a las que la persona tiene
//     acceso; las de otras sucursales responden 404 como si no existieran.
//   - Cambiar de estado es una operación atómica: la orden se bloquea mientras se
//     decide, de modo que dos personas no pueden avanzarla a la vez.
//   - Crear y cada cambio de estado quedan en la bitácora, con sucursal.
//   - La orden NO copia las medidas de la receta: guarda solo su vínculo. Quien
//     quiera verlas las pide a la API de recetas, que exige el consentimiento.
// =============================================================================
import type {
  ChangeOpticalOrderStatusInput,
  CreateOpticalOrderInput,
  ListOpticalOrdersQuery,
} from '../esquemas/ordenesOptica';
import { AppError } from '../intermediarios/errores';
import { createAuditEntry } from '../modelos/auditoria';
import { hasActiveConsent } from '../modelos/consentimientos';
import {
  findOpticalOrder,
  insertOpticalOrder,
  listOpticalOrderEvents,
  listOpticalOrders,
  updateOpticalOrderStatus,
  type OpticalOrder,
  type OpticalOrderEvent,
  type OpticalOrderStatus,
} from '../modelos/ordenesOptica';
import { findPatient } from '../modelos/pacientes';
import { findPrescription } from '../modelos/recetas';
import { auditLog } from '../utilidades/auditoria';
import { withTransaction } from '../utilidades/transaccion';

// Quién actúa: usuario, sucursal activa y todas las sucursales a las que tiene acceso.
export interface OrderActor {
  userId: string;
  branchId: string;
  allowedBranchIds: string[];
}

export type OpticalOrderDetail = OpticalOrder & { events: OpticalOrderEvent[] };

// A qué estados se puede pasar desde cada uno. Las órdenes entregadas y
// canceladas son finales (lista vacía).
const NEXT_STATUSES: Record<OpticalOrderStatus, readonly OpticalOrderStatus[]> = {
  pending: ['in_lab', 'cancelled'],
  in_lab: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

// Nombre de cada estado para los mensajes de error.
const STATUS_LABELS: Record<OpticalOrderStatus, string> = {
  pending: 'pendiente',
  in_lab: 'en taller',
  ready: 'lista',
  delivered: 'entregada',
  cancelled: 'cancelada',
};

// Devuelve la orden si la persona puede verla; si no existe o es de una sucursal
// ajena lanza 404 (no se distingue, para no revelar que existe).
function assertVisible(order: OpticalOrder | null, actor: OrderActor): OpticalOrder {
  if (!order || !actor.allowedBranchIds.includes(order.branch_id)) {
    throw new AppError('Orden no encontrada.', 404);
  }
  return order;
}

// Una página de órdenes de las sucursales de la persona.
export async function search(
  query: ListOpticalOrdersQuery,
  actor: OrderActor,
): Promise<{ rows: OpticalOrder[]; total: number }> {
  if (query.branch_id && !actor.allowedBranchIds.includes(query.branch_id)) {
    throw new AppError('No tiene acceso a esa sucursal.', 403);
  }
  return listOpticalOrders(query, actor.allowedBranchIds);
}

// Una orden con su historia de estados.
export async function getOrder(orderId: string, actor: OrderActor): Promise<OpticalOrderDetail> {
  const order = assertVisible(await findOpticalOrder(orderId), actor);
  return { ...order, events: await listOpticalOrderEvents(order.id) };
}

// Crea una orden a partir de una receta. Devuelve la orden creada.
export async function createOrder(input: CreateOpticalOrderInput, actor: OrderActor): Promise<OpticalOrderDetail> {
  const prescription = await findPrescription(input.prescription_id);
  if (!prescription) throw new AppError('Receta no encontrada.', 404);

  const patient = await findPatient(prescription.patient_id);
  if (!patient || !patient.is_active) {
    throw new AppError('No se puede vender a un paciente inactivo.', 409);
  }

  // El consentimiento va ANTES de la vigencia: sin él no se revela nada de la receta.
  if (!(await hasActiveConsent(patient.id))) {
    await createAuditEntry({
      entityType: 'patient',
      action: 'optical_order_denied',
      entityId: patient.id,
      actorId: actor.userId,
      branchId: actor.branchId,
      detail: { reason: 'no_consent', prescription_id: prescription.id },
    });
    throw new AppError('El paciente no ha autorizado que la óptica use su receta.', 403);
  }

  if (!prescription.is_current) {
    throw new AppError('Esa receta fue reemplazada. Use la receta vigente del paciente.', 409);
  }

  const orderId = await withTransaction((tx) =>
    insertOpticalOrder(tx, {
      patientId: patient.id,
      prescriptionId: prescription.id,
      branchId: actor.branchId,
      createdBy: actor.userId,
      frameDescription: input.frame_description,
      lensDescription: input.lens_description,
      totalAmount: input.total_amount,
      depositAmount: input.deposit_amount,
      notes: input.notes,
    }),
  );

  await auditLog({
    entityType: 'optical_order',
    action: 'optical_order_created',
    entityId: orderId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: { patient_id: patient.id, prescription_id: prescription.id },
  });
  return getOrder(orderId, actor);
}

// Cambia el estado de una orden. Devuelve la orden ya cambiada, con su historia.
export async function changeStatus(
  orderId: string,
  input: ChangeOpticalOrderStatusInput,
  actor: OrderActor,
): Promise<OpticalOrderDetail> {
  const previous = await withTransaction(async (tx) => {
    const current = assertVisible(await findOpticalOrder(orderId, tx), actor); // fila bloqueada

    if (!NEXT_STATUSES[current.status].includes(input.status)) {
      throw new AppError(
        `Una orden ${STATUS_LABELS[current.status]} no puede pasar a ${STATUS_LABELS[input.status]}.`,
        409,
      );
    }

    await updateOpticalOrderStatus(tx, {
      orderId: current.id,
      fromStatus: current.status,
      toStatus: input.status,
      reason: input.reason,
      changedBy: actor.userId,
      branchId: actor.branchId,
    });
    return current;
  });

  await auditLog({
    entityType: 'optical_order',
    action: 'optical_order_status_changed',
    entityId: orderId,
    actorId: actor.userId,
    branchId: actor.branchId,
    detail: {
      patient_id: previous.patient_id,
      from: previous.status,
      to: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
  return getOrder(orderId, actor);
}
