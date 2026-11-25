# Manual técnico de Micro Carmita

[Volver al README](../README.md) · [Calidad e historial](FINAL_QA.md#estado-documental-actual)

Consolidación documental del 24 de noviembre de 2026. Se integran los cinco documentos de dominio conservando su procedencia, requisitos, reglas, API, ejemplos, comandos, tablas, advertencias y evidencias. Cada bloque original aparece una sola vez. No se fusiona código ni se modifican contratos.

## Índice

1. [Introducción y arquitectura relacionada](#introduccion-arquitectura)
2. [Inventario, productos y lotes](#inventario)
3. [Pedidos y recepciones](#pedidos)
4. [Ventas, clientes, fiados y abonos](#ventas)
5. [Ingresos y egresos](#finanzas)
6. [Reportes y exportación PDF](#reportes)
7. [Reglas de negocio e integraciones](#reglas-integraciones)
8. [Pruebas, limitaciones y referencias técnicas](#pruebas-limitaciones)

<a id="introduccion-arquitectura"></a>

## 1. Introducción y arquitectura relacionada

La interfaz HTML/CSS/JavaScript se sirve desde Express y utiliza la API del mismo origen. El backend mantiene rutas, servicios y repositorios por dominio, persistencia MySQL y reglas compartidas en [modelo.js](../modelo.js). El [README](../README.md) contiene la instalación vigente y los permisos; [AUTH](AUTH.md) detalla autenticación y aprovisionamiento. Los 38 requisitos permanecen en [rf.txt](../rf.txt).

Los comandos de terminal, rutas literales de código, migraciones y archivos privados se interpretan desde la **raíz del repositorio**, no desde `docs/`. Los enlaces de navegación sí son relativos a este documento. Los procedimientos históricos conservan sus condiciones y autorizaciones originales; esta reorganización no autoriza ejecutarlos.

### Cómo leer los estados históricos

Los bloques de los apartados 2–6 son registros de sus entregas y revisiones, no una lista de tareas actuales. Un “pendiente” dentro de una entrega antigua no invalida una implementación posterior. Las instrucciones administrativas se conservan para trazabilidad y para instalaciones nuevas revisadas, no para repetir migraciones sobre la base local existente.

| Diferencia conservada | Contexto histórico | Estado posterior y referencia |
| --- | --- | --- |
| Ventas o enlaces con clientes pendientes | Entregas iniciales de inventario y pedidos | Ventas, fiados y abonos se implementaron en el [apartado 4](#ventas); la instalación vigente incluye 001–005. |
| Clientes dentro de Inventario | Descripción inicial de INVENTORY.md | Se trasladaron a Ventas el 19/11/2026; se conserva la evidencia al final de inventario y ventas. |
| Código de lote presentado como obligatorio | Contratos iniciales y ejemplos con código explícito | La actualización posterior permite generación automática e idempotencia cuando se omite; véase [QA de lotes](FINAL_QA.md#actualización-lotes-opcionales-y-fechas-ecuatorianas). Los códigos explícitos de los ejemplos siguen siendo válidos. |
| RF aún sin texto oficial disponible | Alcance inicial de ORDERS.md | [rf.txt](../rf.txt) y la [matriz de QA](FINAL_QA.md#matriz-de-los-38-requisitos) conservan el contraste posterior. |
| Reportes/PDF/R2 descritos como no implementados | Límites de entregas anteriores de ventas y finanzas | Reportes/PDF se implementan en el [apartado 6](#reportes). El mecanismo R2 está implementado, desactivado y pendiente de validación operativa según [BACKUP](BACKUP.md). |
| Conteos de 181, 223, 279, 324, 364, 665 o 673 pruebas | Evidencia fechada de cada bloque | La línea base de esta reorganización es 675 exitosas; no se sustituyen los conteos originales. |
| Avisos de dependencias de desarrollo | Auditoría histórica del bloque de reportes | Se conserva su alcance y versiones; la auditoría actual solicitada es de producción con --omit=dev, no una nueva certificación del árbol de desarrollo. |

<a id="inventario"></a>

## 2. Inventario, productos y lotes

Procedencia: **INVENTORY.md**, antes en la raíz. Se conserva el registro de entrega y sus actualizaciones; leer los estados según la introducción.

<!-- INICIO FUENTE: INVENTORY.md -->

<a id="inventario-clientes-proveedores-e-inventario"></a>

### Clientes, proveedores e inventario

<a id="inventario-estado-posterior-a-la-migración"></a>

#### Estado posterior a la migración

La comprobación de lectura más reciente confirmó `001_auth` y `002_catalogo_inventario` en schema_migrations. Las cinco tablas nuevas son consultables con micro_app y estaban vacías. El Administrador id 1 seguía activo. micro_app conserva SELECT, INSERT, UPDATE y DELETE sobre micro_carmita, sin privilegios administrativos. Los procedimientos de migración que aparecen más abajo se conservan como referencia histórica y no deben repetirse sobre este esquema ya migrado.

El ensayo real todavía queda pendiente de ejecución personal. En esta revisión se reforzó su limpieza mediante [backend/verification-cleanup.js](../backend/verification-cleanup.js). Un error al cerrar el servidor permite continuar con el rollback. Si el rollback falla, la conexión se destruye y el informe marca el fallo, en vez de devolverla al pool. El script comprueba previamente que las ocho tablas que modifica sean InnoDB. Los errores se informan por etapa y sin imprimir excepciones ni datos privados.

La suite posterior a esta revisión pasó con 186 pruebas exitosas, cero fallidas, omitidas o canceladas, código de salida 0. Conserva las 181 anteriores e incorpora cinco pruebas aisladas de limpieza y rutas de error. El ensayo real de inventario no se ejecutó durante esta revisión.

Las escrituras del ensayo se ejecutan en una conexión exclusiva y una transacción externa. El repositorio utiliza savepoints y nunca confirma la transacción externa. Se generan cuentas y registros temporales propios. La cuenta Administrador se utiliza como actor, sin cambios en sus campos, su contraseña o su rol. El cliente HTTP comienza sin cookies y solo utiliza las sesiones creadas por el ensayo. Después del rollback se comparan internamente todos los campos del Administrador y sus sesiones previas, sin mostrarlos. También se verifica la ausencia de contactos, producto, lotes, movimientos y Vendedor temporales. Los autoincrementos pueden conservar saltos.

Se recomienda ejecutar el ensayo sin usar simultáneamente otras sesiones del mismo Administrador para que la comparación de sus sesiones anteriores sea concluyente. Un fallo de limpieza deja ok en false y enumera solo las etapas de cierre fallidas. Ante pérdida de conexión, el rollback se completa al cerrarse la conexión en MySQL. Ese caso no se presenta como una validación exitosa.

<a id="inventario-entrega-y-alcance"></a>

#### Entrega y alcance

Se implementan RF-09, RF-14, RF-15, RF-16, RF-17, RF-18 y RF-20 mediante API Express y una migración aditiva MySQL 8.0.46. El esquema de autenticación y el Administrador se conservan. Durante esta entrega se consultaron únicamente los metadatos reales, que mostraron las cinco tablas de autenticación y la versión `001_auth`. La migración `002_catalogo_inventario` sigue pendiente de autorización administrativa. Las operaciones de este bloque aún requieren validación contra MySQL real después de aplicarla.

<a id="inventario-esquema-y-decisiones"></a>

#### Esquema y decisiones

- `clientes` contiene nombre e identificación, teléfono y dirección opcionales. Administrador y Vendedor pueden registrar y consultar clientes. La clave estable permite asociar ventas y cuentas por cobrar cuando se incorporen sus tablas. Las identificaciones proporcionadas son únicas. Varias personas pueden compartir nombre.
- `proveedores` tiene los mismos campos de contacto. Solo Administrador puede registrar proveedores. Los usuarios autenticados autorizados pueden consultarlos.
- `productos` contiene nombre único, categoría, precios actuales de compra y venta, proveedor principal, estado activo y faltante. El precio de compra admite cero. El precio de venta debe ser positivo. Ambos admiten hasta dos decimales y un máximo de 99999999.99.
- `lotes` contiene código único por producto, proveedor de la recepción, precio de compra de ese lote, fecha de ingreso, caducidad opcional y cantidad física no negativa. Las fechas y el proveedor pertenecen al lote y se conservan aunque cambien los datos del catálogo. El alta de producto incluye siempre su lote inicial, incluso con cantidad cero.
- `movimientos_inventario` contiene producto, responsable autenticado, tipo, variación, stock anterior y posterior, motivo, detalle por lotes y fecha UTC. El CHECK de balance exige que el stock posterior sea el anterior más la variación. Las claves foráneas conservan referencias y evitan borrados de datos relacionados.
- El stock es la suma de existencias físicas menos el faltante. Se reutiliza `modelo.stock`. Las entradas vigentes concilian primero el faltante mediante `modelo.entrada`. Las entradas caducadas conservan el faltante. El modelo mantiene su interfaz histórica y añade un parámetro de umbral a `estadoLote`. Este bloque pasa explícitamente cinco días. Las pruebas históricas conservan su umbral anterior de siete días.
- RF-16 incluye hoy y los cinco días siguientes. Un lote está caducado desde el día posterior a su fecha indicada. Los lotes vacíos se excluyen de las alertas de caducidad. Los vencidos se identifican separadamente. La fecha de negocio utiliza America/Guayaquil.
- RF-17 aplica `stock < 3`, incluyendo cero y negativos. El catálogo conserva también productos archivados para consulta e historial.
- RF-18 permite únicamente al Administrador ajustes enteros distintos de cero, con motivo obligatorio de hasta 255 caracteres. Un ajuste positivo exige un lote del producto y concilia faltantes si ese lote está vigente. Un ajuste negativo retira existencias físicas por caducidad más cercana, incluidos vencidos, y registra cualquier diferencia como faltante. Es un ajuste físico con trazabilidad. La venta con stock negativo sigue pendiente de otra fase.
- Cada escritura vuelve a comprobar el rol y estado de su responsable dentro de la transacción. Las operaciones de stock bloquean primero el producto y después sus lotes. La escritura de existencias y el historial son atómicos. Los errores se revierten. Las cantidades por operación y el faltante se limitan a 2147483647. Se valida que los totales sean enteros seguros.
- El proveedor principal y los proveedores de lote ofrecen las referencias necesarias para incorporar pedidos y recepciones. Los futuros documentos referenciarán estos IDs. Esta entrega conserva sus campos de datos y evita crear tablas vacías de ventas o pedidos antes de definir esas operaciones.

<a id="inventario-api"></a>

#### API

Todas las rutas requieren sesión. Las escrituras exigen JSON, origen autorizado y CSRF, utilizando el middleware de autenticación existente.

| Método y ruta | Uso |
| --- | --- |
| GET/POST `/api/clientes` | Consultar/crear clientes. |
| GET/POST `/api/proveedores` | Consultar/crear proveedores. POST solo Administrador. |
| GET `/api/inventory` | Catálogo, stock calculado y lotes con sus estados. |
| GET `/api/inventory/alerts` | Stock bajo y alertas de caducidad con estado diferenciado. |
| POST `/api/products` | Alta transaccional de producto, lote inicial e historial. Solo Administrador. |
| PATCH `/api/products/:id` | Edición del catálogo. Conserva cantidades, lotes e historial. Solo Administrador. |
| POST `/api/products/:id/lots` | Entrada transaccional de lote y conciliación. Solo Administrador. |
| POST `/api/products/:id/adjustments` | Ajuste con motivo e historial. Solo Administrador. |
| GET `/api/products/:id/history` | Consulta de movimientos y responsable. |

Alta de producto con nombres de campos de la API, sin datos sensibles.

```json
{
  "nombre": "Arroz",
  "categoria": "Abarrotes",
  "precioCompra": 0.80,
  "precioVenta": 1.10,
  "proveedorId": 1,
  "codigo": "AR-01",
  "cantidad": 10,
  "fechaIngreso": "2026-11-17",
  "caducidad": "2027-01-20"
}
```

Las entradas usan los campos del lote sin nombre, categoría ni precioVenta. La edición exige nombre, categoria, precioCompra, precioVenta, proveedorId y activo booleano. Para archivar se utiliza `activo: false` y se exige stock cero. Los registros físicos se conservan. Los ajustes usan cantidad firmada y motivo, y loteId para aumentos. Identificadores inexistentes, campos inesperados, fechas imposibles, cantidades fraccionarias y precios inválidos se rechazan. No se reciben responsables desde el cliente.

<a id="inventario-interfaz-y-transición-de-datos"></a>

#### Interfaz y transición de datos

[inventory-client.js](../inventory-client.js) se carga después de [auth-client.js](../auth-client.js). Reutiliza su cliente HTTP y la sesión actual. La pantalla Inventario contiene el catálogo, lotes, alertas, formularios de entradas y ajustes, historial, clientes y proveedores. Las herramientas administrativas se ocultan para otros roles y el backend las protege independientemente de esa presentación.

El inventario remoto es la fuente utilizada por la aplicación integrada, incluyendo su total de unidades y el catálogo del carrito. El inventario local antiguo se conserva físicamente y se ofrece un botón administrativo para descargarlo. El adaptador impide que se vuelva a guardar un inventario paralelo en localStorage. No se importan ni sobrescriben automáticamente registros antiguos. La importación revisada de datos existentes queda pendiente.

La pantalla de ventas, el carrito, las ventas anteriores, cuentas por cobrar y reportes locales se conservan. El registro de nuevas ventas locales queda temporalmente bloqueado con un mensaje explícito porque descontaría existencias fuera de las transacciones del servidor. La integración transaccional de ventas es una dependencia pendiente. Esta entrega no crea ventas nuevas ni modifica registros históricos para simular esa integración. Los clientes ya tienen IDs, pero su enlace efectivo con nuevas ventas y cuentas por cobrar requiere esa fase.

Si falta la migración o la API falla, se informa el error y se vacía el stock visible. La aplicación evita sustituirlo silenciosamente por el almacenamiento local. La autenticación y gestión de usuarios siguen disponibles con `001_auth`.

<a id="inventario-aplicación-administrativa-pendiente"></a>

#### Aplicación administrativa pendiente

Desde la raíz del proyecto en PowerShell, solicite el nombre de una cuenta administrativa existente y abra MySQL. El cliente solicita su contraseña de forma interactiva.

```powershell
$mysqlClient = (Get-Command mysql.exe -ErrorAction Stop).Source
$cuentaMigracion = Read-Host 'Cuenta administrativa MySQL'
if ($cuentaMigracion -eq 'micro_app') { throw 'Utilice una cuenta administrativa separada' }
& $mysqlClient --host=127.0.0.1 --port=3306 --user=$cuentaMigracion --password --database=micro_carmita
```

Compruebe el destino, la versión previa y las tablas. Las cinco tablas de autenticación deben permanecer presentes. Las cinco tablas nuevas deben estar ausentes.

```sql
SELECT DATABASE(), VERSION(), CURRENT_USER();
SELECT version FROM schema_migrations ORDER BY version;
SHOW TABLES;
EXIT;
```

Tras autorizar la operación, ejecute únicamente el archivo nuevo, sin repetir `001_auth` ni aplicar el directorio development.

```powershell
Get-Content -Raw -Encoding UTF8 backend/migrations/002_catalogo_inventario.sql |
    & $mysqlClient --host=127.0.0.1 --port=3306 --user=$cuentaMigracion --password --database=micro_carmita --default-character-set=utf8mb4 --batch --skip-reconnect
if ($LASTEXITCODE -ne 0) { throw 'Migración interrumpida. Inspeccione el esquema antes de continuar' }
```

DDL tiene commits implícitos. Si ocurre un error, inspeccione los objetos creados antes de reanudar. Las tablas carecen de instrucciones de borrado o reemplazo. La migración no toca registros de autenticación, excepto añadir su propia versión a schema_migrations. `micro_app` conserva exclusivamente DML y nunca ejecuta este archivo.

Después, verifique la versión nueva, las cinco tablas adicionales, sus CHECK, FK e índices. Inicie `npm start`, entre como Administrador, registre primero un proveedor, luego un producto y su lote. Consulte alertas, agregue un segundo lote y realice ajustes con motivo. Verifique el historial. Con Vendedor compruebe lectura y rechazo HTTP 403 de escrituras administrativas. Confirme los límites de cinco y seis días de caducidad y stocks 2 y 3. Estas operaciones escriben datos reales y quedan pendientes de autorización.

<a id="inventario-archivos-y-pruebas"></a>

#### Archivos y pruebas

La suite completa `npm test` pasó con 181 pruebas exitosas, cero fallidas, omitidas o canceladas, código de salida 0. Son las 138 pruebas anteriores y 43 adicionales para este bloque. Las pruebas usan datos aislados. La migración nueva no se ejecutó en la base real.

<a id="inventario-preparación-de-activación-en-desarrollo-jose"></a>

#### Preparación de activación en desarrollo-jose

Se comprobó que la rama activa era `desarrollo-jose` y el árbol estaba limpio antes de esta preparación. La consulta real encontró únicamente las cinco tablas InnoDB de autenticación y la versión `001_auth`, con un Administrador activo. `usuarios.id` es INT UNSIGNED y coincide con la FK de movimientos_inventario. No se encontraron conflictos de nombres para las cinco tablas nuevas.

La revisión estática de 002 confirma cinco claves primarias, cinco claves foráneas y cuatro restricciones de unicidad. Los índices de las FK que no estén cubiertos por índices explícitos serán creados por InnoDB. Las restricciones CHECK, DECIMAL, JSON, DATE y DEFAULT con expresiones están soportadas en MySQL 8.0.46. La migración carece de DROP, TRUNCATE, REPLACE, UPDATE, DELETE, GRANT y desactivación de restricciones. Su único INSERT registra la versión nueva. El archivo SQL revisado se conserva sin cambios.

Después de autorizar la migración y aplicarla con root usando el comando por lotes anterior, verifique desde el cliente MySQL.

```sql
SELECT version FROM schema_migrations ORDER BY version;
SELECT TABLE_NAME, ENGINE FROM information_schema.tables
WHERE TABLE_SCHEMA='micro_carmita' ORDER BY TABLE_NAME;
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.table_constraints
WHERE CONSTRAINT_SCHEMA='micro_carmita'
AND TABLE_NAME IN ('clientes','proveedores','productos','lotes','movimientos_inventario')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.key_column_usage
WHERE TABLE_SCHEMA='micro_carmita'
AND TABLE_NAME IN ('clientes','proveedores','productos','lotes','movimientos_inventario')
AND REFERENCED_TABLE_NAME IS NOT NULL;
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
FROM information_schema.statistics
WHERE TABLE_SCHEMA='micro_carmita'
AND TABLE_NAME IN ('clientes','proveedores','productos','lotes','movimientos_inventario')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
SELECT COUNT(*) AS administradores_activos
FROM usuarios WHERE rol='administrador' AND activo=1;
```

Se esperan diez tablas en total y ambas versiones de migración. Las cinco FK nuevas relacionan productos con proveedores, lotes con productos y proveedores, y movimientos con productos y usuarios. Los registros reales de autenticación se conservan.

El ensayo [backend/verify-inventory-real.js](../backend/verify-inventory-real.js) queda preparado para ejecución manual posterior a la migración, usando micro_app. Exige la versión 002 antes de escribir. Carga Express y ambos repositorios reales sobre una conexión exclusiva. Las transacciones internas utilizan savepoints y toda la prueba termina en ROLLBACK. Genera nombres de ensayo únicos, crea un Vendedor temporal y nunca modifica al Administrador. Las escrituras de contactos, productos, lotes, movimientos, sesiones y auditoría se revierten. Los autoincrementos pueden dejar saltos. No utilice este ensayo como prueba de commits permanentes o de concurrencia entre conexiones, que requieren un entorno aislado adicional.

En PowerShell integrado de VS Code, desde la raíz y después de autorizar el ensayo, introduzca personalmente las credenciales del Administrador.

```powershell
$claveEnsayo = $null
try {
    $env:AUTH_CHECK_USER = Read-Host 'Usuario Administrador'
    $claveEnsayo = Read-Host 'Contraseña del Administrador' -AsSecureString
    $env:AUTH_CHECK_PASSWORD = [System.Net.NetworkCredential]::new('', $claveEnsayo).Password
    node backend/verify-inventory-real.js
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Ensayo incompleto. Revise únicamente la etapaFallida informada.' }
} finally {
    Remove-Item Env:AUTH_CHECK_USER, Env:AUTH_CHECK_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $claveEnsayo) { $claveEnsayo.Dispose() }
    Remove-Variable claveEnsayo -ErrorAction SilentlyContinue
}
```

El resultado esperado contiene ok y rollback en true. El informe excluye credenciales, hashes y tokens. Comprueba los siete RF, precios y campos obligatorios, proveedores válidos, duplicados, lotes con vencimiento a cinco y seis días, lotes vencidos, stocks 2, 0, negativo y 3, conciliación e historial. Comprueba HTTP 403 para escrituras administrativas del Vendedor y permite su registro de clientes. Al terminar verifica la ausencia del producto y del Vendedor de ensayo y la conservación del Administrador.

Este procedimiento se preparó sin ejecutar la migración ni el ensayo sobre la base real. El árbol contiene los cambios de preparación en este documento y en el nuevo script, pendientes de revisión.

Nuevos archivos de este bloque son [002_catalogo_inventario.sql](../backend/migrations/002_catalogo_inventario.sql), [inventory-repository.js](../backend/inventory-repository.js), [inventory-service.js](../backend/inventory-service.js), [inventory-routes.js](../backend/inventory-routes.js), sus pruebas en backend, [inventory-client.js](../inventory-client.js) y este documento. Se modifican [backend/app.js](../backend/app.js), [backend/server.js](../backend/server.js), [modelo.js](../modelo.js), [auth-client.js](../auth-client.js), [index.html](../index.html) y [README.md](../README.md). El resto de pruebas históricas se conserva.

Las pruebas cubren validación, permisos por rol, snapshot con límites de alertas, lotes, conciliación y stock negativo, motivos y responsables, conservación de lotes al editar, archivo, rollback ante fallo de historial y ajustes concurrentes. La integración HTTP utiliza Express y middleware de sesión/CSRF reales con persistencia simulada. Las pruebas del frontend cargan [app.js](../app.js) junto al adaptador y comprueban que el catálogo procede de la API. La ejecución contra MySQL real del bloque nuevo permanece pendiente de aplicar `002`.


<a id="inventario-ubicación-actual-de-clientes--19-de-noviembre-de-2026"></a>

#### Ubicación actual de Clientes — 19 de noviembre de 2026

El formulario y listado de Clientes dejan Inventario y pasan a Gestión de Ventas, entre preparación/carrito e historial. Se mantienen sus IDs, campos y evento de registro; no se elimina funcionalidad ni se crea otra tabla o ruta. Para registrar un cliente, abrir Ventas y utilizar + Nuevo cliente o Gestión de clientes.

inventory-client.js carga exclusivamente inventario y proveedores; no consulta ni pinta listaClientes. El catálogo de clientes, los selectores de ventas/cuentas y el alta son responsabilidad de sales-client.js. El método público contacto('clientes') se conserva como delegación para compatibilidad del evento existente. contacto('proveedores') mantiene su operación anterior.

Productos, lotes, caducidad, alertas, entradas, ajustes, historial, proveedores y Archivar/Reactivar permanecen sin cambios en este traslado. Administrador y Vendedor conservan exactamente sus permisos de clientes mediante los servicios existentes. No cambia SQL, esquema, datos reales ni dependencias. Los textos anteriores de este documento que ubican Clientes en Inventario describen el estado histórico previo.

Suite final: 665 exitosas, 0 fallidas/omitidas; producción 0 vulnerabilidades; diff --check sin errores. Las comprobaciones son aisladas; no se reejecuta una migración ni un ensayo de escritura en MySQL real. Pendiente revisar visualmente Inventario sin el bloque retirado y Ventas con el formulario único, manteniendo todas las otras secciones.

<!-- FIN FUENTE: INVENTORY.md -->

<a id="pedidos"></a>

## 3. Pedidos y recepciones

Procedencia: **ORDERS.md**, antes en la raíz. Se conserva el registro de entrega y sus actualizaciones; leer los estados según la introducción.

<!-- INICIO FUENTE: ORDERS.md -->

<a id="pedidos-pedidos-y-recepciones"></a>

### Pedidos y recepciones

<a id="pedidos-alcance"></a>

#### Alcance

Esta entrega implementa el bloque solicitado bajo RF-19, RF-21, RF-22, RF-23, RF-24 y RF-35 conforme a las operaciones descritas en la solicitud. El texto individual oficial de esos seis RF no estaba incluido en ella ni en los documentos locales examinados. La trazabilidad definitiva de cada número deberá contrastarse con el documento oficial. El alcance implementado comprende creación administrativa de pedidos a proveedor, consulta de detalles y estados, cancelación administrativa, recepción por Administrador o Vendedor y actualización transaccional del inventario con trazabilidad de lotes.

Antes de desarrollar este bloque se verificaron rama desarrollo-jose, secretos de los cuatro archivos pendientes, formato y 186 pruebas exitosas. Se creó el commit local `265a33a`, con [INVENTORY.md](MANUAL_TECNICO.md#inventario) y las herramientas de validación reversible del inventario. No se realizó push. Los cambios del nuevo bloque permanecen pendientes de revisión y commit.

<a id="pedidos-estructura-y-reglas"></a>

#### Estructura y reglas

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

<a id="pedidos-api-y-pantalla"></a>

#### API y pantalla

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

<a id="pedidos-migración-administrativa-pendiente"></a>

#### Migración administrativa pendiente

[backend/migrations/003_pedidos_recepciones.sql](../backend/migrations/003_pedidos_recepciones.sql) crea cuatro tablas y registra su versión. No contiene ALTER, DROP, TRUNCATE, REPLACE ni cambios en los registros existentes de autenticación, clientes o inventario. Las FK e índices son compatibles con MySQL 8.0.46. Se necesita aplicar previamente 001 y 002.

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

<a id="pedidos-verificación"></a>

#### Verificación

La suite completa pasó con 223 pruebas exitosas, cero fallidas, omitidas o canceladas, código de salida 0 y duración observada de 5548.3672 ms. Conserva las 186 anteriores y añade 37 pruebas. Incluye permisos, cantidades, estados, cancelación parcial, idempotencia, exceso agregado, múltiples líneas, conciliación, rollback de recepción/lotes/historial/estado y operaciones concurrentes. Las pruebas HTTP utilizan Express y middleware de sesión/CSRF con persistencia simulada. Las pruebas del frontend verifican consumo de API y conservación de la clave ante una respuesta perdida.

[backend/verify-orders-real.js](../backend/verify-orders-real.js) queda preparado para un ensayo manual después de aplicar 003. Usa una conexión MySQL exclusiva, savepoints para las transacciones internas y rollback externo obligatorio mediante el cierre seguro existente. Genera proveedor, producto, Vendedor, pedidos y recepciones temporales. Compara internamente la cuenta del Administrador y sus sesiones anteriores después del rollback, sin mostrarlas. Los registros de ensayo desaparecen y pueden quedar saltos de autoincremento.

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

Archivos nuevos del bloque son la migración 003, order-repository.js, order-service.js, order-routes.js, order.test.cjs, order-client.test.cjs, verify-orders-real.js, orders-client.js y este documento. Se modifican backend/app.js, backend/server.js, backend/inventory-service.js, index.html y [README.md](../README.md). Se conservan los datos reales y las pruebas anteriores.

<!-- FIN FUENTE: ORDERS.md -->

<a id="ventas"></a>

## 4. Ventas, clientes, fiados y abonos

Procedencia: **SALES.md**, antes en la raíz. Se conserva el registro de entrega y sus actualizaciones; leer los estados según la introducción.

<!-- INICIO FUENTE: SALES.md -->

<a id="ventas-ventas-fiados-y-abonos"></a>

### Ventas, fiados y abonos

Implementación basada en la lectura completa de rf.txt, cuyas 38 líneas no vacías corresponden, en orden, a RF-01 hasta RF-38. Se conserva ese archivo sin modificaciones. Rama desarrollo-jose; el módulo anterior de pedidos está en el commit local 0cae9e8. Esta entrega no ejecuta migraciones, ensayos con escrituras reales, commits ni push.

<a id="ventas-requisitos-oficiales-y-correspondencia"></a>

#### Requisitos oficiales y correspondencia

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

<a id="ventas-reglas-de-validación-y-conservación"></a>

#### Reglas de validación y conservación

Se aceptan cantidades enteras entre 1 y 2147483647, precios positivos con dos decimales hasta 99999999.99, de uno a cien productos distintos y total de venta hasta 999999999.00, compatible con el límite del modelo. Los importes se calculan en centavos enteros y se guardan como DECIMAL. El total del cliente considera solo sus fiados actuales activos; los anulados quedan en el historial con saldo cero. No se admite sobrepago, pago a contado, pago de venta anulada, campos desconocidos ni producto inexistente. Un producto archivado no admite unidades adicionales vendidas.

Las validaciones de importes, cantidades, motivo, idempotencia y límites son decisiones técnicas que concretan operaciones válidas; no se presentan como textos literales adicionales de rf.txt. Los precios positivos introducidos para cada línea se registran como valores de esa venta; rf.txt no define una autorización especial para descuentos ni impone un precio fijo. La pantalla propone el precio del catálogo.

Cuando no alcanzan los lotes válidos, confirmarExistencia debe ser true y caducidadFisica debe estar explícitamente presente como fecha AAAA-MM-DD no vencida o null si no tiene caducidad. La declaración es responsabilidad del operador: el sistema no puede verificar físicamente las unidades. Si solo hay lotes caducados con cantidad, el modelo bloquea la venta; registre previamente el lote válido real en ese caso. No se utiliza la confirmación para desbloquear existencias vencidas.

Una edición genera una revisión inmutable nueva de las líneas. Solo descuenta unidades adicionales o restituye las que se reducen/eliminan; una corrección de precio conserva las asignaciones originales aunque su fecha de caducidad haya pasado después de la venta. No representa una venta nueva de esas unidades históricas. Las unidades adicionales pasan por las validaciones actuales de caducidad, autorización y existencia.

En anulaciones o reducciones se cancela primero el faltante no regularizado de las unidades devueltas. Se restituyen las unidades de lotes originales; si el faltante original ya fue regularizado se crea un lote de reversión con la caducidad declarada. Las devoluciones vigentes concilian otros faltantes del producto, y las vencidas quedan en lotes vencidos. No se incrementa la deuda para simular una devolución. Los movimientos conservan su balance stock_despues = stock_antes + cantidad.

Una venta de contado genera un ingreso por su total. El fiado no anticipa efectivo. Cada abono genera exactamente un ingreso. Una edición ajusta únicamente la diferencia del efectivo de contado. Una anulación registra un reembolso de todo lo cobrado y conserva los abonos originales. Cualquier devolución de efectivo requiere confirmarReembolso=true; ese campo confirma la operación externa realizada por el operador, no ejecuta una transferencia bancaria.

Con abonos existentes se puede corregir cantidades/precios conservando cliente y tipo, siempre que el nuevo total no sea inferior a lo cobrado. Para una devolución completa se anula con reembolso; redistribuir pagos entre clientes o devolver parcialmente abonos requiere un procedimiento posterior específico. Este límite conservador evita reasignar dinero o crear saldos negativos sin una regla de negocio definida en rf.txt. La anulación no elimina físicamente documentos históricos ni permite registrar otra vez un abono sobre ellos.

<a id="ventas-transacciones-e-idempotencia"></a>

#### Transacciones e idempotencia

Cada escritura usa una conexión mysql2/promise, bloquea y revalida al actor, comprueba la clave idempotente y bloquea la venta cuando existe. Productos y lotes se bloquean por producto ascendente; la edición bloquea primero la unión de productos previos y nuevos. La confirmación comprende ventas, lotes, faltante, movimientos, abonos, caja, historial y respuesta idempotente. Cualquier fallo revierte el conjunto.

La clave de 8 a 80 caracteres ASCII (letras, números, guion o guion bajo) es única por usuario entre todas las operaciones de ventas. La huella incluye acción, venta y contenido normalizado. Mismo contenido y clave devuelve la respuesta anterior; contenido diferente devuelve 409. La clave y su respuesta se confirman dentro de la transacción. El bloqueo del actor serializa dos operaciones simultáneas con la misma clave de ese usuario; el bloqueo de la venta serializa abonos de usuarios diferentes.

version aumenta en cada edición, abono o anulación; PATCH y anulación requieren la versión observada. Un abono concurrente impide confirmar una devolución calculada sobre un saldo antiguo. revision identifica las líneas históricas y aumenta solo al editar. No hay reintentos automáticos de transacciones fallidas: el cliente conserva la misma clave cuando desconoce si el servidor confirmó.

<a id="ventas-estructura-y-api"></a>

#### Estructura y API

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

<a id="ventas-aplicación-administrativa-pendiente"></a>

#### Aplicación administrativa pendiente

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

<a id="ventas-ensayo-real-pendiente"></a>

#### Ensayo real pendiente

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

<a id="ventas-archivos-y-verificación-automatizada"></a>

#### Archivos y verificación automatizada

Nuevos: backend/migrations/004_ventas_cobros.sql, backend/sales-repository.js, backend/sales-service.js, backend/sales-routes.js, backend/sales.test.cjs, backend/sales-client.test.cjs, backend/verify-sales-real.js, backend/verify-sales.test.cjs, sales-client.js y [SALES.md](MANUAL_TECNICO.md#ventas). Modificados: backend/app.js, backend/server.js, auth-client.js, index.html y [README.md](../README.md). rf.txt fue proporcionado por el usuario y queda sin modificar. No se cambian app.js, modelo.js, package.json ni las pruebas anteriores.

npm test ejecuta directamente todas las pruebas, sin dependencias nuevas. Se conservan las 223 anteriores. Las nuevas pruebas cubren validaciones, FEFO y caducidad, confirmación física, transacciones y rollback, regularización mediante el inventario existente, abonos concurrentes, claves idempotentes, revisiones, permisos HTTP con Express y sesión/CSRF, caja, anulación, frontend con DOM simulado y cierre del ensayo ante errores. La persistencia de esas pruebas es simulada; no se atribuye a esta suite una validación real de ventas en MySQL.

Resultado de esta entrega: npm test pasó con 279 pruebas exitosas (223 anteriores y 56 nuevas), 0 fallidas, 0 omitidas y 0 canceladas; código de salida 0. git diff --check terminó con salida 0, sin errores de formato y con avisos de conversión LF/CRLF. La revisión de los 16 archivos pendientes no detectó secretos locales ni patrones de claves privadas; la sintaxis JavaScript y los dos bloques PowerShell documentados se comprobaron sin ejecutar los comandos de migración ni el ensayo real.

<a id="ventas-revisión-previa-a-la-activación-de-004"></a>

#### Revisión previa a la activación de 004

Las consultas de solo lectura confirmaron desarrollo-jose, MySQL 8.0.46 en micro_carmita, las versiones 001_auth, 002_catalogo_inventario y 003_pedidos_recepciones, catorce tablas InnoDB y un Administrador activo. Ninguna tabla de 004 existe. Los id de usuarios/clientes/productos/lotes son INT UNSIGNED con PK y coinciden con sus FK nuevas. No hay conflictos con los nueve nombres de CHECK nuevos. Se verificaron los tres CHECK actuales de movimientos_inventario: tipo, motivo y balance. micro_app mantiene SELECT/INSERT/UPDATE/DELETE sobre micro_carmita, sin DDL.

La revisión mantiene siete tablas nuevas, siete PK, trece FK y nueve CHECK. Existe una UNIQUE adicional sobre venta/revisión/producto, y las PK compuestas protegen asignaciones de lotes y claves de operación por usuario. Los índices requeridos por FK se crean en InnoDB; los de cliente/fecha y venta/fecha están explícitos. Se reforzaron los CHECK para exigir revisiones/versiones positivas e importes positivos en contado/abono, negativos en reembolso y distintos de cero en corrección. Los CHECK no comprueban sumas entre tablas: la pertenencia de lotes, el agregado de abonos y el total se mantienen en el servicio transaccional.

No hay DROP TABLE, TRUNCATE, DELETE, UPDATE, REPLACE, cambios de usuarios MySQL ni desactivación de FK. La única inserción fuera de las tablas nuevas registra la versión. El único cambio en una estructura previa es la sustitución del CHECK chk_inventario_tipo, en una sola sentencia ALTER que conserva los tipos existentes; no cambia filas de inventario, autenticación o pedidos. La sintaxis de ALTER/CHECK se contrastó con el [manual de MySQL 8.0](https://dev.mysql.com/doc/refman/8.0/en/alter-table.html) y las [reglas de CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html). La ejecución efectiva y comprobación de las nuevas restricciones siguen pendientes de autorización; no se presenta la inspección estática como una migración ya probada en el servidor real.

El ensayo preparado verifica los nueve RF del bloque. RF-04/05 comprueban líneas, cantidad, total, ingreso de contado y descuento. RF-06 comprueba rechazo sin confirmación física y faltante posterior. RF-07 rechaza producto vencido. Dos lotes vigentes con orden de ingreso distinto al de caducidad permiten comprobar FEFO por asignaciones y cantidades restantes, algo que la primera versión del ensayo no demostraba con un solo lote. RF-08 comprueba HTTP 403 del Vendedor y modificación/anulación administrativa, con reversión de caja y conservación de pagos. RF-10 exige cliente para fiado y rechaza su ausencia. RF-11/12 comprueban deuda 6, abono parcial 2, saldo 4, rechazo de sobrepago y pago completo. RF-13 consulta historial por cliente y responsables. La idempotencia se prueba en ventas, abonos y anulaciones; cambiar el contenido de una clave usada se rechaza con 409.

Mantenga el negocio sin actividad concurrente durante el ensayo: la comparación posterior contrasta todas las filas anteriores y podría detectar cambios legítimos ajenos. Las capturas completas consumen memoria proporcional al tamaño de la base y están pensadas para esta validación controlada de desarrollo. Los saltos de autoincremento no son reversibles por ROLLBACK.

Pendientes explícitos: aplicar 004 y ejecutar el ensayo autorizado; verificar DDL y restricciones efectivas; probar persistencia tras commit y reconexión/reinicio; competir con dos conexiones MySQL reales (ventas simultáneas sobre los mismos lotes, abonos que excedan juntos el saldo, reintentos con la misma clave, edición/anulación concurrente y recuperación de deadlocks); realizar el recorrido visual del navegador. Estos casos necesitan una base aislada con cuentas y registros temporales propios, no los datos permanentes del negocio. El ensayo con una conexión y savepoints no demuestra concurrencia real ni durabilidad. Se conservan los límites documentados para editar fiados abonados y la anulación lógica con reembolso; rf.txt no especifica reasignación de pagos ni devoluciones parciales de abonos.

Resultado de esta revisión: 282 pruebas exitosas (las 279 conservadas y tres nuevas), cero fallidas, omitidas o canceladas, código 0. git diff --check terminó sin errores, con los avisos LF/CRLF ya existentes. Los comandos de PowerShell se validaron sintácticamente sin ejecutarlos. Se ajustaron únicamente 004_ventas_cobros.sql, verify-sales-real.js, verify-sales.test.cjs y este documento; el resto de cambios pendientes pertenece a la implementación anterior. No se ejecutaron DDL ni escrituras reales. La aplicación preparada activa autocommit y comprobación de FK solo en su sesión administrativa, para confirmar también el registro final de versión sin cambiar la configuración global.


<a id="ventas-gestión-de-clientes-trasladada-a-ventas--19-de-noviembre-de-2026"></a>

#### Gestión de clientes trasladada a Ventas — 19 de noviembre de 2026

Gestión de clientes se encuentra ahora en Ventas, después del área de preparación/carrito y antes de Ventas registradas. Conserva los cuatro campos originales y listaClientes, sin formulario duplicado. + Nuevo cliente junto a ventaCliente desplaza y enfoca clientesNombre; no modifica el carrito, cantidad o tipo de venta. Inventario ya no contiene ni carga ese catálogo.

sales-client.js mantiene una sola caché de clientes para listado, ventaCliente y cuentasCliente. GET /api/clientes sigue dentro de la carga de ventas, incluida la restauración de sesión tras F5; el alta utiliza el POST existente y refresca únicamente Clientes. MicroCarmitaInventario.contacto('clientes') delega al nuevo método de ventas para preservar el onclick original. Proveedores mantiene su flujo anterior. No cambian backend, permisos, esquema ni reglas de ventas fiadas/Consumidor final.

Administrador y Vendedor conservan las acciones que ya tenían. La operación bloquea envíos simultáneos y usa el estado accesible estadoClientes. Error de validación conserva los campos; éxito limpia solo los valores que no fueron editados durante la espera. registro.id entero positivo de la respuesta del servidor es la única fuente para selección automática, salvo que el usuario haya cambiado manualmente su selección mientras esperaba. Sin ID inequívoco se consulta el catálogo y se pide elegir, sin adivinar por nombre. Las revisiones de consulta y la identidad descartan resultados anteriores al alta/logout. Si falla la lectura posterior a un alta confirmada, se advierte no repetir el registro y se conserva el cliente identificado por la respuesta.

Pruebas: 665 exitosas, 0 fallidas/omitidas, con 13 nuevas regresiones; auditoría de producción 0 vulnerabilidades y diff --check correcto. Persistencia de sesión/navegación y los escenarios previos de fiados, abonos y trazabilidad se conservan. Un fallo de red durante POST no permite saber si hubo commit: no hay reintento automático ni garantía de idempotencia durable de contactos. Revisar el catálogo antes de repetir una operación incierta.

Verificación manual pendiente en base de prueba: acceder como cada rol; abrir Ventas o recargar F5; usar + Nuevo cliente; registrar; verificar ID seleccionado, lista y selector de Cuentas; conservar carrito y tipo fiado; provocar rechazo sin borrar campos. No hubo escrituras MySQL reales ni migraciones, y el navegador automatizado no estuvo disponible.

<!-- FIN FUENTE: SALES.md -->

<a id="finanzas"></a>

## 5. Ingresos y egresos

Procedencia: **FINANCE.md**, antes en la raíz. Se conserva el registro de entrega y sus actualizaciones; leer los estados según la introducción.

<!-- INICIO FUENTE: FINANCE.md -->

<a id="finanzas-finanzas-rf-25-a-rf-28"></a>

### Finanzas: RF-25 a RF-28

Se leyó rf.txt directamente. El texto oficial, en las líneas 25 a 28, es:

| RF | Texto exacto | Implementación |
| --- | --- | --- |
| RF-25 | El sistema deberá permitir registrar ingresos relacionados con las operaciones del emprendimiento. | Ingreso manual por API y consulta de cobros automáticos de venta_caja. |
| RF-26 | El sistema deberá permitir registrar egresos y clasificarlos según su origen. | Egreso manual con categoría/origen obligatorio; reembolsos y correcciones negativas consultados desde venta_caja. |
| RF-27 | El sistema deberá permitir registrar gastos administrativos relacionados con el funcionamiento del negocio. | Egreso con indicador gastoAdministrativo, categoría libre (por ejemplo luz, agua o internet), motivo, importe, fecha y responsable. |
| RF-28 | El sistema deberá permitir consultar ingresos y egresos por fecha o rango de fechas. | GET /api/finance con fecha, desde/hasta o sin filtro; límites inclusivos y totales del mismo conjunto consultado. |

Antes del desarrollo se confirmó desarrollo-jose, se ejecutaron 282 pruebas exitosas y git diff --check sin errores; la revisión de los 16 archivos pendientes no detectó secretos locales ni patrones de claves privadas. Se registró únicamente el módulo anterior en el commit local fed2b61. No se hizo push. Los cambios financieros quedan sin commit.

<a id="finanzas-permisos-y-decisiones-de-alcance"></a>

#### Permisos y decisiones de alcance

RF-25 a RF-28 no asignan explícitamente permisos a un rol. RF-02 exige diferenciarlos. Se conserva la política operativa existente: Administrador registra y consulta el libro financiero; Vendedor registra ventas y abonos en sus API autorizadas, pero no registra movimientos manuales ni consulta el libro financiero general. Se valida en Express y se revalida el actor con bloqueo dentro de las escrituras. Superusuario no tiene acceso al módulo; continúa bloqueado en autenticación de producción. Esta política se documenta como decisión técnica basada en los permisos previos, no como una frase literal añadida a rf.txt.

Los RF no definen categorías cerradas, presupuestos, prohibición de caja negativa, fechas futuras, edición o eliminación de movimientos. Se aceptan categorías libres de hasta 80 caracteres, motivo hasta 255, fechas válidas MySQL desde 1000-01-01, e importes positivos con dos decimales hasta 99999999.99. El indicador administrativo solo es válido para egresos. Un importe negativo nunca se utiliza para registrar manualmente una operación: se elige ingreso o egreso. No se impide que el neto sea negativo ni se limita arbitrariamente un rango de fechas. No se implementan operaciones de edición o borrado: los registros manuales son inmutables. Una corrección se registra como una nueva operación compensatoria con motivo, conservando el original; el flujo especializado de anulación de ventas sigue siendo el de [SALES.md](MANUAL_TECNICO.md#ventas).

<a id="finanzas-una-sola-fuente-por-operación"></a>

#### Una sola fuente por operación

movimientos_financieros almacena exclusivamente operaciones manuales. venta_caja sigue siendo la única fuente para contado, abonos, correcciones y reembolsos de ventas. El repositorio consulta ambas mediante UNION ALL; no copia caja a otra tabla ni crea un segundo ingreso durante la consulta. Los identificadores de consulta son manual:id y venta:id. La relación ventaId se devuelve únicamente para filas de caja; el cliente no puede proporcionarla para un registro manual. Tampoco puede falsificar origen ni responsable.

En venta_caja, importe positivo se presenta como ingreso y negativo como egreso con valor absoluto. Un fiado sin abono no aporta efectivo. Se muestran tanto el ingreso histórico como su reembolso, aunque la venta esté anulada; no se filtran por el estado actual de la venta. Ingresos y egresos son importes brutos, y neto = ingresos - egresos. La corrección de una venta genera solo la diferencia que ya registra el módulo de ventas. Los totales se suman en centavos enteros, rechazando agregados que excedan el rango exacto de JavaScript.

Una operación manual podría repetir conceptualmente un cobro si el operador introduce el mismo hecho con una clave nueva: no se intenta inferir duplicados por igualdad de fecha/importe, porque existen operaciones legítimas iguales. La pantalla indica que ventas, abonos y devoluciones son automáticos. Los reintentos técnicos sí están protegidos mediante clave única por usuario, huella de contenido normalizado y bloqueo del actor, en la misma transacción que el registro. Misma clave y contenido devuelve el id existente; otro contenido devuelve 409. Las claves financieras son independientes de las de ventas.

La fecha manual es una fecha de negocio explícita; creado_en conserva UTC del servidor. Las fechas de caja se calculan desde su timestamp UTC a America/Guayaquil, UTC-05 sin horario de verano, mediante DATE_SUB. Esto evita depender de las tablas horarias instaladas en MySQL. El filtro puede usar fecha sola, desde/hasta, o un solo límite; mezclar fecha con rango se rechaza. La consulta y sus totales usan las mismas filas en una transacción. No se implementan reportes PDF, cierres, reportes completos ni respaldos R2.

La categoría y descripción provenientes de venta_caja se convierten explícitamente a utf8mb4_0900_ai_ci en el UNION para evitar conflictos si las tablas existentes heredaron otra collation de la base. No se cambia la codificación de las tablas previas.

<a id="finanzas-api-y-frontend"></a>

#### API y frontend

- POST /api/finance: clave, tipo (ingreso/egreso), categoria, motivo, importe, fecha, gastoAdministrativo opcional. HTTP 201 al crear y 200 al repetir. Solo Administrador.
- GET /api/finance: movimientos, filtros, ingresos, egresos y neto. Solo Administrador.
- Ejemplos: /api/finance?fecha=2026-11-17 y /api/finance?desde=2026-11-01&hasta=2026-11-17.

Se reutilizan sesión HttpOnly, protección CSRF y validación de origen. El router se instala antes del router general de inventario. No se crean usuarios ni credenciales predeterminadas.

finance-client.js conecta la pantalla Movimientos existente con la API, agrega categoría/origen, fecha, indicador administrativo y filtros. Sustituye la lectura/escritura de movimientos locales por una caché remota en memoria; los registros antiguos del navegador se conservan sin mezclarlos ni migrarlos automáticamente. Se descartan consultas tardías después de cambiar sesión o filtro. El formulario conserva la clave al perder una respuesta y bloquea envíos simultáneos; un rechazo 4xx permite corregir. No recargue la página mientras haya una operación con respuesta desconocida: reintente los mismos datos y la clave en memoria. La idempotencia confirmada permanece en MySQL. La tarjeta de inicio sigue indicando cobros netos de ventas; los totales financieros completos y del período se presentan en Movimientos.

<a id="finanzas-migración-005-pendiente"></a>

#### Migración 005 pendiente

005_finanzas.sql es necesaria porque las tablas anteriores solo registran caja asociada a ventas. Crea una única tabla InnoDB, movimientos_financieros, con PK, FK a usuarios, UNIQUE usuario/clave, índice fecha/id y cinco CHECK. El esquema pasa de 21 a 22 tablas. No cambia tablas anteriores ni filas de ventas, autenticación, catálogo o pedidos. La única inserción externa registra 005_finanzas en schema_migrations. Se requiere MySQL 8.0.46 y migraciones 001 a 004 previas. No se ejecutó la migración.

Después de autorizar la aplicación, desde la raíz en PowerShell:

```powershell
$mysqlClient = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$preflightFinanzas = @'
SELECT CASE WHEN DATABASE()='micro_carmita'
 AND SUBSTRING_INDEX(CURRENT_USER(),'@',1)='root'
 AND VERSION() LIKE '8.0.46%'
 AND (SELECT COUNT(*) FROM schema_migrations WHERE version IN ('001_auth','002_catalogo_inventario','003_pedidos_recepciones','004_ventas_cobros'))=4
 AND (SELECT COUNT(*) FROM schema_migrations WHERE version='005_finanzas')=0
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='movimientos_financieros')=0
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE())=21
 AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND ENGINE='InnoDB')=21
 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='usuarios' AND COLUMN_NAME='id' AND COLUMN_TYPE='int unsigned' AND COLUMN_KEY='PRI')=1
 AND (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME LIKE 'chk_finanzas_%')=0
 THEN 'APLICABLE' ELSE 'DETENER' END;
'@
$estadoFinanzas = @(& $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita --batch --skip-column-names --execute=$preflightFinanzas)
if ($LASTEXITCODE -ne 0 -or ($estadoFinanzas -join '').Trim() -ne 'APLICABLE') {
    throw 'No aplicar 005: inspeccione versiones, tablas y cuenta administrativa.'
}
$sqlFinanzas = Get-Content -Raw -Encoding UTF8 -ErrorAction Stop backend/migrations/005_finanzas.sql
$sqlFinanzas | & $mysqlClient --host=127.0.0.1 --port=3306 --user=root --password --database=micro_carmita --default-character-set=utf8mb4 --batch --skip-reconnect --init-command="SET SESSION autocommit=1, foreign_key_checks=1"
if ($LASTEXITCODE -ne 0) { throw 'Migración parcial: inspeccione el esquema antes de continuar.' }
```

La contraseña de root se pide por separado en cada invocación y no se pasa en argumentos ni se guarda. No use micro_app, --force ni migraciones anteriores. DDL tiene commits implícitos: prepare respaldo y no aplique simultáneamente desde otra terminal. Si queda una aplicación parcial, no borre tablas ni reejecute el archivo completo. Las comprobaciones bloquean una versión ya aplicada o una tabla nueva existente.

Después inspeccione con consultas de lectura:

```sql
SELECT DATABASE(), VERSION(), CURRENT_USER();
SELECT version FROM schema_migrations ORDER BY version;
SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();
SHOW CREATE TABLE movimientos_financieros;
SHOW INDEX FROM movimientos_financieros;
SELECT CONSTRAINT_NAME,CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='movimientos_financieros';
SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME='movimientos_financieros' AND REFERENCED_TABLE_NAME IS NOT NULL;
SELECT cc.CONSTRAINT_NAME,cc.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS cc
JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA
 AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='movimientos_financieros';
```

Se esperan 22 tablas, versión 005, una PK, una UNIQUE adicional, una FK, cinco CHECK y el índice de fecha. No se necesitan permisos DDL para micro_app; sus permisos existentes DML sobre la base alcanzan para el módulo.

<a id="finanzas-ensayo-real-preparado-sin-ejecutar"></a>

#### Ensayo real preparado, sin ejecutar

backend/verify-finance-real.js requiere 005 aplicada y DB_* ya configuradas. Abre Express temporal en loopback y una conexión MySQL con transacción externa; las transacciones internas usan savepoints y sus commits solo los liberan. Usa Administrador real únicamente para autenticarse y autorizar operaciones sobre datos temporales. Crea un Vendedor, cliente, proveedor, producto, contado, fiado, abono, anulación, ingreso y gasto administrativo temporales. Verifica HTTP 403 del Vendedor en finanzas, idempotencia y conflictos, validaciones, consultas por día/rango y variaciones de caja: +8 ingresos, +4 egresos, +4 neto, cinco filas adicionales. El fiado no aporta ingreso antes de su abono.

La captura previa y posterior compara las 22 tablas completas, incluidas cuentas, sesiones, caja, inventario, pedidos y movimientos anteriores. Se conserva solo en memoria y nunca se imprime. El cierre intenta rollback aunque falle otro recurso; si no lo confirma, destruye la conexión. Las nuevas sesiones y auditoría también quedan dentro de la transacción externa. No hay DDL ni commit externo en el ensayo. Pueden quedar saltos de autoincremento.

No use otras sesiones ni haga operaciones en el negocio durante el ensayo: las diferencias de actividad concurrente ajena también se detectarían. Ejecute dentro del mismo día de negocio, evitando el cambio de fecha durante la comparación de los totales. Las capturas completas requieren memoria proporcional al tamaño de la base. Después de autorizar las escrituras temporales:

```powershell
$claveEnsayo = $null
try {
    $env:AUTH_CHECK_USER = Read-Host 'Usuario Administrador'
    $claveEnsayo = Read-Host 'Contraseña del Administrador' -AsSecureString
    $env:AUTH_CHECK_PASSWORD = [System.Net.NetworkCredential]::new('', $claveEnsayo).Password
    node backend/verify-finance-real.js
    if ($LASTEXITCODE -ne 0) { throw 'Ensayo fallido: revise el diagnóstico controlado sin compartir secretos.' }
} finally {
    Remove-Item Env:AUTH_CHECK_USER, Env:AUTH_CHECK_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $claveEnsayo) { $claveEnsayo.Dispose() }
    Remove-Variable claveEnsayo -ErrorAction SilentlyContinue
}
```

Se esperan ok:true y rollback:true. Quedan pendientes aplicar 005, comprobar restricciones SQL efectivas, ejecutar el ensayo real, validar concurrencia entre conexiones, persistencia tras commit/reconexión, límites de fecha de caja en MySQL y recorrido visual del navegador. Las pruebas automáticas de concurrencia usan persistencia simulada; la prueba del repositorio comprueba consulta y parámetros, no ejecuta el UNION contra MySQL. Una consulta sin filtros puede requerir paginación/optimización futura cuando aumente el historial.

<a id="finanzas-archivos-y-pruebas"></a>

#### Archivos y pruebas

Nuevos: backend/migrations/005_finanzas.sql; backend/finance-repository.js, finance-service.js, finance-routes.js, finance.test.cjs, finance-client.test.cjs; backend/verify-finance-real.js, verify-finance.test.cjs; finance-client.js y [FINANCE.md](MANUAL_TECNICO.md#finanzas). Modificados: backend/app.js, backend/server.js, index.html y [README.md](../README.md). No se modifican app.js, modelo.js, package.json, rf.txt ni las migraciones previas.

Las pruebas cubren RF-25 a RF-28, roles, validaciones de dinero y fechas, categorías, gastos administrativos, idempotencia, concurrencia simulada, rollback, unión de fuentes sin copias, parámetros SQL, HTTP real de Express con persistencia aislada, DOM simulado sin almacenamiento local y cierre seguro del ensayo. Resultado: 323 exitosas (282 anteriores y 41 nuevas), 0 fallidas, 0 omitidas y 0 canceladas, código de salida 0. git diff --check termina sin errores de formato, con avisos LF/CRLF. La revisión de los 14 archivos pendientes no detecta secretos locales ni patrones de claves privadas; la sintaxis JavaScript y los dos bloques PowerShell se comprobaron sin ejecutar migraciones ni el ensayo real. No se realizaron nuevos commits después de fed2b61 ni push.

<a id="finanzas-auditoría-previa-a-aplicar-005"></a>

#### Auditoría previa a aplicar 005

Las consultas de solo lectura realizadas sobre MySQL confirman versión 8.0.46, base micro_carmita, 21 tablas InnoDB y únicamente las migraciones 001_auth, 002_catalogo_inventario, 003_pedidos_recepciones y 004_ventas_cobros. Existe un Administrador activo; no se imprimieron datos de su cuenta. usuarios.id es INT UNSIGNED y PK; coincide con la FK nueva. No existe movimientos_financieros ni hay nombres de CHECK en conflicto con chk_finanzas_*. micro_app conserva SELECT/INSERT/UPDATE/DELETE sobre micro_carmita y carece de privilegios DDL. Git sigue en desarrollo-jose, con los 14 archivos financieros pendientes (cuatro modificados y diez nuevos); no se prepararon archivos ni se crearon commits en esta auditoría.

Se revisaron la PK id, la UNIQUE usuario_id/clave, la FK a usuarios y el índice fecha/id. Los cinco CHECK validan tipo, importe, categoría, motivo e indicador administrativo. No se detectaron tipos incompatibles, borrados en cascada ni operaciones destructivas. El único CREATE es la tabla nueva y el único INSERT registra su versión. No hay ALTER, DROP, TRUNCATE, DELETE, UPDATE ni REPLACE; venta_caja, ventas, abonos, inventario y pedidos no se modifican al aplicar este archivo. La compatibilidad fue revisada estáticamente contra el esquema actual; la ejecución SQL y las restricciones efectivas siguen pendientes de autorización.

La lectura unificada usa una fila por PK de cada fuente, con prefijos de id distintos y JOIN a usuarios por su PK. UNION ALL conserva operaciones legítimas de igual importe sin multiplicarlas. No materializa ingresos ni registra copias durante las consultas. Se reforzó el ensayo para comparar los cinco identificadores esperados contra la caja real de las ventas temporales, además de las diferencias de ingresos/egresos/neto.

La auditoría confirma una transacción externa y una conexión compartida para todas las escrituras del ensayo, incluidos sesiones, usuario temporal y auditoría. Las transacciones internas solo liberan savepoints. El cierre espera el servidor antes de intentar rollback, sigue intentando limpieza si falla un recurso y destruye la conexión cuando no puede confirmar rollback. Se añadió una prueba aislada de fallo posterior a una escritura temporal, comprobando cierre, rollback y liberación en ese orden. La comparación final de las 22 tablas conserva todas las filas previas; en rutas de error, el cierre obligatorio revierte las escrituras y no declara ok. Los datos sensibles de las capturas quedan solo en memoria.

Los permisos se contrastaron con RF-25 a RF-28: el archivo oficial no reserva estas operaciones a un rol concreto. La restricción administrativa y la clasificación libre son decisiones técnicas explícitas, conservando la política anterior y sin alterar el texto de los RF. La autorización de ventas/abonos del Vendedor permanece separada de la consulta financiera general.

Resultado de esta auditoría: npm test conserva las 323 pruebas anteriores y añade una, con 324 exitosas, 0 fallidas, 0 omitidas y 0 canceladas, salida 0. git diff --check no detecta errores de formato; solo se mantienen los avisos LF/CRLF. Los dos bloques PowerShell se validaron sintácticamente sin ejecutarlos. En esta revisión se ajustaron [FINANCE.md](MANUAL_TECNICO.md#finanzas), backend/verify-finance-real.js y backend/verify-finance.test.cjs; la migración y las reglas del módulo no necesitaron cambios. No se ejecutaron migraciones ni escrituras del ensayo real.

<!-- FIN FUENTE: FINANCE.md -->

<a id="reportes"></a>

## 6. Reportes y exportación PDF

Procedencia: **REPORTS.md**, antes en la raíz. Se conserva el registro de entrega y sus actualizaciones; leer los estados según la introducción.

<!-- INICIO FUENTE: REPORTS.md -->

<a id="reportes-reportes-y-pdf"></a>

### Reportes y PDF

Implementación sobre las 22 tablas existentes, sin migraciones nuevas ni almacenamiento de resultados. Se leyó rf.txt directamente. Los textos siguientes corresponden a sus líneas 29 a 34 y 36.

| RF | Texto oficial exacto | Criterio implementado |
| --- | --- | --- |
| RF-29 | El sistema deberá generar reportes de ventas aplicando filtros por fecha o rango de fechas. | Ventas con fecha original, cliente, detalle de productos/cantidades/precios, tipo, estado, total de la revisión y total vigente; filtros inclusivos. Anuladas visibles pero excluidas de totales. |
| RF-30 | El sistema deberá generar un reporte de cierre diario que muestre el total de ventas y egresos registrados durante el día. | Ventas vigentes de contado/fiado y egresos de la fecha, junto a ingresos efectivos y neto de caja, claramente separados. |
| RF-31 | El sistema deberá generar un reporte de clientes con valores pendientes de pago, mostrando deuda, abonos y saldo. | Clientes con saldo agregado positivo; suma de todos sus fiados activos, deuda, abonos y saldo actuales. |
| RF-32 | El sistema deberá generar un reporte semanal de los pagos o abonos realizados por los clientes. | Semana lunes-domingo que contiene la fecha seleccionada; cliente, venta, importe, responsable y estado actual de la venta. |
| RF-33 | El sistema deberá generar reportes de ingresos y egresos por período. | Consulta financiera unificada, filtros de fecha y totales de ingresos, egresos y neto, sin copiar caja. |
| RF-34 | El sistema deberá generar un reporte del inventario que permita identificar existencias, productos con stock bajo y productos próximos a caducar. | Estado actual con existencias, faltantes, alertas de stock, lotes/cantidad/caducidad y distinción de vencidos. Reutiliza snapshot del inventario y modelo.js. |
| RF-36 | El sistema deberá permitir exportar o imprimir los reportes en formato PDF. | Los siete tipos de consulta disponibles tienen descarga PDF con encabezado, filtros, fecha de generación, resumen, registros y paginación. El archivo se puede imprimir desde su visor. |

Se revisó RF-35, cuyo texto es «El sistema deberá permitir consultar información relacionada con los pedidos realizados a proveedores y su estado». Se conserva su módulo operativo y se añade su consulta al selector de reportes y su exportación, reutilizando pedidos.lista y pedidos.detalles. No se cambian creación, recepción ni cancelación de pedidos.

<a id="reportes-línea-base-y-permisos"></a>

#### Línea base y permisos

Antes de desarrollar se confirmó desarrollo-jose, se ejecutaron las 324 pruebas existentes y git diff --check sin errores. La revisión de los 14 archivos financieros pendientes no encontró secretos locales ni patrones de claves privadas. Se creó el commit LOCAL 47cb226 del módulo financiero ya validado. No se hizo push. Los cambios de reportes permanecen sin commit.

Los RF de reportes no fijan permisos específicos. Se conserva la política de la pantalla previa: únicamente Administrador accede a reportes y PDF. Vendedor mantiene sus consultas y operaciones de ventas/cuentas/inventario/pedidos en los endpoints operativos anteriores; no recibe acceso financiero global mediante reportes. Superusuario tampoco recibe acceso a este módulo y continúa bloqueado en autenticación de producción. Esta separación es una decisión técnica, no un RF nuevo ni una cita atribuida a rf.txt. JSON y PDF usan la misma autorización Express, sesión HttpOnly y Cache-Control no-store.

<a id="reportes-consultas-y-coherencia-contable"></a>

#### Consultas y coherencia contable

report-repository.js abre una transacción y construye sobre la misma conexión los repositorios existentes de inventario, ventas, finanzas y pedidos. Reutiliza la consulta financiera, la lectura de detalles históricos de ventas y las reglas de inventario. Las consultas nuevas de cabeceras de venta, pendientes y abonos son SELECT parametrizados sobre las mismas tablas. No hay tablas, DDL, movimientos automáticos adicionales ni caché persistente de reportes.

Los reportes de ventas usan su fecha de creación en America/Guayaquil (UTC-05), mostrando el estado y revisión actuales. Una modificación o anulación posterior puede cambiar el reporte de un período pasado; no se presenta como una reconstrucción contable a una fecha de corte. La revisión anterior sigue en el historial de ventas. Se muestran tanto el total registrado en la revisión como el total que se computa en las ventas vigentes.

Un fiado cuenta como venta en RF-29/30, pero no como efectivo cobrado. Los ingresos son únicamente venta_caja y movimientos manuales. Los abonos no se suman al total vendido. Los reembolsos y correcciones negativas son egresos y permanecen visibles aunque la venta esté anulada. El cálculo financiero se extrajo a resumirFinanzas, compartido por finanzas y reportes, para evitar reglas divergentes. Los importes se agregan en centavos enteros y se rechazan totales fuera del rango exacto de cálculo.

El cierre de RF-30 es una consulta diaria con ventas y egresos; no bloquea una caja, impide operaciones posteriores ni crea un cierre definitivo, porque eso no está exigido por rf.txt. Neto de caja es ingresos menos egresos, no ventas menos egresos.

Pendientes e inventario muestran el estado actual y rechazan filtros históricos que el esquema no permitiría reconstruir fielmente. Los clientes con saldo cero no aparecen en pendientes; para un cliente con saldo positivo, deuda y abonos incluyen todos sus fiados activos. Anuladas no generan deuda. El reporte semanal conserva abonos históricos incluso si la venta fue anulada después: se muestra su estado actual y se advierte que las devoluciones están en Finanzas, sin borrar el pago original ni convertirlo en ingreso nuevo.

rf.txt no define el primer día semanal: se adopta lunes a domingo, con límites inclusivos, y se muestra el período calculado. Cierre y semana usan la fecha seleccionada o el día actual de Guayaquil. Ventas y finanzas aceptan fecha sola, desde/hasta, un solo límite o ausencia de filtros. Se rechazan fechas inexistentes, parámetros desconocidos, arrays, rangos invertidos y combinaciones ambiguas.

El inventario conserva stock = suma física de lotes (incluidos vencidos) menos faltante. El stock bajo es estrictamente menor que tres, incluidos cero y negativos. La alerta próxima comprende cero a cinco días, solo sobre lotes con cantidad positiva; vencidos se cuentan por separado. El detalle distingue lotes sin caducidad, vigentes, por caducar y vencidos. Incluye productos archivados identificados como tales para no ocultar registros existentes. No se cambia la prohibición de vender vencidos.

<a id="reportes-endpoints-y-pantalla"></a>

#### Endpoints y pantalla

| Ruta | Resultado |
| --- | --- |
| GET /api/reports/ventas | RF-29; fecha, desde/hasta opcionales. |
| GET /api/reports/cierre | RF-30; fecha opcional. |
| GET /api/reports/pendientes | RF-31; estado actual sin filtros. |
| GET /api/reports/pagos | RF-32; fecha opcional que determina la semana completa. |
| GET /api/reports/finanzas | RF-33; fecha, desde/hasta opcionales. |
| GET /api/reports/inventario | RF-34; estado actual sin filtros. |
| GET /api/reports/pedidos | Consulta RF-35; estado actual sin filtros. |
| GET /api/reports/:tipo/pdf | RF-36; mismo tipo, filtros y permisos, application/pdf y Content-Disposition attachment. |

Ejemplo: /api/reports/ventas?desde=2026-11-01&hasta=2026-11-17 y /api/reports/ventas/pdf?desde=2026-11-01&hasta=2026-11-17. Cada petición genera una captura nueva; si se registra una operación entre consulta y descarga, los datos pueden variar. La fecha/hora de generación del PDF permite identificar esa captura.

reports-client.js reemplaza mostrarReportes y la pantalla anterior basada en resúmenes locales. El selector permite consultar y descargar PDF. Los valores se escapan antes de generar la tabla HTML, no se accede a localStorage y se descartan respuestas tardías al cambiar filtros o sesión. auth-client.archivo descarga el blob con cookies de sesión, rechaza contenido distinto de PDF y limpia una sesión vencida. El usuario abre el PDF descargado y puede imprimirlo desde su visor. No se permite que una petición controle rutas del sistema de archivos ni nombres arbitrarios de archivos de salida.

<a id="reportes-pdf-y-dependencia"></a>

#### PDF y dependencia

Se agregó PDFKit 0.20.2 como dependencia de ejecución, registrada en package.json y package-lock.json. npm test conserva su script anterior. PDFKit genera los documentos en memoria: no escribe reportes ni datos del negocio en archivos del servidor. El diseño A4 incluye encabezados repetidos, título, período o fecha de estado actual, generación UTC, resumen monetario, notas de interpretación, registros con etiquetas y pie con número de página/total. Los campos largos se dividen en líneas y páginas; no se truncan filas. El formato de importes conserva el símbolo $ ya utilizado por la aplicación, con dos decimales.

Las fuentes estándar Helvetica cubren español y Latin-1; los caracteres fuera de ese conjunto se muestran como ?. No se atribuye soporte completo de alfabetos Unicode a esta versión. El texto íntegro permanece en la consulta JSON y pantalla. Si se requieren otros alfabetos, deberá incorporarse una fuente Unicode con licencia adecuada. No se incluyen fuentes propietarias del sistema operativo ni servicios externos para convertir documentos.

Las pruebas generan PDF reales y validan firma, fin de archivo, xref, texto descomprimido, acentos, filtros, totales, paginación, registros al final de documentos extensos y respuesta HTTP. La inspección visual en visor y la impresión física quedan pendientes; no se presenta la comprobación estructural como una inspección visual ya realizada.

<a id="reportes-configuración-y-ensayo-real-preparado"></a>

#### Configuración y ensayo real preparado

No existe migración 006 ni se requiere aplicar DDL. El módulo usa DB_* y las migraciones 001 a 005 ya existentes. Para preparar una instalación desde los archivos versionados e iniciar:

```powershell
npm ci
npm test
npm start
```

backend/verify-reports-real.js reutiliza el ensayo financiero mediante una comprobación adicional, dentro de su misma conexión y transacción externa. No ejecuta el ensayo en esta entrega. Prepara ingreso/egreso manual, Vendedor, cliente, proveedor, producto, contado, fiado, abono y reembolso temporales. Contrasta los siete JSON y PDF, HTTP 403 del Vendedor en ambas variantes, ventas anuladas excluidas del total vigente, cierre frente a caja, pendientes sin deuda anulada, abonos históricos y stock final. No copia ni altera pedidos existentes; su consulta y el estado de todas sus tablas se conservan.

El servidor Express temporal vive en loopback. Los commits internos liberan savepoints; no confirman la transacción externa. Un fallo de reportes se captura dentro del mismo try/finally que ejecuta el cierre y rollback seguro. Después se comparan las 22 tablas completas con sus filas previas, incluidos Administrador, sesiones, ventas, pedidos e inventario. Las capturas y los PDF de ensayo solo viven en memoria y no se imprimen ni se guardan. Los errores muestran únicamente etapa/categorías controladas. Pueden quedar saltos de autoincremento.

Las escrituras temporales necesitan autorización antes de ejecutar el ensayo. Evite actividad del negocio o de otras sesiones durante la comparación y no lo ejecute atravesando el cambio de día. Desde una terminal integrada controlada personalmente:

```powershell
$claveEnsayo = $null
try {
    $env:AUTH_CHECK_USER = Read-Host 'Usuario Administrador'
    $claveEnsayo = Read-Host 'Contraseña del Administrador' -AsSecureString
    $env:AUTH_CHECK_PASSWORD = [System.Net.NetworkCredential]::new('', $claveEnsayo).Password
    node backend/verify-reports-real.js
    if ($LASTEXITCODE -ne 0) { throw 'Ensayo fallido: revise etapaFallida o erroresLimpieza sin compartir secretos.' }
} finally {
    Remove-Item Env:AUTH_CHECK_USER, Env:AUTH_CHECK_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $claveEnsayo) { $claveEnsayo.Dispose() }
    Remove-Variable claveEnsayo -ErrorAction SilentlyContinue
}
```

Se esperan ok:true y rollback:true. Quedan pendientes el ensayo MySQL autorizado, SQL efectivo de las nuevas consultas, fronteras de fecha/zona horaria en el servidor, concurrencia entre conexiones reales y recorrido visual de pantalla/PDF. La consulta transaccional utiliza el aislamiento configurado en MySQL; para una captura consistente entre varias lecturas se requiere el aislamiento REPEATABLE READ habitual del proyecto. Los reportes completos y PDF se cargan en memoria; antes de un historial grande habrá que incorporar paginación/límites de exportación y optimizar consultas de fecha. El ensayo de una conexión no demuestra durabilidad tras commit ni comportamiento entre conexiones concurrentes.

<a id="reportes-seguridad-de-dependencias"></a>

#### Seguridad de dependencias

Situación inicial: npm audit informó ocho avisos, seis altos y dos moderados, en body-parser, qs y la cadena de nodemon (chokidar, minimatch, picomatch, anymatch, readdirp). Se contrastaron sus versiones con el package-lock del commit financiero: todos esos paquetes/versiones ya existían antes de añadir PDFKit. El informe no señaló PDFKit ni sus nuevas dependencias. La actualización y el resultado actual se detallan en la auditoría siguiente; este párrafo conserva la evidencia inicial.

<a id="reportes-archivos-y-comprobaciones"></a>

#### Archivos y comprobaciones

Nuevos: backend/report-repository.js, report-service.js, report-pdf.js, report-routes.js, report.test.cjs, report-download.test.cjs, reports-client.test.cjs, verify-reports-real.js, verify-reports.test.cjs; reports-client.js y [REPORTS.md](MANUAL_TECNICO.md#reportes). Modificados: backend/app.js, backend/server.js, backend/finance-service.js (cálculo compartido), backend/verify-finance-real.js (comprobación adicional opcional y recepción PDF), auth-client.js, index.html, package.json, package-lock.json y [README.md](../README.md). No se modifican reglas de ventas, app.js, modelo.js, rf.txt ni migraciones anteriores.

Se conservan las 324 pruebas anteriores. Las nuevas pruebas cubren cálculos, fechas inclusivas y semanas que cruzan año, permisos, parámetros SQL, ausencia de multiplicación de abonos, coherencia de caja, inventario/alertas compartidas, generación PDF real, descarga autenticada, DOM sin datos locales y comprobación del ensayo preparado. Los datos de persistencia de las pruebas son simulados; no se atribuye a esta suite una validación real del nuevo bloque contra MySQL.

Resultado del bloque inicial de reportes: 359 pruebas exitosas (324 conservadas y 35 nuevas), 0 fallidas, 0 omitidas y 0 canceladas, código 0. git diff --check terminó sin errores de formato, con avisos de conversión LF/CRLF. Los cambios de reportes permanecen sin commit; no se realizaron escrituras reales ni push.

<a id="reportes-auditoría-de-seguridad-y-preparación-del-ensayo"></a>

#### Auditoría de seguridad y preparación del ensayo

Se ejecutó npm audit --json sobre el árbol completo: ocho entradas de paquetes afectados, que agrupan cuatro avisos originales y su propagación por las dependencias. No son ocho fallos independientes de la aplicación. Se revisaron los manifiestos instalados, las versiones publicadas en npm y los avisos oficiales. Se conserva desarrollo-jose y no se crea ningún commit en este bloque.

| Paquete y versión inicial | Relación / uso | Severidad inicial | Corrección o resultado |
| --- | --- | --- | --- |
| body-parser 2.3.0 | Transitiva de Express; producción | Alta | Actualizado a 2.4.0, corregido y admitido por Express ^2.2.1. |
| qs 6.16.0 | Transitiva de Express/body-parser; producción | Moderada | Actualizado a 6.17.1; parche publicado desde 6.16.1, dentro de los rangos ^6 existentes. |
| nodemon 3.1.14 | Directa, devDependencies | Alta, propagada | Conservado. Es la versión publicada actual; sus rangos siguen incluyendo las ramas afectadas. |
| chokidar 3.6.0 | Transitiva de nodemon; desarrollo | Alta, propagada | Conservado; depende de anymatch y readdirp afectados. |
| anymatch 3.1.3 | Transitiva de chokidar; desarrollo | Alta, propagada | Conservado; requiere picomatch ^2.0.4. |
| readdirp 3.6.0 | Transitiva de chokidar; desarrollo | Alta, propagada | Conservado; requiere picomatch ^2.2.1. |
| picomatch 2.3.2 | Transitiva de anymatch/readdirp; desarrollo | Alta | El aviso alcanza hasta 4.0.7 y no declara versión corregida. La versión publicada actual 4.0.7 también está afectada. |
| minimatch 10.2.6 | Transitiva de nodemon; desarrollo | Moderada | Corregida desde 11.0.1; actual publicada 11.0.9. Es un cambio mayor fuera de ^10.2.1 de nodemon y no se fuerza. |

<a id="reportes-rutas-de-explotación-y-exposición"></a>

##### Rutas de explotación y exposición

- [body-parser, GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828): una solicitud comprimida con bytes sobrantes podía provocar un error no controlado en el descompresor y derribar el proceso. express.json se instala antes de autenticar, por lo que la sesión no protegía ese punto de entrada. Es una ruta relevante si el backend está accesible por HTTP, incluso con límite de 8 KB. Se instaló el parche y una prueba local comprueba que un gzip malformado no impide consultar health posteriormente. No se enviaron solicitudes a servidores ajenos ni a MySQL.
- [qs, GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw): el fallo afecta stringify con arrayFormat comma cuando recibe elementos con toString propio no invocable. No se encontró ese uso en el código del proyecto; estar instalada en producción no demuestra una ruta explotable de esa función. Se actualizó igualmente y se agregó una prueba de serialización defensiva.
- [picomatch, GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): riesgo de ReDoS con patrones extglob manipulados. En este árbol solo llega a la vigilancia de archivos de nodemon, a través de anymatch/readdirp. Requiere introducir patrones no confiables en la configuración o invocación de la herramienta; no se identificó una ruta HTTP del backend hacia esos patrones. No ejecute nodemon con patrones/configuraciones de procedencia no confiable.
- [minimatch, GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): amplificación de patrones bajo optimizationLevel >= 2. nodemon lo usa para coincidencias de archivos; su llamada instalada configura dot/nocase/windowsPathsNoEscape, sin activar ese nivel. No se observó una ruta de explotación remota en la aplicación, pero el paquete permanece afectado según audit. El cambio a minimatch 11 necesita evaluación explícita de compatibilidad.

El servidor de producción se inicia con node backend/server.js, no con nodemon. Los seis avisos restantes son exclusivos de desarrollo en el árbol actual. No se ocultan ni se declaran resueltos por cambiar su clasificación. Para despliegue use npm ci --omit=dev y npm start; npm audit --omit=dev --json comprueba el árbol de producción sin alterar la instalación. No introducir patrones externos en herramientas de vigilancia sigue siendo importante en estaciones de desarrollo.

Alternativas pendientes: esperar versiones compatibles del mantenedor de nodemon/chokidar y un parche de picomatch; evaluar por separado minimatch 11 con pruebas de vigilancia; o retirar nodemon si se confirma que ya no se utiliza y adoptar node --watch. Los scripts versionados actuales no invocan nodemon, pero no se eliminó una herramienta que el desarrollador podría usar manualmente. No se aplicó el descenso sugerido por audit a nodemon 3.1.11: queda fuera de ^3.1.14, no prueba la eliminación de picomatch y no sustituye el análisis del árbol resultante.

<a id="reportes-cambios-compatibles-y-cantidades-exactas"></a>

##### Cambios compatibles y cantidades exactas

Se ejecutó únicamente npm update body-parser qs --ignore-scripts, sin audit fix ni fix --force y sin overrides de versiones mayores. Cambiaron dos paquetes en package-lock.json; no se agregaron dependencias directas nuevas en este bloque. Se mantuvieron Express 5.2.1, PDFKit 0.20.2 y nodemon 3.1.14. Node utilizado: 26.10.0; body-parser 2.4.0 requiere Node >=18.

- Auditoría inicial completa: 8 (6 altas, 2 moderadas), salida 1 por avisos.
- Auditoría posterior completa: 6 (5 altas, 1 moderada; 0 críticas), exclusivamente desarrollo, salida 1 por avisos.
- Auditoría posterior de producción con --omit=dev: 0, salida 0.
- npm test: 364 exitosas (359 anteriores y cinco nuevas), 0 fallidas, omitidas o canceladas, salida 0.

La regresión HTTP verifica también que JSON y PDF no entregan contenido sin sesión, a Vendedor, a cuenta inactiva ni al Superusuario en producción, incluso solicitando habilitarlo en la factoría. Las respuestas denegadas no tienen MIME PDF ni firma PDF y mantienen Cache-Control no-store. Las descargas de Administrador siguen comprobadas por las pruebas anteriores.

<a id="reportes-cobertura-reforzada-del-ensayo-todavía-sin-ejecutar"></a>

##### Cobertura reforzada del ensayo, todavía sin ejecutar

Se revisó la cadena verify-reports-real -> verify-finance-real -> cerrarVerificacion. Todas las escrituras temporales, nuevas sesiones y auditoría comparten la misma conexión/transacción externa. Los commits de repositorio solo liberan savepoints. El cierre espera el servidor antes de rollback, continúa ante fallos de cierre y destruye una conexión cuyo rollback no se confirmó. Las capturas completas de las 22 tablas comparan Administrador, sesiones, ventas, cobros, inventario, pedidos y demás filas anteriores; nunca se guardan ni imprimen. Un fallo de las comprobaciones de reportes permanece dentro del try/finally del ensayo financiero y no declara ok. Las pruebas aisladas de cierre existentes cubren fallo después de escritura, rollback fallido y liberación ordenada.

La primera versión del ensayo comprobaba que el cliente dejaba de tener pendientes después de anular, pero no demostraba RF-31 con saldo positivo. Ahora, antes de la anulación, comprueba por JSON y PDF deuda 2, abonos 1 y saldo 1; después confirma ausencia de ese cliente en pendientes. Para RF-34 el producto temporal tiene caducidad a cinco días, y el reporte debe mostrar su lote Por caducar y stock bajo de una unidad. No cambia el ensayo financiero ordinario, que conserva su lote sin caducidad. Se añadieron pruebas aisladas del saldo correcto e incorrecto.

RF-29 comprueba contado vigente y fiado anulado excluido; RF-30 compara ventas y caja; RF-31 compara deuda/abono/saldo antes y después de anular; RF-32 conserva el abono semanal y el estado de la venta; RF-33 concilia con la fuente financiera, incluyendo reembolso sin ingreso anticipado; RF-34 comprueba stock y alerta de caducidad; RF-36 verifica siete PDF y rechazo del Vendedor. La caja financiera subyacente compara los identificadores exactos de los cobros temporales para detectar duplicados, además de los totales.

<a id="reportes-procedimiento-exacto-para-el-ensayo-autorizado"></a>

##### Procedimiento exacto para el ensayo autorizado

No ejecute este bloque hasta autorizar sus escrituras temporales. Las migraciones 001 a 005 ya deben existir; no hay migración que ejecutar aquí. El propio ensayo detiene la ejecución si faltan versiones o no encuentra 22 tablas InnoDB. DB_* deben estar configuradas en el .env local ignorado por Git. Evite actividad concurrente y el cambio de día durante el ensayo.

```powershell
Set-Location -LiteralPath 'C:\Users\HP\Desktop\Proyecto Titulacion\Micro-Carmita'
if ((git branch --show-current) -ne 'desarrollo-jose') { throw 'Rama incorrecta; no continuar.' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Pruebas fallidas; no ejecutar el ensayo.' }
$claveEnsayo = $null
try {
    $env:AUTH_CHECK_USER = Read-Host 'Usuario Administrador'
    $claveEnsayo = Read-Host 'Contraseña del Administrador' -AsSecureString
    $env:AUTH_CHECK_PASSWORD = [System.Net.NetworkCredential]::new('', $claveEnsayo).Password
    node backend/verify-reports-real.js
    if ($LASTEXITCODE -ne 0) { throw 'Ensayo fallido: revise únicamente el diagnóstico controlado.' }
} finally {
    Remove-Item Env:AUTH_CHECK_USER, Env:AUTH_CHECK_PASSWORD -ErrorAction SilentlyContinue
    if ($null -ne $claveEnsayo) { $claveEnsayo.Dispose() }
    Remove-Variable claveEnsayo -ErrorAction SilentlyContinue
}
```

Aceptar únicamente ok:true y rollback:true, sin erroresLimpieza. No compartir capturas, credenciales, hashes ni tokens. Los saltos de autoincremento pueden permanecer; no significan que queden filas de ensayo. Siguen pendientes SQL real de los reportes, revisión visual/PDF, concurrencia entre conexiones, durabilidad tras commit y las seis entradas de auditoría de desarrollo. No se ejecutaron el ensayo, migraciones, commits ni push en este bloque.

Cambios específicos de esta auditoría: package-lock.json; backend/verify-finance-real.js, verify-reports-real.js y verify-reports.test.cjs; nuevas pruebas backend/dependency-security.test.cjs y backend/report-security.test.cjs; este documento. Se revisaron los 22 archivos candidatos del bloque completo sin detectar secretos locales ni patrones de claves privadas. La sintaxis JavaScript y los tres bloques PowerShell se comprobaron sin ejecutar el ensayo. git diff --check terminó con salida 0 y solo avisos LF/CRLF. La última auditoría volvió a confirmar 0 avisos de producción y 6 de desarrollo (5 altos y 1 moderado).

<!-- FIN FUENTE: REPORTS.md -->

<a id="reglas-integraciones"></a>

## 7. Reglas de negocio e integraciones

Este índice evita repetir reglas que ya están documentadas con su alcance y evidencia:

| Integración | Referencia canónica en este manual |
| --- | --- |
| Stock, FEFO, caducidad, faltante y recepción | [Inventario: esquema y decisiones](#inventario-esquema-y-decisiones), [pedidos: estructura y reglas](#pedidos-estructura-y-reglas), [ventas: conservación](#ventas-reglas-de-validación-y-conservación) |
| Sesiones, actor, permisos y CSRF | [Autenticación](AUTH.md), API de cada módulo y [permisos vigentes](../README.md#roles-y-permisos-actuales) |
| Caja de ventas frente a movimientos manuales | [Finanzas: una sola fuente](#finanzas-una-sola-fuente-por-operación), [reportes: coherencia](#reportes-consultas-y-coherencia-contable) |
| Idempotencia y revisiones | [Ventas: transacciones e idempotencia](#ventas-transacciones-e-idempotencia), [recepciones](#pedidos-estructura-y-reglas) y actualización de lotes en QA |
| Respaldo y recuperación | [BACKUP](BACKUP.md); independiente de Express, sin activación en esta reorganización |

<a id="pruebas-limitaciones"></a>

## 8. Pruebas, limitaciones y referencias técnicas

Las tablas, ensayos y referencias externas originales se mantienen junto al módulo al que pertenecen. No se repiten aquí sus comandos ni sus resultados. La [instalación local](../README.md#instalación-local) permanece en el README, y el [estado actual y las evidencias históricas](FINAL_QA.md#estado-documental-actual) se distinguen en QA.

| Dominio | Verificación y limitaciones originales |
| --- | --- |
| Inventario | [Archivos y pruebas](#inventario-archivos-y-pruebas), [activación y ensayo reversible](#inventario-preparación-de-activación-en-desarrollo-jose) |
| Pedidos | [Verificación](#pedidos-verificación) |
| Ventas | [Ensayo real pendiente](#ventas-ensayo-real-pendiente), [pruebas automatizadas](#ventas-archivos-y-verificación-automatizada) |
| Finanzas | [Ensayo preparado](#finanzas-ensayo-real-preparado-sin-ejecutar), [pruebas](#finanzas-archivos-y-pruebas) |
| Reportes | [Configuración y ensayo](#reportes-configuración-y-ensayo-real-preparado), [seguridad histórica](#reportes-auditoría-de-seguridad-y-preparación-del-ensayo) |

Las pruebas aisladas no demuestran concurrencia entre conexiones reales ni persistencia tras commit/reinicio. R2 y restauración requieren su validación operativa aislada. Los límites de volumen, fuentes PDF, incertidumbres y advertencias de seguridad permanecen en los bloques originales, sin descartarlos por aparecer en más de un contexto histórico.
