# Pedidos y recepciones

## Alcance

Esta entrega implementa el bloque solicitado bajo RF-19, RF-21, RF-22, RF-23, RF-24 y RF-35 conforme a las operaciones descritas en la solicitud. El texto individual oficial de esos seis RF no estaba incluido en ella ni en los documentos locales examinados. La trazabilidad definitiva de cada número deberá contrastarse con el documento oficial. El alcance implementado comprende creación administrativa de pedidos a proveedor, consulta de detalles y estados, cancelación administrativa, recepción por Administrador o Vendedor y actualización transaccional del inventario con trazabilidad de lotes.

Antes de desarrollar este bloque se verificaron rama desarrollo-jose, secretos de los cuatro archivos pendientes, formato y 186 pruebas exitosas. Se creó el commit local `265a33a`, con INVENTORY.md y las herramientas de validación reversible del inventario. No se realizó push. Los cambios del nuevo bloque permanecen pendientes de revisión y commit.

## Estructura y reglas

- `pedidos` referencia proveedor, creador y cancelador. Guarda estado, observaciones, motivo y fecha de cancelación.
- `pedido_detalles` guarda producto, cantidad solicitada, cantidad recibida y precio de compra acordado. Un producto aparece una sola vez por pedido. Los productos deben existir y estar activos. Se permiten de una a cien líneas y cantidades enteras positivas. El proveedor del pedido puede diferir del proveedor principal del catálogo, permitiendo comprar el producto a otro proveedor existente.
- `recepciones` guarda pedido, responsable autenticado, fecha UTC, clave de idempotencia y huella del contenido normalizado. La clave es única por pedido.
- `recepcion_detalles` relaciona cada recepción con la línea del mismo pedido y un lote nuevo. Las FK compuestas impiden relacionar cabeceras o detalles de pedidos diferentes. La cantidad recibida es positiva. Los lotes conservan costo recibido, proveedor, fecha de ingreso y caducidad.

Los estados son Pendiente, Recibido parcialmente, Recibido completo y Cancelado. La recepción completa requiere cubrir todas las líneas. Administrador puede cancelar pedidos pendientes o parciales con motivo obligatorio. Las unidades recibidas antes de cancelar se conservan, y se bloquea únicamente la recepción del saldo restante. Un pedido completo o ya cancelado queda cerrado. No se eliminan pedidos ni recepciones.

Solo Administrador crea y cancela pedidos. Administrador y Vendedor consultan y reciben pedidos existentes. Superusuario queda fuera de las operaciones de pedidos, incluso en pruebas. La autenticación continúa bloqueándolo en producción. La API valida campos, pertenencia de líneas, proveedor, producto activo, fechas, precios con dos decimales y cantidades pendientes. Las cantidades de una recepción se agregan por línea antes de verificar límites, de modo que varias partidas no puedan superar juntas el saldo.

La operación bloquea al responsable, la cabecera del pedido y sus detalles. La creación de recepción, lotes, entradas de inventario, actualización de cantidades y estado se confirma en una sola transacción. No se ejecutan transacciones de inventario separadas dentro de la recepción. Las actualizaciones utilizan el mismo objeto de conexión mysql2/promise. Un error provoca rollback del conjunto.

La nueva entrada interna `recibirPedido` reutiliza la entrada de inventario y las reglas de modelo.js. Permite que un Vendedor reciba una compra autorizada sin habilitarle el endpoint de entradas libres ni ajustes administrativos. Los lotes vigentes concilian faltantes antes de quedar como existencias disponibles. Los lotes caducados conservan el faltante y mantienen su estado para las alertas. Se contabilizan las unidades físicamente recibidas del pedido, aunque se consuman para regularizar un faltante. RF-06 queda preparado mediante esa conciliación. La implementación de ventas permanece pendiente.

Cada recepción debe tener clave de idempotencia de 8 a 80 caracteres ASCII de letras, números, guion o guion bajo. Un reintento con la misma clave y contenido devuelve la recepción existente, sin nuevos lotes ni movimientos, incluso si el pedido se completó después de aquella recepción. Una clave reutilizada con contenido diferente devuelve 409. Una nueva recepción en un pedido cerrado también devuelve 409.

Para evitar atribuir una recepción repetida a otro lote, los códigos de lote mantienen su unicidad por producto. Cada nueva partida de recepción requiere un código que todavía no exista para ese producto. Se pueden recibir varias partidas de la misma línea en una solicitud, con códigos diferentes. Reutilizar un lote existente requiere una ampliación explícita futura del modelo de entradas, y actualmente se rechaza sin modificar sus datos.

## API y pantalla

Todas las rutas utilizan la sesión y protección CSRF existentes.

| Método y ruta | Operación |
| --- | --- |
| GET `/api/orders` | Lista pedidos y estados. |
| GET `/api/orders/:id` | Cabecera, detalles solicitados/recibidos e historial de recepciones, lotes y responsables. |
| POST `/api/orders` | Crear pedido. Administrador. |
| POST `/api/orders/:id/cancel` | Cancelar con `{ "motivo": "..." }`. Administrador. |
| POST `/api/orders/:id/receipts` | Recibir partidas. Administrador o Vendedor. |

Ejemplo de creación.

```json
{
  "proveedorId": 1,
  "observaciones": "Entrega parcial permitida",
  "detalles": [{ "productoId": 1, "cantidad": 5, "precioCompra": 0.8 }]
}
```

Ejemplo de recepción. El detalleId procede de GET del pedido, y la clave debe generarse para esa operación y conservarse en sus reintentos.

```json
{
  "clave": "recepcion-unica-por-operacion",
  "lineas": [{
    "detalleId": 1,
    "cantidad": 2,
    "codigo": "COMPRA-LOTE-01",
    "fechaIngreso": "2026-11-17",
    "caducidad": "2026-12-20",
    "precioCompra": 0.8
  }]
}
```

La nueva pantalla Pedidos y recepciones permite agregar líneas, consultar estados, recibir parcialmente y ver historial. La creación y cancelación se ocultan al Vendedor y se protegen en Express. La pantalla genera una clave por envío y la conserva al reintentar una respuesta perdida. También bloquea envíos simultáneos desde esa instancia de pantalla. Las consultas y escrituras utilizan la API y MySQL. No se guardan pedidos o recepciones en localStorage. La recepción actualiza la vista del inventario remoto al terminar.

## Migración administrativa pendiente

`backend/migrations/003_pedidos_recepciones.sql` crea cuatro tablas y registra su versión. No contiene ALTER, DROP, TRUNCATE, REPLACE ni cambios en los registros existentes de autenticación, clientes o inventario. Las FK e índices son compatibles con MySQL 8.0.46. Se necesita aplicar previamente 001 y 002.

Desde la raíz, abra el cliente como root y compruebe destino, versiones y ausencia de las cuatro tablas nuevas. La contraseña se solicita en el terminal.

```powershell
$mysqlClient = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
& $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita
```

```sql
SELECT DATABASE(), VERSION(), CURRENT_USER();
SELECT version FROM schema_migrations ORDER BY version;
SHOW TABLES;
EXIT;
```

Después de autorizar la operación, ejecute únicamente 003, sin repetir 001, 002 o las migraciones de desarrollo.

```powershell
$preflight = @'
SELECT CASE WHEN DATABASE() = 'micro_carmita'
 AND SUBSTRING_INDEX(CURRENT_USER(), '@', 1) = 'root'
 AND (SELECT COUNT(*) FROM schema_migrations WHERE version IN ('001_auth','002_catalogo_inventario')) = 2
 AND (SELECT COUNT(*) FROM schema_migrations WHERE version = '003_pedidos_recepciones') = 0
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('pedidos','pedido_detalles','recepciones','recepcion_detalles')) = 0
 THEN 'APLICABLE' ELSE 'DETENER' END;
'@
$estadoMigracion = @(& $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita --batch --skip-column-names --execute=$preflight)
if ($LASTEXITCODE -ne 0 -or ($estadoMigracion -join '').Trim() -ne 'APLICABLE') {
    throw 'No aplicar 003: revise versiones, tablas y cuenta administrativa.'
}
Get-Content -Raw -Encoding UTF8 backend/migrations/003_pedidos_recepciones.sql |
    & $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita --default-character-set=utf8mb4 --batch --skip-reconnect
if ($LASTEXITCODE -ne 0) { throw 'Migración interrumpida. Inspeccione el esquema antes de continuar.' }
```

DDL tiene commits implícitos. Ante un error parcial, revise las estructuras creadas antes de reanudar. micro_app conserva permisos DML y no ejecuta migraciones. Después, compruebe 14 tablas, versión 003, claves, índices y restricciones, y confirme que el Administrador y sus sesiones permanecen intactos.

La comprobación previa y la aplicación solicitan por separado la contraseña de root en la terminal. El archivo SQL no es una migración repetible: no utiliza IF NOT EXISTS ni elimina estructuras para reintentarse. La comprobación detiene tanto una versión ya registrada como una aplicación parcial con tablas existentes. No use --force. Ejecute sin otro operador aplicando migraciones simultáneamente.

Después de aplicar 003, abra nuevamente el cliente administrativo y ejecute estas consultas de solo lectura:

```sql
SELECT version FROM schema_migrations ORDER BY version;
SELECT COUNT(*) AS tablas FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();
SHOW CREATE TABLE pedidos;
SHOW CREATE TABLE pedido_detalles;
SHOW CREATE TABLE recepciones;
SHOW CREATE TABLE recepcion_detalles;
SELECT TABLE_NAME, CONSTRAINT_TYPE, COUNT(*) AS total
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('pedidos','pedido_detalles','recepciones','recepcion_detalles')
GROUP BY TABLE_NAME, CONSTRAINT_TYPE ORDER BY TABLE_NAME, CONSTRAINT_TYPE;
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('pedidos','pedido_detalles','recepciones','recepcion_detalles')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
```

Se esperan cuatro claves primarias, diez claves foráneas, cinco restricciones UNIQUE adicionales a las primarias y cinco CHECK. Las FK compuestas vinculan detalles y recepciones al mismo pedido. Ninguna relación usa borrado en cascada. Los cuatro estados válidos y el motivo obligatorio de cancelación están restringidos en SQL; las transiciones, los límites agregados de recepción y la comparación de contenido idempotente se validan además en el servicio con bloqueos transaccionales. No se atribuye a los CHECK la validación entre tablas.

## Verificación

La suite completa pasó con 223 pruebas exitosas, cero fallidas, omitidas o canceladas, código de salida 0 y duración observada de 5548.3672 ms. Conserva las 186 anteriores y añade 37 pruebas. Incluye permisos, cantidades, estados, cancelación parcial, idempotencia, exceso agregado, múltiples líneas, conciliación, rollback de recepción/lotes/historial/estado y operaciones concurrentes. Las pruebas HTTP utilizan Express y middleware de sesión/CSRF con persistencia simulada. Las pruebas del frontend verifican consumo de API y conservación de la clave ante una respuesta perdida.

`backend/verify-orders-real.js` queda preparado para un ensayo manual después de aplicar 003. Usa una conexión MySQL exclusiva, savepoints para las transacciones internas y rollback externo obligatorio mediante el cierre seguro existente. Genera proveedor, producto, Vendedor, pedidos y recepciones temporales. Compara internamente la cuenta del Administrador y sus sesiones anteriores después del rollback, sin mostrarlas. Los registros de ensayo desaparecen y pueden quedar saltos de autoincremento.

```powershell
$claveEnsayo = $null
try {
    $env:AUTH_CHECK_USER = Read-Host 'Usuario Administrador'
    $claveEnsayo = Read-Host 'Contraseña del Administrador' -AsSecureString
    $env:AUTH_CHECK_PASSWORD = [System.Net.NetworkCredential]::new('', $claveEnsayo).Password
    node backend/verify-orders-real.js
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Revise etapaFallida o erroresLimpieza, sin compartir secretos.' }
} finally {
    Remove-Item Env:AUTH_CHECK_USER, Env:AUTH_CHECK_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $claveEnsayo) { $claveEnsayo.Dispose() }
    Remove-Variable claveEnsayo -ErrorAction SilentlyContinue
}
```

Se esperan ok y rollback en true. Este ensayo secuencial valida lecturas y escrituras MySQL reversibles. La verificación de commits durables, competencia entre conexiones reales y uso visual en navegador queda pendiente de un entorno aislado posterior a la migración. Evite utilizar otras sesiones del Administrador durante la comparación para impedir cambios concurrentes ajenos al ensayo. En esta entrega no se ejecutó la migración ni el ensayo real.

Revisión previa de activación del 17 de noviembre de 2026: rama desarrollo-jose; MySQL 8.0.46; únicamente 001_auth y 002_catalogo_inventario registradas; diez tablas InnoDB; un Administrador activo. Los id referenciados de usuarios, proveedores, productos y lotes son INT UNSIGNED con clave primaria. micro_app mantiene exclusivamente SELECT, INSERT, UPDATE y DELETE sobre micro_carmita, además de USAGE. Se realizaron solo consultas de lectura. npm test confirmó 223 exitosas, 0 fallidas, 0 omitidas y 0 canceladas, con salida 0. git diff --check terminó con salida 0, con avisos de conversión LF/CRLF y sin errores de formato.

La revisión del ensayo confirmó que todas sus escrituras, incluidas las sesiones nuevas y la auditoría del Vendedor temporal, comparten la misma conexión dentro de la transacción externa. Los commits internos solo liberan savepoints. El cierre del servidor precede al rollback para terminar las solicitudes pendientes; si falla ese cierre, se intenta igualmente rollback. Si rollback falla, se destruye la conexión en vez de devolverla al pool. Las cinco pruebas de verification-cleanup.test.cjs cubren estos caminos. El ensayo no utiliza cookies de sesiones existentes ni modifica el Administrador. No imprime contraseñas, hashes ni tokens. Las comparaciones posteriores del Administrador y sus sesiones se ejecutan en memoria. Ante cualquier etapa fallida o error de limpieza, no considerar aprobado el ensayo.

Archivos nuevos del bloque son la migración 003, order-repository.js, order-service.js, order-routes.js, order.test.cjs, order-client.test.cjs, verify-orders-real.js, orders-client.js y este documento. Se modifican backend/app.js, backend/server.js, backend/inventory-service.js, index.html y README.md. Se conservan los datos reales y las pruebas anteriores.
