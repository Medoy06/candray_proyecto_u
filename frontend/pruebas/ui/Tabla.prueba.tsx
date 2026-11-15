// =============================================================================
// Tabla.prueba.tsx
// Qué prueba:   la tabla genérica: nombre accesible, encabezados con scope="col",
//               una fila por elemento, celdas dibujadas por cada columna, la
//               alineación a la derecha y el contenedor con desplazamiento
//               horizontal.
// =============================================================================
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabla, type TablaColumna } from '../../src/componentes/ui/Tabla';

interface Fila {
  id: string;
  nombre: string;
  edad: number;
}
const COLUMNAS: TablaColumna<Fila>[] = [
  { id: 'nombre', header: 'Nombre', cell: (fila) => fila.nombre },
  { id: 'edad', header: 'Edad', align: 'right', noWrap: true, cell: (fila) => <b>{fila.edad}</b> },
];
const FILAS: Fila[] = [
  { id: 'a', nombre: 'Ana', edad: 30 },
  { id: 'b', nombre: 'Beto', edad: 41 },
];
const dibujar = (rows = FILAS) => render(<Tabla label="Personas" columns={COLUMNAS} rows={rows} rowKey={(fila) => fila.id} />);

describe('Tabla', () => {
  it('tiene nombre accesible', () => {
    dibujar();
    expect(screen.getByRole('table', { name: 'Personas' })).toBeInTheDocument();
  });

  it('los encabezados son de columna (scope="col")', () => {
    dibujar();
    const encabezados = screen.getAllByRole('columnheader');
    expect(encabezados.map((th) => th.textContent)).toEqual(['Nombre', 'Edad']);
    encabezados.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
  });

  it('dibuja una fila por elemento, con lo que devuelve cell()', () => {
    dibujar();
    const filas = screen.getAllByRole('row').slice(1); // sin la fila de encabezados
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText('Ana')).toBeInTheDocument();
    expect(within(filas[1]).getByText('41').tagName).toBe('B');
  });

  it('sin filas, solo queda el encabezado', () => {
    dibujar([]);
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });

  it('align="right" alinea el encabezado a la derecha; noWrap evita partir la celda', () => {
    dibujar();
    expect(screen.getByRole('columnheader', { name: 'Edad' })).toHaveClass('text-right');
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).not.toHaveClass('text-right');
    expect(screen.getByText('30').closest('td')).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('Ana').closest('td')).not.toHaveClass('whitespace-nowrap');
  });

  it('va dentro de un contenedor con desplazamiento horizontal', () => {
    dibujar();
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto');
  });
});
