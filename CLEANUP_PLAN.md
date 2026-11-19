# Plan de limpieza operativa — Micro Carmita

Fecha de inspección: 19 de noviembre de 2026. Rama: desarrollo-jose.

**Estado actual: limpieza ejecutada y confirmada en una intervención posterior autorizada. NO volver a ejecutarla.** Se eliminaron 101 filas operativas en una sola transacción, sin respaldo por autorización expresa del usuario. Las cinco tablas protegidas conservaron exactamente su contenido antes y después del COMMIT. La inspección administrativa previa con root fue confirmada por el usuario; la ejecución utilizó la cuenta DML existente, sin atribuirle permisos administrativos.

La verificación actual de solo lectura confirma las 17 tablas operativas vacías y los conteos protegidos: usuarios 2, roles 2, auditoria_usuarios 3 y schema_migrations 5. Sesiones tiene 16 registros frente a los 15 de la instantánea al terminar la limpieza. Su conteo es dinámico, pertenece a autenticación y no forma parte de la limpieza operativa. No se modificó ni eliminó ninguna sesión.

El usuario autorizó continuar el cierre tras revisar metadatos no sensibles, sin exigir el conteo histórico de 15. La revisión no encontró las anomalías temporales o de referencias comprobadas, pero **no demuestra la causa ni la autoría de la sesión adicional**. El cierre deja de estar bloqueado por esa diferencia numérica; no se interpreta como prueba concluyente de acceso legítimo ni como evidencia de intrusión.

El resto del documento conserva el historial de preparación y sus limitaciones en cada etapa; las exigencias originales de respaldo quedaron expresamente dispensadas para esta única limpieza. Los comandos de respaldo/restauración siguen siendo referencias no ejecutadas. El antiguo preview SQL se conserva totalmente comentado, sin sentencias ejecutables. La base de datos, sus credenciales y sus filas no forman parte del commit Git.

## Evidencia y alcance

Base local comprobada: **micro_carmita**, MySQL **8.0.46**, 22 tablas base, todas InnoDB. Se inspeccionaron 001_auth.sql, 002_catalogo_inventario.sql, 003_pedidos_recepciones.sql, 004_ventas_cobros.sql, 005_finanzas.sql y development/001_dev_role.sql. Solo las cinco primeras están registradas. La migración de desarrollo NO está aplicada y no se debe aplicar.

Se consultaron las restricciones reales: 22 PRIMARY KEY, 33 FOREIGN KEY (35 columnas por dos relaciones compuestas), 12 UNIQUE y 40 CHECK habilitados. Todas las FK observadas usan NO ACTION para DELETE y UPDATE. No se observaron vistas ni referencias externas visibles.

**Limitación detectada en la preparación:** la cuenta de aplicación tiene únicamente USAGE y SELECT/INSERT/UPDATE/DELETE sobre esta base. Las listas visibles de triggers, rutinas y eventos estaban vacías, pero esos permisos no permiten certificar su ausencia. El programador de eventos estaba ON. Antes de la intervención, el usuario confirmó una inspección administrativa con root: cero triggers, rutinas y eventos en micro_carmita y cero FK externas. No se cambió el programador ni ningún privilegio. Esta confirmación no convierte la conexión DML en una conexión administrativa.

Los conteos identifican datos operativos, pero no demuestran que sean de prueba. Para limpiar las 17 tablas completas, el responsable debe confirmar expresamente que **todas sus filas son de demostración**. Si existe información real, este plan global no es aplicable: se necesita una selección verificable de registros y sus dependencias; no se usarán nombres “QA” como criterio automático.

## Tablas operativas y orden propuesto

Conteos observados; deben repetirse con la aplicación detenida. El orden respeta las FK reales: primero hijos y después padres.

| Orden | Tabla | Filas observadas |
|---:|---|---:|
| 1 | venta_lotes | 10 |
| 2 | venta_abonos | 3 |
| 3 | venta_caja | 6 |
| 4 | venta_historial | 10 |
| 5 | venta_operaciones | 10 |
| 6 | venta_detalles | 6 |
| 7 | ventas | 6 |
| 8 | recepcion_detalles | 5 |
| 9 | recepciones | 5 |
| 10 | pedido_detalles | 4 |
| 11 | pedidos | 4 |
| 12 | movimientos_inventario | 15 |
| 13 | movimientos_financieros | 1 |
| 14 | lotes | 8 |
| 15 | productos | 3 |
| 16 | clientes | 4 |
| 17 | proveedores | 1 |

venta_lotes depende de venta_detalles y lotes. Los abonos, caja e historial dependen de ventas; los detalles de ventas también dependen de productos. ventas depende de clientes. recepcion_detalles depende de recepciones, pedido_detalles y lotes; sus dos relaciones con pedidos son compuestas. recepciones y pedido_detalles dependen de pedidos; pedidos depende de proveedores. lotes depende de productos y proveedores; productos depende de proveedores. movimientos_inventario depende de productos. Las referencias de operaciones a usuarios se conservan al no eliminar usuarios.

Se incluyen auditorías operativas e idempotencia (venta_historial, venta_operaciones y movimientos_inventario) para que no sobrevivan respuestas o referencias a operaciones borradas. No deben confundirse con auditoria_usuarios.

## Tablas que se conservan completas

| Tabla | Filas observadas | Motivo |
|---|---:|---|
| usuarios | 2 | Cuentas, credenciales protegidas, estados y roles asignados |
| roles | 2 | Definiciones de roles |
| sesiones | 15 | Sesiones existentes, sin revocarlas ni modificarlas |
| auditoria_usuarios | 3 | Trazabilidad de la gestión de cuentas |
| schema_migrations | 5 | Versiones 001 a 005 |

No se descubrieron otras tablas de configuración. La configuración local y de respaldos es externa a estas tablas y no se toca. Tampoco se modifican las cuentas, contraseñas o GRANT de MySQL. El respaldo de esta base no incluye las cuentas del sistema MySQL; estas permanecen en la instancia original.

## Revisión administrativa pendiente (solo lectura)

Archivo preparado: backend/maintenance/inspeccion_limpieza.sql. Contiene SELECT y SHOW, incluyendo SHOW CREATE TABLE de las 22 tablas, índices, CHECK, FK, motores, conteos y metadatos de objetos programables. No consulta registros de credenciales ni imprime hashes de contraseñas.

En una terminal local controlada por el administrador, desde la raíz del proyecto:

```powershell
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$configLocal = (& node -e "require('dotenv').config({quiet:true}); process.stdout.write(JSON.stringify({host:process.env.DB_HOST,port:process.env.DB_PORT||'3306',database:process.env.DB_NAME}));") | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $configLocal.database -cne 'micro_carmita' -or -not $configLocal.host) { throw 'Revisar configuración local sin mostrar secretos.' }

& $mysql --no-defaults "--host=$($configLocal.host)" "--port=$($configLocal.port)" --user=root --password --database=micro_carmita --execute="SOURCE backend/maintenance/inspeccion_limpieza.sql"
if ($LASTEXITCODE -ne 0) { throw 'Falló la inspección. Detener el procedimiento.' }
```

--password sin valor solicita la contraseña en la terminal. No usar MYSQL_PWD, contraseñas en argumentos, chat, archivos o transcripciones. No publicar la salida administrativa: SHOW GRANTS y definiciones pueden revelar configuración privada. No usar --force. Ante cualquier error SQL, detenerse aunque el proceso termine con código cero: SOURCE no sustituye la revisión de errores.

Si aparecen triggers, rutinas, eventos, vistas o dependencias externas, detenerse y revisar sus definiciones privadamente; considerar SQL dinámico y escrituras entre esquemas. No basta buscar el nombre de esta base en el texto. No deshabilitar eventos automáticamente: cualquier cambio global requiere revisión aparte. No continuar si un trabajo puede escribir durante la intervención.

## Respaldo local — comandos preparados, NO ejecutados

Condiciones previas: ventana de mantenimiento, Express detenido, pestañas cerradas, tareas y otros escritores/DDL detenidos. Mantenerlos así hasta terminar o recuperar. Esto también evita cambios de sesiones y auditoría. Certificar previamente dependencias administrativas. Usar disco local cifrado y acceso restringido, fuera del repositorio y de carpetas sincronizadas.

Los binarios locales mysql.exe y mysqldump.exe 8.0.46 fueron encontrados en la ruta siguiente. Ejecutar después de la revisión administrativa y autorización del respaldo:

```powershell
$dump = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
$repo = (Resolve-Path .).Path.TrimEnd('\')
$backupRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'MicroCarmitaResguardos'))
if ($backupRoot.Equals($repo, [StringComparison]::OrdinalIgnoreCase) -or $backupRoot.StartsWith($repo + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'El respaldo debe estar fuera del repositorio.' }
$backupDir = Join-Path $backupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null

# Restringir la carpeta antes de escribir datos. Revisar también el cifrado del disco.
$miSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $backupDir /inheritance:r /grant:r "*${miSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos del respaldo.' }

$parcial = Join-Path $backupDir 'micro_carmita.partial'
$respaldo = Join-Path $backupDir 'micro_carmita.sql'
& $dump --no-defaults "--host=$($configLocal.host)" "--port=$($configLocal.port)" --user=root --password --single-transaction --quick --routines --triggers --events --hex-blob --default-character-set=utf8mb4 --no-tablespaces --set-gtid-purged=OFF --skip-add-drop-table "--result-file=$parcial" micro_carmita
if ($LASTEXITCODE -ne 0) { throw 'Respaldo incompleto. No limpiar la base.' }
if (-not (Test-Path -LiteralPath $parcial) -or (Get-Item -LiteralPath $parcial).Length -eq 0) { throw 'Respaldo vacío o ausente.' }
$ultimaLinea = Get-Content -LiteralPath $parcial -Tail 1
if ($ultimaLinea -notmatch '^-- Dump completed on ') { throw 'Falta el marcador de finalización. Revisar sin mostrar contenido.' }
Move-Item -LiteralPath $parcial -Destination $respaldo -ErrorAction Stop
$huella = (Get-FileHash -LiteralPath $respaldo -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $backupDir 'micro_carmita.sha256') -Value $huella -Encoding ascii
```

Usar --result-file evita problemas de codificación por redirección de PowerShell. --single-transaction da una instantánea coherente para InnoDB; no admite cambios DDL concurrentes. --routines, --triggers y --events incluyen los objetos que existan y sean visibles para la cuenta administrativa. Si los permisos son insuficientes o hay errores, no dar por válido el archivo.

No se usa --databases ni --all-databases; el archivo no debe seleccionar o crear la base original por sí mismo. --skip-add-drop-table omite los borrados de tablas en el respaldo. Un dump estándar puede contener ajustes de sesión para restauración: no reutilizar esos ajustes en la limpieza.

El archivo contiene información personal y hashes de autenticación: tratarlo como secreto, aunque no contenga contraseñas en texto plano. No subirlo a GitHub, R2 ni compartirlo. La huella SHA256 detecta modificaciones posteriores; **no demuestra restaurabilidad**. El checksum no debe confundirse con hashes de contraseñas y no es necesario publicarlo.

## Verificación restaurable y recuperación aislada

No se preparó ni ejecutó ninguna instancia de prueba en esta fase. Antes de autorizar limpieza:

1. Preparar otra instancia MySQL 8.0.46 aislada (por ejemplo localhost:3307), sin acceso de la aplicación ni de procesos productivos. Debe tener event_scheduler=DISABLED desde el arranque y no poder producir efectos externos. No usar otra base dentro de la misma instancia como único aislamiento si hay rutinas o eventos con referencias calificadas.
2. Comparar @@server_uuid y @@port con la instancia de origen: deben identificar otra instancia; confirmar que la base micro_carmita NO existe allí. No suponer aislamiento solo por el puerto. Revisar posibles DEFINER y objetos programables antes de importar; sus privilegios deben limitarse al entorno aislado.
3. Capturar en privado los conteos y estructura del origen detenido mediante inspeccion_limpieza.sql, sin copiar filas sensibles a Git.
4. Comprobar SHA256 y restaurar el respaldo en la instancia vacía. Estos comandos son **solo para el destino aislado y después de verificarlo manualmente**:

```powershell
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
# Cada conexión solicita su contraseña en la terminal local.
& $mysql --no-defaults --host=127.0.0.1 --port=3307 --user=root --password --execute="SELECT @@server_uuid, @@port, @@event_scheduler; SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='micro_carmita';"
# DETENERSE si no es la instancia aislada, el esquema ya existe o eventos no están DISABLED.
throw 'BLOQUEADO: verificar manualmente UUID distinto, instancia aislada, esquema ausente y eventos DISABLED antes de ejecutar por separado los pasos siguientes.'
# Confirmada la instancia, crear exclusivamente el esquema vacío de ensayo:
& $mysql --no-defaults --host=127.0.0.1 --port=3307 --user=root --password --execute="CREATE DATABASE micro_carmita CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
if ($LASTEXITCODE -ne 0) { throw 'No importar: falló la preparación del destino aislado.' }

$huellaGuardada = (Get-Content -LiteralPath (Join-Path $backupDir 'micro_carmita.sha256') -Raw).Trim()
if ((Get-FileHash -LiteralPath $respaldo -Algorithm SHA256).Hash -cne $huellaGuardada) { throw 'El respaldo cambió.' }
Push-Location -LiteralPath $backupDir
try {
    & $mysql --no-defaults --host=127.0.0.1 --port=3307 --user=root --password --database=micro_carmita --execute="SOURCE micro_carmita.sql"
    if ($LASTEXITCODE -ne 0) { throw 'Falló la restauración aislada.' }
} finally {
    Pop-Location
}
```

No automatizar el paso marcado DETENERSE ni copiarlo como aprobación implícita. Revisar **todos** los errores de importación, no solo el código de salida; no usar --force. CREATE DATABASE se muestra como instrucción futura para una instancia vacía aislada, nunca se ejecutó ni debe dirigirse al origen.

5. Repetir inspeccion_limpieza.sql contra la instancia aislada. Comparar las 22 estructuras, índices, FK compuestas, CHECK, motores, cinco versiones y todos los conteos con el origen congelado. Validar integridad de datos por comparación privada de contenidos/huellas por tabla, sin imprimir hashes, tokens o contraseñas de usuarios. Un conteo igual no prueba igualdad de contenidos.
6. Verificar consultas de lectura de los módulos y relaciones; no usar credenciales reales en un navegador de prueba ni provocar nuevas sesiones en el origen. Confirmar que los objetos adicionales encontrados se restauraron de forma segura. Registrar resultado y ubicación del respaldo sin incluir su contenido.
7. Antes de cualquier ensayo de borrado, probar también el procedimiento de recuperación sobre este entorno aislado. Guardar el respaldo y no destruir el entorno de verificación hasta cerrar el mantenimiento.

### Recuperación si algo falla

- Antes de confirmar una futura limpieza: ejecutar ROLLBACK en la misma conexión y cerrarla. Repetir los 22 conteos y comprobar las cinco tablas protegidas mediante comparación privada con la captura previa. Todas las tablas son InnoDB; triggers o efectos externos desconocidos bloquearían esta garantía y por eso deben auditarse antes.
- El SQL entregado **siempre termina en ROLLBACK**, incluso si se habilitaran sus indicadores. No incluye un COMMIT activo y no hace limpieza permanente.
- Si una futura versión autorizada ya hubiera confirmado una limpieza, mantener la aplicación detenida. Restaurar el respaldo completo en una **instancia aislada vacía** mediante el procedimiento probado anterior, verificar datos y autenticación, y decidir con el administrador la recuperación. Nunca importar un dump de estructura sobre la base existente ni sobrescribir las cinco tablas protegidas.
- Una opción de recuperación sin borrar el origen es promover la instancia restaurada, tras autorización separada y verificación de conectividad/privilegios/configuración; conserva el estado completo del respaldo tomado con el servicio detenido. La instancia original queda intacta para diagnóstico. No crear ni cambiar cuentas/contraseñas automáticamente.
- Si se exige recuperar en la instancia original, preparar por separado una importación **solo de datos de las 17 tablas operativas**, en orden inverso al de borrado, con FK activas y transacción, únicamente si están vacías y las cinco tablas protegidas coinciden con la instantánea. Requiere revisión y autorización específicas; no se entrega un comando genérico que pueda sobrescribir cuentas o datos nuevos. Si han aparecido filas nuevas, detenerse y planificar conciliación. No restaurar sesiones antiguas sobre sesiones nuevas.
- Nunca usar DROP, TRUNCATE, FOREIGN_KEY_CHECKS=0 ni reiniciar AUTO_INCREMENT para recuperar o limpiar este origen. Los IDs siguientes pueden conservar saltos.

## Script de limpieza preparado

backend/maintenance/limpieza_operativa.preview.sql:

- No fue ejecutado, ni siquiera con sus indicadores apagados.
- Reinicia cinco indicadores manuales a cero: autorización, respaldo restaurado/verificado, ausencia de escritores, revisión administrativa completa y confirmación de que todo lo operativo es demostración.
- Comprueba base/versión, nombres y motores, migraciones, las 35 columnas de FK, reglas NO ACTION y cantidades de restricciones. Son controles de deriva, no una prueba completa de igualdad del esquema: comparar también SHOW CREATE TABLE.
- Exige FOREIGN_KEY_CHECKS=1. Si SQL_SAFE_UPDATES=1, no modificarlo automáticamente; detenerse y revisar el procedimiento.
- Incluye SELECT COUNT(*) por cada una de las 22 tablas antes, dentro de la transacción después de los DELETE y después del ROLLBACK.
- Cada uno de los 17 DELETE está condicionado a @habilitado=1. No toca las cinco tablas protegidas ni usa DDL.
- Verifica cero filas operativas y conteos protegidos; estos conteos no sustituyen comparación de contenidos.
- Termina incondicionalmente con ROLLBACK. No existe ruta de confirmación permanente en el archivo entregado.

No se proporciona en esta fase un comando para ejecutar este archivo. Antes de cualquier ensayo o limpieza hacen falta autorización expresa, respaldo restaurado, metadatos administrativos completos, ventana sin escritores y confirmación del alcance. Una limpieza definitiva exigiría revisar por separado el control de errores y confirmación manual; no basta sustituir ROLLBACK por COMMIT en un proceso por lotes.

## Estado final y límites

Solo se añadieron este documento y los dos SQL de preparación. No se modificó lógica de aplicación, diseño, datos ni cuentas. No se realizaron commits, push, migraciones, backups ni transferencias. Los artefactos SQL se verifican estáticamente; no se presentan como ensayos MySQL ejecutados. npm test no es una prueba de seguridad de un borrado real y no se necesita cambiar la suite para esta preparación documental.

## Segunda revisión de seguridad — corte histórico anterior a la limpieza

La continuación autorizó generar un respaldo local únicamente si podía obtenerse completo sin modificar el origen. **No se generó ningún respaldo**: la única conexión verificada sigue siendo la cuenta DML. No se dispone de una conexión administrativa autenticada para certificar objetos ni completar el dump con todos sus componentes. No se inició un prompt de contraseña ni se intentó adivinar credenciales. No se creó carpeta ni archivo de respaldo; tamaño, código de salida de mysqldump y huella del respaldo no son aplicables porque el comando no se ejecutó.

Resultados de las consultas actuales:

- micro_carmita, MySQL 8.0.46, 22 tablas base y 22 motores InnoDB.
- Permisos observados: USAGE global y SELECT/INSERT/UPDATE/DELETE sobre micro_carmita.*; no se modificaron permisos.
- Cero triggers, rutinas, eventos y FK externas **visibles** entre esquemas de usuario. Sigue sin poder certificarse ausencia: faltan privilegios TRIGGER/EVENT y visibilidad suficiente de rutinas y otros esquemas. Debe usarse una cuenta administrativa existente en una terminal controlada por su titular; no elevar micro_app ni guardar una contraseña administrativa en .env.
- event_scheduler permanece ON. No se alteró ni se detuvieron servicios de MySQL.
- Docker CLI está instalado, pero la consulta al servidor Docker falló incluso fuera del sandbox: no existe la tubería dockerDesktopLinuxEngine. No se inició Docker ni se crearon contenedores. No se verificó ninguna instancia alternativa aislada, por lo que no se ejecutó restauración.

Revisión estática, sin ejecutar ninguno de los SQL:

- Los 17 DELETE están condicionados a @habilitado=1. Los cinco indicadores manuales se restablecen a cero. Se añadió además SET @habilitado=0 antes de los controles para invalidar estado residual de una conexión reutilizada.
- El último comando de cierre transaccional es ROLLBACK; después solo hay consultas de conteos. No existe COMMIT activo, DDL, reinicio de secuencias ni desactivación de FK en el preview. Incluye 22 conteos en cada una de tres etapas.
- Se contrastó nuevamente el orden de las 17 tablas con las FK reales visibles: sin violaciones de orden hijo/padre. Ninguna de las cinco tablas protegidas es destino de DELETE.
- inspeccion_limpieza.sql contiene exclusivamente SELECT y SHOW. No se ejecutó el archivo; se realizaron consultas específicas equivalentes de metadatos con salida limitada.
- Se añadió un throw obligatorio entre la consulta de identidad del destino de restauración y la creación del esquema de ensayo. Copiar el bloque completo se detiene antes de crear o importar nada; los pasos posteriores requieren revisión y ejecución separada.

Estos controles protegen la ejecución íntegra del archivo sin editar; no hacen inocuo ejecutar fragmentos aislados o modificar los indicadores. Un ROLLBACK no garantiza revertir efectos externos de triggers o rutinas desconocidos. La limpieza continúa bloqueada hasta la revisión administrativa, el respaldo completo, su restauración probada y la autorización expresa de cualquier ensayo o borrado. Los comandos exactos de respaldo y restauración futura están en las secciones anteriores. No se ejecutó la suite de aplicación porque solo se ajustaron artefactos de mantenimiento y documentación; la validación aquí es estática y de metadatos de solo lectura.

## Verificación final de sesiones y estado estable — 19 de noviembre de 2026

Consulta realizada a las 23:24 UTC usando exclusivamente SELECT. La tabla no tiene un identificador primario no sensible; su clave primaria es un hash de token y **no fue consultada**. Se revisaron únicamente usuario_id, creación, última actividad y estado derivado de expiración/revocación. No se consultaron tokens, hashes de sesión, cookies ni credenciales. No se incorporan filas ni identificadores de usuarios a esta documentación.

Instantánea: 16 sesiones, 15 revocadas y 1 vigente en el momento de consulta. Cero fechas de creación/actividad futuras con tolerancia de un minuto; cero actividad anterior a creación, expiración incoherente o revocación anterior a creación; cero usuarios inexistentes o sesiones vigentes asociadas a usuarios inactivos. No se detectaron indicios relevantes de acceso no autorizado en estas comprobaciones acotadas. No se dispone en esos metadatos de IP, dispositivo o auditoría de login para atribuir la sesión adicional. Su causa permanece **no determinada**. La creación de sesiones al autenticar existe en el código; esto no prueba qué originó una fila concreta.

El aumento de 15 a 16 no altera los resultados de la limpieza: las cinco tablas protegidas fueron preservadas exactamente durante aquella transacción; posteriormente autenticación puede crear, actualizar, revocar o vencer sesiones conforme al flujo normal. Su conteo se documenta como instantánea, no como condición fija de entrega. Durante este cierre no se alteró ningún registro.

Resultado actual: 17 tablas operativas con cero filas; usuarios 2, roles 2, auditoria_usuarios 3, migraciones 5, sesiones 16. npm test: 673 exitosas, 0 fallidas/omitidas/canceladas/pendientes. npm audit --omit=dev: 0 vulnerabilidades. Se conserva este plan y los SQL como documentación; el preview histórico está totalmente comentado y la inspección contiene solo SELECT/SHOW. No se reutiliza ni se vuelve a ejecutar la limpieza. La base MySQL y los archivos sensibles quedan fuera de Git.

Referencias técnicas: [mysqldump MySQL 8.0](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html) y [visibilidad de triggers](https://dev.mysql.com/doc/refman/8.0/en/information-schema-triggers-table.html).
