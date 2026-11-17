-- Aplicar después de 001_auth con cuenta administrativa. Conserva autenticación.
CREATE TABLE clientes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    identificacion VARCHAR(30) NULL,
    telefono VARCHAR(30) NULL,
    direccion VARCHAR(255) NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UNIQUE KEY uq_cliente_identificacion (identificacion),
    KEY idx_cliente_nombre (nombre),
    CONSTRAINT chk_cliente_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE proveedores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    identificacion VARCHAR(30) NULL,
    telefono VARCHAR(30) NULL,
    direccion VARCHAR(255) NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UNIQUE KEY uq_proveedor_identificacion (identificacion),
    KEY idx_proveedor_nombre (nombre),
    CONSTRAINT chk_proveedor_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE productos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    precio_compra DECIMAL(10,2) NOT NULL,
    precio_venta DECIMAL(10,2) NOT NULL,
    proveedor_id INT UNSIGNED NOT NULL,
    faltante INT UNSIGNED NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UNIQUE KEY uq_producto_nombre (nombre),
    CONSTRAINT fk_producto_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    CONSTRAINT chk_producto_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
    CONSTRAINT chk_producto_categoria CHECK (CHAR_LENGTH(TRIM(categoria)) > 0),
    CONSTRAINT chk_producto_compra CHECK (precio_compra >= 0),
    CONSTRAINT chk_producto_venta CHECK (precio_venta > 0),
    CONSTRAINT chk_producto_activo CHECK (activo IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lotes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    producto_id INT UNSIGNED NOT NULL,
    proveedor_id INT UNSIGNED NOT NULL,
    codigo VARCHAR(60) NOT NULL,
    cantidad INT UNSIGNED NOT NULL,
    precio_compra DECIMAL(10,2) NOT NULL,
    fecha_ingreso DATE NOT NULL,
    caducidad DATE NULL,
    UNIQUE KEY uq_lote_producto_codigo (producto_id,codigo),
    KEY idx_lote_caducidad (caducidad),
    CONSTRAINT fk_lote_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
    CONSTRAINT fk_lote_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    CONSTRAINT chk_lote_codigo CHECK (CHAR_LENGTH(TRIM(codigo)) > 0),
    CONSTRAINT chk_lote_precio CHECK (precio_compra >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE movimientos_inventario (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    producto_id INT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(15) NOT NULL,
    cantidad INT NOT NULL,
    stock_antes BIGINT NOT NULL,
    stock_despues BIGINT NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    detalle JSON NOT NULL,
    ocurrido_en DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    KEY idx_movimiento_producto_fecha (producto_id,ocurrido_en),
    CONSTRAINT fk_inventario_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
    CONSTRAINT fk_inventario_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_inventario_tipo CHECK (tipo IN ('alta','entrada','ajuste')),
    CONSTRAINT chk_inventario_motivo CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
    CONSTRAINT chk_inventario_balance CHECK (stock_despues = stock_antes + cantidad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (version) VALUES ('002_catalogo_inventario');
