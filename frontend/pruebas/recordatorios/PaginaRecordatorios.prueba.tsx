// =============================================================================
// PaginaRecordatorios.prueba.tsx
// Qué prueba:   la bandeja de recordatorios: el aviso de que es una simulación,
//               la lista con el mensaje de cada paciente, el estado vacío, la
//               carga, el error con "Reintentar" y que al cambiar de sucursal
//               se vuelva a pedir.
// Cómo:         la página con el cliente real + ayudas/apiFalsa.ts, dentro de
//               una sesión de ayudas/conSesion.tsx.
// =============================================================================
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaginaRecordatorios } from '../../src/paginas/recordatorios/PaginaRecordatorios';
import type { Reminder } from '../../src/servicios/recordatorios';
import { installFakeApi } from '../ayudas/apiFalsa';
import { renderConSesion } from '../ayudas/conSesion';
import { CENTRAL, ESCALON } from '../ayudas/datosSesion';

const ANA: Reminder = {
  appointment_id: 'a1', starts_at: '2026-11-16 09:30:00', patient_name: 'Ana Pérez',
  patient_phone: '7000-1111', doctor_name: 'Dra. Lucía Rivas', branch_name: 'Candray Central',
};
const LUIS: Reminder = {
  appointment_id: 'a2', starts_at: '2026-11-17 16:00:00', patient_name: 'Luis Mena',
  patient_phone: '7222-3333', doctor_name: 'Dr. Mauricio Portillo', branch_name: 'Candray Central',
};

const mount = () => renderConSesion(<PaginaRecordatorios />, { capabilities: ['reminders_read'], role: 'recepcionista' });

describe('la bandeja', () => {
  it('muestra el título, la sucursal y que es una simulación', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [ANA] } }));
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Recordatorios' })).toBeInTheDocument();
    expect(screen.getByText(`Citas agendadas de hoy y mañana en ${CENTRAL.name}.`)).toBeInTheDocument();
    expect(screen.getByText(/Simulación: el sistema no envía mensajes/)).toBeInTheDocument();
    await screen.findByText('Ana Pérez');
  });

  it('pide solo la bandeja al servidor', async () => {
    const received = installFakeApi(() => ({ status: 200, data: { data: [ANA] } }));
    mount();
    await screen.findByText('Ana Pérez');
    expect(received.map((request) => `${request.method} ${request.url}`)).toEqual(['get /recordatorios']);
  });

  it('cada fila muestra la cita, el paciente con su teléfono, el médico y el mensaje', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [ANA, LUIS] } }));
    mount();
    await screen.findByText('Ana Pérez');
    const table = screen.getByRole('table', { name: 'Recordatorios de citas' });
    const rows = within(table).getAllByRole('row').slice(1); // sin el encabezado
    expect(rows).toHaveLength(2);

    const first = within(rows[0]);
    expect(first.getByText('16/11/2026 09:30')).toBeInTheDocument();
    expect(first.getByText('7000-1111')).toBeInTheDocument();
    expect(first.getByText('Dra. Lucía Rivas')).toBeInTheDocument();
    expect(first.getByText(/Estimado\(a\) Ana Pérez: le recordamos su cita del 16\/11\/2026 a las 09:30/)).toBeInTheDocument();

    const second = within(rows[1]);
    expect(second.getByText('17/11/2026 16:00')).toBeInTheDocument();
    expect(second.getByText('Dr. Mauricio Portillo')).toBeInTheDocument();
  });

  it('las filas quedan en el orden que manda el servidor', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [LUIS, ANA] } }));
    mount();
    await screen.findByText('Ana Pérez');
    const names = within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(names[0]).toContain('Luis Mena');
    expect(names[1]).toContain('Ana Pérez');
  });

  it('un paciente con dos citas aparece dos veces, sin avisos de React por filas repetidas', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installFakeApi(() => ({ status: 200, data: { data: [ANA, { ...ANA, appointment_id: 'a9', starts_at: '2026-11-17 10:00:00' }] } }));
    mount();
    await screen.findAllByText('Ana Pérez');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('sin citas lo dice, y no dibuja la tabla', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [] } }));
    mount();
    expect(await screen.findByText('No hay citas agendadas para hoy ni mañana en esta sucursal.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('mientras carga dice "Cargando recordatorios..."', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    installFakeApi(async () => { await gate; return { status: 200, data: { data: [ANA] } }; });
    mount();
    expect(screen.getByText('Cargando recordatorios...')).toBeInTheDocument();
    release();
    await screen.findByText('Ana Pérez');
    expect(screen.queryByText('Cargando recordatorios...')).not.toBeInTheDocument();
  });

  it('si falla, muestra el mensaje del servidor y "Reintentar" vuelve a pedir', async () => {
    let fail = true;
    const received = installFakeApi(() =>
      fail ? { status: 500, data: { message: 'La base no responde.' } } : { status: 200, data: { data: [ANA] } },
    );
    mount();
    expect(await screen.findByText('La base no responde.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Ana Pérez');
    expect(screen.queryByText('La base no responde.')).not.toBeInTheDocument();
    expect(received).toHaveLength(2);
  });

  it('un error sin mensaje usa el texto de reserva', async () => {
    installFakeApi(() => ({ status: 500, data: {} }));
    mount();
    expect(await screen.findByText('No se pudieron cargar los recordatorios.')).toBeInTheDocument();
  });

  it('el nombre de la sucursal activa aparece en la descripción', async () => {
    installFakeApi(() => ({ status: 200, data: { data: [] } }));
    renderConSesion(<PaginaRecordatorios />, { capabilities: ['reminders_read'], role: 'recepcionista', activeBranch: ESCALON });
    expect(screen.getByText(`Citas agendadas de hoy y mañana en ${ESCALON.name}.`)).toBeInTheDocument();
    await screen.findByText('No hay citas agendadas para hoy ni mañana en esta sucursal.');
  });
});
