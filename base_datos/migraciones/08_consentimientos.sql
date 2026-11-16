-- =============================================================================
-- 08_consentimientos.sql
-- Consentimiento: el paciente autoriza que la óptica vea su receta.
-- Depende de: 01_base.sql (users) y 03_pacientes.sql (patients).
--
-- Un paciente tiene como máximo UN consentimiento vigente a la vez, y vale para
-- toda la clínica (no es por médico ni por sucursal). No vence solo: dura hasta
-- que alguien lo revoca. Al revocarlo queda escrito cuándo y quién; si el
-- paciente vuelve a autorizar, se registra uno nuevo y el anterior queda como
-- historia. Quien lo registra es una persona del personal, no el paciente.
--
-- Esta tabla solo guarda el hecho. Quién puede registrarlo y consultarlo lo
-- decide la API (capacidades consents_manage y consents_read).
-- =============================================================================
CREATE TABLE consents (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid         NOT NULL REFERENCES patients (id),

  -- Quién lo registró (sale del token, no del cuerpo) y cómo se obtuvo
  -- (por ejemplo "Firmó el formulario en recepción"). La nota es opcional.
  granted_by uuid         NOT NULL REFERENCES users (id),
  note       varchar(200) CHECK (note IS NULL OR length(btrim(note)) >= 1),
  created_at timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),

  -- Si se revoca, queda escrito cuándo y quién. Las dos columnas van juntas.
  revoked_at timestamp,
  revoked_by uuid         REFERENCES users (id),

  CONSTRAINT ck_consents_revocacion CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT ck_consents_orden CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- Un solo consentimiento vigente por paciente: el índice parcial lo garantiza
-- aunque dos personas lo registren al mismo tiempo.
CREATE UNIQUE INDEX uq_consents_vigente ON consents (patient_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_consents_patient ON consents (patient_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Lo ya firmado no se reescribe: solo se puede REVOCAR (poner revoked_at y
-- revoked_by una vez). No se borra, no se cambia quién ni cuándo lo dio, y una
-- revocación no se deshace. Dos capas: sin permiso DELETE/TRUNCATE y un
-- disparador que también las frena si alguien devolviera los permisos.
-- -----------------------------------------------------------------------------
REVOKE DELETE, TRUNCATE ON consents FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON consents FROM CURRENT_USER;

CREATE FUNCTION consents_proteger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NULL
       AND NEW.revoked_at IS NOT NULL
       AND NEW.id = OLD.id
       AND NEW.patient_id = OLD.patient_id
       AND NEW.granted_by = OLD.granted_by
       AND NEW.note IS NOT DISTINCT FROM OLD.note
       AND NEW.created_at = OLD.created_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'consents solo permite revocar un consentimiento vigente: otros cambios no están permitidos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RAISE EXCEPTION 'consents no permite %: un consentimiento se revoca, no se borra.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consents_proteger
  BEFORE UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION consents_proteger();

CREATE TRIGGER trg_consents_no_truncate
  BEFORE TRUNCATE ON consents
  FOR EACH STATEMENT EXECUTE FUNCTION consents_proteger();
