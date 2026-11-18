# Autenticación y usuarios — RF-01, RF-02 y RF-03

Corte de revisión del 17/11/2026: consultas de solo lectura confirman un Administrador activo, cero Superusuarios activos, 22 tablas y migraciones 001–005. Los ensayos reales previos satisfactorios fueron confirmados por el responsable del proyecto; no se repitieron en esta auditoría. Véase FINAL_QA.md para el estado actual y las validaciones pendientes. Las cifras y el esquema vacío de la sección siguiente corresponden a la entrega inicial.

## Estado de la entrega inicial (registro histórico)

El backend implementa inicio y cierre de sesión, autorización y gestión de usuarios. El frontend utiliza `auth-client.js` para estas operaciones. Las 56 pruebas anteriores se conservan. La migración `001_auth` ya se aplicó en `micro_carmita` sobre MySQL 8.0.46 como `root@localhost`, después de comprobar que el esquema estaba vacío. El aprovisionamiento del primer Administrador y el ensayo funcional contra MySQL real quedan pendientes.

La activación ejecutó exclusivamente `001_auth.sql`, con SHA-256 `7cce0d8584607196b7a87beb3a9fac223eb0365a8408b870b25ebf2fa25dbc13`. Se comprobaron cinco tablas, cinco claves primarias, cuatro claves foráneas, nueve CHECK, el índice único de usuario y los índices previstos. Hay dos roles operativos y una versión de migración. Usuarios, sesiones y auditoría permanecen vacíos. `micro_app@localhost` pudo consultar las cinco tablas y conservó únicamente SELECT, INSERT, UPDATE y DELETE sobre `micro_carmita`.*. La contraseña administrativa se solicitó de forma oculta en el terminal local y se mantuvo temporalmente en memoria del proceso. Los archivos auxiliares de activación se retiraron.

Después de la activación, `npm test` conservó 81 pruebas exitosas, cero fallidas, omitidas o canceladas, código de salida 0 y duración de 5514.05 ms. Las notas de preparación siguientes describen la revisión previa. La migración común ya aplicada debe conservarse como registro y no volver a ejecutarse.

La suite completa se ejecuta mediante `npm test`. La integración HTTP utiliza Express y scrypt reales con un repositorio en memoria. Las pruebas unitarias adicionales comprueban las transacciones del repositorio con conexiones simuladas. La suite funciona sin modificar la base real.

Resultado registrado de `npm test` durante esta entrega.

| Resultado | Cantidad |
| --- | ---: |
| Exitosas | 81 |
| Fallidas | 0 |
| Omitidas | 0 |
| Canceladas | 0 |

Se conservan las 56 pruebas previas y se añaden 25. Código de salida `0`, duración observada en la revisión de preparación de `5445.0865 ms`. `npm run db:check` también terminó con código `0` mediante `SELECT 1` en la comprobación previa. Una revisión anterior consultó únicamente los metadatos de tablas de la base configurada y obtuvo una lista vacía. Durante esta preparación no se ejecutaron migraciones ni operaciones sobre la base real. La aplicación de las migraciones y las operaciones de usuarios contra MySQL real quedan pendientes del procedimiento administrativo descrito abajo.

## Migración administrativa

El archivo versionado es `backend/migrations/001_auth.sql`. Crea `schema_migrations`, `roles`, `usuarios`, `sesiones` y `auditoria_usuarios`, y registra la versión `001_auth` al finalizar. Los roles iniciales son Administrador y Vendedor. Los nombres de usuario son únicos sin distinguir mayúsculas, con longitud de 3 a 30 caracteres ASCII de letras, números, punto, guion o guion bajo.

Desde la raíz del proyecto, abra el cliente MySQL con una cuenta administrativa separada de `micro_app`. Sustituya `cuenta_migraciones` por la cuenta autorizada de su instalación. La opción `-p` solicita la contraseña de forma interactiva.

```powershell
mysql -h 127.0.0.1 -u cuenta_migraciones -p micro_carmita
```

Dentro del cliente, compruebe que está conectado a la base correcta y que sigue vacía antes de la primera migración.

```sql
SELECT DATABASE(), VERSION();
SHOW TABLES;
EXIT;
```

Después de confirmar la base y su estado vacío, aplique el archivo mediante el procedimiento por lotes de la sección de activación al final de este documento. Así el cliente interrumpe la ejecución al primer error. Evite ejecutar todo el directorio de migraciones recursivamente, ya que contiene una migración exclusiva de desarrollo.

El script se aplica una sola vez. Las tablas se crean sin reemplazar objetos existentes. Si aparecen tablas o datos inesperados, revise su procedencia antes de continuar. MySQL realiza commits implícitos con DDL. Una interrupción puede dejar tablas creadas antes de registrar la versión. En ese caso, inspeccione el estado y prepare una corrección específica conservando los datos. Las siguientes migraciones usarán números nuevos y conservarán los archivos ya aplicados.

La cuenta `micro_app` mantiene permisos DML sobre las tablas necesarias y carece de permisos DDL. Las credenciales administrativas quedan fuera de la configuración de ejecución del servidor. La aplicación y `auth:bootstrap` utilizan consultas parametrizadas y carecen de código de ejecución automática de migraciones.

## Configuración y primera cuenta

Configure localmente `.env` a partir de `.env.example`, conservando cualquier configuración existente. Complete `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` con la conexión de `micro_app` a `micro_carmita`.

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`. Se utiliza `development` si está ausente. |
| `PORT` | Puerto HTTP, con valor predeterminado 3000. |
| `APP_ORIGIN` | Origen exacto desde el que se abre la aplicación, sin barra final. Ejemplo local `http://127.0.0.1:3000`. En producción exige HTTPS. |
| `ALLOW_DEV_SUPERUSER` | Habilitación explícita mediante `true`, exclusivamente en desarrollo o pruebas. El ejemplo está desactivado. |

Después de aplicar la migración, cree el primer Administrador mediante `npm run auth:bootstrap`. El comando exige que todavía no haya usuarios y registra una auditoría con actor de aprovisionamiento inicial. Configure las variables únicamente en la sesión local. Este ejemplo solicita la contraseña sin escribirla en el historial.

```powershell
$env:BOOTSTRAP_NAME = Read-Host 'Nombre del Administrador'
$env:BOOTSTRAP_USER = Read-Host 'Usuario del Administrador'
$claveInicial = Read-Host 'Contraseña inicial de 8 a 128 caracteres' -AsSecureString
$env:BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $claveInicial).Password
try {
    npm run auth:bootstrap
} finally {
    Remove-Item Env:BOOTSTRAP_NAME, Env:BOOTSTRAP_USER, Env:BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
    $claveInicial.Dispose()
}
```

El script rechaza una base ya aprovisionada y los usuarios duplicados. No sobrescribe cuentas. Luego inicie `npm start` y abra el origen configurado en `APP_ORIGIN`. Las cuentas del antiguo prototipo local quedan fuera de la autenticación del backend.

El frontend se sirve desde Express mediante una lista explícita de archivos públicos. La pantalla de usuarios conserva su formulario e incorpora edición, activación y desactivación. Para cambiar una contraseña, escríbala en el campo de contraseña del formulario y pulse Editar en la cuenta correspondiente. El campo se limpia tras guardar correctamente.

Ventas, inventario, cobros y movimientos conservan su almacenamiento local. La integración de esta entrega abarca autenticación y usuarios. El navegador conserva los datos por origen. Si anteriormente se utilizaba otro puerto, dominio o `file://`, esos datos permanecen en aquel origen. Utilice el mismo origen HTTP anterior para conservar acceso a los datos locales, configurando `PORT` y `APP_ORIGIN` de forma coherente. Esta entrega no copia ni elimina datos entre orígenes.

## API

| Método y ruta | Acceso y resultado |
| --- | --- |
| `GET /api/health` | Público, HTTP 200. |
| `POST /api/auth/login` | JSON con `usuario` y `clave`. Devuelve usuario público, token CSRF y cookie de sesión. |
| `GET /api/auth/me` | Sesión vigente. Devuelve usuario público y token CSRF. |
| `POST /api/auth/logout` | Sesión y CSRF válidos. Revoca la sesión y elimina su cookie. HTTP 204. |
| `GET /api/users` | Administrador. Lista las cuentas operativas, omitiendo hashes. |
| `POST /api/users` | Administrador. Exige `nombre`, `usuario`, `clave`, `rol` y admite `activo` booleano opcional. HTTP 201. |
| `PATCH /api/users/:id` | Administrador. Modifica campos presentes de la lista anterior. `activo` permite activar o desactivar. |

Las solicitudes que modifican estado requieren `Origin` igual a `APP_ORIGIN` y `Content-Type: application/json`. Las autenticadas requieren además `X-CSRF-Token`, obtenido en login o en `/api/auth/me`. El cliente utiliza cookies de mismo origen. Las respuestas utilizan 400 para validación, 401 para sesión o credenciales inválidas, 403 para permisos, 404 para cuentas inexistentes, 409 para duplicados o protección del último Administrador, 429 para límites y 503 para indisponibilidad interna. Los errores de MySQL se ocultan.

## Contraseñas, sesiones y roles

- RF-01 utiliza scrypt asíncrono de Node.js, con N=131072, r=8, p=1, sal aleatoria de 16 bytes y hash de 64 bytes. Los parámetros y la sal se guardan junto al hash. Se evita incorporar una dependencia adicional. Esta elección reemplaza la propuesta inicial de Argon2id por una alternativa admitida por OWASP. Consulte [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- La política exige contraseñas de 8 a 128 caracteres para Administrador y Vendedor, y de 15 a 128 para Superusuario. Se aplica al establecer contraseñas nuevas y en el aprovisionamiento. Se permiten letras, números, símbolos y espacios sin exigir una mezcla de categorías. El conteo utiliza la longitud de JavaScript, coherente con los atributos HTML del formulario. `backend/password-policy.js` centraliza la validación utilizada por el servicio y bootstrap. El formulario operativo admite únicamente Administrador y Vendedor y conserva mínimo 8. Superusuario se aprovisiona exclusivamente por la herramienta de desarrollo con mínimo 15, sin añadirlo al formulario operativo.
- Se rechazan claves comunes y variantes previsibles mediante una lista local de términos, secuencias numéricas, alfabéticas o de teclado, patrones repetidos y variantes del nombre de usuario. La comparación normaliza mayúsculas y espacios exteriores únicamente para detectar esos patrones. La contraseña original se conserva íntegra para scrypt. La lista local tiene alcance limitado y puede ampliarse con términos adicionales. No se consulta ningún servicio externo con contraseñas.
- Las contraseñas existentes permanecen intactas. El login verifica su hash sin aplicar retroactivamente la nueva política. La regla se aplica al establecer una contraseña nueva. Las contraseñas se transmiten únicamente por HTTPS en producción y se excluyen de respuestas y auditorías.
- Las sesiones utilizan tokens aleatorios de 32 bytes. MySQL conserva únicamente SHA-256 del token. La cookie es HttpOnly y SameSite=Strict, y utiliza Secure en producción. La duración absoluta es de ocho horas y la inactividad máxima de treinta minutos. El backend verifica el rol y estado actuales en cada solicitud autenticada.
- El login tiene un límite por IP de veinte intentos en quince minutos. Se permiten como máximo dos derivaciones scrypt concurrentes por proceso, para limitar el consumo de memoria. Estos límites corresponden a la instancia actual de Express. Un despliegue con varias réplicas deberá compartir el limitador. La instancia actual escucha en loopback y conserva la IP de su conexión directa.
- RF-02 impide al Vendedor acceder a gestión de usuarios. Los permisos del backend proceden de la sesión verificada. Los permisos visuales del frontend acompañan esos controles.
- RF-03 permite al Administrador crear, modificar, activar y desactivar cuentas Administrador o Vendedor. Se impide modificar cuentas Superusuario y asignar ese rol desde la API. Los cambios revocan las sesiones de la cuenta afectada, incluidos cambios sobre la cuenta propia.
- Se conserva al menos un Administrador activo mediante bloqueo transaccional del rol Administrador. Creación o modificación, revocación de sesiones y auditoría se confirman conjuntamente. La auditoría conserva actor, cuenta afectada, acción, fecha y cambios de datos públicos. El inicio de sesión bloquea la cuenta antes de crear la sesión y vuelve a comprobar contraseña y estado.

Producción requiere un origen HTTPS detrás de un terminador TLS que reenvíe las peticiones al servidor local. El navegador debe acceder al frontend y la API mediante ese mismo origen. La configuración de proxy y certificados corresponde al despliegue.

## Superusuario de desarrollo

Superusuario queda reservado al desarrollador y carece de función operativa. Las migraciones comunes solo insertan los roles operativos. En una base separada de desarrollo o pruebas, una cuenta administrativa puede aplicar `backend/migrations/development/001_dev_role.sql` después de la migración común.

Para aprovisionar una cuenta de desarrollo, configure `NODE_ENV=development` o `test`, habilite `ALLOW_DEV_SUPERUSER=true` y proporcione las variables `BOOTSTRAP_*` mediante el mismo procedimiento seguro, solicitando en Read-Host una contraseña de 15 a 128 caracteres. Ejecute `npm run auth:bootstrap -- --superuser`. La cuenta tendrá credenciales elegidas localmente y un nombre único. El script valida el entorno y la política específica del rol antes de abrir el pool. El aprovisionamiento operativo inicial debe realizarse primero.

En producción, el backend rechaza tanto el login como las sesiones existentes del Superusuario, incluso si `ALLOW_DEV_SUPERUSER` está activado accidentalmente. El aprovisionamiento con `--superuser` también se rechaza. La base de producción debe conservarse separada de las bases de desarrollo y carecer de cuentas activas de prueba. Los privilegios del Administrador se limitan a las operaciones del negocio y su gestión de usuarios.

## Archivos y verificación

Los módulos nuevos son `backend/passwords.js`, `backend/auth-service.js`, `backend/auth-repository.js`, `backend/bootstrap.js`, las migraciones y sus pruebas. `backend/app.js` integra rutas y middleware. `backend/server.js` configura el repositorio y el cierre del pool. `auth-client.js` integra las pantallas.

Los cambios en `app.js` retiran las credenciales iniciales y delegan el arranque al adaptador. Sus funciones locales anteriores permanecen para conservar las pruebas históricas de caracterización. El navegador utiliza las funciones reemplazadas por el adaptador, y los controles de sesión del HTML apuntan explícitamente a este. La prueba histórica sobre el bloqueo del Administrador describe el módulo local aislado. Las nuevas pruebas verifican que la aplicación integrada sí permite RF-03.

`index.html` incorpora el adaptador y ajusta el texto, las opciones operativas y la longitud de contraseña del formulario. `package.json` incorpora `auth:bootstrap`. `.env.example` documenta el entorno y el origen. `modelo.js`, `estilos.css`, las pruebas anteriores y `BASELINE.md` se conservan.

Después de aplicar la migración y crear el Administrador, compruebe en el navegador login, creación de Vendedor, rechazo de su acceso a usuarios, edición, desactivación, reactivación y logout. Una cuenta desactivada deberá perder acceso a la API. La verificación contra MySQL real y la revisión visual del navegador quedan pendientes de este paso administrativo.

## Revisión de preparación para activación

Se revisaron ambos archivos SQL y su correspondencia con `auth-repository.js`, `auth-service.js`, `bootstrap.js` y la configuración de Express. El esquema utiliza funcionalidades disponibles en MySQL 8.0.46. Las expresiones DEFAULT requieren 8.0.13 o posterior y los CHECK efectivos requieren 8.0.16 o posterior. Esta conclusión procede de revisión estática. La ejecución DDL real sigue pendiente. Referencias oficiales de [valores predeterminados](https://dev.mysql.com/doc/refman/8.0/en/data-type-defaults.html) y [restricciones CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html).

Las cinco tablas tienen clave primaria. `usuarios.usuario` tiene índice único sin distinción de mayúsculas. Las columnas de rol de ambas tablas tienen tipo y collation coincidentes. Las relaciones usuario-rol, sesión-usuario y auditoría-usuario usan claves foráneas InnoDB y rechazo de cambios referenciados por defecto. Los índices explícitos cubren rol/estado, usuario de sesión, caducidad y auditoría por afectado/fecha. InnoDB crea el índice necesario de la FK del actor. Se reforzaron los CHECK de fechas de actividad y revocación de sesiones. Estos CHECK admiten la renovación de actividad de una sesión que ya haya alcanzado su vencimiento absoluto, aunque esa sesión seguirá siendo rechazada por el servicio.

Los scripts contienen CREATE TABLE e INSERT de catálogos y versiones. Carecen de DROP, TRUNCATE, REPLACE, desactivación de claves foráneas o credenciales. La migración común crea únicamente los roles operativos. La migración de desarrollo ahora agrupa sus dos INSERT en una transacción para conservar conjuntamente rol y versión. La migración común incluye DDL con commits implícitos y exige comprobar cualquier interrupción antes de reanudar.

Los controles RF-03 y de Superusuario están verificados por pruebas HTTP y de servicio. El aprovisionamiento inicial utiliza `BOOTSTRAP_*`, exige una base sin cuentas y carece de contraseña predeterminada. Bloquea la fila del rol Administrador para serializar aprovisionamientos y registra auditoría. El esquema conserva los hashes y los tokens de sesión únicamente en sus formas derivadas.

La cuenta actual `micro_app` tiene DML amplio según el contexto del proyecto. Esto permite que sus credenciales modifiquen directamente auditoría y catálogos fuera de Express. La protección de la API sigue vigente, pero la auditoría carece de inmutabilidad frente al poseedor de esas credenciales. El ajuste futuro de permisos por tabla debe planificarse administrativamente. La configuración de proxy conserva un limitador por IP de conexión directa, que puede agrupar usuarios detrás de un proxy. Los límites y esa topología deben comprobarse al desplegar.

## Activación por lotes y verificaciones

Los siguientes comandos quedan preparados para ejecución posterior. En PowerShell, desde la raíz del proyecto, localice el cliente MySQL y solicite el nombre de una cuenta administrativa existente.

```powershell
$mysqlClient = (Get-Command mysql.exe -ErrorAction Stop).Source
$cuentaMigracion = Read-Host 'Cuenta administrativa de MySQL para migraciones'
if ($cuentaMigracion -eq 'micro_app') { throw 'Utilice una cuenta administrativa separada' }
& $mysqlClient --host=127.0.0.1 --port=3306 --user=$cuentaMigracion --password --database=micro_carmita
```

Si MySQL no está en PATH, asigne a `$mysqlClient` la ruta real de `mysql.exe` instalada en su equipo. Dentro del cliente, compruebe el destino y la identidad, y salga.

```sql
SELECT DATABASE() AS base, VERSION() AS version, CURRENT_USER() AS cuenta;
SHOW TABLES;
EXIT;
```

Continúe únicamente si la base es `micro_carmita`, la cuenta autenticada es administrativa y el esquema está vacío. Para aplicar exclusivamente la migración común desde PowerShell, el cliente pedirá la contraseña en el terminal.

```powershell
Get-Content -Raw -Encoding UTF8 backend/migrations/001_auth.sql |
    & $mysqlClient --host=127.0.0.1 --port=3306 --user=$cuentaMigracion --password --database=micro_carmita --default-character-set=utf8mb4 --batch --skip-reconnect
if ($LASTEXITCODE -ne 0) { throw 'Migración interrumpida. Inspeccione el esquema antes de continuar' }
& $mysqlClient --host=127.0.0.1 --port=3306 --user=$cuentaMigracion --password --database=micro_carmita
```

El modo por lotes se utiliza sin `--force`, para detener la ejecución ante errores. Después de la migración, verifique en el cliente.

```sql
SELECT version FROM schema_migrations;
SHOW TABLES;
SELECT codigo FROM roles ORDER BY codigo;
SELECT COUNT(*) AS usuarios_iniciales FROM usuarios;
SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.table_constraints
WHERE CONSTRAINT_SCHEMA = 'micro_carmita'
ORDER BY TABLE_NAME, CONSTRAINT_TYPE, CONSTRAINT_NAME;
SHOW INDEX FROM usuarios;
SHOW INDEX FROM sesiones;
EXIT;
```

Se esperan cinco tablas, versión `001_auth`, dos roles operativos y cero usuarios. Mantenga `.env` con `micro_app` y sus credenciales locales. Ejecute `npm run db:check`. Después aprovisione el Administrador mediante el bloque PowerShell de la sección Configuración y primera cuenta. Compruebe el código de salida inmediatamente después de `npm run auth:bootstrap` mediante `$LASTEXITCODE` antes de continuar. El resultado esperado es `0`. Elimine las variables de aprovisionamiento mediante el bloque `finally` indicado.

Para el ensayo local, configure `NODE_ENV=development`, `ALLOW_DEV_SUPERUSER=false`, `PORT=3000` y `APP_ORIGIN=http://127.0.0.1:3000` en el entorno local y ejecute `npm start`. Abra exactamente `http://127.0.0.1:3000`.

| Paso del ensayo contra MySQL real | Resultado esperado |
| --- | --- |
| Iniciar sesión con el Administrador aprovisionado | Login HTTP 200, `/api/auth/me` HTTP 200 y pantalla del negocio. |
| Crear un Vendedor con usuario nuevo y contraseña elegida localmente | POST `/api/users` HTTP 201 y cuenta visible. |
| Editar su nombre y usuario | PATCH HTTP 200, datos persistidos al recargar. |
| Abrir sesión de Vendedor en un navegador privado separado | Login HTTP 200. GET `/api/users` mediante la consola, con `fetch('/api/users').then(r => r.status).then(console.log)`, devuelve 403. |
| Desactivar al Vendedor desde la sesión del Administrador | PATCH HTTP 200. La sesión del Vendedor recibe 401 al consultar `/api/auth/me`. El login del Vendedor también devuelve 401. |
| Reactivar al Vendedor | PATCH HTTP 200 y login del Vendedor nuevamente permitido. |
| Intentar crear una cuenta con el mismo usuario | HTTP 409 y ninguna cuenta duplicada. |
| Intentar desactivar al único Administrador activo | HTTP 409. La cuenta permanece activa. |
| Cerrar sesión y consultar `/api/auth/me` | Logout HTTP 204, consulta posterior HTTP 401. |

Observe estados en la pestaña Red del navegador sin copiar cookies, tokens, solicitudes con contraseñas ni capturas que los expongan. El ensayo crea cuentas, sesiones y auditorías reales y cambia únicamente el estado de las cuentas de ensayo indicadas. Queda pendiente de autorización operativa. Conserve esos registros y desactive las cuentas de ensayo al finalizar.

Después del ensayo, el cliente MySQL permite comprobar persistencia sin mostrar hashes o tokens.

```sql
SELECT id, usuario, rol, activo,
       (password_hash LIKE 'scrypt$131072$8$1$%') AS formato_hash_valido
FROM usuarios ORDER BY id;
SELECT COUNT(*) AS sesiones, SUM(revocada_en IS NOT NULL) AS revocadas FROM sesiones;
SELECT actor_id, usuario_afectado_id, accion, ocurrido_en
FROM auditoria_usuarios ORDER BY id;
```

Para producción, configure `NODE_ENV=production`, `ALLOW_DEV_SUPERUSER=false` y el origen HTTPS real. Aplique solo la migración común. Las pruebas automatizadas verifican el rechazo tanto de login como de sesiones Superusuario en producción incluso ante una habilitación accidental. Una comprobación real de esa condición deberá realizarse en un entorno aislado equivalente a producción, conservando las credenciales y cuentas de desarrollo fuera de la base operativa.
