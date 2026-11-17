-- Aplicar solo después de 003, con cuenta administrativa. No borra registros.
CREATE TABLE ventas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NULL,
    usuario_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'Activa',
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    total DECIMAL(12,2) NOT NULL,
    abonado DECIMAL(12,2) NOT NULL DEFAULT 0,
    saldo DECIMAL(12,2) NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    KEY idx_venta_cliente_fecha (cliente_id,creado_en),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_venta_tipo CHECK (tipo IN ('contado','fiado')),
    CONSTRAINT chk_venta_estado CHECK (estado IN ('Activa','Anulada')),
    CONSTRAINT chk_venta_credito CHECK (tipo <> 'fiado' OR cliente_id IS NOT NULL),
    CONSTRAINT chk_venta_importes CHECK (revision > 0 AND version > 0 AND total > 0 AND abonado >= 0 AND abonado <= total AND saldo >= 0 AND
        ((estado = 'Anulada' AND saldo = 0) OR (estado = 'Activa' AND
        ((tipo = 'contado' AND saldo = 0 AND abonado = 0) OR (tipo = 'fiado' AND saldo = total - abonado)))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE venta_detalles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venta_id INT UNSIGNED NOT NULL,
    revision INT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    cantidad INT UNSIGNED NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    sin_existencia INT UNSIGNED NOT NULL,
    existencia_confirmada BOOLEAN NOT NULL,
    caducidad_fisica DATE NULL,
    UNIQUE KEY uq_venta_revision_producto (venta_id,revision,producto_id),
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    CONSTRAINT chk_venta_detalle CHECK (revision > 0 AND cantidad > 0 AND precio > 0 AND sin_existencia <= cantidad AND existencia_confirmada IN (0,1)
        AND (sin_existencia = 0 OR existencia_confirmada = 1))
) ENGINE=InnoDB;

CREATE TABLE venta_lotes (
    detalle_id INT UNSIGNED NOT NULL,
    lote_id INT UNSIGNED NOT NULL,
    cantidad INT UNSIGNED NOT NULL,
    PRIMARY KEY (detalle_id,lote_id),
    FOREIGN KEY (detalle_id) REFERENCES venta_detalles(id),
    FOREIGN KEY (lote_id) REFERENCES lotes(id),
    CONSTRAINT chk_venta_lote_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

CREATE TABLE venta_abonos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venta_id INT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    KEY idx_abono_venta_fecha (venta_id,creado_en),
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_abono_importe CHECK (importe > 0)
) ENGINE=InnoDB;

CREATE TABLE venta_caja (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venta_id INT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(15) NOT NULL,
    importe DECIMAL(12,2) NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_venta_caja CHECK ((tipo IN ('contado','abono') AND importe > 0)
        OR (tipo = 'reembolso' AND importe < 0) OR (tipo = 'correccion' AND importe <> 0))
) ENGINE=InnoDB;

CREATE TABLE venta_historial (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venta_id INT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NOT NULL,
    accion VARCHAR(15) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    anterior JSON NOT NULL,
    posterior JSON NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_venta_historial CHECK (accion IN ('crear','editar','anular','abonar') AND CHAR_LENGTH(TRIM(motivo)) > 0)
) ENGINE=InnoDB;

CREATE TABLE venta_operaciones (
    usuario_id INT UNSIGNED NOT NULL,
    clave VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    contenido_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    respuesta JSON NOT NULL,
    PRIMARY KEY (usuario_id,clave),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- Amplía la lista permitida en una sola sentencia, conservando los tipos previos
-- y la restricción de balance existente. No cambia datos de movimientos previos.
ALTER TABLE movimientos_inventario DROP CHECK chk_inventario_tipo,
    ADD CONSTRAINT chk_inventario_tipo CHECK (tipo IN ('alta','entrada','ajuste','venta','reversion'));

INSERT INTO schema_migrations (version) VALUES ('004_ventas_cobros');
