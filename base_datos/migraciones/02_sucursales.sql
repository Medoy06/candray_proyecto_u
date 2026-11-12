-- =============================================================================
-- 02_sucursales.sql
-- Sucursales de Candray y la relación entre usuarios y sucursales.
-- Depende de: 01_base.sql (tabla users, tabla audit_log, set_updated_at()).
--
-- Un usuario puede trabajar en varias sucursales (por ejemplo, un médico
-- itinerante). Cada sucursal tiene su color de acento, que el frontend usa
-- para el tema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabla branches
-- Una fila por sucursal. Nunca se borra: se desactiva con is_active = false.
-- -----------------------------------------------------------------------------
CREATE TABLE branches (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                varchar(20)  NOT NULL UNIQUE
                      CHECK (code ~ '^[A-Z0-9_]+$'),     -- ej.: CENTRAL, ESCALON
  name                varchar(255) NOT NULL,
  address             text,
  phone               varchar(30),

  -- Horario general de atención. Los horarios de cada médico se definen
  -- aparte (Incremento 1) y deben caer dentro de este horario.
  opening_time        time         NOT NULL,
  closing_time        time         NOT NULL,

  -- Color de acento de la interfaz para esta sucursal, formato #RRGGBB.
  theme_color         varchar(7)   NOT NULL DEFAULT '#0F766E'
                      CHECK (theme_color ~ '^#[0-9A-Fa-f]{6}$'),

  -- Indica si la sucursal tiene mostrador de óptica.
  has_optical_counter boolean      NOT NULL DEFAULT false,

  -- Permite mostrar en la demostración una sucursal inactiva.
  is_active           boolean      NOT NULL DEFAULT true,

  created_at          timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  updated_at          timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  CONSTRAINT ck_branches_horario CHECK (opening_time < closing_time)
);

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tabla user_branches
-- Qué sucursales puede usar cada usuario. La clave primaria compuesta evita
-- asignar dos veces la misma sucursal al mismo usuario.
-- Si se elimina un usuario o una sucursal (solo en reinicios de demostración),
-- sus asignaciones se eliminan con ellos.
-- -----------------------------------------------------------------------------
CREATE TABLE user_branches (
  user_id    uuid    NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
  branch_id  uuid    NOT NULL REFERENCES branches (id) ON DELETE CASCADE,

  -- Sucursal con la que el usuario inicia sesión. Solo una por usuario.
  is_default boolean NOT NULL DEFAULT false,

  PRIMARY KEY (user_id, branch_id)
);

-- Garantiza "una sola sucursal por defecto por usuario": el índice solo
-- considera las filas con is_default = true, y en ellas user_id no se repite.
CREATE UNIQUE INDEX uq_user_branches_one_default
  ON user_branches (user_id)
  WHERE is_default;

-- Para listar rápido los usuarios de una sucursal.
CREATE INDEX idx_user_branches_branch ON user_branches (branch_id);

-- -----------------------------------------------------------------------------
-- audit_log.branch_id
-- Sucursal activa del usuario al momento de la acción. Puede ser nula (por
-- ejemplo, un intento de inicio de sesión: todavía no hay sucursal elegida).
-- Agregar una columna no es un UPDATE de filas, así que no choca con los
-- disparadores de solo agregar de la migración 01.
-- -----------------------------------------------------------------------------
ALTER TABLE audit_log
  ADD COLUMN branch_id uuid REFERENCES branches (id);

CREATE INDEX idx_audit_branch ON audit_log (branch_id);
