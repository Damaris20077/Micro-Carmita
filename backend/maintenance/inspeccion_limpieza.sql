-- SOLO LECTURA. Para revisión administrativa local antes de cualquier autorización.
-- No contiene DML ni DDL. Sus resultados pueden revelar estructura privada: no subirlos a Git.
-- Usar una cuenta que vea TRIGGER, EVENT, rutinas y dependencias entre esquemas.
-- No interpretar cero filas con la cuenta DML de la aplicación como ausencia de objetos.
SELECT DATABASE() AS base_seleccionada, VERSION() AS version_mysql,
       @@port AS puerto, @@server_uuid AS instancia, @@event_scheduler AS programador_eventos;

SHOW GRANTS;

SELECT TABLE_SCHEMA,TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION
FROM information_schema.TABLES WHERE TABLE_SCHEMA='micro_carmita'
ORDER BY TABLE_NAME;

SELECT k.TABLE_SCHEMA,k.TABLE_NAME,k.COLUMN_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION,
       k.REFERENCED_TABLE_SCHEMA,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,
       r.DELETE_RULE,r.UPDATE_RULE
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.REFERENTIAL_CONSTRAINTS r
 ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
WHERE k.REFERENCED_TABLE_SCHEMA='micro_carmita'
   OR (k.TABLE_SCHEMA='micro_carmita' AND k.REFERENCED_TABLE_NAME IS NOT NULL)
ORDER BY k.TABLE_SCHEMA,k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;

SELECT t.TABLE_NAME,t.CONSTRAINT_NAME,t.CONSTRAINT_TYPE,t.ENFORCED,c.CHECK_CLAUSE
FROM information_schema.TABLE_CONSTRAINTS t
LEFT JOIN information_schema.CHECK_CONSTRAINTS c
 ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME
WHERE t.TABLE_SCHEMA='micro_carmita' ORDER BY t.TABLE_NAME,t.CONSTRAINT_NAME;

SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='micro_carmita'
ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;

-- Metadatos de TODOS los esquemas de usuario, para no omitir dependencias externas.
-- No se muestran cuerpos: si aparece cualquier objeto, revisar SHOW CREATE en privado
-- y detener este plan hasta descartar efectos, SQL dinámico o escrituras cruzadas.
SELECT TRIGGER_SCHEMA,TRIGGER_NAME,EVENT_OBJECT_SCHEMA,EVENT_OBJECT_TABLE,
       ACTION_TIMING,EVENT_MANIPULATION,SHA2(ACTION_STATEMENT,256) AS huella_definicion
FROM information_schema.TRIGGERS
WHERE EVENT_OBJECT_SCHEMA NOT IN ('mysql','sys','information_schema','performance_schema')
ORDER BY TRIGGER_SCHEMA,TRIGGER_NAME;

SELECT ROUTINE_SCHEMA,ROUTINE_NAME,ROUTINE_TYPE,SQL_DATA_ACCESS,SECURITY_TYPE,
       SHA2(ROUTINE_DEFINITION,256) AS huella_definicion
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA NOT IN ('mysql','sys','information_schema','performance_schema')
ORDER BY ROUTINE_SCHEMA,ROUTINE_NAME;

SELECT EVENT_SCHEMA,EVENT_NAME,STATUS,EVENT_TYPE,INTERVAL_VALUE,INTERVAL_FIELD,
       SHA2(EVENT_DEFINITION,256) AS huella_definicion
FROM information_schema.EVENTS
WHERE EVENT_SCHEMA NOT IN ('mysql','sys','information_schema','performance_schema')
ORDER BY EVENT_SCHEMA,EVENT_NAME;

SELECT version FROM micro_carmita.schema_migrations ORDER BY version;

-- Solo agregados; nunca seleccionar hashes de contraseña, tokens o datos personales.
SELECT 'auditoria_usuarios' AS tabla, COUNT(*) AS filas FROM micro_carmita.`auditoria_usuarios`
UNION ALL
SELECT 'clientes' AS tabla, COUNT(*) AS filas FROM micro_carmita.`clientes`
UNION ALL
SELECT 'lotes' AS tabla, COUNT(*) AS filas FROM micro_carmita.`lotes`
UNION ALL
SELECT 'movimientos_financieros' AS tabla, COUNT(*) AS filas FROM micro_carmita.`movimientos_financieros`
UNION ALL
SELECT 'movimientos_inventario' AS tabla, COUNT(*) AS filas FROM micro_carmita.`movimientos_inventario`
UNION ALL
SELECT 'pedido_detalles' AS tabla, COUNT(*) AS filas FROM micro_carmita.`pedido_detalles`
UNION ALL
SELECT 'pedidos' AS tabla, COUNT(*) AS filas FROM micro_carmita.`pedidos`
UNION ALL
SELECT 'productos' AS tabla, COUNT(*) AS filas FROM micro_carmita.`productos`
UNION ALL
SELECT 'proveedores' AS tabla, COUNT(*) AS filas FROM micro_carmita.`proveedores`
UNION ALL
SELECT 'recepcion_detalles' AS tabla, COUNT(*) AS filas FROM micro_carmita.`recepcion_detalles`
UNION ALL
SELECT 'recepciones' AS tabla, COUNT(*) AS filas FROM micro_carmita.`recepciones`
UNION ALL
SELECT 'roles' AS tabla, COUNT(*) AS filas FROM micro_carmita.`roles`
UNION ALL
SELECT 'schema_migrations' AS tabla, COUNT(*) AS filas FROM micro_carmita.`schema_migrations`
UNION ALL
SELECT 'sesiones' AS tabla, COUNT(*) AS filas FROM micro_carmita.`sesiones`
UNION ALL
SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM micro_carmita.`usuarios`
UNION ALL
SELECT 'venta_abonos' AS tabla, COUNT(*) AS filas FROM micro_carmita.`venta_abonos`
UNION ALL
SELECT 'venta_caja' AS tabla, COUNT(*) AS filas FROM micro_carmita.`venta_caja`
UNION ALL
SELECT 'venta_detalles' AS tabla, COUNT(*) AS filas FROM micro_carmita.`venta_detalles`
UNION ALL
SELECT 'venta_historial' AS tabla, COUNT(*) AS filas FROM micro_carmita.`venta_historial`
UNION ALL
SELECT 'venta_lotes' AS tabla, COUNT(*) AS filas FROM micro_carmita.`venta_lotes`
UNION ALL
SELECT 'venta_operaciones' AS tabla, COUNT(*) AS filas FROM micro_carmita.`venta_operaciones`
UNION ALL
SELECT 'ventas' AS tabla, COUNT(*) AS filas FROM micro_carmita.`ventas`;

-- Estructura real completa para comparar con las migraciones; sin filas de negocio.
SHOW CREATE TABLE micro_carmita.`auditoria_usuarios`;
SHOW CREATE TABLE micro_carmita.`clientes`;
SHOW CREATE TABLE micro_carmita.`lotes`;
SHOW CREATE TABLE micro_carmita.`movimientos_financieros`;
SHOW CREATE TABLE micro_carmita.`movimientos_inventario`;
SHOW CREATE TABLE micro_carmita.`pedido_detalles`;
SHOW CREATE TABLE micro_carmita.`pedidos`;
SHOW CREATE TABLE micro_carmita.`productos`;
SHOW CREATE TABLE micro_carmita.`proveedores`;
SHOW CREATE TABLE micro_carmita.`recepcion_detalles`;
SHOW CREATE TABLE micro_carmita.`recepciones`;
SHOW CREATE TABLE micro_carmita.`roles`;
SHOW CREATE TABLE micro_carmita.`schema_migrations`;
SHOW CREATE TABLE micro_carmita.`sesiones`;
SHOW CREATE TABLE micro_carmita.`usuarios`;
SHOW CREATE TABLE micro_carmita.`venta_abonos`;
SHOW CREATE TABLE micro_carmita.`venta_caja`;
SHOW CREATE TABLE micro_carmita.`venta_detalles`;
SHOW CREATE TABLE micro_carmita.`venta_historial`;
SHOW CREATE TABLE micro_carmita.`venta_lotes`;
SHOW CREATE TABLE micro_carmita.`venta_operaciones`;
SHOW CREATE TABLE micro_carmita.`ventas`;
