-- Exclusivo para bases aisladas de desarrollo y pruebas.
-- Aplicar con cuenta administrativa después de 001_auth.sql.
START TRANSACTION;
INSERT INTO roles (codigo) VALUES ('superusuario');
INSERT INTO schema_migrations (version) VALUES ('dev_001_superuser_role');
COMMIT;
