// =============================================================================
// tokensDiseno.prueba.ts
// Qué prueba:   dos reglas del diseño, para que no se rompan sin avisar:
//   1. CONTRASTE: los pares de colores de texto y fondo de index.css cumplen
//      el nivel AA de accesibilidad (WCAG 2.1): 4.5 a 1 para texto normal.
//   2. TOKENS: ninguna pantalla usa colores sueltos de Tailwind (bg-red-700,
//      text-slate-500...); todo sale de los nombres de index.css.
// Cómo:         lee index.css y los archivos de src/ como texto.
// =============================================================================
import { describe, expect, it } from 'vitest';
import css from '../../src/index.css?raw'; // el texto de index.css (?raw = como texto, sin procesarlo)

// El texto de TODOS los archivos de código de src/ (carga hecha por Vite).
const SOURCES = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

// Colores declarados en el bloque @theme: --color-nombre: #rrggbb
const colors = new Map<string, string>();
for (const match of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  colors.set(match[1], match[2]);
}
const WHITE = '#ffffff';
const color = (name: string): string => {
  const value = name === 'blanco' ? WHITE : colors.get(name);
  if (value === undefined) throw new Error(`Falta el color "${name}" en index.css`);
  return value;
};

// Luminancia relativa y razón de contraste, según la definición de WCAG 2.1.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('contraste AA (4.5 a 1) de los pares texto / fondo', () => {
  // [color del texto, color del fondo, dónde se usa]
  const PARES: [string, string, string][] = [
    ['texto', 'fondo', 'texto normal sobre el fondo general'],
    ['texto', 'superficie', 'texto normal en tarjetas'],
    ['texto', 'apoyo', 'texto en opciones con el cursor encima'],
    ['texto-suave', 'fondo', 'ayudas sobre el fondo general'],
    ['texto-suave', 'superficie', 'ayudas en tarjetas y encabezado'],
    ['texto-suave', 'apoyo', 'ayudas con el cursor encima'],
    ['titulo', 'superficie', 'títulos'],
    ['titulo', 'fondo', 'títulos sobre el fondo general'],
    ['titulo', 'apoyo', 'opción activa del menú'],
    ['blanco', 'marca', 'botón principal'],
    ['blanco', 'marca-oscuro', 'botón principal con el cursor encima'],
    ['marca', 'superficie', 'enlaces rojos en tarjetas'],
    ['marca', 'fondo', 'enlaces rojos sobre el fondo general'],
    ['error-texto', 'error-fondo', 'mensajes de error'],
  ];

  it.each(PARES)('%s sobre %s (%s)', (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });

  it('la prueba sabe distinguir: un gris claro sobre blanco NO pasa', () => {
    expect(contrast('#bbbbbb', WHITE)).toBeLessThan(4.5);
  });
});

describe('el diseño vive en index.css', () => {
  it('se están leyendo los archivos de código (no una lista vacía)', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  // bg-red-700, text-slate-500, border-blue-200, ring-teal-600/30...
  const LOOSE_COLOR =
    /\b(?:bg|text|border|ring|fill|stroke|divide|outline|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

  it('ningún archivo usa colores sueltos de Tailwind', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, text]) => LOOSE_COLOR.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('el detector reconoce un color suelto (control negativo)', () => {
    expect(LOOSE_COLOR.test('<p className="text-slate-500">')).toBe(true);
    expect(LOOSE_COLOR.test('<p className="text-texto-suave bg-marca/30">')).toBe(false);
  });

  it('el color de la marca es el rojo de Candray', () => {
    expect(color('marca').toLowerCase()).toBe('#af1d1d');
  });
});
