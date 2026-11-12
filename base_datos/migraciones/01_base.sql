-- =============================================================================
-- 01_base.sql
-- Base mínima de Candray: extensión, roles de usuario, usuarios, bitácora de
-- auditoría y la función que mantiene al día la columna updated_at.
--
-- Esta migración NO depende de ninguna otra. Las sucursales llegan en la 02,
-- que agrega a audit_log la columna branch_id.
--
-- Convenciones (ver CONVENTIONS.md):
--   * Claves primarias uuid, generadas por gen_random_uuid() (viene con
--     PostgreSQL desde la versión 13; no hace falta uuid-ossp).
--   * Fechas y horas: "timestamp" SIN zona, guardadas en hora local de
--     El Salvador (UTC-6, sin horario de verano). Por eso el valor por defecto
--     es  (now() AT TIME ZONE 'America/El_Salvador')  y no simplemente now():
--     así el valor guardado no depende de la zona horaria de la conexión.
--   * Identificadores (tablas, columnas) en inglés; comentarios en español.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensión btree_gist
-- Se usará en el Incremento 1 para impedir que un médico tenga dos citas
-- activas al mismo tiempo (restricción de exclusión, regla RB-02).
-- Es una extensión "de confianza": el dueño de la base puede crearla sin ser
-- superusuario. Si ya existe, esta línea no hace nada.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Tipo user_role
-- Es un ENUM (y no un varchar con CHECK) porque los roles casi nunca cambian
-- y cada rol tiene permisos propios en el código.
--   admin            : administra usuarios, sucursales y auditoría
--   doctor           : atiende pacientes; puede tener varias sucursales
--   recepcionista    : agenda citas y registra pacientes
--   encargado_venta  : atiende el mostrador de óptica
--   directivo        : ve indicadores generales
-- -----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
  'admin',
  'doctor',
  'recepcionista',
  'encargado_venta',
  'directivo'
);

-- -----------------------------------------------------------------------------
-- Función set_updated_at()
-- Se asocia a un disparador (trigger) en cada tabla que tenga updated_at.
-- Antes de cada UPDATE, reemplaza updated_at por la hora local actual, de modo
-- que ningún modelo tenga que acordarse de hacerlo.
-- -----------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := (now() AT TIME ZONE 'America/El_Salvador');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Tabla users
-- Una fila por persona que usa el sistema. Nunca se borran filas: una cuenta
-- que ya no se usa se desactiva (is_active = false) para conservar la
-- trazabilidad de la auditoría.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             varchar(255) NOT NULL,
  email                 varchar(255) NOT NULL,
  password_hash         varchar(255) NOT NULL,   -- bcrypt; la API nunca lo devuelve
  role                  user_role    NOT NULL,
  is_active             boolean      NOT NULL DEFAULT true,

  -- Bloqueo de cuenta (regla: 5 intentos fallidos seguidos => 15 minutos).
  -- failed_login_attempts cuenta los fallos seguidos; vuelve a 0 al entrar bien.
  -- Mientras locked_until sea posterior a la hora local actual, la cuenta
  -- está bloqueada.
  failed_login_attempts integer      NOT NULL DEFAULT 0
                        CHECK (failed_login_attempts >= 0),
  locked_until          timestamp,

  last_login            timestamp,
  created_at            timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  updated_at            timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')
);

-- Correo único sin distinguir mayúsculas: "Ana@x.test" y "ana@x.test" son la
-- misma cuenta. El código debe buscar siempre con lower(email).
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tabla audit_log
-- Bitácora de lo que ocurre en el sistema: quién hizo qué y cuándo.
-- Es de SOLO AGREGAR: ni el programa ni un error pueden modificarla o borrarla.
-- Se protege de dos maneras (ver más abajo): permisos y disparadores.
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(50) NOT NULL,   -- sobre qué ocurrió (ej.: 'user', 'appointment')
  action      varchar(50) NOT NULL,   -- qué ocurrió (ej.: 'LOGIN_FAILED')
  entity_id   uuid,                   -- nulo cuando no aplica (ej.: un login fallido)
  actor_id    uuid REFERENCES users (id),  -- quién lo hizo; sale SIEMPRE del token.
                                           -- Nulo si no hay usuario (correo inexistente).
  detail      jsonb,                  -- contexto o diferencias, sin datos secretos
  created_at  timestamp   NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')
);

-- Índices para las búsquedas de la pantalla de auditoría.
CREATE INDEX idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_entity  ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_actor   ON audit_log (actor_id);

-- Protección 1: permisos. Se le quita a cualquier rol (incluido el dueño de la
-- tabla) el derecho de modificar o borrar filas.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM CURRENT_USER;

-- Protección 2: disparadores. Un permiso lo puede devolver el dueño de la
-- tabla con un GRANT; un disparador no se salta sin eliminarlo explícitamente
-- y deja un error claro. Las dos capas juntas se prueban en las pruebas
-- automáticas (un UPDATE directo debe fallar).
CREATE FUNCTION audit_log_prohibir_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo agregar: % no está permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_prohibir_cambios();

CREATE TRIGGER trg_audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_prohibir_cambios();
