-- =============================================================================
-- 07_interconsultas.sql
-- Interconsulta: un médico le da a otro médico acceso TEMPORAL al expediente de
-- un paciente que el segundo todavía no ha atendido.
-- Depende de: 01_base.sql (users) y 03_pacientes.sql (patients).
--
-- Por defecto un médico solo ve a los pacientes con los que tiene una cita.
-- La interconsulta es la excepción controlada: queda escrito quién la dio, por
-- qué y hasta cuándo, y se puede revocar antes de que venza.
-- Que quien la da sea médico, y que tenga acceso a ese paciente, lo revisa la
-- API: son reglas que miran otras tablas.
-- =============================================================================
CREATE TABLE referrals (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid         NOT NULL REFERENCES patients (id),

  -- Médico que recibe el acceso y médico que lo concede. Los dos salen de datos
  -- validados por la API; quien concede sale del token, no del cuerpo.
  provider_id uuid         NOT NULL REFERENCES users (id),
  granted_by  uuid         NOT NULL REFERENCES users (id),

  reason      varchar(500) NOT NULL CHECK (length(btrim(reason)) >= 3),
  created_at  timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'America/El_Salvador'),
  expires_at  timestamp    NOT NULL,

  -- Si se revoca, queda escrito cuándo y quién. Las dos columnas van juntas.
  revoked_at  timestamp,
  revoked_by  uuid         REFERENCES users (id),

  CONSTRAINT ck_referrals_distintos CHECK (provider_id <> granted_by),
  CONSTRAINT ck_referrals_vigencia CHECK (expires_at > created_at),
  CONSTRAINT ck_referrals_revocacion CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

-- Para saber si un médico tiene acceso vigente a un paciente (la consulta más
-- frecuente) y para listar las interconsultas de un paciente.
CREATE INDEX idx_referrals_provider ON referrals (provider_id, patient_id, expires_at);
CREATE INDEX idx_referrals_patient  ON referrals (patient_id, created_at DESC);
