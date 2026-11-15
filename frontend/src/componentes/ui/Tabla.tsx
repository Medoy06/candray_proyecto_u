// =============================================================================
// Tabla.tsx
// Qué hace:     una tabla genérica: recibe las columnas (encabezado y cómo
//               dibujar cada celda) y las filas, y se encarga del marco, el
//               encabezado y el desplazamiento horizontal.
// Lo usan:      las tablas de usuarios, sucursales y auditoría.
//
// Cada pantalla define SUS columnas; aquí solo vive lo que es común:
//  - el contenedor con overflow-x-auto: si no cabe, aparece una barra y no se
//    corta en silencio (lección del ítem 80 de Hospital Mio);
//  - encabezados con scope="col" (los lectores de pantalla relacionan cada celda
//    con su columna);
//  - `label` da nombre accesible a la tabla ("Lista de usuarios").
// =============================================================================
import type { ReactNode } from 'react';

export interface TablaColumna<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  noWrap?: boolean; // true = el contenido no se parte en varias líneas (fechas, roles...)
}

interface TablaProps<T> {
  label: string;
  columns: TablaColumna<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

export function Tabla<T>({ label, columns, rows, rowKey }: TablaProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
      <table aria-label={label} className="w-full text-left text-sm">
        <thead className="bg-apoyo text-xs text-texto-suave">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={`px-4 py-2.5 font-medium ${column.align === 'right' ? 'text-right' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.id} className={`px-4 py-3 ${column.noWrap === true ? 'whitespace-nowrap' : ''}`}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
