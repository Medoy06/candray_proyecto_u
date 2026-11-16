// =============================================================================
// rutas.prueba.ts
// Qué prueba:   el mapa de pantallas (configuracion/rutas.ts): que es coherente
//               y que visibleSections muestra a cada persona solo lo que le
//               corresponde, sin mostrar nunca de más.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, type Capability } from '../../src/configuracion/capacidades';
import { canOpen, RECORD_ROUTE, recordPath, ROUTES, SECTIONS, visibleSections } from '../../src/configuracion/rutas';

const canWith = (granted: Capability[]) => (capability: Capability) => granted.includes(capability);
const labelsOf = (granted: Capability[]) =>
  visibleSections(canWith(granted)).flatMap((section) => section.routes.map((route) => route.label));

describe('mapa de rutas', () => {
  it('cada dirección es única y empieza con "/"', () => {
    const paths = ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith('/')).toBe(true);
  });

  it('cada id es único', () => {
    const ids = ROUTES.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda capacidad que pide una pantalla existe en la lista de capacidades', () => {
    for (const route of ROUTES) {
      if (route.capability !== null) expect(CAPABILITIES).toContain(route.capability);
    }
  });

  it('toda pantalla pertenece a una sección que existe', () => {
    const sectionKeys: string[] = SECTIONS.map((section) => section.key);
    for (const route of ROUTES) expect(sectionKeys).toContain(route.section);
  });

  it('el Inicio está abierto a cualquier persona con sesión', () => {
    const inicio = ROUTES.find((route) => route.id === 'inicio')!;
    expect(inicio.path).toBe('/');
    expect(inicio.capability).toBeNull();
  });
});

describe('canOpen', () => {
  const usuarios = ROUTES.find((route) => route.id === 'usuarios')!;

  it('una pantalla con capacidad solo se abre si se tiene', () => {
    expect(canOpen(usuarios, canWith(['users_manage']))).toBe(true);
    expect(canOpen(usuarios, canWith(['audit_read']))).toBe(false);
  });
});

describe('visibleSections', () => {
  it('sin ninguna capacidad: solo el Inicio (lo mínimo, nunca de más)', () => {
    expect(labelsOf([])).toEqual(['Inicio']);
  });

  it('una capacidad abre solo su pantalla', () => {
    expect(labelsOf(['audit_read'])).toEqual(['Inicio', 'Auditoría']);
  });

  it('Pacientes lo ve quien puede buscar pacientes, en la sección Clínico', () => {
    expect(labelsOf(['patients_search'])).toEqual(['Inicio', 'Pacientes']);
    expect(labelsOf(['patients_manage'])).toEqual(['Inicio']); // modificar sin poder buscar no abre la pantalla
    const clinico = visibleSections(canWith(['patients_search'])).find((section) => section.key === 'clinico');
    expect(clinico?.routes.map((route) => route.path)).toEqual(['/pacientes']);
  });

  it('Citas lo ve quien puede leer citas; médicos y recepción comparten la sección Clínico', () => {
    expect(labelsOf(['appointments_read'])).toEqual(['Inicio', 'Citas']);
    expect(labelsOf(['appointments_manage'])).toEqual(['Inicio']); // agendar sin poder leer no abre la pantalla
    expect(labelsOf(['appointments_read', 'patients_search'])).toEqual(['Inicio', 'Pacientes', 'Citas']);
  });

  it('Órdenes de óptica lo ve quien puede leer órdenes, en su propia sección', () => {
    expect(labelsOf(['optical_orders_read'])).toEqual(['Inicio', 'Órdenes de óptica']);
    expect(labelsOf(['optical_orders_manage'])).toEqual(['Inicio']); // crear sin poder leer no abre la pantalla
    const optica = visibleSections(canWith(['optical_orders_read'])).find((section) => section.key === 'optica');
    expect(optica?.label).toBe('Óptica');
    expect(optica?.routes.map((route) => route.path)).toEqual(['/ordenes-optica']);
  });

  it('Panel de indicadores lo ve quien tiene dashboard_read, en la sección General', () => {
    expect(labelsOf(['dashboard_read'])).toEqual(['Inicio', 'Panel de indicadores']);
    const general = visibleSections(canWith(['dashboard_read'])).find((section) => section.key === 'general');
    expect(general?.routes.map((route) => route.path)).toEqual(['/', '/panel']);
  });

  it('Recordatorios lo ve quien tiene reminders_read, en la sección Clínico', () => {
    expect(labelsOf(['reminders_read'])).toEqual(['Inicio', 'Recordatorios']);
    const clinico = visibleSections(canWith(['reminders_read'])).find((section) => section.key === 'clinico');
    expect(clinico?.routes.map((route) => route.path)).toEqual(['/recordatorios']);
  });

  it('con todas las capacidades ve todas las pantallas', () => {
    expect(labelsOf([...CAPABILITIES])).toEqual(ROUTES.map((route) => route.label));
  });

  it('una capacidad que ninguna pantalla pide no agrega nada', () => {
    expect(labelsOf(['medical_records_read'])).toEqual(['Inicio']);
  });

  it('descarta las secciones que quedan vacías y respeta el orden del menú', () => {
    expect(visibleSections(canWith([])).map((section) => section.key)).toEqual(['general']);
    expect(visibleSections(canWith(['users_manage', 'audit_read'])).map((section) => section.key)).toEqual([
      'general',
      'administracion',
    ]);
  });
});

describe('ruta del expediente', () => {
  it('la dirección de un paciente concreto sale del patrón de la ruta', () => {
    expect(recordPath('abc-123')).toBe('/pacientes/abc-123/expediente');
    expect(RECORD_ROUTE.path.replace(':patientId', 'abc-123')).toBe(recordPath('abc-123'));
  });

  it('pide una capacidad que existe', () => {
    expect(CAPABILITIES).toContain(RECORD_ROUTE.capability);
  });

  it('no está en el menú: necesita un paciente, se abre desde la lista de pacientes', () => {
    expect(ROUTES.map((route) => route.path)).not.toContain(RECORD_ROUTE.path);
    expect(labelsOf(['patients_search', 'medical_records_read'])).not.toContain('Expediente');
  });
});
