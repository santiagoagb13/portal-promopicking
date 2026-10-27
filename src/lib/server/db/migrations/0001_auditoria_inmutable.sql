-- El registro de auditoría es inmutable: solo admite INSERT (sección 4.3 del plan).
CREATE OR REPLACE FUNCTION audit_log_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_log es inmutable: % no permitido', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_sin_cambios BEFORE UPDATE OR DELETE ON audit_log
	FOR EACH ROW EXECUTE FUNCTION audit_log_inmutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_sin_truncate BEFORE TRUNCATE ON audit_log
	FOR EACH STATEMENT EXECUTE FUNCTION audit_log_inmutable();
