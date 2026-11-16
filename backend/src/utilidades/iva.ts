// =============================================================================
// iva.ts (utilidad)
// Qué hace:     separa un total que YA incluye el IVA en subtotal (sin IVA) y
//               en el IVA que contiene.
// Requerimiento: IVA incluido en los precios (sección 9).
// Depende de:   configuracion/negocio.ts (VAT_PERCENT).
// Lo usan:      servicios/ordenesOptica.ts.
//
// Se calcula con centavos enteros para evitar errores de decimales. El subtotal
// se redondea al centavo y el IVA es lo que resta, así subtotal + IVA siempre
// da exactamente el total.
// =============================================================================
import { VAT_PERCENT } from '../configuracion/negocio';

export interface VatSplit {
  subtotal: number;   // total sin IVA
  tax: number;        // IVA contenido en el total
}

// Recibe el total en dólares (con IVA incluido) y devuelve su desglose.
export function splitVat(total: number): VatSplit {
  const totalCents = Math.round(total * 100);
  const subtotalCents = Math.round((totalCents * 100) / (100 + VAT_PERCENT));
  return {
    subtotal: subtotalCents / 100,
    tax: (totalCents - subtotalCents) / 100,
  };
}
