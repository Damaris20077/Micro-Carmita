-- Requiere 004. Aplicar con cuenta administrativa; sin cambios de filas previas.
CREATE TABLE movimientos_financieros (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    fecha DATE NOT NULL,
    gasto_administrativo BOOLEAN NOT NULL DEFAULT FALSE,
    clave VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    contenido_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UNIQUE KEY uq_finanzas_usuario_clave (usuario_id,clave),
    KEY idx_finanzas_fecha (fecha,id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_finanzas_tipo CHECK (tipo IN ('ingreso','egreso')),
    CONSTRAINT chk_finanzas_importe CHECK (importe > 0 AND importe <= 99999999.99),
    CONSTRAINT chk_finanzas_categoria CHECK (CHAR_LENGTH(TRIM(categoria)) > 0),
    CONSTRAINT chk_finanzas_motivo CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
    CONSTRAINT chk_finanzas_administrativo CHECK (gasto_administrativo IN (0,1) AND (gasto_administrativo=0 OR tipo='egreso'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version) VALUES ('005_finanzas');
