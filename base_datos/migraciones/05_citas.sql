-- =============================================================================
-- 05_citas.sql
-- Citas médicas, con la regla de que un médico no puede tener dos citas al mismo
-- tiempo (regla RB-02), aunque las dos sean en sucursales distintas.
-- Depende de: 01_base.sql (users, btree_gist, set_updated_at()),
--             02_sucursales.sql (branches) y 03_pacientes.sql (patients).
--
-- La regla se hace cumplir EN LA BASE DE DATOS con una restricción de exclusión,
-- y no solo en el código de la API. Si dos recepcionistas intentan agendar el
-- mismo horario a la vez, la base acepta la primera y rechaza la segunda, aun
-- cuando el código de las dos haya comprobado antes que el horario estaba libre.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipo appointment_status
--   scheduled : agendada, pendiente de atender
--   completed : atendida
--   cancelled : cancelada (libera el horario)
--   no_show   : el paciente no se presentó
-- -----------------------------------------------------------------------------
CREATE TYPE appointment_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- -----------------------------------------------------------------------------
-- Tabla appointments
-- Nunca se borran filas: una cita que no se realizará se cancela.
--
-- Que doctor_id sea un médico, que atienda en esa sucursal y que el horario caiga
-- dentro de su bloque semanal lo revisa la API antes de insertar.
-- -----------------------------------------------------------------------------
CREATE TABLE appointments (
  id                  uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid               NOT NULL REFERENCES patients (id),
  doctor_id           uuid               NOT NULL REFERENCES users (id),
  branch_id           uuid               NOT NULL REFERENCES branches (id),

  starts_at           timestamp          NOT NULL,
  ends_at             timestamp          NOT NULL,
  status              appointment_status NOT NULL DEFAULT 'scheduled',
  reason              varchar(500),      -- motivo de la consulta, opcional
  cancellation_reason varchar(500),      -- solo cuando la cita está cancelada

  -- Quién la agendó. Sale del token de sesión, nunca de lo que envía el cliente.
  created_by          uuid               NOT NULL REFERENCES users (id),
  created_at          timestamp          NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  updated_at          timestamp          NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  -- Toda cita dura 30 minutos y empieza en hora en punto o y media. Se guarda
  -- ends_at (aunque se pueda calcular) porque la restricción de exclusión
  -- necesita el rango completo. Si algún día hay duraciones distintas, esta
  -- restricción se cambia con una migración nueva.
  CONSTRAINT ck_appointments_duracion CHECK (ends_at = starts_at + interval '30 minutes'),
  CONSTRAINT ck_appointments_media_hora CHECK (
    extract(minute FROM starts_at) IN (0, 30)
    AND extract(second FROM starts_at) = 0
  ),

  -- El motivo de cancelación solo tiene sentido en una cita cancelada.
  CONSTRAINT ck_appointments_cancelacion CHECK (
    status = 'cancelled' OR cancellation_reason IS NULL
  ),

  -- RB-02: un médico no puede tener dos citas que se crucen. Una cita cancelada
  -- no cuenta: su horario queda libre para otro paciente. Las citas seguidas
  -- (8:00 y 8:30) sí se permiten, porque el rango incluye el inicio y excluye
  -- el final.
  CONSTRAINT ex_appointments_medico_sin_cruces EXCLUDE USING gist (
    doctor_id WITH =,
    tsrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled'),

  -- Un paciente tampoco puede estar en dos citas al mismo tiempo.
  CONSTRAINT ex_appointments_paciente_sin_cruces EXCLUDE USING gist (
    patient_id WITH =,
    tsrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled')
);

-- Para la agenda de una sucursal y para el historial de un paciente. La agenda
-- de un médico ya la cubre el índice de la restricción de exclusión.
CREATE INDEX idx_appointments_branch_start ON appointments (branch_id, starts_at);
CREATE INDEX idx_appointments_patient ON appointments (patient_id, starts_at DESC);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
