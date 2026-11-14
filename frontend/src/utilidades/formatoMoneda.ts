// =============================================================================
// formatoMoneda.ts
// Qué hace:     formatMoney(): escribe un monto en dólares al estilo de
//               El Salvador, por ejemplo  "$1,234.50".
// Depende de:   configuracion/negocio.ts.
// Lo usan:      toda pantalla que muestre dinero (órdenes de óptica, pagos...).
//
// Importante: la base de datos entrega los montos (NUMERIC) como TEXTO, por
// ejemplo "1234.50", para no perder precisión. Esta función acepta texto o
// número. Los montos son de hasta 10 dígitos, que un número de JavaScript
// representa sin error; aun así, NO se hacen cuentas en el frontend: sumas e
// IVA se calculan en el backend y aquí solo se muestran.
// =============================================================================
import { CURRENCY, LOCALE } from '../configuracion/negocio';

const moneyFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });

// Texto que se muestra cuando no hay monto (vacío o inválido).
const NO_VALUE = '—';

// Formatea un monto en dólares.
// Recibe: el monto como texto o número (null/undefined = sin dato).
// Devuelve: ej. "$1,234.50", o "—" si no hay un monto válido.
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return NO_VALUE;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? moneyFormat.format(amount) : NO_VALUE;
}
