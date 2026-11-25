# Micro Carmita

Sistema de gestión con interfaz HTML, CSS y JavaScript, backend Node.js/Express y persistencia MySQL. Los 38 requisitos funcionales están implementados; las verificaciones pendientes de aceptación se distinguen más abajo. El despliegue en la nube, incluidos Render y TiDB, está pospuesto.

## Arquitectura y almacenamiento

- `index.html` y `estilos.css` contienen las pantallas y el diseño aprobado.
- `app.js` conserva la base de interfaz utilizada por los adaptadores `auth-client.js`, `inventory-client.js`, `orders-client.js`, `sales-client.js`, `finance-client.js`, `reports-client.js` y `dashboard-client.js`. No debe retirarse por contener funciones históricas.
- `date-formatter.js` comparte la fecha técnica actual de Ecuador (`hoy`, YYYY-MM-DD) y los formatos de presentación (`calendario`, `instante`). Las cadenas de presentación no se usan para cálculos ni filtros.
- `backend/server.js` configura el pool y los repositorios e inicia Express en loopback. `backend/app.js` compone autenticación, API y recursos públicos explícitos.
- Cada dominio conserva rutas, servicios y repositorios separados. `modelo.js` aporta reglas compartidas al backend; no es un archivo obsoleto del prototipo.
- `backend/migrations/` contiene el esquema versionado. Las migraciones son administrativas: no se ejecutan al iniciar la aplicación.
- Los respaldos se ejecutan mediante una CLI independiente de Express.

Los datos operativos del negocio se almacenan en MySQL. El almacenamiento del navegador no sustituye esa persistencia; quedan funciones históricas y estado de navegación local. Abra la aplicación desde Express, no mediante `file://` ni un servidor estático.

**GitHub contiene código, migraciones, pruebas y documentación; no incluye el estado local de MySQL**, sus filas, cuentas MySQL ni sesiones. Clonar el repositorio no reproduce la base operativa. `.env`, dependencias instaladas, salidas de prueba y respaldos están ignorados por Git.

## Instalación local

Requisitos: Node.js 22 o posterior con npm y MySQL 8.0 compatible con el esquema, verificado previamente con MySQL 8.0.46. Ejecute los comandos desde la raíz del proyecto. Para mantenimiento de esta entrega se utiliza exclusivamente `desarrollo-jose`.

1. Instale las versiones fijadas en el lockfile:

   ```powershell
   npm ci
   ```

2. Si todavía no existe `.env`, cree la configuración local sin sobrescribir una existente:

   ```powershell
   if (-not (Test-Path -LiteralPath .env)) {
       Copy-Item -LiteralPath .env.example -Destination .env
   }
   ```

3. Complete privadamente las variables de conexión y origen. No publique ni comparta sus valores.

| Variable | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Host y puerto MySQL; el puerto predeterminado es 3306. |
| `DB_NAME` | Base existente de la instalación. |
| `DB_USER`, `DB_PASSWORD` | Cuenta de aplicación con los permisos DML necesarios, separada de la cuenta administrativa de migraciones. Una contraseña vacía debe configurarse explícitamente. |
| `NODE_ENV` | `development` para el entorno local; también admite `test` y `production`. |
| `PORT` | Puerto HTTP, predeterminado 3000. |
| `APP_ORIGIN` | Origen exacto, por ejemplo `http://127.0.0.1:3000`, sin barra final y coherente con `PORT`. |
| `ALLOW_DEV_SUPERUSER` | Desactivado en el ejemplo; habilitación exclusiva de desarrollo/pruebas. |

La aplicación carga `.env` sin reemplazar variables ya definidas en el proceso. Mantenga las credenciales administrativas fuera de esa configuración.

### Esquema y migraciones

**En el entorno local existente las migraciones 001–005 ya están aplicadas: no volver a ejecutarlas.** Para una instalación nueva, un administrador debe preparar una base vacía, confirmar el destino y aplicar los siguientes archivos una sola vez, en este orden:

| Orden | Archivo | Contenido y procedimiento |
| --- | --- | --- |
| 001 | `backend/migrations/001_auth.sql` | Roles, usuarios, sesiones, auditoría y registro de versiones. [AUTH.md](AUTH.md) |
| 002 | `backend/migrations/002_catalogo_inventario.sql` | Clientes, proveedores, catálogo, lotes e inventario. [INVENTORY.md](INVENTORY.md) |
| 003 | `backend/migrations/003_pedidos_recepciones.sql` | Pedidos y recepciones. [ORDERS.md](ORDERS.md) |
| 004 | `backend/migrations/004_ventas_cobros.sql` | Ventas, fiados, abonos, caja e historial. [SALES.md](SALES.md) |
| 005 | `backend/migrations/005_finanzas.sql` | Movimientos financieros manuales. [FINANCE.md](FINANCE.md) |

Use el cliente MySQL con una cuenta administrativa separada y el procedimiento por lotes documentado en AUTH.md, revisando cada archivo y deteniéndose ante cualquier error. Compruebe las versiones en `schema_migrations` antes de continuar. MySQL puede confirmar DDL implícitamente: una aplicación parcial requiere inspección específica, no repetir archivos indiscriminadamente.

No ejecute el directorio recursivamente: `migrations/development/001_dev_role.sql` es exclusivo de desarrollo/pruebas. Los SQL de `backend/maintenance/` no son migraciones ni pasos de instalación; el preview de limpieza es evidencia histórica inerte y no debe reutilizarse.

### Comprobación y primera cuenta

Compruebe la conexión configurada:

```powershell
npm run db:check
```

El comando realiza `SELECT 1` y cierra el pool; no certifica por sí solo que todo el esquema esté instalado.

En una instalación nueva, después de preparar el esquema y antes de tener usuarios, aprovisione el primer Administrador. Configure temporalmente `BOOTSTRAP_NAME`, `BOOTSTRAP_USER` y `BOOTSTRAP_PASSWORD` mediante el procedimiento de entrada oculta y limpieza de variables de [AUTH.md](AUTH.md), y ejecute:

```powershell
npm run auth:bootstrap
```

No hay credenciales predeterminadas. El aprovisionamiento inicial se bloquea si ya existen usuarios; no es un mecanismo de recuperación de contraseñas. Las cuentas operativas posteriores se gestionan desde la aplicación por un Administrador. Las contraseñas nuevas de Administrador y Vendedor admiten de 8 a 128 caracteres y rechazan patrones previsibles.

### Inicio y pruebas

```powershell
npm start
```

Abra `http://127.0.0.1:3000` o el origen local configurado. El frontend y `/api` utilizan el mismo origen. El endpoint público `/api/health` permite comprobar HTTP, pero no certifica la disponibilidad de MySQL.

```powershell
npm test
```

La suite incluye caracterización histórica, reglas del modelo, servicios, repositorios simulados, HTTP local, permisos, contratos de interfaz y respaldo simulado. Funciona sin migraciones ni operaciones contra MySQL real. La línea base previa a esta mejora, del 24 de noviembre de 2026, es de **673 pruebas exitosas**; el total vigente lo informa el ejecutor después de incorporar regresiones.

## Roles y permisos actuales

Los permisos se comprueban en el servidor; ocultar un botón no sustituye la autorización.

| Operación | Administrador | Vendedor |
| --- | --- | --- |
| Consultar inventario, contactos y alertas; registrar clientes | Sí | Sí |
| Modificar catálogo, proveedores, entradas libres y ajustes | Sí | No |
| Registrar/consultar ventas, fiados, saldos y abonos | Sí | Sí |
| Editar o anular ventas conservando trazabilidad | Sí | No |
| Crear o cancelar pedidos | Sí | No |
| Consultar y recibir pedidos existentes | Sí | Sí |
| Registrar movimientos financieros manuales y consultar el libro general | Sí | No |
| Consultar reportes globales y descargar PDF | Sí | No |
| Crear, editar, activar o desactivar cuentas operativas | Sí | No |

La gestión de usuarios protege al último Administrador activo y no permite asignar ni modificar Superusuario. Superusuario es exclusivo del desarrollador, requiere habilitación explícita fuera de producción y no equivale a Administrador del negocio. Producción rechaza su login y sus sesiones. Los detalles están en AUTH.md y en los documentos de cada dominio.

Las sesiones usan cookie HttpOnly y SameSite=Strict, Secure en producción; las escrituras autenticadas comprueban origen y CSRF. Las contraseñas se derivan con scrypt. No coloque secretos en el frontend ni en Git.

## Implementado y pendiente de validación

Están implementados autenticación y usuarios, catálogo/contactos, inventario por lotes y FEFO, alertas, stock negativo controlado y conciliación, pedidos y recepciones, ventas/fiados/abonos, finanzas, reportes y exportación PDF. `rf.txt` conserva los 38 requisitos y [FINAL_QA.md](FINAL_QA.md) documenta su trazabilidad y las evidencias.

El mecanismo RF-37/38 de respaldo MySQL cifrado hacia Cloudflare R2 y periodicidad quincenal está implementado y probado con simulaciones. **Está desactivado por defecto y pendiente de validación operativa real**: bucket privado, credenciales dedicadas, programación persistente, custodia de claves, retención y restauración en una instancia aislada. `npm start` no inicia respaldos. La CLI usa `.env.backup` o `BACKUP_ENV_FILE`, no el `.env` de Express. Consulte [BACKUP.md](BACKUP.md) antes de habilitar o ejecutar sus comandos.

Las pruebas automatizadas no sustituyen los ensayos pendientes de concurrencia con conexiones MySQL independientes, persistencia tras commit/reinicio, recorrido manual y accesibilidad, volumen PDF y recuperación real de respaldos. Las evidencias históricas de FINAL_QA.md distinguen esos alcances. Esta mejora no ejecuta ninguno de esos procedimientos ni prepara despliegue en la nube.

## Documentación y evidencias

- [AUTH.md](AUTH.md): autenticación, cuentas, aprovisionamiento y migración inicial.
- [INVENTORY.md](INVENTORY.md), [ORDERS.md](ORDERS.md), [SALES.md](SALES.md), [FINANCE.md](FINANCE.md), [REPORTS.md](REPORTS.md): contratos, reglas y verificaciones por dominio.
- [BACKUP.md](BACKUP.md): respaldo privado, programación y recuperación aislada.
- [UI_UX.md](UI_UX.md): decisiones del diseño aprobado.
- [BASELINE.md](BASELINE.md), [FINAL_QA.md](FINAL_QA.md): líneas base y evolución de pruebas; sus conteos están fechados.
- [CLEANUP_PLAN.md](CLEANUP_PLAN.md): evidencia de la limpieza operativa ya finalizada; no repetirla.

Este README describe el funcionamiento actual. Los documentos técnicos conservan entregas y estados históricos; sus referencias al prototipo local, migraciones pendientes o conteos anteriores deben leerse con la fecha y el alcance de cada registro.
