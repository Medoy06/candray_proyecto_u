// =============================================================================
// formularioReceta.ts
// Qué hace:     la lógica SIN pantalla del formulario de recetas: los valores del
//               formulario (texto, como se escriben), su validación y el armado
//               del cuerpo que se envía. Sirve para emitir y para reemplazar.
// Depende de:   configuracion/negocio.ts y servicios/recetas.ts (solo los tipos).
// Lo usan:      paginas/expediente/FormularioReceta.tsx.
//
// Las reglas son las mismas que valida el servidor y la base de datos (migración 09):
// aquí se revisan antes para avisar sin esperar la respuesta, pero decide el servidor.
//   - Esfera, cilindro y adición van de 0.25 en 0.25; la distancia pupilar, de 0.5 en 0.5.
//   - Un ojo con datos necesita esfera (puede ser 0).
//   - El eje se escribe si y solo si hay cilindro distinto de 0.
//   - Se mide al menos un ojo.
// Se acepta la coma como separador decimal ("-1,25") y un número sin cero inicial (".5").
// =============================================================================
import { PRESCRIPTION_LIMITS } from '../../configuracion/negocio';
import type { PrescriptionMeasures } from '../../servicios/recetas';

export interface EyeValues {
  sphere: string;
  cylinder: string;
  axis: string;
  addition: string;
}

export interface PrescriptionFormValues {
  od: EyeValues; // ojo derecho
  oi: EyeValues; // ojo izquierdo
  pupillaryDistance: string;
  lensNotes: string;
}

export type Eye = 'od' | 'oi';

const EMPTY_EYE: EyeValues = { sphere: '', cylinder: '', axis: '', addition: '' };
export const EMPTY_PRESCRIPTION_FORM: PrescriptionFormValues = {
  od: EMPTY_EYE,
  oi: EMPTY_EYE,
  pupillaryDistance: '',
  lensNotes: '',
};

const EYE_NAME: Record<Eye, string> = { od: 'derecho', oi: 'izquierdo' };

const toText = (value: number | null): string => (value === null ? '' : String(value));

// Los valores de partida de un reemplazo: las medidas de la receta que se corrige,
// para que la persona cambie solo lo que haga falta.
export function formFromPrescription(prescription: PrescriptionMeasures): PrescriptionFormValues {
  return {
    od: {
      sphere: toText(prescription.od_sphere),
      cylinder: toText(prescription.od_cylinder),
      axis: toText(prescription.od_axis),
      addition: toText(prescription.od_addition),
    },
    oi: {
      sphere: toText(prescription.oi_sphere),
      cylinder: toText(prescription.oi_cylinder),
      axis: toText(prescription.oi_axis),
      addition: toText(prescription.oi_addition),
    },
    pupillaryDistance: toText(prescription.pupillary_distance),
    lensNotes: prescription.lens_notes ?? '',
  };
}

// Texto -> número. Vacío = null (sin dato). Algo que no es un número = NaN.
function parseNumber(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean) ? Number(clean) : Number.NaN;
}

// ¿El valor cae en la cuadrícula de "step" (0.25, 0.5)? Con margen por los decimales de la computadora.
const isOnStep = (value: number, step: number): boolean => Math.abs(value / step - Math.round(value / step)) < 1e-9;

// Un problema de rango o de paso, o '' si el valor está bien.
function checkMeasure(label: string, value: number, min: number, max: number, step: number): string {
  if (value < min || value > max || !isOnStep(value, step)) {
    return `${label} debe estar entre ${min} y ${max}, de ${step} en ${step}.`;
  }
  return '';
}

// Valida los datos de un ojo. Devuelve el primer problema, o ''.
function validateEye(eye: Eye, values: EyeValues): string {
  const name = EYE_NAME[eye];
  const sphere = parseNumber(values.sphere);
  const cylinder = parseNumber(values.cylinder);
  const axis = parseNumber(values.axis);
  const addition = parseNumber(values.addition);

  const typed: [string, number | null][] = [['La esfera', sphere], ['El cilindro', cylinder], ['El eje', axis], ['La adición', addition]];
  for (const [label, value] of typed) {
    if (value !== null && Number.isNaN(value)) return `${label} del ojo ${name} debe ser un número.`;
  }

  const hasData = cylinder !== null || axis !== null || addition !== null;
  if (sphere === null) return hasData ? `Indique la esfera del ojo ${name} (puede ser 0).` : '';

  const { sphere: S, cylinder: C, axis: A, addition: D } = PRESCRIPTION_LIMITS;
  const sphereProblem = checkMeasure(`La esfera del ojo ${name}`, sphere, S.min, S.max, 0.25);
  if (sphereProblem !== '') return sphereProblem;
  if (cylinder !== null) {
    const problem = checkMeasure(`El cilindro del ojo ${name}`, cylinder, C.min, C.max, 0.25);
    if (problem !== '') return problem;
  }
  if (addition !== null) {
    const problem = checkMeasure(`La adición del ojo ${name}`, addition, D.min, D.max, 0.25);
    if (problem !== '') return problem;
  }
  if (axis !== null && (!Number.isInteger(axis) || axis < A.min || axis > A.max)) {
    return `El eje del ojo ${name} debe ser un número entero entre ${A.min} y ${A.max}.`;
  }

  const hasCylinder = cylinder !== null && cylinder !== 0;
  if (hasCylinder && axis === null) return `Indique el eje del ojo ${name}: tiene cilindro.`;
  if (!hasCylinder && axis !== null) return `El ojo ${name} no lleva eje sin cilindro.`;
  return '';
}

// Devuelve el primer problema encontrado como mensaje, o '' si todo está bien.
export function validatePrescriptionForm(values: PrescriptionFormValues): string {
  const odProblem = validateEye('od', values.od);
  if (odProblem !== '') return odProblem;
  const oiProblem = validateEye('oi', values.oi);
  if (oiProblem !== '') return oiProblem;
  if (parseNumber(values.od.sphere) === null && parseNumber(values.oi.sphere) === null) {
    return 'Indique las medidas de al menos un ojo.';
  }

  const distance = parseNumber(values.pupillaryDistance);
  if (distance !== null) {
    if (Number.isNaN(distance)) return 'La distancia pupilar debe ser un número.';
    const { min, max } = PRESCRIPTION_LIMITS.pupillaryDistance;
    const problem = checkMeasure('La distancia pupilar', distance, min, max, 0.5);
    if (problem !== '') return problem;
  }

  if (values.lensNotes.trim().length > PRESCRIPTION_LIMITS.lensNotesMaxLength) {
    return `La nota para el taller no puede pasar de ${PRESCRIPTION_LIMITS.lensNotesMaxLength} caracteres.`;
  }
  return '';
}

// El cuerpo que se envía (las medidas). Lo que se dejó vacío va como null.
// Se arma solo después de validar, por eso los números ya son válidos.
export function buildPrescriptionMeasures(values: PrescriptionFormValues): PrescriptionMeasures {
  const notes = values.lensNotes.trim();
  return {
    od_sphere: parseNumber(values.od.sphere),
    od_cylinder: parseNumber(values.od.cylinder),
    od_axis: parseNumber(values.od.axis),
    od_addition: parseNumber(values.od.addition),
    oi_sphere: parseNumber(values.oi.sphere),
    oi_cylinder: parseNumber(values.oi.cylinder),
    oi_axis: parseNumber(values.oi.axis),
    oi_addition: parseNumber(values.oi.addition),
    pupillary_distance: parseNumber(values.pupillaryDistance),
    lens_notes: notes === '' ? null : notes,
  };
}
