-- =============================================================================
-- 06_expedientes.sql
-- Expediente clínico: las notas que un médico escribe al atender a un paciente.
-- Depende de: 01_base.sql (users), 02_sucursales.sql (branches),
--             03_pacientes.sql (patients) y 05_citas.sql (appointments).
--
-- Dos reglas de Candray se hacen cumplir AQUÍ, en la base de datos:
--   1. Lo que se escribe en un expediente no se edita ni se borra. Una
--      corrección es una fila nueva (una "enmienda") que apunta a la original.
--      Así queda siempre el rastro de qué se dijo y cuándo (RB-03).
--   2. Cada nota guarda quién la escribió y en qué sucursal, para que el
--      historial sea el mismo desde las seis sucursales (RF-01).
-- Quién puede leer o escribir lo decide la API, no esta migración.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cambio a appointments
-- Se agrega una clave única que mira tres columnas a la vez. Su único propósito
-- es permitir la clave foránea de medical_records (más abajo), que obliga a que
-- la nota use el mismo paciente y el mismo médico que la cita a la que
-- pertenece. No cambia los datos de las citas.
-- -----------------------------------------------------------------------------
ALTER TABLE appointments
  ADD CONSTRAINT uq_appointments_id_paciente_medico UNIQUE (id, patient_id, doctor_id);

-- -----------------------------------------------------------------------------
-- Tabla medical_records
-- Hay dos clases de fila:
--   - Nota original: nace de una consulta. Tiene appointment_id y no tiene
--     amends_id.
--   - Enmienda: corrige o completa una nota anterior. Tiene amends_id y no
--     tiene appointment_id (la consulta es la de la nota que enmienda).
-- No hay una columna "estado" (vigente / enmendada): como la fila no se puede
-- modificar, ese dato se deduce de si existe otra fila que la enmienda.
-- -----------------------------------------------------------------------------
CREATE TABLE medical_records (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     uuid         NOT NULL REFERENCES patients (id),

  -- Quién escribió la nota (sale del token de sesión) y desde qué sucursal.
  doctor_id      uuid         NOT NULL REFERENCES users (id),
  branch_id      uuid         NOT NULL REFERENCES branches (id),

  appointment_id uuid,
  amends_id      uuid,

  diagnosis      text         NOT NULL
                 CHECK (length(btrim(diagnosis)) > 0 AND length(diagnosis) <= 2000),
  treatment      text         CHECK (length(treatment) <= 2000),
  notes          text         CHECK (length(notes) <= 4000),

  created_at     timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  -- Una nota original necesita su cita; una enmienda no la tiene. Exactamente
  -- una de las dos columnas debe tener valor.
  CONSTRAINT ck_medical_records_origen CHECK ((appointment_id IS NULL) <> (amends_id IS NULL)),

  -- Clave que permite a una enmienda apuntar a una nota SIN poder cambiar de
  -- paciente (ver ck más abajo, fk_medical_records_enmienda).
  CONSTRAINT uq_medical_records_id_paciente UNIQUE (id, patient_id),

  -- La cita debe ser de ese mismo paciente y de ese mismo médico. Cuando
  -- appointment_id es nulo (una enmienda), PostgreSQL no revisa esta clave.
  CONSTRAINT fk_medical_records_cita FOREIGN KEY (appointment_id, patient_id, doctor_id)
    REFERENCES appointments (id, patient_id, doctor_id),

  -- La enmienda debe ser del mismo paciente que la nota que corrige.
  CONSTRAINT fk_medical_records_enmienda FOREIGN KEY (amends_id, patient_id)
    REFERENCES medical_records (id, patient_id)
);

-- Una consulta se registra una sola vez: para agregar o corregir algo después
-- se usa una enmienda, no otra nota original de la misma cita.
CREATE UNIQUE INDEX uq_medical_records_una_nota_por_cita
  ON medical_records (appointment_id) WHERE appointment_id IS NOT NULL;

-- Para mostrar el historial de un paciente, de lo más reciente a lo más antiguo,
-- y para encontrar las enmiendas de una nota.
CREATE INDEX idx_medical_records_patient ON medical_records (patient_id, created_at DESC);
CREATE INDEX idx_medical_records_amends  ON medical_records (amends_id) WHERE amends_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Solo se agrega. A diferencia de audit_log, aquí la protección NO es igual en
-- las dos capas, y la razón es una limitación de PostgreSQL:
--   - Un UPDATE lo frena el disparador (más abajo). No se puede quitar el permiso
--     UPDATE, porque la clave foránea de las enmiendas (y las de las recetas, más
--     adelante) bloquea la fila apuntada con SELECT ... FOR KEY SHARE, y esa
--     instrucción exige el permiso UPDATE sobre la tabla.
--   - Un DELETE y un TRUNCATE los frenan las dos capas: sin permisos y, aunque
--     alguien los devuelva con un GRANT, el disparador.
-- -----------------------------------------------------------------------------
REVOKE DELETE, TRUNCATE ON medical_records FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON medical_records FROM CURRENT_USER;

CREATE FUNCTION medical_records_prohibir_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'medical_records es de solo agregar: % no está permitido. Para corregir una nota, agregue una enmienda.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_medical_records_no_update_delete
  BEFORE UPDATE OR DELETE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION medical_records_prohibir_cambios();

CREATE TRIGGER trg_medical_records_no_truncate
  BEFORE TRUNCATE ON medical_records
  FOR EACH STATEMENT EXECUTE FUNCTION medical_records_prohibir_cambios();
