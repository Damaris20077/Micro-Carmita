-- Aplicar después de 002 con cuenta administrativa. Sin cambios de datos previos.
CREATE TABLE pedidos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    proveedor_id INT UNSIGNED NOT NULL,
    creado_por INT UNSIGNED NOT NULL,
    estado VARCHAR(24) NOT NULL DEFAULT 'Pendiente',
    observaciones VARCHAR(255) NOT NULL DEFAULT '',
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    cancelado_por INT UNSIGNED NULL,
    cancelado_en DATETIME(6) NULL,
    motivo_cancelacion VARCHAR(255) NULL,
    KEY idx_pedido_estado_fecha (estado, creado_en),
    CONSTRAINT fk_pedido_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    CONSTRAINT fk_pedido_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    CONSTRAINT fk_pedido_cancelador FOREIGN KEY (cancelado_por) REFERENCES usuarios(id),
    CONSTRAINT chk_pedido_estado CHECK (estado IN ('Pendiente','Recibido parcialmente','Recibido completo','Cancelado')),
    CONSTRAINT chk_pedido_cancelacion CHECK (estado <> 'Cancelado' OR
        (cancelado_por IS NOT NULL AND cancelado_en IS NOT NULL AND motivo_cancelacion IS NOT NULL AND CHAR_LENGTH(TRIM(motivo_cancelacion)) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pedido_detalles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    cantidad INT UNSIGNED NOT NULL,
    recibida INT UNSIGNED NOT NULL DEFAULT 0,
    precio_compra DECIMAL(10,2) NOT NULL,
    UNIQUE KEY uq_pedido_producto (pedido_id, producto_id),
    UNIQUE KEY uq_pedido_detalle (pedido_id, id),
    CONSTRAINT fk_detalle_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    CONSTRAINT fk_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
    CONSTRAINT chk_detalle_cantidad CHECK (cantidad > 0 AND recibida <= cantidad),
    CONSTRAINT chk_detalle_compra CHECK (precio_compra >= 0)
) ENGINE=InnoDB;

CREATE TABLE recepciones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NOT NULL,
    clave VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    contenido_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UNIQUE KEY uq_recepcion_clave (pedido_id, clave),
    UNIQUE KEY uq_pedido_recepcion (pedido_id, id),
    CONSTRAINT fk_recepcion_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    CONSTRAINT fk_recepcion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE recepcion_detalles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT UNSIGNED NOT NULL,
    recepcion_id INT UNSIGNED NOT NULL,
    pedido_detalle_id INT UNSIGNED NOT NULL,
    lote_id INT UNSIGNED NOT NULL,
    cantidad INT UNSIGNED NOT NULL,
    UNIQUE KEY uq_recepcion_lote (lote_id),
    CONSTRAINT fk_recepcion_detalle_cabecera FOREIGN KEY (pedido_id, recepcion_id) REFERENCES recepciones(pedido_id, id),
    CONSTRAINT fk_recepcion_detalle_pedido FOREIGN KEY (pedido_id, pedido_detalle_id) REFERENCES pedido_detalles(pedido_id, id),
    CONSTRAINT fk_recepcion_detalle_lote FOREIGN KEY (lote_id) REFERENCES lotes(id),
    CONSTRAINT chk_recepcion_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

INSERT INTO schema_migrations (version) VALUES ('003_pedidos_recepciones');
