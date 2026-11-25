[Volver al README](../README.md) · [Manual técnico](MANUAL_TECNICO.md) · [Estado de QA](FINAL_QA.md#estado-documental-actual)

Los comandos de terminal, rutas literales de código, migraciones y archivos privados se interpretan desde la **raíz del repositorio**, no desde `docs/`. Los enlaces de navegación sí son relativos a este documento. Los procedimientos históricos conservan sus condiciones y autorizaciones originales; esta reorganización no autoriza ejecutarlos.

<!-- INICIO FUENTE: BACKUP.md -->

# Respaldos privados de Micro Carmita

## Requisitos oficiales

Se leyó rf.txt directamente; sus dos últimas líneas dicen literalmente:

- RF-37: «El sistema deberá permitir generar copias de seguridad de la base de datos para su almacenamiento en Cloudflare R2.»
- RF-38: «Los respaldos de la información deberán realizarse con una periodicidad quincenal.»

Antes del desarrollo se confirmó desarrollo-jose, 364 pruebas exitosas y git diff --check sin errores. La revisión de los 22 archivos candidatos de reportes no detectó secretos. Se creó únicamente el commit LOCAL 61f3803 del módulo de reportes y correcciones de seguridad ya validados; no se hizo push. Los respaldos quedan como cambios nuevos sin commit. No se ejecutó ningún respaldo, transferencia a R2, restauración, migración ni modificación de cuentas o registros reales en esta entrega.

## Diseño y límites de acceso

Un proceso Node independiente de Express genera y sube la copia. Está desactivado por defecto, no se conecta al iniciar npm start y requiere BACKUP_ENABLED=true más configuración y confirmaciones explícitas. No hay endpoints de ejecución/descarga de SQL ni nuevas pantallas de acceso privilegiado. RF-37/38 no exigen esa consulta web: estado, ejecución y recuperación son comandos operativos del servidor, protegidos por permisos del sistema operativo. No se amplían privilegios de Administrador, Vendedor ni Superusuario.

La copia usa mysqldump 8.0.46 del equipo, una cuenta MySQL separada de root y micro_app, conexión TCP local y los argumentos --single-transaction --quick --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --hex-blob --skip-add-drop-table --skip-add-locks. Se comprueba que existan tablas y que todas sean BASE TABLE/InnoDB. Se rechazan vistas y triggers. El alcance es el esquema actual de tablas del proyecto; no incluye cuentas MySQL, rutinas almacenadas ni eventos SQL, que no forman parte de las migraciones actuales. Se usan --skip-triggers --routines=false --events=false. Si se incorporan esos objetos, este mecanismo debe ampliarse y validarse antes de considerar completa la copia. La cuenta necesita SELECT y visibilidad de triggers (TRIGGER) para que la comprobación no oculte objetos. Un administrador debe preparar esa cuenta aparte, sin reutilizar ni cambiar micro_app; no se crea ni concede nada automáticamente.

TRIGGER permite también administrar triggers: es un compromiso de privilegios para poder detectar y rechazar objetos no soportados. El ejecutor solo emite SELECT y mysqldump. Revise esta concesión con el administrador de MySQL; no entregue una cuenta con privilegios sobre usuarios, tablas del sistema, creación de bases o administración global. Se omiten tablaspaces y GTID purged para no requerir PROCESS/RELOAD por esas opciones. Para MySQL remoto se necesita una implementación TLS específica: esta versión admite únicamente loopback, no un servidor remoto sin cifrado.

El snapshot transaccional mantiene coherencia entre tablas InnoDB durante escrituras ordinarias. No ejecute DDL/migraciones mientras se genera: --single-transaction no protege frente a cambios de estructura. Se exportan todas las tablas del esquema, incluidas usuarios, sesiones e historial; por eso la copia es altamente sensible aunque los registros ordinarios estén hasheados. Las garantías y privilegios se contrastaron con el [manual de mysqldump 8.0](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).

La contraseña MySQL nunca aparece en argumentos, logs o SQL versionado. Se crea un mysql.cnf temporal privado; se ejecuta sin shell y con ventana oculta en Windows. El proceso hijo no hereda variables con PASSWORD/SECRET/TOKEN/KEY. El SQL viaja por stdout hacia gzip y AES-256-GCM: no se guarda SQL plano durante el respaldo. El archivo temporal subido ya está cifrado. Al terminar se eliminan el cifrado local y el archivo de opciones, tanto en éxito como en error. Si la limpieza falla, se conserva el bloqueo y se exige intervención.

## Cifrado e integridad

Formato MCB1: cabecera JSON con versión, identificador de clave e IV aleatorio de 12 bytes, seguida de gzip cifrado con AES-256-GCM y tag de 16 bytes. La cabecera es AAD autenticada. La clave base64 de 32 bytes se configura fuera de Git, nunca en R2 ni en los metadatos del objeto. Las claves viejas deben conservarse de forma independiente mientras existan copias asociadas a sus keyId; perder la clave impide recuperar la información. La rotación cambia clave e identificador para las nuevas copias, sin reescribir las anteriores.

Se calcula SHA-256 del archivo cifrado, se sube mediante PutObject y se descarga mediante GetObject para comparar hash y tamaño reales, no solo metadatos declarados. Solo después de esa verificación y la limpieza local se registra el éxito. Un fallo de verificación no avanza lastSuccess. Puede quedar un objeto remoto no confirmado tras una subida parcialmente observada; no se borra automáticamente para no eliminar una posible copia recuperable.

El SDK oficial @aws-sdk/client-s3 3.1171.0 usa HTTPS en el endpoint S3 de la cuenta, región auto y credenciales explícitas. Se desactiva el cálculo opcional de checksum del SDK para evitar cabeceras no compatibles con R2; la comprobación independiente descarga y verifica el objeto completo. No hay ACL pública, URL pública, URL prefirmada, operación DeleteObject ni gestión de buckets en el código. La API usada corresponde a la [compatibilidad S3 de R2](https://developers.cloudflare.com/r2/api/s3/api/).

## Cloudflare R2: configuración manual pendiente

Prepare, personalmente y fuera del chat, un bucket dedicado a respaldos. Para ensayos use otro bucket privado o un prefijo tests/ separado, nunca datos personales de producción. Cree un token de objetos Object Read & Write limitado exclusivamente al bucket elegido. Se necesita escribir y leer para verificar; no se necesita Admin Read & Write, crear buckets ni modificar sus políticas desde el worker. Esta es la granularidad disponible: Object Read & Write también permite borrar objetos aunque el programa no lo haga. Mantenga los permisos administrativos de configuración en otra identidad y valore un bucket lock para proteger copias frente a borrado por un token robado. Consulte [autenticación y permisos oficiales](https://developers.cloudflare.com/r2/api/tokens/).

Confirme en el panel que r2.dev esté deshabilitado y que no haya dominios personalizados públicos conectados. Son vías independientes de exposición; el token de objetos no permite comprobar o administrar toda esa configuración. R2_PRIVATE_BUCKET_CONFIRMED es una declaración del operador, no una inspección automática de permisos. Los buckets son privados por defecto, pero hay que revisar ambas vías antes de activar, según la [documentación de buckets públicos](https://developers.cloudflare.com/r2/buckets/public-buckets/). El programa también cifra el contenido antes de transmitirlo. R2 añade su cifrado de almacenamiento del proveedor; véase [seguridad de datos](https://developers.cloudflare.com/r2/reference/data-security/).

Propuesta de retención, no un RF nuevo: 90 días para el prefijo de respaldos, aproximadamente seis intervalos quincenales, conservando claves y una copia validada independiente. La regla de lifecycle debe aprobarla y configurarla el propietario del bucket en el panel; el worker no recibe permisos administrativos ni aplica borrados. Sin esa regla, esta versión conserva indefinidamente los objetos remotos. La expiración del proveedor no es instantánea; revise los [ciclos de vida de R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/). No active retención antes de comprobar una restauración y asegurar las claves. Los locks pueden impedir borrar antes de su plazo; coordine ambos períodos.

## Configuración privada

.env.example contiene únicamente nombres y valores de ejemplo sin claves reales. Copie SOLO su sección de respaldos a .env.backup, ignorado por Git, o inyecte esas variables mediante el gestor de secretos del sistema. El worker NO lee el .env de Express. BACKUP_ENV_FILE permite usar otro archivo privado; las variables ya inyectadas tienen prioridad. No comparta ese archivo ni sus valores. No introduzca credenciales en Git, argumentos de consola, tickets o chat.

| Variables | Configuración |
| --- | --- |
| BACKUP_ENABLED | false hasta autorización; true para habilitar comandos y programación. |
| BACKUP_DIR | Ruta absoluta privada fuera del repositorio y del contenido web. Un único directorio persistente para todos los procesos de esta base. |
| BACKUP_PRIVATE_DIR_CONFIRMED | true únicamente después de revisar ACL/permisos. |
| MYSQLDUMP_PATH | Ruta absoluta de mysqldump.exe 8.0.46. |
| BACKUP_DB_HOST/PORT/USER/PASSWORD/NAME | Fuente local; cuenta dedicada. Prohibidos root y micro_app. No se crean cuentas ni bases. |
| BACKUP_ENCRYPTION_KEY / BACKUP_KEY_ID | Base64 de 32 bytes y nombre de versión no secreto. Sin valores predeterminados. |
| BACKUP_TIMEOUT_SECONDS | 600 por defecto; entre 10 y 7200. |
| R2_ACCOUNT_ID | Identificador de cuenta de 32 caracteres hexadecimales; endpoint HTTPS derivado, no URL pública arbitraria. |
| R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY | Credenciales S3 del token de objetos limitado al bucket. |
| R2_BUCKET / R2_BACKUP_PREFIX | Bucket privado y prefijo sin traversal, por ejemplo micro-carmita o tests/micro-carmita. |
| R2_PRIVATE_BUCKET_CONFIRMED | true después de revisar r2.dev y dominios públicos. |

Para crear una clave en su terminal local sin imprimirla:

```powershell
$env:BACKUP_ENCRYPTION_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:BACKUP_KEY_ID = 'key-2026-11'
```

Conserve esa clave en un gestor de secretos/copia offline antes de usarla. No la regenere para descifrar una copia vieja. Una variable de proceso no sobrevive al cierre de la terminal ni se comparte automáticamente con una tarea programada. Para operación desatendida use un gestor que inyecte las variables o un .env.backup protegido, con una copia de recuperación independiente y segura. Esta entrega no genera ni almacena claves reales.

En Windows, chmod/mode 0600 no establece por sí solo una DACL privada. Cree un directorio NUEVO fuera del proyecto y restrinja su ACL a la identidad operativa y SYSTEM. El ejemplo siguiente no modifica carpetas existentes:

```powershell
$rutaPrivada = Join-Path $env:LOCALAPPDATA 'MicroCarmitaRespaldos'
if (Test-Path -LiteralPath $rutaPrivada) { throw 'Revise la ACL existente manualmente; este ejemplo solo crea un directorio nuevo.' }
$null = New-Item -ItemType Directory -Path $rutaPrivada
$identidadRespaldo = [Security.Principal.WindowsIdentity]::GetCurrent().User
$aclRespaldo = [Security.AccessControl.DirectorySecurity]::new()
$aclRespaldo.SetOwner($identidadRespaldo)
$aclRespaldo.SetAccessRuleProtection($true, $false)
$herenciaRespaldo = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$reglaRespaldo = [Security.AccessControl.FileSystemAccessRule]::new($identidadRespaldo, 'FullControl', $herenciaRespaldo, 'None', 'Allow')
$reglaSistema = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', $herenciaRespaldo, 'None', 'Allow')
$aclRespaldo.AddAccessRule($reglaRespaldo)
$aclRespaldo.AddAccessRule($reglaSistema)
Set-Acl -LiteralPath $rutaPrivada -AclObject $aclRespaldo
```

Si el worker corre bajo otra identidad, el administrador debe preparar y comprobar ACL para ESA cuenta, también en .env.backup; no copie claves a un directorio compartido. Los logs y archivos SQL descifrados requieren el mismo cuidado. .gitignore excluye .env.*, mysql.cnf, *.mcbackup y nombres de archivos de recuperación, pero no sustituye a las ACL.

## Ejecución y periodicidad

Comandos desde la raíz, después de configurar y autorizar:

```powershell
npm run backup:status
npm run backup:run
npm run backup:run -- --now
npm run backup:worker
```

status solo lee estado local y no consulta MySQL/R2. run respeta vencimiento; --now fuerza una ejecución manual adicional, sin ignorar el bloqueo. worker comprueba al arrancar y cada minuto. RF-38 se concreta como 15 x 24 horas desde la finalización del último respaldo subido/verificado, no los días 1 y 15 del mes. Sin éxitos previos se ejecuta una primera copia al habilitarlo. Un reinicio o ejecución perdida se recupera en la siguiente comprobación mediante UNA copia actual, sin inventar snapshots de días anteriores. Los fallos programan reintento en una hora. Las fechas del estado se guardan en UTC y el intervalo no depende de la zona horaria del host.

state.json es persistente y se reemplaza mediante archivo temporal/sync/rename. Guarda último éxito, reintento, último resultado y hasta cien resultados recientes, sin contraseñas, claves ni SQL. backup.lock se crea de forma exclusiva con token, host y PID del worker; se registra además el PID de mysqldump. Dos procesos con el mismo BACKUP_DIR no pueden ejecutar juntos. Es un diseño para un único servidor de un emprendimiento pequeño: no es coordinación distribuida entre carpetas/servidores diferentes. Todos los operadores deben usar el mismo directorio por base.

Para cubrir reinicios sin sesión interactiva, el administrador debe registrar manualmente una tarea del Programador de tareas de Windows: desencadenador Al iniciar el sistema, ejecutar tanto si el usuario inició sesión como si no, identidad operativa dedicada, programa node.exe con argumentos `"ruta-absoluta/backend/backup-cli.js" worker`, y directorio inicial de proyecto. Configure reinicio tras fallo y no iniciar una instancia nueva si ya existe otra. Introduzca la contraseña de la cuenta únicamente en el diálogo seguro del Programador; no en código ni en argumentos. BACKUP_ENV_FILE/.env.backup y BACKUP_DIR deben estar disponibles para esa identidad. No se registró ni inició una tarea del equipo en esta entrega. Alternativamente una tarea periódica puede invocar run cada hora y al arrancar; la fecha persistente determina si corresponde copiar.

Un archivo de estado corrupto detiene el trabajo para no sobrescribir evidencia. Una caída durante el respaldo conserva el lock; no hay expiración insegura por tiempo. Antes de liberar, detenga/verifique TODOS los procesos de respaldo y sus hijos. El comando exige confirmación, comprueba que los PID registrados no estén activos en ese host, limpia work-* propios y deja reintento inmediato:

```powershell
npm run backup:unlock -- --confirm-stopped
```

Si el PID fue reutilizado o cambió el host, se requiere revisión manual y no se fuerza desde la aplicación. No mate procesos ajenos ni borre el lock para eludir una ejecución activa. Una caída justo al crear el proceso hijo puede anteceder a registrar su PID: la revisión de mysqldump por el operador sigue siendo necesaria. Si la limpieza o escritura de estado falla, se conserva el bloqueo hasta corregir el problema. Un objeto subido puede existir aunque el registro final fallara: inspecciónelo y verifíquelo antes de descartar una posible copia válida.

## Ensayo aislado preparado, sin ejecutar

Se preparó backend/backup-test-fixture.sql con dos filas ficticias, sin usuarios ni información del negocio. El ensayo requiere autorización separada para generar y subir incluso esa copia de prueba. Use otro MySQL local 8.0.46 en TCP 3307 (servidor/contenedor aislado), sin montar el volumen de micro_carmita, y un bucket/prefijo de pruebas privado.

En el servidor aislado, un administrador prepara bases vacías micro_carmita_backup_test_qa y micro_carmita_restore_test_qa y cuentas de lectura/importación limitadas a esas bases. No reutilice root como cuenta de exportación ni cuentas del servidor real. Para importar use una cuenta que no tenga permisos sobre la base real, y mantenga su contraseña fuera del código. Compruebe destino y bases vacías antes de cargar el fixture; los siguientes comandos se ejecutan PERSONALMENTE en PowerShell 7 y solo sobre 3307:

```powershell
$mysqlPrueba = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
& $mysqlPrueba --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --password --execute="SELECT VERSION(), @@port; SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN ('micro_carmita_backup_test_qa','micro_carmita_restore_test_qa');"
if ($LASTEXITCODE -ne 0) { throw 'Servidor aislado no disponible.' }
$vaciaOrigen = @(& $mysqlPrueba --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --password --database=micro_carmita_backup_test_qa --batch --skip-column-names --execute="SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();")
if ($LASTEXITCODE -ne 0 -or ($vaciaOrigen -join '').Trim() -ne '0') { throw 'No cargar fixture: la base de origen no está vacía.' }
$fixtureRespaldo = Get-Content -Raw -Encoding UTF8 -ErrorAction Stop backend/backup-test-fixture.sql
$fixtureRespaldo | & $mysqlPrueba --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --password --database=micro_carmita_backup_test_qa --default-character-set=utf8mb4 --batch --skip-reconnect
if ($LASTEXITCODE -ne 0) { throw 'Fixture no aplicado; inspeccione únicamente el servidor aislado.' }
```

Las bases y las cuentas se preparan por el administrador fuera de estos comandos; no se dan contraseñas conocidas ni se cambian cuentas actuales. mysql.exe las solicita interactivamente. Configure un archivo .env.backup.test privado con el lector de ensayo, puerto 3307, BACKUP_DIR cuyo nombre empiece por micro-carmita-backup-test-, y R2_BACKUP_PREFIX=tests/micro-carmita. Todas las demás confirmaciones y claves se configuran como antes. Activar BACKUP_ENABLED=true y ejecutar este bloque significa autorizar la subida de los datos FICTICIOS:

```powershell
$env:BACKUP_ENV_FILE = Join-Path (Get-Location).Path '.env.backup.test'
try {
    node backend/backup-cli.js run --now --test
    if ($LASTEXITCODE -ne 0) { throw 'Ensayo de respaldo fallido; revise solo el estado controlado.' }
} finally {
    Remove-Item Env:BACKUP_ENV_FILE -ErrorAction SilentlyContinue
}
```

--test rechaza micro_carmita, bases sin el prefijo de ensayo, el puerto habitual 3306 (o DB_PORT indicado), un prefijo R2 ajeno a tests/ y directorios de trabajo que no sean de ensayo. mysqldump usa --protocol=TCP para que localhost no ignore el puerto mediante un socket local. No se crea ninguna base ni fila desde el comando de respaldo.

Tras status:success, descargue el objeto exacto mediante la sesión autenticada del panel de R2, guardándolo directamente en un directorio privado. No active r2.dev ni comparta enlaces públicos. Se puede usar una identidad de recuperación con permiso Object Read only sobre el bucket, separada del worker. La aplicación no expone un endpoint web para descargar SQL ni genera URL prefirmada.

## Descifrado y restauración manual

No hay restauración automática. backup:decrypt solo produce un archivo SQL NUEVO y privado, y no conecta con MySQL. Verifica completamente el tag GCM antes de descomprimir/publicar la salida. Para ello usa un gzip descifrado temporal con permisos privados, que elimina al terminar; una copia alterada o clave errónea no entrega SQL. Se rechaza una salida dentro del proyecto o un archivo existente. El directorio elegido debe tener ACL restringida y estar fuera de cualquier publicación web.

Con el archivo cifrado de ensayo descargado y la clave correcta ya cargada de forma segura en el entorno/gestor:

```powershell
$env:BACKUP_ENV_FILE = Join-Path (Get-Location).Path '.env.backup.test'
$cifradoPrueba = Join-Path $env:LOCALAPPDATA 'micro-carmita-backup-test-recuperacion\ensayo.mcbackup'
$sqlRecuperado = Join-Path $env:LOCALAPPDATA 'micro-carmita-backup-test-recuperacion\restore-test.sql'
try {
    node backend/backup-cli.js decrypt --confirm-private-output "$cifradoPrueba" "$sqlRecuperado"
    if ($LASTEXITCODE -ne 0) { throw 'No importar: falló autenticación/descifrado.' }
} finally {
    Remove-Item Env:BACKUP_ENV_FILE -ErrorAction SilentlyContinue
}
```

El directorio anterior debe prepararse privadamente antes del comando. SQL y clave descifrada son sensibles: no use Get-Content para mostrarlos ni los añada a Git. No importe sobre micro_carmita ni sobre una base con registros. El ejemplo de recuperación de las DOS FILAS FICTICIAS exige destino vacío en el servidor aislado, y solicita contraseña de una cuenta limitada a ese destino:

```powershell
$puertoRecuperacion = 3307
$baseRecuperacion = 'micro_carmita_restore_test_qa'
$usuarioRecuperacion = Read-Host 'Cuenta limitada a la base de recuperación aislada'
if ($puertoRecuperacion -eq 3306 -or $baseRecuperacion -notmatch '^micro_carmita_restore_test_[a-z0-9_]+$') { throw 'Destino no aislado.' }
$vaciaDestino = @(& $mysqlPrueba --protocol=TCP --host=127.0.0.1 --port=$puertoRecuperacion --user=$usuarioRecuperacion --password --database=$baseRecuperacion --batch --skip-column-names --execute="SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();")
if ($LASTEXITCODE -ne 0 -or ($vaciaDestino -join '').Trim() -ne '0') { throw 'No importar sobre una base existente.' }
$sqlEnsayo = Get-Content -Raw -Encoding UTF8 -ErrorAction Stop $sqlRecuperado
$sqlEnsayo | & $mysqlPrueba --protocol=TCP --host=127.0.0.1 --port=$puertoRecuperacion --user=$usuarioRecuperacion --password --database=$baseRecuperacion --default-character-set=utf8mb4 --batch --skip-reconnect
if ($LASTEXITCODE -ne 0) { throw 'Importación aislada parcial; no reejecutar sin inspección.' }
& $mysqlPrueba --protocol=TCP --host=127.0.0.1 --port=$puertoRecuperacion --user=$usuarioRecuperacion --password --database=$baseRecuperacion --execute="SELECT COUNT(*) AS filas, SUM(importe) AS total FROM backup_probe; CHECK TABLE backup_probe;"
if ($LASTEXITCODE -ne 0) { throw 'Verificación de recuperación fallida.' }
Remove-Variable sqlEnsayo -ErrorAction SilentlyContinue
```

Se esperan dos filas y total 4.00, junto con CHECK TABLE correcto. Compare también etiquetas y estructura en la herramienta local; nunca imprima datos reales de otras copias. Tras aprobar, elimine manualmente los archivos SQL/gzip de recuperación del directorio privado y retire credenciales de proceso cuando termine, sin borrar copias remotas válidas:

```powershell
Remove-Item Env:BACKUP_ENCRYPTION_KEY, Env:BACKUP_DB_PASSWORD, Env:R2_ACCESS_KEY_ID, Env:R2_SECRET_ACCESS_KEY, Env:BACKUP_ENV_FILE -ErrorAction SilentlyContinue
```

Esto limpia variables de la terminal, no el gestor privado ni .env.backup. En un desastre real restaure primero sobre un servidor/base NUEVOS y aislados, compruebe esquema, conteos, importes y relaciones, y pruebe la aplicación antes de un cambio de servicio autorizado. Revise/revoque las sesiones restauradas antes de exponer el entorno recuperado. No reutilice una copia real como entorno público de pruebas. Un restore lógico puede aplicar SQL y requiere una cuenta capaz de crear/importar objetos SOLO en el destino aislado; no confunda ese permiso con el lector de respaldo.

## Limitaciones y validación pendiente

El límite actual del SQL sin comprimir es 512 MiB; no hay carga multipart ni restauración de archivos mayores. Se aplican límites de tiempo, pero una caída eléctrica o terminación forzada puede impedir finally: las ACL y el bloqueo conservado protegen los temporales hasta la recuperación manual. La eliminación de archivos no garantiza borrado forense de un SSD. La consistencia presupone InnoDB y ausencia de DDL durante mysqldump; no cubre vistas, triggers, rutinas, eventos ni cuentas del servidor. No es copia física ni recuperación a un instante entre respaldos. RPO nominal: quince días desde un éxito, mayor si no se atienden fallos. RTO no medido.

El estado local y la clave deben sobrevivir a reinicios y respaldarse por separado. Si se pierde state.json, no se puede deducir automáticamente el último éxito remoto con este token/flujo: el operador debe verificar R2 antes de reconstruirlo. No se confía en un lock viejo como prueba de proceso activo, pero tampoco se vence automáticamente para evitar concurrencia insegura. La privacidad del bucket y las ACL son verificaciones operativas, no inferencias a partir de una casilla de configuración.

Queda pendiente autorizar/preparar la cuenta MySQL de respaldo sin tocar micro_app, configurar secretos reales y bucket privado, confirmar políticas/retención, instalar el inicio programado, ejecutar el ensayo ficticio en 3307, validar R2 S3 real y recuperación MySQL efectiva, medir recursos y repetir una prueba después de reiniciar el host. No se ha generado ni subido información real en esta entrega.

## Archivos y pruebas

Nuevos: backend/backup-config.js, backup-store.js, backup-crypto.js, backup-runtime.js, backup-service.js, backup-cli.js, backup.test.cjs, backup-test-fixture.sql y [BACKUP.md](BACKUP.md). Modificados: .env.example, .gitignore, package.json, package-lock.json y [README.md](../README.md). No cambia Express, app.js, modelo.js, rf.txt, migraciones, tablas o cuentas existentes.

Las pruebas usan SQL ficticio, directorios temporales propios, almacenamiento S3 simulado y procesos simulados; no ejecutan mysqldump ni se conectan a MySQL/R2. Cubren quince días exactos, reinicios/ejecuciones perdidas, exclusión de instancias, reintentos, errores, estados corruptos, limpieza y desbloqueo conservador, cifrado/compresión/descifrado, IV aleatorio y autenticidad, no sobrescritura, opciones sin secretos, preflight y verificación remota simulada. El roundtrip local no equivale todavía a una recuperación probada contra MySQL real.

Resultado de esta entrega: npm test confirma 389 pruebas exitosas (364 conservadas y 25 nuevas), 0 fallidas, 0 omitidas y 0 canceladas, salida 0. npm audit --omit=dev --json informa 0 vulnerabilidades de producción, salida 0. git diff --check termina sin errores; se mantienen avisos LF/CRLF. La sintaxis JavaScript y los nueve bloques PowerShell se verificaron sin ejecutar los comandos operativos. La revisión de los archivos candidatos no detectó secretos locales ni patrones de claves privadas. Los seis avisos de desarrollo previamente documentados no se corrigen con este bloque; no se aplicó audit fix --force. El fixture ficticio está expresamente exceptuado de la regla Git que excluye archivos SQL de respaldo.

<!-- FIN FUENTE: BACKUP.md -->
