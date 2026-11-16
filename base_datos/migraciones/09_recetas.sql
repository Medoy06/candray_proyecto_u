-- =============================================================================
-- 09_recetas.sql
-- Receta óptica: lo que el médico indica para los lentes del paciente.
-- Depende de: 01_base.sql (users), 02_sucursales.sql (branches),
--             03_pacientes.sql (patients) y 06_expedientes.sql (medical_records).
--
-- Una receta nace de la nota de una consulta: guarda esfera, cilindro, eje y
-- adición de cada ojo (OD = derecho, OI = izquierdo) y la distancia pupilar.
-- Igual que el expediente, lo que se emite no se edita ni se borra: una
-- corrección es una receta NUEVA que reemplaza a la anterior. La receta vigente
-- de una consulta es la que nadie ha reemplazado; ese dato se deduce, no se guarda.
-- Quién puede emitirla y leerla lo decide la API (capacidades prescriptions_*) y,
-- para la óptica, el consentimiento del paciente (migración 08).
-- =============================================================================
CREATE TABLE prescriptions (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid          NOT NULL REFERENCES patients (id),

  -- Quién la emitió (sale del token) y desde qué sucursal.
  doctor_id     uuid          NOT NULL REFERENCES users (id),
  branch_id     uuid          NOT NULL REFERENCES branches (id),

  -- La nota de la consulta de la que nace, y la receta a la que reemplaza (si es
  -- una corrección). Una receta que reemplaza a otra pertenece a la MISMA nota.
  record_id     uuid          NOT NULL,
  supersedes_id uuid,

  -- Ojo derecho (OD) y ojo izquierdo (OI). Medidas en dioptrías, de cuarto en cuarto.
  od_sphere     numeric(4,2),
  od_cylinder   numeric(4,2),
  od_axis       smallint,
  od_addition   numeric(3,2),
  oi_sphere     numeric(4,2),
  oi_cylinder   numeric(4,2),
  oi_axis       smallint,
  oi_addition   numeric(3,2),

  -- Distancia pupilar en milímetros, de medio en medio.
  pupillary_distance numeric(3,1),
  lens_notes    text          CHECK (length(lens_notes) <= 500),

  created_at    timestamp     NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  -- La nota debe ser de ese mismo paciente.
  CONSTRAINT fk_prescriptions_nota FOREIGN KEY (record_id, patient_id)
    REFERENCES medical_records (id, patient_id),

  -- Clave que permite a una corrección apuntar a una receta SIN poder cambiar de nota.
  CONSTRAINT uq_prescriptions_id_nota UNIQUE (id, record_id),
  CONSTRAINT fk_prescriptions_reemplazo FOREIGN KEY (supersedes_id, record_id)
    REFERENCES prescriptions (id, record_id),

  -- Rangos. Un valor nulo se salta estas reglas: el ojo sin medir queda en blanco.
  CONSTRAINT ck_prescriptions_rangos CHECK (
    od_sphere BETWEEN -20 AND 20 AND oi_sphere BETWEEN -20 AND 20
    AND od_cylinder BETWEEN -8 AND 8 AND oi_cylinder BETWEEN -8 AND 8
    AND od_axis BETWEEN 1 AND 180 AND oi_axis BETWEEN 1 AND 180
    AND od_addition BETWEEN 0.25 AND 4 AND oi_addition BETWEEN 0.25 AND 4
    AND pupillary_distance BETWEEN 40 AND 80
  ),
  CONSTRAINT ck_prescriptions_pasos CHECK (
    od_sphere * 4 = round(od_sphere * 4) AND oi_sphere * 4 = round(oi_sphere * 4)
    AND od_cylinder * 4 = round(od_cylinder * 4) AND oi_cylinder * 4 = round(oi_cylinder * 4)
    AND od_addition * 4 = round(od_addition * 4) AND oi_addition * 4 = round(oi_addition * 4)
    AND pupillary_distance * 2 = round(pupillary_distance * 2)
  ),

  -- Un ojo se mide o no se mide: si tiene algún dato, tiene esfera.
  CONSTRAINT ck_prescriptions_od_esfera CHECK (
    od_sphere IS NOT NULL OR (od_cylinder IS NULL AND od_axis IS NULL AND od_addition IS NULL)
  ),
  CONSTRAINT ck_prescriptions_oi_esfera CHECK (
    oi_sphere IS NOT NULL OR (oi_cylinder IS NULL AND oi_axis IS NULL AND oi_addition IS NULL)
  ),

  -- El eje va si y solo si hay cilindro distinto de cero.
  CONSTRAINT ck_prescriptions_od_eje CHECK ((od_cylinder IS NOT NULL AND od_cylinder <> 0) = (od_axis IS NOT NULL)),
  CONSTRAINT ck_prescriptions_oi_eje CHECK ((oi_cylinder IS NOT NULL AND oi_cylinder <> 0) = (oi_axis IS NOT NULL)),

  -- Una receta mide al menos un ojo.
  CONSTRAINT ck_prescriptions_un_ojo CHECK (od_sphere IS NOT NULL OR oi_sphere IS NOT NULL)
);

-- Una consulta tiene una sola receta original; las correcciones la reemplazan.
CREATE UNIQUE INDEX uq_prescriptions_una_por_nota
  ON prescriptions (record_id) WHERE supersedes_id IS NULL;

-- Una receta se reemplaza una sola vez: aunque dos médicos la corrijan al mismo
-- tiempo, solo una corrección entra.
CREATE UNIQUE INDEX uq_prescriptions_un_reemplazo
  ON prescriptions (supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE INDEX idx_prescriptions_patient ON prescriptions (patient_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Solo se agrega, igual que medical_records (ver la explicación en la migración
-- 06): no se quita el permiso UPDATE porque las claves foráneas lo necesitan, y un
-- disparador frena todo UPDATE y DELETE; DELETE y TRUNCATE además sin permisos.
-- -----------------------------------------------------------------------------
REVOKE DELETE, TRUNCATE ON prescriptions FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON prescriptions FROM CURRENT_USER;

CREATE FUNCTION prescriptions_prohibir_cambios() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'prescriptions es de solo agregar: % no está permitido. Para corregir una receta, emita una que la reemplace.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prescriptions_no_update_delete
  BEFORE UPDATE OR DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION prescriptions_prohibir_cambios();

CREATE TRIGGER trg_prescriptions_no_truncate
  BEFORE TRUNCATE ON prescriptions
  FOR EACH STATEMENT EXECUTE FUNCTION prescriptions_prohibir_cambios();
