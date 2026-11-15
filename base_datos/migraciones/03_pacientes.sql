-- =============================================================================
-- 03_pacientes.sql
-- Pacientes de Candray: los datos mínimos para registrarlos y agendarles citas.
-- Depende de: 01_base.sql (set_updated_at()).
--
-- Un paciente pertenece a la empresa, no a una sucursal: se puede atender en
-- cualquiera de ellas. El expediente clínico completo (historias, recetas,
-- consentimientos) llega en incrementos posteriores y se apoyará en esta tabla.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensión unaccent
-- Permite buscar sin distinguir acentos: "jose" encuentra a "José". Sin ella,
-- la recepcionista tendría que escribir los acentos exactos para encontrar a
-- alguien. Es una extensión "de confianza", igual que btree_gist.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;

-- -----------------------------------------------------------------------------
-- Tabla patients
-- Nunca se borran filas: un paciente que ya no se atiende se desactiva
-- (is_active = false) para conservar su historial.
-- -----------------------------------------------------------------------------
CREATE TABLE patients (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Número de expediente. Lo asigna la base al crear al paciente y nadie lo
  -- puede escribir a mano (GENERATED ALWAYS). La pantalla lo muestra con el
  -- formato EXP-000001.
  record_number integer      GENERATED ALWAYS AS IDENTITY UNIQUE,

  full_name     varchar(255) NOT NULL
                CHECK (length(btrim(full_name)) >= 2),
  birth_date    date         NOT NULL
                CHECK (birth_date >= DATE '1900-01-01'),
  phone         varchar(30)  NOT NULL
                CHECK (length(btrim(phone)) > 0),

  -- DUI (documento de identidad): 8 dígitos, guion y el dígito verificador.
  -- Es opcional (los menores, por ejemplo, no tienen). UNIQUE permite varios
  -- valores nulos pero no dos DUI iguales: así se evita registrar dos veces a
  -- la misma persona.
  dui           varchar(10)  UNIQUE
                CHECK (dui ~ '^[0-9]{8}-[0-9]$'),
  email         varchar(255),

  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  updated_at    timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')
);

-- Que la fecha de nacimiento no sea futura depende de la fecha de hoy, y una
-- restricción de la tabla debe dar siempre el mismo resultado para la misma
-- fila. Esa regla la revisa la API al registrar al paciente.

CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
