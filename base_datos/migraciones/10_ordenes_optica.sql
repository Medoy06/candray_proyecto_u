-- =============================================================================
-- 10_ordenes_optica.sql
-- Orden de óptica: la venta de unos lentes (armazón y lentes) a partir de una receta.
-- Depende de: 01_base.sql (users), 02_sucursales.sql (branches),
--             03_pacientes.sql (patients) y 09_recetas.sql (prescriptions).
--
-- Cada orden nace de UNA receta (así se puede seguir la venta hasta el médico que
-- la indicó) y avanza por estados en un solo sentido:
--
--     pending (pendiente) -> in_lab (en taller) -> ready (lista) -> delivered (entregada)
--
-- y puede cancelarse mientras no se haya entregado (pending, in_lab o ready).
-- Una orden entregada o cancelada ya no cambia.
--
-- Qué se guarda de cada cosa:
--   - optical_orders:       la orden y su estado ACTUAL.
--   - optical_order_events: la HISTORIA de estados (quién y cuándo cambió cada uno).
-- Las dos tablas son de solo agregar en lo que importa: no se borran filas y los
-- datos de la venta no se reescriben; lo único que cambia en una orden es su estado.
-- Quién puede crear y avanzar órdenes lo decide la API (optical_orders_*) y el
-- consentimiento del paciente (migración 08).
-- =============================================================================
CREATE TYPE optical_order_status AS ENUM ('pending', 'in_lab', 'ready', 'delivered', 'cancelled');

CREATE TABLE optical_orders (
  id                uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid                 NOT NULL REFERENCES patients (id),

  -- La receta de la que sale la orden (obligatoria: RF-07 pide la trazabilidad).
  prescription_id   uuid                 NOT NULL REFERENCES prescriptions (id),

  -- Sucursal donde se vendió y quién la registró (sale del token, no del cuerpo).
  branch_id         uuid                 NOT NULL REFERENCES branches (id),
  created_by        uuid                 NOT NULL REFERENCES users (id),

  -- Lo que se vende, en palabras del encargado: "Armazón metálico negro", "Lentes
  -- progresivos con antirreflejo".
  frame_description varchar(200)         NOT NULL CHECK (length(btrim(frame_description)) >= 1),
  lens_description  varchar(200)         NOT NULL CHECK (length(btrim(lens_description)) >= 1),

  -- Dinero en dólares. El anticipo no puede pasar del total.
  total_amount      numeric(8,2)         NOT NULL CHECK (total_amount > 0),
  deposit_amount    numeric(8,2)         NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),

  notes             varchar(500)         CHECK (notes IS NULL OR length(btrim(notes)) >= 1),

  status              optical_order_status NOT NULL DEFAULT 'pending',
  cancellation_reason varchar(200)         CHECK (cancellation_reason IS NULL OR length(btrim(cancellation_reason)) >= 1),

  created_at        timestamp            NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  updated_at        timestamp            NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  CONSTRAINT ck_optical_orders_anticipo CHECK (deposit_amount <= total_amount),
  -- El motivo existe si y solo si la orden está cancelada.
  CONSTRAINT ck_optical_orders_motivo CHECK ((status = 'cancelled') = (cancellation_reason IS NOT NULL))
);

CREATE INDEX idx_optical_orders_sucursal ON optical_orders (branch_id, status, created_at DESC);
CREATE INDEX idx_optical_orders_patient ON optical_orders (patient_id, created_at DESC);
CREATE INDEX idx_optical_orders_prescription ON optical_orders (prescription_id);

-- -----------------------------------------------------------------------------
-- Historia de estados. Cada fila es un cambio: el primero (from_status vacío) es
-- la creación de la orden. No se edita ni se borra.
-- -----------------------------------------------------------------------------
CREATE TABLE optical_order_events (
  id          uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid                 NOT NULL REFERENCES optical_orders (id),
  from_status optical_order_status,
  to_status   optical_order_status NOT NULL,
  changed_by  uuid                 NOT NULL REFERENCES users (id),
  branch_id   uuid                 NOT NULL REFERENCES branches (id),
  created_at  timestamp            NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador')
);

CREATE INDEX idx_optical_order_events_order ON optical_order_events (order_id, created_at, id);

-- -----------------------------------------------------------------------------
-- Protección de la orden. Dos capas, como en las demás tablas: sin permiso
-- DELETE/TRUNCATE y un disparador que además:
--   - impide borrar;
--   - permite cambiar SOLO el estado (y su motivo de cancelación) y respeta las
--     transiciones válidas, aunque alguien escriba el UPDATE a mano;
--   - actualiza updated_at por sí mismo.
-- -----------------------------------------------------------------------------
REVOKE DELETE, TRUNCATE ON optical_orders FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON optical_orders FROM CURRENT_USER;
REVOKE UPDATE, DELETE, TRUNCATE ON optical_order_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON optical_order_events FROM CURRENT_USER;

CREATE FUNCTION optical_orders_proteger() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'optical_orders no permite %: una orden se cancela, no se borra.', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Todo lo que no es estado debe quedar igual.
  IF NEW.id <> OLD.id
     OR NEW.patient_id <> OLD.patient_id
     OR NEW.prescription_id <> OLD.prescription_id
     OR NEW.branch_id <> OLD.branch_id
     OR NEW.created_by <> OLD.created_by
     OR NEW.frame_description <> OLD.frame_description
     OR NEW.lens_description <> OLD.lens_description
     OR NEW.total_amount <> OLD.total_amount
     OR NEW.deposit_amount <> OLD.deposit_amount
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'optical_orders solo permite cambiar el estado de una orden.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El estado solo avanza por los caminos permitidos.
  IF NOT (
       (OLD.status = 'pending' AND NEW.status IN ('in_lab', 'cancelled'))
    OR (OLD.status = 'in_lab'  AND NEW.status IN ('ready', 'cancelled'))
    OR (OLD.status = 'ready'   AND NEW.status IN ('delivered', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'optical_orders: no se puede pasar de % a %.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := (now() AT TIME ZONE 'America/El_Salvador');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_optical_orders_proteger
  BEFORE UPDATE OR DELETE ON optical_orders
  FOR EACH ROW EXECUTE FUNCTION optical_orders_proteger();

CREATE TRIGGER trg_optical_orders_no_truncate
  BEFORE TRUNCATE ON optical_orders
  FOR EACH STATEMENT EXECUTE FUNCTION optical_orders_proteger();

CREATE FUNCTION optical_order_events_proteger() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'optical_order_events no permite %: la historia de una orden no se reescribe.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_optical_order_events_proteger
  BEFORE UPDATE OR DELETE ON optical_order_events
  FOR EACH ROW EXECUTE FUNCTION optical_order_events_proteger();

CREATE TRIGGER trg_optical_order_events_no_truncate
  BEFORE TRUNCATE ON optical_order_events
  FOR EACH STATEMENT EXECUTE FUNCTION optical_order_events_proteger();
