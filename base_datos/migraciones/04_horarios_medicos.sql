-- =============================================================================
-- 04_horarios_medicos.sql
-- Horario semanal de cada médico: en qué sucursal atiende, qué días y a qué
-- horas. Las citas solo se pueden agendar dentro de estos bloques.
-- Depende de: 01_base.sql (users, btree_gist, set_updated_at()) y
--             02_sucursales.sql (branches).
--
-- El horario es SEMANAL y repetido: "los lunes de 8:00 a 12:00 en Central".
-- Los días libres y los horarios especiales de un día concreto no están
-- incluidos todavía.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipo timerange
-- PostgreSQL trae rangos de fechas y números, pero no de horas del día. Se
-- crea uno, porque la regla "dos bloques de un médico no se pueden cruzar"
-- necesita comparar rangos de horas.
-- -----------------------------------------------------------------------------
CREATE TYPE timerange AS RANGE (subtype = time);

-- -----------------------------------------------------------------------------
-- Tabla doctor_schedules
-- Una fila por bloque de atención. Un médico puede tener varios bloques el
-- mismo día (por ejemplo, mañana y tarde) y hasta en sucursales distintas.
--
-- Que doctor_id sea realmente un usuario con rol 'doctor', y que el bloque caiga
-- dentro del horario de la sucursal, lo revisa la API: son reglas que miran
-- otras tablas y no caben en una restricción de esta.
-- -----------------------------------------------------------------------------
CREATE TABLE doctor_schedules (
  id         uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  uuid      NOT NULL REFERENCES users (id),
  branch_id  uuid      NOT NULL REFERENCES branches (id),

  -- Día de la semana en formato ISO: 1 = lunes ... 7 = domingo. Coincide con
  -- extract(isodow FROM fecha), que es lo que se usa para consultar.
  weekday    smallint  NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time      NOT NULL,
  end_time   time      NOT NULL,

  created_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  updated_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  CONSTRAINT ck_doctor_schedules_orden CHECK (start_time < end_time),

  -- Las citas duran 30 minutos, así que los bloques empiezan y terminan en hora
  -- en punto o y media. 1800 son los segundos de media hora.
  CONSTRAINT ck_doctor_schedules_medias_horas CHECK (
    extract(epoch FROM start_time)::int % 1800 = 0
    AND extract(epoch FROM end_time)::int % 1800 = 0
  ),

  -- Un médico no puede tener dos bloques que se crucen el mismo día, ni en la
  -- misma sucursal ni en otra: no está en dos lugares a la vez. Los bloques
  -- seguidos (8:00-12:00 y 12:00-14:00) sí se permiten, porque el rango
  -- incluye el inicio y excluye el final.
  CONSTRAINT ex_doctor_schedules_sin_cruces EXCLUDE USING gist (
    doctor_id WITH =,
    weekday WITH =,
    timerange(start_time, end_time) WITH &&
  )
);

-- Para consultar los bloques de una sucursal en un día.
CREATE INDEX idx_doctor_schedules_branch ON doctor_schedules (branch_id, weekday);

CREATE TRIGGER trg_doctor_schedules_updated_at
  BEFORE UPDATE ON doctor_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
