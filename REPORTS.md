# Reportes y PDF

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

## Línea base y permisos

Antes de desarrollar se confirmó desarrollo-jose, se ejecutaron las 324 pruebas existentes y git diff --check sin errores. La revisión de los 14 archivos financieros pendientes no encontró secretos locales ni patrones de claves privadas. Se creó el commit LOCAL 47cb226 del módulo financiero ya validado. No se hizo push. Los cambios de reportes permanecen sin commit.

Los RF de reportes no fijan permisos específicos. Se conserva la política de la pantalla previa: únicamente Administrador accede a reportes y PDF. Vendedor mantiene sus consultas y operaciones de ventas/cuentas/inventario/pedidos en los endpoints operativos anteriores; no recibe acceso financiero global mediante reportes. Superusuario tampoco recibe acceso a este módulo y continúa bloqueado en autenticación de producción. Esta separación es una decisión técnica, no un RF nuevo ni una cita atribuida a rf.txt. JSON y PDF usan la misma autorización Express, sesión HttpOnly y Cache-Control no-store.

## Consultas y coherencia contable

report-repository.js abre una transacción y construye sobre la misma conexión los repositorios existentes de inventario, ventas, finanzas y pedidos. Reutiliza la consulta financiera, la lectura de detalles históricos de ventas y las reglas de inventario. Las consultas nuevas de cabeceras de venta, pendientes y abonos son SELECT parametrizados sobre las mismas tablas. No hay tablas, DDL, movimientos automáticos adicionales ni caché persistente de reportes.

Los reportes de ventas usan su fecha de creación en America/Guayaquil (UTC-05), mostrando el estado y revisión actuales. Una modificación o anulación posterior puede cambiar el reporte de un período pasado; no se presenta como una reconstrucción contable a una fecha de corte. La revisión anterior sigue en el historial de ventas. Se muestran tanto el total registrado en la revisión como el total que se computa en las ventas vigentes.

Un fiado cuenta como venta en RF-29/30, pero no como efectivo cobrado. Los ingresos son únicamente venta_caja y movimientos manuales. Los abonos no se suman al total vendido. Los reembolsos y correcciones negativas son egresos y permanecen visibles aunque la venta esté anulada. El cálculo financiero se extrajo a resumirFinanzas, compartido por finanzas y reportes, para evitar reglas divergentes. Los importes se agregan en centavos enteros y se rechazan totales fuera del rango exacto de cálculo.

El cierre de RF-30 es una consulta diaria con ventas y egresos; no bloquea una caja, impide operaciones posteriores ni crea un cierre definitivo, porque eso no está exigido por rf.txt. Neto de caja es ingresos menos egresos, no ventas menos egresos.

Pendientes e inventario muestran el estado actual y rechazan filtros históricos que el esquema no permitiría reconstruir fielmente. Los clientes con saldo cero no aparecen en pendientes; para un cliente con saldo positivo, deuda y abonos incluyen todos sus fiados activos. Anuladas no generan deuda. El reporte semanal conserva abonos históricos incluso si la venta fue anulada después: se muestra su estado actual y se advierte que las devoluciones están en Finanzas, sin borrar el pago original ni convertirlo en ingreso nuevo.

rf.txt no define el primer día semanal: se adopta lunes a domingo, con límites inclusivos, y se muestra el período calculado. Cierre y semana usan la fecha seleccionada o el día actual de Guayaquil. Ventas y finanzas aceptan fecha sola, desde/hasta, un solo límite o ausencia de filtros. Se rechazan fechas inexistentes, parámetros desconocidos, arrays, rangos invertidos y combinaciones ambiguas.

El inventario conserva stock = suma física de lotes (incluidos vencidos) menos faltante. El stock bajo es estrictamente menor que tres, incluidos cero y negativos. La alerta próxima comprende cero a cinco días, solo sobre lotes con cantidad positiva; vencidos se cuentan por separado. El detalle distingue lotes sin caducidad, vigentes, por caducar y vencidos. Incluye productos archivados identificados como tales para no ocultar registros existentes. No se cambia la prohibición de vender vencidos.

## Endpoints y pantalla

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

## PDF y dependencia

Se agregó PDFKit 0.20.2 como dependencia de ejecución, registrada en package.json y package-lock.json. npm test conserva su script anterior. PDFKit genera los documentos en memoria: no escribe reportes ni datos del negocio en archivos del servidor. El diseño A4 incluye encabezados repetidos, título, período o fecha de estado actual, generación UTC, resumen monetario, notas de interpretación, registros con etiquetas y pie con número de página/total. Los campos largos se dividen en líneas y páginas; no se truncan filas. El formato de importes conserva el símbolo $ ya utilizado por la aplicación, con dos decimales.

Las fuentes estándar Helvetica cubren español y Latin-1; los caracteres fuera de ese conjunto se muestran como ?. No se atribuye soporte completo de alfabetos Unicode a esta versión. El texto íntegro permanece en la consulta JSON y pantalla. Si se requieren otros alfabetos, deberá incorporarse una fuente Unicode con licencia adecuada. No se incluyen fuentes propietarias del sistema operativo ni servicios externos para convertir documentos.

Las pruebas generan PDF reales y validan firma, fin de archivo, xref, texto descomprimido, acentos, filtros, totales, paginación, registros al final de documentos extensos y respuesta HTTP. La inspección visual en visor y la impresión física quedan pendientes; no se presenta la comprobación estructural como una inspección visual ya realizada.

## Configuración y ensayo real preparado

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

## Seguridad de dependencias

Situación inicial: npm audit informó ocho avisos, seis altos y dos moderados, en body-parser, qs y la cadena de nodemon (chokidar, minimatch, picomatch, anymatch, readdirp). Se contrastaron sus versiones con el package-lock del commit financiero: todos esos paquetes/versiones ya existían antes de añadir PDFKit. El informe no señaló PDFKit ni sus nuevas dependencias. La actualización y el resultado actual se detallan en la auditoría siguiente; este párrafo conserva la evidencia inicial.

## Archivos y comprobaciones

Nuevos: backend/report-repository.js, report-service.js, report-pdf.js, report-routes.js, report.test.cjs, report-download.test.cjs, reports-client.test.cjs, verify-reports-real.js, verify-reports.test.cjs; reports-client.js y REPORTS.md. Modificados: backend/app.js, backend/server.js, backend/finance-service.js (cálculo compartido), backend/verify-finance-real.js (comprobación adicional opcional y recepción PDF), auth-client.js, index.html, package.json, package-lock.json y README.md. No se modifican reglas de ventas, app.js, modelo.js, rf.txt ni migraciones anteriores.

Se conservan las 324 pruebas anteriores. Las nuevas pruebas cubren cálculos, fechas inclusivas y semanas que cruzan año, permisos, parámetros SQL, ausencia de multiplicación de abonos, coherencia de caja, inventario/alertas compartidas, generación PDF real, descarga autenticada, DOM sin datos locales y comprobación del ensayo preparado. Los datos de persistencia de las pruebas son simulados; no se atribuye a esta suite una validación real del nuevo bloque contra MySQL.

Resultado del bloque inicial de reportes: 359 pruebas exitosas (324 conservadas y 35 nuevas), 0 fallidas, 0 omitidas y 0 canceladas, código 0. git diff --check terminó sin errores de formato, con avisos de conversión LF/CRLF. Los cambios de reportes permanecen sin commit; no se realizaron escrituras reales ni push.

## Auditoría de seguridad y preparación del ensayo

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

### Rutas de explotación y exposición

- [body-parser, GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828): una solicitud comprimida con bytes sobrantes podía provocar un error no controlado en el descompresor y derribar el proceso. express.json se instala antes de autenticar, por lo que la sesión no protegía ese punto de entrada. Es una ruta relevante si el backend está accesible por HTTP, incluso con límite de 8 KB. Se instaló el parche y una prueba local comprueba que un gzip malformado no impide consultar health posteriormente. No se enviaron solicitudes a servidores ajenos ni a MySQL.
- [qs, GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw): el fallo afecta stringify con arrayFormat comma cuando recibe elementos con toString propio no invocable. No se encontró ese uso en el código del proyecto; estar instalada en producción no demuestra una ruta explotable de esa función. Se actualizó igualmente y se agregó una prueba de serialización defensiva.
- [picomatch, GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): riesgo de ReDoS con patrones extglob manipulados. En este árbol solo llega a la vigilancia de archivos de nodemon, a través de anymatch/readdirp. Requiere introducir patrones no confiables en la configuración o invocación de la herramienta; no se identificó una ruta HTTP del backend hacia esos patrones. No ejecute nodemon con patrones/configuraciones de procedencia no confiable.
- [minimatch, GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): amplificación de patrones bajo optimizationLevel >= 2. nodemon lo usa para coincidencias de archivos; su llamada instalada configura dot/nocase/windowsPathsNoEscape, sin activar ese nivel. No se observó una ruta de explotación remota en la aplicación, pero el paquete permanece afectado según audit. El cambio a minimatch 11 necesita evaluación explícita de compatibilidad.

El servidor de producción se inicia con node backend/server.js, no con nodemon. Los seis avisos restantes son exclusivos de desarrollo en el árbol actual. No se ocultan ni se declaran resueltos por cambiar su clasificación. Para despliegue use npm ci --omit=dev y npm start; npm audit --omit=dev --json comprueba el árbol de producción sin alterar la instalación. No introducir patrones externos en herramientas de vigilancia sigue siendo importante en estaciones de desarrollo.

Alternativas pendientes: esperar versiones compatibles del mantenedor de nodemon/chokidar y un parche de picomatch; evaluar por separado minimatch 11 con pruebas de vigilancia; o retirar nodemon si se confirma que ya no se utiliza y adoptar node --watch. Los scripts versionados actuales no invocan nodemon, pero no se eliminó una herramienta que el desarrollador podría usar manualmente. No se aplicó el descenso sugerido por audit a nodemon 3.1.11: queda fuera de ^3.1.14, no prueba la eliminación de picomatch y no sustituye el análisis del árbol resultante.

### Cambios compatibles y cantidades exactas

Se ejecutó únicamente npm update body-parser qs --ignore-scripts, sin audit fix ni fix --force y sin overrides de versiones mayores. Cambiaron dos paquetes en package-lock.json; no se agregaron dependencias directas nuevas en este bloque. Se mantuvieron Express 5.2.1, PDFKit 0.20.2 y nodemon 3.1.14. Node utilizado: 26.10.0; body-parser 2.4.0 requiere Node >=18.

- Auditoría inicial completa: 8 (6 altas, 2 moderadas), salida 1 por avisos.
- Auditoría posterior completa: 6 (5 altas, 1 moderada; 0 críticas), exclusivamente desarrollo, salida 1 por avisos.
- Auditoría posterior de producción con --omit=dev: 0, salida 0.
- npm test: 364 exitosas (359 anteriores y cinco nuevas), 0 fallidas, omitidas o canceladas, salida 0.

La regresión HTTP verifica también que JSON y PDF no entregan contenido sin sesión, a Vendedor, a cuenta inactiva ni al Superusuario en producción, incluso solicitando habilitarlo en la factoría. Las respuestas denegadas no tienen MIME PDF ni firma PDF y mantienen Cache-Control no-store. Las descargas de Administrador siguen comprobadas por las pruebas anteriores.

### Cobertura reforzada del ensayo, todavía sin ejecutar

Se revisó la cadena verify-reports-real -> verify-finance-real -> cerrarVerificacion. Todas las escrituras temporales, nuevas sesiones y auditoría comparten la misma conexión/transacción externa. Los commits de repositorio solo liberan savepoints. El cierre espera el servidor antes de rollback, continúa ante fallos de cierre y destruye una conexión cuyo rollback no se confirmó. Las capturas completas de las 22 tablas comparan Administrador, sesiones, ventas, cobros, inventario, pedidos y demás filas anteriores; nunca se guardan ni imprimen. Un fallo de las comprobaciones de reportes permanece dentro del try/finally del ensayo financiero y no declara ok. Las pruebas aisladas de cierre existentes cubren fallo después de escritura, rollback fallido y liberación ordenada.

La primera versión del ensayo comprobaba que el cliente dejaba de tener pendientes después de anular, pero no demostraba RF-31 con saldo positivo. Ahora, antes de la anulación, comprueba por JSON y PDF deuda 2, abonos 1 y saldo 1; después confirma ausencia de ese cliente en pendientes. Para RF-34 el producto temporal tiene caducidad a cinco días, y el reporte debe mostrar su lote Por caducar y stock bajo de una unidad. No cambia el ensayo financiero ordinario, que conserva su lote sin caducidad. Se añadieron pruebas aisladas del saldo correcto e incorrecto.

RF-29 comprueba contado vigente y fiado anulado excluido; RF-30 compara ventas y caja; RF-31 compara deuda/abono/saldo antes y después de anular; RF-32 conserva el abono semanal y el estado de la venta; RF-33 concilia con la fuente financiera, incluyendo reembolso sin ingreso anticipado; RF-34 comprueba stock y alerta de caducidad; RF-36 verifica siete PDF y rechazo del Vendedor. La caja financiera subyacente compara los identificadores exactos de los cobros temporales para detectar duplicados, además de los totales.

### Procedimiento exacto para el ensayo autorizado

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
