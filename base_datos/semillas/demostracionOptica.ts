// =============================================================================
// demostracionOptica.ts (semilla)
// Qué hace:     inserta unos pocos datos FICTICIOS de óptica para que la
//               demostración tenga algo que mostrar: consentimientos, recetas
//               y órdenes de óptica en distintos estados.
// Requerimiento: demostración reproducible (sección 11 del documento de diseño).
// Depende de:   backend/src/configuracion/baseDatos.ts, de las tablas de las
//               migraciones 08, 09 y 10 y de los pacientes y notas que crea
//               demostracionClinica.ts.
// Lo usa:       demostracion.ts (seedDemo), después de la semilla clínica.
//
// Se siembran cinco pacientes, cada uno con un caso distinto:
//   1. Orden pendiente, y el médico después reemplazó la receta (sale la
//      etiqueta "Receta reemplazada").
//   2. Orden en el taller.
//   3. Orden entregada, con toda su historia.
//   4. Orden cancelada, con su motivo (en la sucursal Escalón).
//   5. Orden lista, pero el paciente ya revocó el consentimiento: la óptica
//      ya no puede ver las medidas.
// Los datos se insertan directo en las tablas (no por la API) porque la semilla
// necesita fechas del pasado; las reglas de la API ya las prueban sus pruebas.
// =============================================================================
import { pool } from '../../backend/src/configuracion/baseDatos';

// Medidas de las recetas (cada juego respeta los pasos de 0.25 de la base).
interface DemoMeasures {
  od_sphere: number;
  od_cylinder: number | null;
  od_axis: number | null;
  od_addition: number | null;
  oi_sphere: number;
  oi_cylinder: number | null;
  oi_axis: number | null;
  oi_addition: number | null;
  pupillary_distance: number;
  lens_notes: string | null;
}

const MEASURES: DemoMeasures[] = [
  { od_sphere: -1.5, od_cylinder: -0.5, od_axis: 90, od_addition: null, oi_sphere: -1.25, oi_cylinder: null, oi_axis: null, oi_addition: null, pupillary_distance: 62, lens_notes: 'Antirreflejo recomendado' },
  { od_sphere: 0.75, od_cylinder: null, od_axis: null, od_addition: 1.5, oi_sphere: 1, oi_cylinder: null, oi_axis: null, oi_addition: 1.5, pupillary_distance: 64.5, lens_notes: 'Lentes progresivos' },
  { od_sphere: -3, od_cylinder: -1.25, od_axis: 175, od_addition: null, oi_sphere: -2.75, oi_cylinder: -1, oi_axis: 10, oi_addition: null, pupillary_distance: 60, lens_notes: null },
  { od_sphere: -0.5, od_cylinder: null, od_axis: null, od_addition: null, oi_sphere: -0.75, oi_cylinder: null, oi_axis: null, oi_addition: null, pupillary_distance: 58.5, lens_notes: null },
  { od_sphere: 2, od_cylinder: -0.75, od_axis: 45, od_addition: 2, oi_sphere: 2.25, oi_cylinder: null, oi_axis: null, oi_addition: 2, pupillary_distance: 66, lens_notes: 'Para lectura y computadora' },
];

// Medidas nuevas con las que el médico reemplaza la primera receta.
const REPLACEMENT: DemoMeasures = {
  od_sphere: -1.75, od_cylinder: -0.5, od_axis: 90, od_addition: null,
  oi_sphere: -1.5, oi_cylinder: null, oi_axis: null, oi_addition: null,
  pupillary_distance: 62, lens_notes: 'Graduación corregida en el control',
};

type OrderStatus = 'pending' | 'in_lab' | 'ready' | 'delivered' | 'cancelled';

// Un caso de óptica: a qué paciente (por posición), en qué sucursal se vende
// y cómo está la orden.
interface DemoCase {
  branchCode: string;
  frame: string;
  lens: string;
  total: number;
  deposit: number;
  status: OrderStatus;
  daysAgo: number;               // cuándo se creó la orden
  revokedConsent?: boolean;      // el paciente retiró el consentimiento después
  replacedPrescription?: boolean; // el médico reemplazó la receta después
  cancellationReason?: string;
}

const CASES: DemoCase[] = [
  { branchCode: 'CENTRAL', frame: 'Armazón metálico negro', lens: 'Lentes con antirreflejo', total: 120, deposit: 40, status: 'pending', daysAgo: 0, replacedPrescription: true },
  { branchCode: 'CENTRAL', frame: 'Armazón de acetato carey', lens: 'Lentes progresivos', total: 285.5, deposit: 100, status: 'in_lab', daysAgo: 2 },
  { branchCode: 'CENTRAL', frame: 'Armazón ligero azul', lens: 'Lentes con filtro de luz azul', total: 150, deposit: 150, status: 'delivered', daysAgo: 6 },
  { branchCode: 'ESCALON', frame: 'Armazón al aire plateado', lens: 'Lentes sencillos', total: 95, deposit: 30, status: 'cancelled', daysAgo: 3, cancellationReason: 'El paciente prefirió otro armazón' },
  { branchCode: 'CENTRAL', frame: 'Armazón redondo dorado', lens: 'Lentes para lectura', total: 175, deposit: 75, status: 'ready', daysAgo: 4, revokedConsent: true },
];

// Quién registra cada orden y quién atiende el consentimiento, por sucursal.
const OPTICAL_STAFF: Record<string, string> = {
  CENTRAL: 'optica.central@candray.test',
  ESCALON: 'optica.escalon@candray.test',
};
const RECEPTIONIST: Record<string, string> = {
  CENTRAL: 'recepcion.central@candray.test',
  ESCALON: 'recepcion.escalon@candray.test',
};

// Estados por los que pasó una orden hasta llegar al actual.
const PATH: Record<OrderStatus, OrderStatus[]> = {
  pending: ['pending'],
  in_lab: ['pending', 'in_lab'],
  ready: ['pending', 'in_lab', 'ready'],
  delivered: ['pending', 'in_lab', 'ready', 'delivered'],
  cancelled: ['pending', 'cancelled'],
};

export interface OpticalSummary {
  consents: number;
  revokedConsents: number;
  prescriptions: number;
  orders: number;
}

// Una nota original (sin enmienda) de un paciente: de ahí sale su receta.
interface SourceNote {
  patientId: string;
  recordId: string;
  doctorId: string;
  branchId: string;
}

// Inserta una receta con sus medidas, emitida hace `daysAgo` días. Devuelve su id.
async function insertDemoPrescription(
  note: SourceNote,
  measures: DemoMeasures,
  supersedesId: string | null,
  daysAgo: number,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO prescriptions
       (patient_id, doctor_id, branch_id, record_id, supersedes_id,
        od_sphere, od_cylinder, od_axis, od_addition,
        oi_sphere, oi_cylinder, oi_axis, oi_addition,
        pupillary_distance, lens_notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             (now() AT TIME ZONE 'America/El_Salvador') - ($16 || ' days')::interval)
     RETURNING id`,
    [
      note.patientId, note.doctorId, note.branchId, note.recordId, supersedesId,
      measures.od_sphere, measures.od_cylinder, measures.od_axis, measures.od_addition,
      measures.oi_sphere, measures.oi_cylinder, measures.oi_axis, measures.oi_addition,
      measures.pupillary_distance, measures.lens_notes, daysAgo,
    ],
  );
  return result.rows[0].id;
}

// Siembra consentimientos, recetas y órdenes de óptica.
// `patientIds`: pacientes de la semilla clínica. `branchIds` y `userIds`: ids por
// código de sucursal y por correo. Devuelve cuántos datos creó (puede ser menos
// que los casos si algún paciente no tiene una nota de consulta).
export async function seedOpticalDemo(
  patientIds: string[],
  branchIds: Map<string, string>,
  userIds: Map<string, string>,
): Promise<OpticalSummary> {
  const idOf = (map: Map<string, string>, key: string): string => {
    const id = map.get(key);
    if (id === undefined) throw new Error(`La semilla de óptica no encontró "${key}".`);
    return id;
  };

  // Una receta nace de una consulta: se toma la primera nota original de cada paciente.
  const notes = await pool.query<{ patient_id: string; record_id: string; doctor_id: string; branch_id: string }>(
    `SELECT DISTINCT ON (patient_id)
            patient_id, id AS record_id, doctor_id, branch_id
       FROM medical_records
      WHERE patient_id = ANY($1::uuid[]) AND amends_id IS NULL
      ORDER BY patient_id, created_at, id`,
    [patientIds],
  );
  const noteOf = new Map(notes.rows.map((row) => [
    row.patient_id,
    { patientId: row.patient_id, recordId: row.record_id, doctorId: row.doctor_id, branchId: row.branch_id },
  ]));
  // Se respeta el orden de los pacientes de la semilla, para que el resultado sea siempre igual.
  const available = patientIds.flatMap((id) => (noteOf.has(id) ? [noteOf.get(id)!] : []));

  const summary: OpticalSummary = { consents: 0, revokedConsents: 0, prescriptions: 0, orders: 0 };

  for (const [index, demoCase] of CASES.entries()) {
    const note = available[index];
    if (note === undefined) break;
    const branchId = idOf(branchIds, demoCase.branchCode);
    const seller = idOf(userIds, OPTICAL_STAFF[demoCase.branchCode]);
    const receptionist = idOf(userIds, RECEPTIONIST[demoCase.branchCode]);

    // 1) Consentimiento: lo registra recepción; en un caso el paciente lo retira después.
    const consent = await pool.query<{ id: string }>(
      `INSERT INTO consents (patient_id, granted_by, note, created_at)
       VALUES ($1, $2, $3, (now() AT TIME ZONE 'America/El_Salvador') - ($4 || ' days')::interval)
       RETURNING id`,
      [note.patientId, receptionist, 'Autoriza que la óptica use su receta', demoCase.daysAgo + 1],
    );
    summary.consents += 1;
    if (demoCase.revokedConsent) {
      await pool.query(
        `UPDATE consents
            SET revoked_at = (now() AT TIME ZONE 'America/El_Salvador'), revoked_by = $2
          WHERE id = $1`,
        [consent.rows[0].id, receptionist],
      );
      summary.revokedConsents += 1;
    }

    // 2) Receta (y su reemplazo, si el caso lo pide).
    const prescriptionId = await insertDemoPrescription(note, MEASURES[index], null, demoCase.daysAgo + 1);
    summary.prescriptions += 1;
    if (demoCase.replacedPrescription) {
      // El reemplazo es de hoy: el médico corrigió la receta después de la venta.
      await insertDemoPrescription(note, REPLACEMENT, prescriptionId, 0);
      summary.prescriptions += 1;
    }

    // 3) Orden. Se inserta ya en su estado final; la base solo vigila los CAMBIOS
    //    de estado, no la inserción.
    const order = await pool.query<{ id: string }>(
      `INSERT INTO optical_orders
         (patient_id, prescription_id, branch_id, created_by, frame_description,
          lens_description, total_amount, deposit_amount, status, cancellation_reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               (now() AT TIME ZONE 'America/El_Salvador') - ($11 || ' days')::interval)
       RETURNING id`,
      [
        note.patientId, prescriptionId, branchId, seller, demoCase.frame, demoCase.lens,
        demoCase.total, demoCase.deposit, demoCase.status,
        demoCase.cancellationReason ?? null, demoCase.daysAgo,
      ],
    );
    summary.orders += 1;

    // 4) Historia de la orden: un evento por cada estado, con un par de horas de diferencia.
    const path = PATH[demoCase.status];
    for (const [step, to] of path.entries()) {
      await pool.query(
        `INSERT INTO optical_order_events (order_id, from_status, to_status, changed_by, branch_id, created_at)
         VALUES ($1, $2, $3, $4, $5,
                 (now() AT TIME ZONE 'America/El_Salvador') - ($6 || ' days')::interval + ($7 || ' hours')::interval)`,
        [order.rows[0].id, step === 0 ? null : path[step - 1], to, seller, branchId, demoCase.daysAgo, step * 2],
      );
    }
  }
  return summary;
}
