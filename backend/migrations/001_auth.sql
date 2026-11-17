-- Aplicar una sola vez en micro_carmita con una cuenta administrativa.
-- MySQL 8.0.46. La aplicación no ejecuta este archivo.
CREATE TABLE schema_migrations (
    version VARCHAR(80) PRIMARY KEY,
    aplicada_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE roles (
    codigo VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    CONSTRAINT chk_roles CHECK (codigo IN ('administrador', 'vendedor', 'superusuario'))
) ENGINE=InnoDB;

INSERT INTO roles (codigo) VALUES ('administrador'), ('vendedor');

CREATE TABLE usuarios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    usuario VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
    password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    rol VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    actualizado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UNIQUE KEY uq_usuario (usuario),
    KEY idx_usuarios_rol_activo (rol, activo),
    CONSTRAINT fk_usuario_rol FOREIGN KEY (rol) REFERENCES roles(codigo),
    CONSTRAINT chk_usuario_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
    CONSTRAINT chk_usuario_cuenta CHECK (CHAR_LENGTH(usuario) BETWEEN 3 AND 30 AND REGEXP_LIKE(usuario, '^[A-Za-z0-9._-]+$')),
    CONSTRAINT chk_usuario_hash CHECK (CHAR_LENGTH(password_hash) > 0),
    CONSTRAINT chk_usuario_activo CHECK (activo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sesiones (
    token_hash BINARY(32) PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    creada_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    ultima_actividad_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    expira_en DATETIME(6) NOT NULL,
    revocada_en DATETIME(6) NULL,
    KEY idx_sesiones_usuario (usuario_id),
    KEY idx_sesiones_expira (expira_en),
    CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_sesion_expira CHECK (expira_en > creada_en),
    CONSTRAINT chk_sesion_actividad CHECK (ultima_actividad_en >= creada_en),
    CONSTRAINT chk_sesion_revocada CHECK (revocada_en IS NULL OR revocada_en >= creada_en)
) ENGINE=InnoDB;

CREATE TABLE auditoria_usuarios (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id INT UNSIGNED NULL,
    usuario_afectado_id INT UNSIGNED NOT NULL,
    accion VARCHAR(30) NOT NULL,
    anterior JSON NULL,
    posterior JSON NULL,
    ocurrido_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    KEY idx_auditoria_usuario_fecha (usuario_afectado_id, ocurrido_en),
    CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_id) REFERENCES usuarios(id),
    CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_afectado_id) REFERENCES usuarios(id),
    CONSTRAINT chk_auditoria_accion CHECK (accion IN ('crear', 'modificar', 'activar', 'desactivar', 'cambiar_password'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (version) VALUES ('001_auth');
