-- audit_logs bersifat append-only: UPDATE dan DELETE ditolak di level database.
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs bersifat append-only: UPDATE ditolak');
END;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs bersifat append-only: DELETE ditolak');
END;
