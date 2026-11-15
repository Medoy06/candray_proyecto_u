// =============================================================================
// pacientes.prueba.ts
// Qué prueba:   las reglas que la base de datos hace cumplir en la tabla
//               patients (migración 03): número de expediente automático, DUI
//               con formato y sin repetirse, datos obligatorios y la búsqueda
//               sin acentos.
// Cómo:         inserta con SQL sobre la base de pruebas y comprueba el código
//               de error de PostgreSQL cuando una regla se rompe.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { pool } from '../../src/configuracion/baseDatos';
import { createTestPatient } from '../ayudas/datosClinicos';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const GENERATED_ALWAYS = '428C9';

// Un DUI de prueba con formato válido: 8 dígitos, guion y el verificador. El
// prefijo distingue a los DUI de una prueba de los de otra.
const randomDui = (prefix: string, check: number) =>
  `${prefix}${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}0-${check}`;

describe('patients: datos básicos', () => {
  it('guarda al paciente activo y con las fechas de creación y cambio', async () => {
    const patient = await createTestPatient({ email: 'a@prueba.test' });
    const row = (await pool.query('SELECT * FROM patients WHERE id = $1', [patient.id])).rows[0];
    expect(row.is_active).toBe(true);
    expect(row.email).toBe('a@prueba.test');
    expect(row.birth_date).toBe('1990-05-17'); // la fecha llega como texto, sin correrse de día
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('asigna números de expediente que van subiendo', async () => {
    const first = await createTestPatient();
    const second = await createTestPatient();
    expect(second.record_number).toBeGreaterThan(first.record_number);
  });

  it('no permite escribir el número de expediente a mano', async () => {
    await expect(
      pool.query(
        `INSERT INTO patients (record_number, full_name, birth_date, phone)
         VALUES (999999, 'Nombre Prueba', '1990-01-01', '7000-0000')`,
      ),
    ).rejects.toMatchObject({ code: GENERATED_ALWAYS });
  });

  it('cambiar al paciente actualiza updated_at', async () => {
    const patient = await createTestPatient();
    const before = (await pool.query('SELECT updated_at FROM patients WHERE id = $1', [patient.id])).rows[0];
    await pool.query('SELECT pg_sleep(0.05)');
    await pool.query(`UPDATE patients SET phone = '7111-1111' WHERE id = $1`, [patient.id]);
    const after = (await pool.query('SELECT updated_at FROM patients WHERE id = $1', [patient.id])).rows[0];
    expect(after.updated_at > before.updated_at).toBe(true);
  });
});

describe('patients: DUI', () => {
  it('acepta el formato 8 dígitos, guion y dígito verificador', async () => {
    const patient = await createTestPatient({ dui: randomDui('9', 1) });
    expect(patient.id).toBeTruthy();
  });

  it.each(['1234', '12345678', '12345678-', '1234567-89', 'abcdefgh-1', '12345678-a'])(
    'rechaza el DUI mal escrito "%s"',
    async (dui) => {
      await expect(createTestPatient({ dui })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    },
  );

  it('no permite dos pacientes con el mismo DUI', async () => {
    const dui = randomDui('8', 2);
    await createTestPatient({ dui });
    await expect(createTestPatient({ dui })).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('sí permite varios pacientes sin DUI', async () => {
    await createTestPatient({ dui: null });
    await expect(createTestPatient({ dui: null })).resolves.toBeTruthy();
  });
});

describe('patients: datos obligatorios', () => {
  it.each(['', ' ', 'A', '  B '])('rechaza el nombre "%s" (mínimo 2 letras)', async (full_name) => {
    await expect(createTestPatient({ full_name })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('acepta un nombre de 2 letras', async () => {
    await expect(createTestPatient({ full_name: 'Li' })).resolves.toBeTruthy();
  });

  it.each(['', '   '])('rechaza el teléfono vacío "%s"', async (phone) => {
    await expect(createTestPatient({ phone })).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('el teléfono y la fecha de nacimiento no pueden ser nulos', async () => {
    await expect(createTestPatient({ phone: null })).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
    await expect(createTestPatient({ birth_date: null })).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
  });

  it('rechaza fechas de nacimiento anteriores a 1900 y acepta el 1 de enero de 1900', async () => {
    await expect(createTestPatient({ birth_date: '1899-12-31' })).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(createTestPatient({ birth_date: '1900-01-01' })).resolves.toBeTruthy();
  });
});

describe('búsqueda sin acentos', () => {
  it('unaccent hace que "jose" encuentre a "José" y "nunez" a "Núñez"', async () => {
    const marca = `Zz${Math.random().toString(36).slice(2, 8)}`;
    await createTestPatient({ full_name: `José Núñez ${marca}` });
    const result = await pool.query(
      `SELECT full_name FROM patients
        WHERE unaccent(lower(full_name)) LIKE unaccent(lower($1))`,
      [`%jose nunez ${marca}%`],
    );
    expect(result.rows).toHaveLength(1);
  });
});
