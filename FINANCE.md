# Finanzas: RF-25 a RF-28

Se leyó rf.txt directamente. El texto oficial, en las líneas 25 a 28, es:

| RF | Texto exacto | Implementación |
| --- | --- | --- |
| RF-25 | El sistema deberá permitir registrar ingresos relacionados con las operaciones del emprendimiento. | Ingreso manual por API y consulta de cobros automáticos de venta_caja. |
| RF-26 | El sistema deberá permitir registrar egresos y clasificarlos según su origen. | Egreso manual con categoría/origen obligatorio; reembolsos y correcciones negativas consultados desde venta_caja. |
| RF-27 | El sistema deberá permitir registrar gastos administrativos relacionados con el funcionamiento del negocio. | Egreso con indicador gastoAdministrativo, categoría libre (por ejemplo luz, agua o internet), motivo, importe, fecha y responsable. |
| RF-28 | El sistema deberá permitir consultar ingresos y egresos por fecha o rango de fechas. | GET /api/finance con fecha, desde/hasta o sin filtro; límites inclusivos y totales del mismo conjunto consultado. |

Antes del desarrollo se confirmó desarrollo-jose, se ejecutaron 282 pruebas exitosas y git diff --check sin errores; la revisión de los 16 archivos pendientes no detectó secretos locales ni patrones de claves privadas. Se registró únicamente el módulo anterior en el commit local fed2b61. No se hizo push. Los cambios financieros quedan sin commit.

## Permisos y decisiones de alcance

RF-25 a RF-28 no asignan explícitamente permisos a un rol. RF-02 exige diferenciarlos. Se conserva la política operativa existente: Administrador registra y consulta el libro financiero; Vendedor registra ventas y abonos en sus API autorizadas, pero no registra movimientos manuales ni consulta el libro financiero general. Se valida en Express y se revalida el actor con bloqueo dentro de las escrituras. Superusuario no tiene acceso al módulo; continúa bloqueado en autenticación de producción. Esta política se documenta como decisión técnica basada en los permisos previos, no como una frase literal añadida a rf.txt.

Los RF no definen categorías cerradas, presupuestos, prohibición de caja negativa, fechas futuras, edición o eliminación de movimientos. Se aceptan categorías libres de hasta 80 caracteres, motivo hasta 255, fechas válidas MySQL desde 1000-01-01, e importes positivos con dos decimales hasta 99999999.99. El indicador administrativo solo es válido para egresos. Un importe negativo nunca se utiliza para registrar manualmente una operación: se elige ingreso o egreso. No se impide que el neto sea negativo ni se limita arbitrariamente un rango de fechas. No se implementan operaciones de edición o borrado: los registros manuales son inmutables. Una corrección se registra como una nueva operación compensatoria con motivo, conservando el original; el flujo especializado de anulación de ventas sigue siendo el de SALES.md.

## Una sola fuente por operación

movimientos_financieros almacena exclusivamente operaciones manuales. venta_caja sigue siendo la única fuente para contado, abonos, correcciones y reembolsos de ventas. El repositorio consulta ambas mediante UNION ALL; no copia caja a otra tabla ni crea un segundo ingreso durante la consulta. Los identificadores de consulta son manual:id y venta:id. La relación ventaId se devuelve únicamente para filas de caja; el cliente no puede proporcionarla para un registro manual. Tampoco puede falsificar origen ni responsable.

En venta_caja, importe positivo se presenta como ingreso y negativo como egreso con valor absoluto. Un fiado sin abono no aporta efectivo. Se muestran tanto el ingreso histórico como su reembolso, aunque la venta esté anulada; no se filtran por el estado actual de la venta. Ingresos y egresos son importes brutos, y neto = ingresos - egresos. La corrección de una venta genera solo la diferencia que ya registra el módulo de ventas. Los totales se suman en centavos enteros, rechazando agregados que excedan el rango exacto de JavaScript.

Una operación manual podría repetir conceptualmente un cobro si el operador introduce el mismo hecho con una clave nueva: no se intenta inferir duplicados por igualdad de fecha/importe, porque existen operaciones legítimas iguales. La pantalla indica que ventas, abonos y devoluciones son automáticos. Los reintentos técnicos sí están protegidos mediante clave única por usuario, huella de contenido normalizado y bloqueo del actor, en la misma transacción que el registro. Misma clave y contenido devuelve el id existente; otro contenido devuelve 409. Las claves financieras son independientes de las de ventas.

La fecha manual es una fecha de negocio explícita; creado_en conserva UTC del servidor. Las fechas de caja se calculan desde su timestamp UTC a America/Guayaquil, UTC-05 sin horario de verano, mediante DATE_SUB. Esto evita depender de las tablas horarias instaladas en MySQL. El filtro puede usar fecha sola, desde/hasta, o un solo límite; mezclar fecha con rango se rechaza. La consulta y sus totales usan las mismas filas en una transacción. No se implementan reportes PDF, cierres, reportes completos ni respaldos R2.

La categoría y descripción provenientes de venta_caja se convierten explícitamente a utf8mb4_0900_ai_ci en el UNION para evitar conflictos si las tablas existentes heredaron otra collation de la base. No se cambia la codificación de las tablas previas.

## API y frontend

- POST /api/finance: clave, tipo (ingreso/egreso), categoria, motivo, importe, fecha, gastoAdministrativo opcional. HTTP 201 al crear y 200 al repetir. Solo Administrador.
- GET /api/finance: movimientos, filtros, ingresos, egresos y neto. Solo Administrador.
- Ejemplos: /api/finance?fecha=2026-11-17 y /api/finance?desde=2026-11-01&hasta=2026-11-17.

Se reutilizan sesión HttpOnly, protección CSRF y validación de origen. El router se instala antes del router general de inventario. No se crean usuarios ni credenciales predeterminadas.

finance-client.js conecta la pantalla Movimientos existente con la API, agrega categoría/origen, fecha, indicador administrativo y filtros. Sustituye la lectura/escritura de movimientos locales por una caché remota en memoria; los registros antiguos del navegador se conservan sin mezclarlos ni migrarlos automáticamente. Se descartan consultas tardías después de cambiar sesión o filtro. El formulario conserva la clave al perder una respuesta y bloquea envíos simultáneos; un rechazo 4xx permite corregir. No recargue la página mientras haya una operación con respuesta desconocida: reintente los mismos datos y la clave en memoria. La idempotencia confirmada permanece en MySQL. La tarjeta de inicio sigue indicando cobros netos de ventas; los totales financieros completos y del período se presentan en Movimientos.

## Migración 005 pendiente

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

## Ensayo real preparado, sin ejecutar

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

## Archivos y pruebas

Nuevos: backend/migrations/005_finanzas.sql; backend/finance-repository.js, finance-service.js, finance-routes.js, finance.test.cjs, finance-client.test.cjs; backend/verify-finance-real.js, verify-finance.test.cjs; finance-client.js y FINANCE.md. Modificados: backend/app.js, backend/server.js, index.html y README.md. No se modifican app.js, modelo.js, package.json, rf.txt ni las migraciones previas.

Las pruebas cubren RF-25 a RF-28, roles, validaciones de dinero y fechas, categorías, gastos administrativos, idempotencia, concurrencia simulada, rollback, unión de fuentes sin copias, parámetros SQL, HTTP real de Express con persistencia aislada, DOM simulado sin almacenamiento local y cierre seguro del ensayo. Resultado: 323 exitosas (282 anteriores y 41 nuevas), 0 fallidas, 0 omitidas y 0 canceladas, código de salida 0. git diff --check termina sin errores de formato, con avisos LF/CRLF. La revisión de los 14 archivos pendientes no detecta secretos locales ni patrones de claves privadas; la sintaxis JavaScript y los dos bloques PowerShell se comprobaron sin ejecutar migraciones ni el ensayo real. No se realizaron nuevos commits después de fed2b61 ni push.

## Auditoría previa a aplicar 005

Las consultas de solo lectura realizadas sobre MySQL confirman versión 8.0.46, base micro_carmita, 21 tablas InnoDB y únicamente las migraciones 001_auth, 002_catalogo_inventario, 003_pedidos_recepciones y 004_ventas_cobros. Existe un Administrador activo; no se imprimieron datos de su cuenta. usuarios.id es INT UNSIGNED y PK; coincide con la FK nueva. No existe movimientos_financieros ni hay nombres de CHECK en conflicto con chk_finanzas_*. micro_app conserva SELECT/INSERT/UPDATE/DELETE sobre micro_carmita y carece de privilegios DDL. Git sigue en desarrollo-jose, con los 14 archivos financieros pendientes (cuatro modificados y diez nuevos); no se prepararon archivos ni se crearon commits en esta auditoría.

Se revisaron la PK id, la UNIQUE usuario_id/clave, la FK a usuarios y el índice fecha/id. Los cinco CHECK validan tipo, importe, categoría, motivo e indicador administrativo. No se detectaron tipos incompatibles, borrados en cascada ni operaciones destructivas. El único CREATE es la tabla nueva y el único INSERT registra su versión. No hay ALTER, DROP, TRUNCATE, DELETE, UPDATE ni REPLACE; venta_caja, ventas, abonos, inventario y pedidos no se modifican al aplicar este archivo. La compatibilidad fue revisada estáticamente contra el esquema actual; la ejecución SQL y las restricciones efectivas siguen pendientes de autorización.

La lectura unificada usa una fila por PK de cada fuente, con prefijos de id distintos y JOIN a usuarios por su PK. UNION ALL conserva operaciones legítimas de igual importe sin multiplicarlas. No materializa ingresos ni registra copias durante las consultas. Se reforzó el ensayo para comparar los cinco identificadores esperados contra la caja real de las ventas temporales, además de las diferencias de ingresos/egresos/neto.

La auditoría confirma una transacción externa y una conexión compartida para todas las escrituras del ensayo, incluidos sesiones, usuario temporal y auditoría. Las transacciones internas solo liberan savepoints. El cierre espera el servidor antes de intentar rollback, sigue intentando limpieza si falla un recurso y destruye la conexión cuando no puede confirmar rollback. Se añadió una prueba aislada de fallo posterior a una escritura temporal, comprobando cierre, rollback y liberación en ese orden. La comparación final de las 22 tablas conserva todas las filas previas; en rutas de error, el cierre obligatorio revierte las escrituras y no declara ok. Los datos sensibles de las capturas quedan solo en memoria.

Los permisos se contrastaron con RF-25 a RF-28: el archivo oficial no reserva estas operaciones a un rol concreto. La restricción administrativa y la clasificación libre son decisiones técnicas explícitas, conservando la política anterior y sin alterar el texto de los RF. La autorización de ventas/abonos del Vendedor permanece separada de la consulta financiera general.

Resultado de esta auditoría: npm test conserva las 323 pruebas anteriores y añade una, con 324 exitosas, 0 fallidas, 0 omitidas y 0 canceladas, salida 0. git diff --check no detecta errores de formato; solo se mantienen los avisos LF/CRLF. Los dos bloques PowerShell se validaron sintácticamente sin ejecutarlos. En esta revisión se ajustaron FINANCE.md, backend/verify-finance-real.js y backend/verify-finance.test.cjs; la migración y las reglas del módulo no necesitaron cambios. No se ejecutaron migraciones ni escrituras del ensayo real.
