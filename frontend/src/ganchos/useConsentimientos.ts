// =============================================================================
// useConsentimientos.ts
// Qué hace:     carga el historial de consentimientos de un paciente y lo
//               recarga con reload().
// Depende de:   ganchos/useCarga.ts y servicios/consentimientos.ts.
// Lo usa:       paginas/pacientes/ModalConsentimiento.tsx.
// =============================================================================
import { listConsents } from '../servicios/consentimientos';
import { useCarga } from './useCarga';

export function useConsentimientos(patientId: string) {
  return useCarga(() => listConsents(patientId), [patientId], 'No se pudo cargar el consentimiento.');
}
