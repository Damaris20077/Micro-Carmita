# Ventas, fiados y abonos

Implementación basada en la lectura completa de rf.txt, cuyas 38 líneas no vacías corresponden, en orden, a RF-01 hasta RF-38. Se conserva ese archivo sin modificaciones. Rama desarrollo-jose; el módulo anterior de pedidos está en el commit local 0cae9e8. Esta entrega no ejecuta migraciones, ensayos con escrituras reales, commits ni push.

## Requisitos oficiales y correspondencia

| RF | Texto exacto de rf.txt | Implementación |
| --- | --- | --- |
| RF-04 | El sistema deberá permitir registrar ventas indicando los productos, cantidades, valores y total de la operación. | Cabecera, líneas con nombre y precio histórico, cantidades y total calculado en el servidor. Administrador y Vendedor registran y consultan. No se exige factura electrónica, número fiscal ni un servicio externo. |
| RF-05 | El sistema deberá descontar automáticamente del inventario las cantidades correspondientes a los productos vendidos. | Descuento de lotes, faltante y movimiento en la misma transacción de la venta. |
| RF-06 | El sistema deberá permitir registrar ventas con stock igual a cero o insuficiente cuando el producto exista físicamente, generando temporalmente inventario negativo hasta que este sea regularizado mediante la recepción de mercadería o un ajuste autorizado por el Administrador. | Confirmación explícita de existencia física y declaración de caducidad de las unidades adicionales. Se reutiliza producto.faltante, que ya regularizan entradas, recepciones y ajustes administrativos. |
| RF-07 | El sistema deberá impedir la venta de productos cuya fecha de caducidad haya vencido. | FEFO solo sobre lotes no vencidos; no consume lotes caducados. Rechaza también una declaración física vencida o la existencia exclusiva de lotes caducados. El día de caducidad sigue vigente, según modelo.js. |
| RF-08 | Únicamente el Administrador podrá modificar o eliminar una venta previamente registrada. | PATCH y anulación exclusiva del Administrador en Express, revalidados dentro de la transacción. La eliminación se implementa como anulación lógica con restitución de existencias y reversión contable, conservando documentos y pagos. |
| RF-10 | El sistema deberá permitir registrar ventas fiadas asociándolas con el cliente correspondiente. | cliente_id obligatorio y FK para fiados; opcional para contado. Usa clientes existentes de RF-09. |
| RF-11 | El sistema deberá registrar el valor total adeudado, los abonos realizados y el saldo pendiente de cada cliente. | Total, abonado y saldo por venta; agregación de fiados activos por cliente sin otra tabla de saldos independiente. |
| RF-12 | El sistema deberá permitir registrar pagos parciales o abonos y actualizar automáticamente el saldo restante. | Abono positivo hasta el saldo, bloqueo de venta, ingreso único, actualización de saldo e historial en una transacción. Administrador y Vendedor pueden registrar abonos. |
| RF-13 | El sistema deberá permitir consultar el historial de valores pendientes y pagos realizados por cada cliente. | Consulta por cliente con ventas activas y anuladas, abonos con fecha y responsable, caja e historial. Los cambios de asociación sin abonos conservan la relación histórica con el cliente anterior, sin atribuirle la deuda actual. |

Los RF anteriores reservan expresamente la modificación/eliminación al Administrador; no reservan al Administrador el registro o consulta de ventas y abonos. Se mantiene el permiso operativo existente del Vendedor para ventas y cuentas. Superusuario no tiene acceso a este módulo; además continúa bloqueado en autenticación de producción. Estas decisiones no agregan RF ni alteran los 38 originales.

## Reglas de validación y conservación

Se aceptan cantidades enteras entre 1 y 2147483647, precios positivos con dos decimales hasta 99999999.99, de uno a cien productos distintos y total de venta hasta 999999999.00, compatible con el límite del modelo. Los importes se calculan en centavos enteros y se guardan como DECIMAL. El total del cliente considera solo sus fiados actuales activos; los anulados quedan en el historial con saldo cero. No se admite sobrepago, pago a contado, pago de venta anulada, campos desconocidos ni producto inexistente. Un producto archivado no admite unidades adicionales vendidas.

Las validaciones de importes, cantidades, motivo, idempotencia y límites son decisiones técnicas que concretan operaciones válidas; no se presentan como textos literales adicionales de rf.txt. Los precios positivos introducidos para cada línea se registran como valores de esa venta; rf.txt no define una autorización especial para descuentos ni impone un precio fijo. La pantalla propone el precio del catálogo.

Cuando no alcanzan los lotes válidos, confirmarExistencia debe ser true y caducidadFisica debe estar explícitamente presente como fecha AAAA-MM-DD no vencida o null si no tiene caducidad. La declaración es responsabilidad del operador: el sistema no puede verificar físicamente las unidades. Si solo hay lotes caducados con cantidad, el modelo bloquea la venta; registre previamente el lote válido real en ese caso. No se utiliza la confirmación para desbloquear existencias vencidas.

Una edición genera una revisión inmutable nueva de las líneas. Solo descuenta unidades adicionales o restituye las que se reducen/eliminan; una corrección de precio conserva las asignaciones originales aunque su fecha de caducidad haya pasado después de la venta. No representa una venta nueva de esas unidades históricas. Las unidades adicionales pasan por las validaciones actuales de caducidad, autorización y existencia.

En anulaciones o reducciones se cancela primero el faltante no regularizado de las unidades devueltas. Se restituyen las unidades de lotes originales; si el faltante original ya fue regularizado se crea un lote de reversión con la caducidad declarada. Las devoluciones vigentes concilian otros faltantes del producto, y las vencidas quedan en lotes vencidos. No se incrementa la deuda para simular una devolución. Los movimientos conservan su balance stock_despues = stock_antes + cantidad.

Una venta de contado genera un ingreso por su total. El fiado no anticipa efectivo. Cada abono genera exactamente un ingreso. Una edición ajusta únicamente la diferencia del efectivo de contado. Una anulación registra un reembolso de todo lo cobrado y conserva los abonos originales. Cualquier devolución de efectivo requiere confirmarReembolso=true; ese campo confirma la operación externa realizada por el operador, no ejecuta una transferencia bancaria.

Con abonos existentes se puede corregir cantidades/precios conservando cliente y tipo, siempre que el nuevo total no sea inferior a lo cobrado. Para una devolución completa se anula con reembolso; redistribuir pagos entre clientes o devolver parcialmente abonos requiere un procedimiento posterior específico. Este límite conservador evita reasignar dinero o crear saldos negativos sin una regla de negocio definida en rf.txt. La anulación no elimina físicamente documentos históricos ni permite registrar otra vez un abono sobre ellos.

## Transacciones e idempotencia

Cada escritura usa una conexión mysql2/promise, bloquea y revalida al actor, comprueba la clave idempotente y bloquea la venta cuando existe. Productos y lotes se bloquean por producto ascendente; la edición bloquea primero la unión de productos previos y nuevos. La confirmación comprende ventas, lotes, faltante, movimientos, abonos, caja, historial y respuesta idempotente. Cualquier fallo revierte el conjunto.

La clave de 8 a 80 caracteres ASCII (letras, números, guion o guion bajo) es única por usuario entre todas las operaciones de ventas. La huella incluye acción, venta y contenido normalizado. Mismo contenido y clave devuelve la respuesta anterior; contenido diferente devuelve 409. La clave y su respuesta se confirman dentro de la transacción. El bloqueo del actor serializa dos operaciones simultáneas con la misma clave de ese usuario; el bloqueo de la venta serializa abonos de usuarios diferentes.

version aumenta en cada edición, abono o anulación; PATCH y anulación requieren la versión observada. Un abono concurrente impide confirmar una devolución calculada sobre un saldo antiguo. revision identifica las líneas históricas y aumenta solo al editar. No hay reintentos automáticos de transacciones fallidas: el cliente conserva la misma clave cuando desconoce si el servidor confirmó.

## Estructura y API

La migración 004 crea siete tablas InnoDB: ventas, venta_detalles, venta_lotes, venta_abonos, venta_caja, venta_historial y venta_operaciones. El destino pasa de 14 a 21 tablas. No crea usuarios ni modifica datos existentes. Amplía en un único ALTER TABLE el CHECK de tipos de movimientos_inventario, conservando alta/entrada/ajuste y añadiendo venta/reversion; también conserva el CHECK del balance y todas las claves existentes. El DROP CHECK de esa sentencia reemplaza únicamente esa restricción y no elimina tablas ni registros.

| Ruta | Permisos y uso |
| --- | --- |
| GET /api/sales | Administrador/Vendedor, listado con saldo y efectivo neto por venta. |
| GET /api/sales/:id | Administrador/Vendedor, detalle actual, lotes, pagos, caja e historial. |
| POST /api/sales | Administrador/Vendedor; clave, tipo, clienteId y detalles. |
| PATCH /api/sales/:id | Administrador; datos completos de venta más version, motivo y confirmarReembolso cuando corresponda. |
| POST /api/sales/:id/void | Administrador; clave, version, motivo y confirmarReembolso cuando corresponda. |
| POST /api/sales/:id/payments | Administrador/Vendedor; clave e importe. |
| GET /api/customers/:id/receivables | Administrador/Vendedor; deuda, pagos, saldo e historial por cliente. |

Todas las rutas reutilizan sesión HttpOnly, validación de origen y CSRF existentes. Las rutas se conectan antes del router general de inventario. Los errores de base de datos no devuelven SQL, parámetros ni secretos.

```json
{
  "clave": "venta-una-operacion-unica",
  "tipo": "fiado",
  "clienteId": 1,
  "detalles": [{ "productoId": 1, "cantidad": 2, "precio": 1.25,
    "confirmarExistencia": true, "caducidadFisica": "2026-12-20" }]
}
```

sales-client.js reemplaza las operaciones de ventas/cuentas del prototipo mediante el mismo patrón de adaptadores existente. Las pantallas utilizan /sales, /clientes y /customers/:id/receivables. No leen ni escriben ventas/cuentas locales. La caché y el carrito son solo de memoria; no se fusionan ni se migran automáticamente registros históricos del navegador. El panel muestra cobros netos de ventas, sin sumar los movimientos manuales locales de fases anteriores. No se implementan reportes, PDF ni respaldos.

El formulario permite editar cargando una venta en el carrito; se pueden quitar/reagregar líneas, cambiar cliente/tipo cuando no hay abonos y modificar el precio antes de agregar la línea. El botón Registrar guarda la edición con motivo. El detalle y el historial por cliente se presentan en Cuentas por cobrar. El frontend conserva la clave al reintentar una respuesta perdida y bloquea cambios de operación mientras está pendiente; los rechazos HTTP 4xx permiten corregir. No recargue la página tras una respuesta perdida antes de verificar/reintentar: la clave del formulario no persiste entre recargas. La API sí conserva sus claves y respuestas confirmadas. Las respuestas tardías se descartan si cambia la sesión.

## Aplicación administrativa pendiente

Desde la raíz, después de autorizar exclusivamente 004, use PowerShell. Ambas invocaciones solicitan la contraseña de root en la terminal; no la pase como argumento ni la guarde. No use micro_app, --force ni repita migraciones anteriores.

```powershell
$mysqlClient = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$preflightVentas = @'
SELECT CASE WHEN DATABASE()='micro_carmita'
 AND VERSION() LIKE '8.0.46%'
 AND SUBSTRING_INDEX(CURRENT_USER(),'@',1)='root'
 AND (SELECT COUNT(*) FROM schema_migrations WHERE version IN ('001_auth','002_catalogo_inventario','003_pedidos_recepciones'))=3
 AND (SELECT COUNT(*) FROM schema_migrations WHERE version='004_ventas_cobros')=0
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME IN ('ventas','venta_detalles','venta_lotes','venta_abonos','venta_caja','venta_historial','venta_operaciones'))=0
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE())=14
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND ENGINE='InnoDB')=14
 AND (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='movimientos_inventario' AND CONSTRAINT_TYPE='CHECK'
      AND CONSTRAINT_NAME IN ('chk_inventario_tipo','chk_inventario_motivo','chk_inventario_balance'))=3
 THEN 'APLICABLE' ELSE 'DETENER' END;
'@
$estadoVentas = @(& $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita --batch --skip-column-names --execute=$preflightVentas)
if ($LASTEXITCODE -ne 0 -or ($estadoVentas -join '').Trim() -ne 'APLICABLE') {
    throw 'No aplicar 004: inspeccione versiones, tablas y cuenta administrativa.'
}
$sqlVentas = Get-Content -Raw -Encoding UTF8 -ErrorAction Stop backend/migrations/004_ventas_cobros.sql
$sqlVentas |
    & $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita --default-character-set=utf8mb4 --batch --skip-reconnect --init-command="SET SESSION autocommit=1, foreign_key_checks=1"
if ($LASTEXITCODE -ne 0) { throw 'Aplicación parcial: inspeccione el esquema antes de continuar.' }
```

DDL tiene commits implícitos. Prepare un respaldo administrativo previo y no aplique simultáneamente desde otra terminal. Si falla parcialmente, no elimine tablas ni reejecute todo el archivo. La versión se inserta al final. Después inspeccione, mediante consultas de lectura:

```sql
SELECT DATABASE(), VERSION(), CURRENT_USER();
SELECT version FROM schema_migrations ORDER BY version;
SELECT COUNT(*) AS tablas FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();
SHOW CREATE TABLE ventas;
SHOW CREATE TABLE venta_detalles;
SHOW CREATE TABLE venta_lotes;
SHOW CREATE TABLE venta_abonos;
SHOW CREATE TABLE venta_caja;
SHOW CREATE TABLE venta_historial;
SHOW CREATE TABLE venta_operaciones;
SHOW CREATE TABLE movimientos_inventario;
SELECT TABLE_NAME,CONSTRAINT_NAME,CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN
 ('ventas','venta_detalles','venta_lotes','venta_abonos','venta_caja','venta_historial','venta_operaciones')
ORDER BY TABLE_NAME,CONSTRAINT_TYPE,CONSTRAINT_NAME;
SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('ventas','venta_detalles','venta_lotes','venta_abonos','venta_caja','venta_historial','venta_operaciones')
AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION;
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('ventas','venta_detalles','venta_lotes','venta_abonos','venta_caja','venta_historial','venta_operaciones')
ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;
```

Se esperan 21 tablas, versiones 001/002/003/004, siete claves primarias, trece FK nuevas y nueve CHECK nuevos. Verifique los índices de cliente/fecha y venta/fecha, la unicidad de producto por revisión y la clave idempotente por usuario. micro_app conserva sus permisos DML existentes; no necesita privilegios DDL. Las nuevas tablas no incorporan borrados en cascada.

## Ensayo real pendiente

backend/verify-sales-real.js está preparado, pero no se ha ejecutado. Requiere 004 aplicada y las variables DB_* ya utilizadas por db:check. Inicia un servidor Express temporal en loopback y usa una única conexión con transacción externa y savepoints para las transacciones internas. Crea únicamente datos temporales con nombres aleatorios: proveedor, cliente, dos productos (vigente/vencido), lotes y Vendedor. Verifica contado, rechazo de caducados, fiado, inventario negativo, abonos parciales/completos, sobrepago, idempotencia, permisos, modificación y anulación con reembolso.

No utiliza cookies del navegador ni cambia la cuenta del Administrador. Sus sesiones nuevas y la auditoría también quedan dentro de la transacción externa. El cierre espera al servidor y hace rollback; si este falla, destruye la conexión para no devolver escrituras pendientes al pool. Los errores imprimen únicamente la etapa y categorías controladas. Tras rollback compara en memoria las catorce tablas previas completas, incluidos Administrador, sesiones, inventario y pedidos, y comprueba la ausencia de registros temporales. Las capturas nunca se imprimen ni se guardan en archivos. Pueden quedar saltos de autoincremento. Las rutas de error del ensayo se prueban con simulaciones, sin conectarse a MySQL, incluyendo fallos después de escrituras temporales de catálogo y de venta.

No utilice simultáneamente otras sesiones del Administrador durante el ensayo, para que la comparación no se vea afectada por actividad externa. Solo después de autorizar las escrituras temporales y aplicar 004, ejecute personalmente:

```powershell
$claveEnsayo = $null
try {
    $env:AUTH_CHECK_USER = Read-Host 'Usuario Administrador'
    $claveEnsayo = Read-Host 'Contraseña del Administrador' -AsSecureString
    $env:AUTH_CHECK_PASSWORD = [System.Net.NetworkCredential]::new('', $claveEnsayo).Password
    node backend/verify-sales-real.js
    if ($LASTEXITCODE -ne 0) { throw 'Ensayo fallido: revise etapaFallida o erroresLimpieza sin compartir secretos.' }
} finally {
    Remove-Item Env:AUTH_CHECK_USER, Env:AUTH_CHECK_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $claveEnsayo) { $claveEnsayo.Dispose() }
    Remove-Variable claveEnsayo -ErrorAction SilentlyContinue
}
```

El resultado esperado es ok:true y rollback:true. Este ensayo secuencial no demuestra commits durables ni concurrencia entre conexiones reales. Esas comprobaciones y el recorrido visual completo quedan pendientes en un entorno aislado después de aplicar la migración.

## Archivos y verificación automatizada

Nuevos: backend/migrations/004_ventas_cobros.sql, backend/sales-repository.js, backend/sales-service.js, backend/sales-routes.js, backend/sales.test.cjs, backend/sales-client.test.cjs, backend/verify-sales-real.js, backend/verify-sales.test.cjs, sales-client.js y SALES.md. Modificados: backend/app.js, backend/server.js, auth-client.js, index.html y README.md. rf.txt fue proporcionado por el usuario y queda sin modificar. No se cambian app.js, modelo.js, package.json ni las pruebas anteriores.

npm test ejecuta directamente todas las pruebas, sin dependencias nuevas. Se conservan las 223 anteriores. Las nuevas pruebas cubren validaciones, FEFO y caducidad, confirmación física, transacciones y rollback, regularización mediante el inventario existente, abonos concurrentes, claves idempotentes, revisiones, permisos HTTP con Express y sesión/CSRF, caja, anulación, frontend con DOM simulado y cierre del ensayo ante errores. La persistencia de esas pruebas es simulada; no se atribuye a esta suite una validación real de ventas en MySQL.

Resultado de esta entrega: npm test pasó con 279 pruebas exitosas (223 anteriores y 56 nuevas), 0 fallidas, 0 omitidas y 0 canceladas; código de salida 0. git diff --check terminó con salida 0, sin errores de formato y con avisos de conversión LF/CRLF. La revisión de los 16 archivos pendientes no detectó secretos locales ni patrones de claves privadas; la sintaxis JavaScript y los dos bloques PowerShell documentados se comprobaron sin ejecutar los comandos de migración ni el ensayo real.

## Revisión previa a la activación de 004

Las consultas de solo lectura confirmaron desarrollo-jose, MySQL 8.0.46 en micro_carmita, las versiones 001_auth, 002_catalogo_inventario y 003_pedidos_recepciones, catorce tablas InnoDB y un Administrador activo. Ninguna tabla de 004 existe. Los id de usuarios/clientes/productos/lotes son INT UNSIGNED con PK y coinciden con sus FK nuevas. No hay conflictos con los nueve nombres de CHECK nuevos. Se verificaron los tres CHECK actuales de movimientos_inventario: tipo, motivo y balance. micro_app mantiene SELECT/INSERT/UPDATE/DELETE sobre micro_carmita, sin DDL.

La revisión mantiene siete tablas nuevas, siete PK, trece FK y nueve CHECK. Existe una UNIQUE adicional sobre venta/revisión/producto, y las PK compuestas protegen asignaciones de lotes y claves de operación por usuario. Los índices requeridos por FK se crean en InnoDB; los de cliente/fecha y venta/fecha están explícitos. Se reforzaron los CHECK para exigir revisiones/versiones positivas e importes positivos en contado/abono, negativos en reembolso y distintos de cero en corrección. Los CHECK no comprueban sumas entre tablas: la pertenencia de lotes, el agregado de abonos y el total se mantienen en el servicio transaccional.

No hay DROP TABLE, TRUNCATE, DELETE, UPDATE, REPLACE, cambios de usuarios MySQL ni desactivación de FK. La única inserción fuera de las tablas nuevas registra la versión. El único cambio en una estructura previa es la sustitución del CHECK chk_inventario_tipo, en una sola sentencia ALTER que conserva los tipos existentes; no cambia filas de inventario, autenticación o pedidos. La sintaxis de ALTER/CHECK se contrastó con el [manual de MySQL 8.0](https://dev.mysql.com/doc/refman/8.0/en/alter-table.html) y las [reglas de CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html). La ejecución efectiva y comprobación de las nuevas restricciones siguen pendientes de autorización; no se presenta la inspección estática como una migración ya probada en el servidor real.

El ensayo preparado verifica los nueve RF del bloque. RF-04/05 comprueban líneas, cantidad, total, ingreso de contado y descuento. RF-06 comprueba rechazo sin confirmación física y faltante posterior. RF-07 rechaza producto vencido. Dos lotes vigentes con orden de ingreso distinto al de caducidad permiten comprobar FEFO por asignaciones y cantidades restantes, algo que la primera versión del ensayo no demostraba con un solo lote. RF-08 comprueba HTTP 403 del Vendedor y modificación/anulación administrativa, con reversión de caja y conservación de pagos. RF-10 exige cliente para fiado y rechaza su ausencia. RF-11/12 comprueban deuda 6, abono parcial 2, saldo 4, rechazo de sobrepago y pago completo. RF-13 consulta historial por cliente y responsables. La idempotencia se prueba en ventas, abonos y anulaciones; cambiar el contenido de una clave usada se rechaza con 409.

Mantenga el negocio sin actividad concurrente durante el ensayo: la comparación posterior contrasta todas las filas anteriores y podría detectar cambios legítimos ajenos. Las capturas completas consumen memoria proporcional al tamaño de la base y están pensadas para esta validación controlada de desarrollo. Los saltos de autoincremento no son reversibles por ROLLBACK.

Pendientes explícitos: aplicar 004 y ejecutar el ensayo autorizado; verificar DDL y restricciones efectivas; probar persistencia tras commit y reconexión/reinicio; competir con dos conexiones MySQL reales (ventas simultáneas sobre los mismos lotes, abonos que excedan juntos el saldo, reintentos con la misma clave, edición/anulación concurrente y recuperación de deadlocks); realizar el recorrido visual del navegador. Estos casos necesitan una base aislada con cuentas y registros temporales propios, no los datos permanentes del negocio. El ensayo con una conexión y savepoints no demuestra concurrencia real ni durabilidad. Se conservan los límites documentados para editar fiados abonados y la anulación lógica con reembolso; rf.txt no especifica reasignación de pagos ni devoluciones parciales de abonos.

Resultado de esta revisión: 282 pruebas exitosas (las 279 conservadas y tres nuevas), cero fallidas, omitidas o canceladas, código 0. git diff --check terminó sin errores, con los avisos LF/CRLF ya existentes. Los comandos de PowerShell se validaron sintácticamente sin ejecutarlos. Se ajustaron únicamente 004_ventas_cobros.sql, verify-sales-real.js, verify-sales.test.cjs y este documento; el resto de cambios pendientes pertenece a la implementación anterior. No se ejecutaron DDL ni escrituras reales. La aplicación preparada activa autocommit y comprobación de FK solo en su sesión administrativa, para confirmar también el registro final de versión sin cambiar la configuración global.
