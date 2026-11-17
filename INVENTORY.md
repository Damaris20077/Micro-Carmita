# Clientes, proveedores e inventario

## Entrega y alcance

Se implementan RF-09, RF-14, RF-15, RF-16, RF-17, RF-18 y RF-20 mediante API Express y una migración aditiva MySQL 8.0.46. El esquema de autenticación y el Administrador se conservan. Durante esta entrega se consultaron únicamente los metadatos reales, que mostraron las cinco tablas de autenticación y la versión `001_auth`. La migración `002_catalogo_inventario` sigue pendiente de autorización administrativa. Las operaciones de este bloque aún requieren validación contra MySQL real después de aplicarla.

## Esquema y decisiones

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

## API

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

## Interfaz y transición de datos

`inventory-client.js` se carga después de `auth-client.js`. Reutiliza su cliente HTTP y la sesión actual. La pantalla Inventario contiene el catálogo, lotes, alertas, formularios de entradas y ajustes, historial, clientes y proveedores. Las herramientas administrativas se ocultan para otros roles y el backend las protege independientemente de esa presentación.

El inventario remoto es la fuente utilizada por la aplicación integrada, incluyendo su total de unidades y el catálogo del carrito. El inventario local antiguo se conserva físicamente y se ofrece un botón administrativo para descargarlo. El adaptador impide que se vuelva a guardar un inventario paralelo en localStorage. No se importan ni sobrescriben automáticamente registros antiguos. La importación revisada de datos existentes queda pendiente.

La pantalla de ventas, el carrito, las ventas anteriores, cuentas por cobrar y reportes locales se conservan. El registro de nuevas ventas locales queda temporalmente bloqueado con un mensaje explícito porque descontaría existencias fuera de las transacciones del servidor. La integración transaccional de ventas es una dependencia pendiente. Esta entrega no crea ventas nuevas ni modifica registros históricos para simular esa integración. Los clientes ya tienen IDs, pero su enlace efectivo con nuevas ventas y cuentas por cobrar requiere esa fase.

Si falta la migración o la API falla, se informa el error y se vacía el stock visible. La aplicación evita sustituirlo silenciosamente por el almacenamiento local. La autenticación y gestión de usuarios siguen disponibles con `001_auth`.

## Aplicación administrativa pendiente

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

## Archivos y pruebas

La suite completa `npm test` pasó con 181 pruebas exitosas, cero fallidas, omitidas o canceladas, código de salida 0. Son las 138 pruebas anteriores y 43 adicionales para este bloque. Las pruebas usan datos aislados. La migración nueva no se ejecutó en la base real.

Nuevos archivos de este bloque son `002_catalogo_inventario.sql`, `inventory-repository.js`, `inventory-service.js`, `inventory-routes.js`, sus pruebas en backend, `inventory-client.js` y este documento. Se modifican `backend/app.js`, `backend/server.js`, `modelo.js`, `auth-client.js`, `index.html` y `README.md`. El resto de pruebas históricas se conserva.

Las pruebas cubren validación, permisos por rol, snapshot con límites de alertas, lotes, conciliación y stock negativo, motivos y responsables, conservación de lotes al editar, archivo, rollback ante fallo de historial y ajustes concurrentes. La integración HTTP utiliza Express y middleware de sesión/CSRF reales con persistencia simulada. Las pruebas del frontend cargan `app.js` junto al adaptador y comprueban que el catálogo procede de la API. La ejecución contra MySQL real del bloque nuevo permanece pendiente de aplicar `002`.
