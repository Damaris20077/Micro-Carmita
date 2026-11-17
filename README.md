# Micro Carmita — prototipo adaptado

## Backend de Fase 1

El bloque de pedidos y recepciones se documenta en [ORDERS.md](ORDERS.md). Incluye estados, recepción parcial/completa, permisos, idempotencia y la migración administrativa pendiente `003_pedidos_recepciones.sql`.

El bloque de clientes, proveedores e inventario se documenta en [INVENTORY.md](INVENTORY.md), con la migración administrativa pendiente `002_catalogo_inventario.sql`, endpoints, formularios y alcance de las pruebas. El registro local de nuevas ventas queda pendiente de integrarse transaccionalmente con el inventario remoto.

La autenticación y gestión de usuarios de RF-01, RF-02 y RF-03 están implementadas. Consulte [AUTH.md](AUTH.md) para migraciones administrativas, primera cuenta, configuración, endpoints y pruebas. La aplicación completa se abre desde Express mediante `npm start`. La aplicación de la migración y la comprobación con MySQL real quedan pendientes del paso administrativo.

La estructura inicial utiliza Express instalado en el proyecto y CommonJS.

- `backend/app.js` define la aplicación y el endpoint de salud, y exporta la aplicación para probarla.
- `backend/server.js` inicia el servidor en `127.0.0.1` y lee el puerto de la variable de entorno `PORT`. El valor predeterminado es `3000`.
- `backend/health.test.cjs` prueba el endpoint mediante HTTP real con un puerto temporal, usando las herramientas integradas de Node.js.

Desde la raíz del proyecto, inicie el servidor con Node.js 22 o posterior.

```powershell
npm start
```

Para elegir otro puerto en PowerShell, configure la variable antes de iniciar.

```powershell
$env:PORT = '3001'
npm start
```

En otra terminal, compruebe el servidor con el puerto elegido.

```powershell
Invoke-WebRequest http://127.0.0.1:3001/api/health
```

Con el puerto predeterminado, utilice `http://127.0.0.1:3000/api/health`. La respuesta esperada tiene estado HTTP `200`, tipo `application/json` y cuerpo `{"status":"ok"}`. Detenga el servidor con `Ctrl+C`. Para volver al puerto predeterminado, elimine la variable de la sesión de PowerShell mediante `Remove-Item Env:PORT`.

Ejecute todas las pruebas desde la raíz.

```powershell
npm test
```

El script `test` ejecuta directamente `node --test modelo.test.cjs app.test.cjs backend/*.test.cjs`. Conserva las 56 pruebas previas e incorpora pruebas de autenticación, autorización, gestión de usuarios y adaptación del frontend. También puede ejecutar la prueba HTTP de salud directamente mediante `node --test backend/health.test.cjs`.

El frontend utiliza el mismo origen HTTP de Express para autenticación y usuarios. Las secciones históricas sobre el prototipo se contrastan con `BASELINE.md` y `AUTH.md` para conocer la evolución y las diferencias funcionales verificadas.

### Configuración MySQL

`backend/database.js` exporta `crearPool()` mediante `mysql2/promise` y `comprobarConexion(pool)`. El pool admite hasta cinco conexiones y utiliza un tiempo de conexión de cinco segundos. La comprobación ejecuta únicamente `SELECT 1` y devuelve un booleano. Las pruebas inyectan un cliente o pool simulado y funcionan sin MySQL real.

Desde la raíz, copie `.env.example` a `.env` si todavía carece de configuración local.

```powershell
Copy-Item .env.example .env
```

Complete `.env` con los valores de su servidor y una base de datos ya existente.

| Variable | Configuración |
| --- | --- |
| `DB_HOST` | Dirección real del servidor MySQL. El ejemplo usa `127.0.0.1` para desarrollo local. |
| `DB_PORT` | Puerto MySQL. Se utiliza `3306` si la variable está ausente. |
| `DB_USER` | Usuario autorizado de su servidor. El ejemplo queda vacío. |
| `DB_PASSWORD` | Contraseña local. El ejemplo queda vacío. Se permite una cadena vacía solo si el servidor está configurado así. |
| `DB_NAME` | Nombre de una base existente. El ejemplo queda vacío. |
| `PORT` | Puerto HTTP de Express, con valor predeterminado `3000`. |

`npm start` y `npm run db:check` cargan `.env` con dotenv, conservando la prioridad de las variables ya definidas en el proceso. Ejecute el comando siguiente para comprobar MySQL.

```powershell
npm run db:check
```

Una comprobación correcta informa `Conexión MySQL verificada mediante SELECT 1.` y termina con código `0`. Ante configuración incompleta o fallo de conexión, el comando muestra un mensaje genérico y termina con código `1`. El pool se cierra al terminar la comprobación. Los mensajes evitan imprimir credenciales y detalles internos del servidor.

La conexión real queda pendiente de proporcionar la configuración local. Esta entrega prepara el módulo y sus pruebas simuladas. El comando de comprobación utiliza una base existente. El arranque HTTP y `/api/health` funcionan independientemente de MySQL.

`.gitignore` excluye `.env`, sus variantes, respaldos y logs. La excepción `.env.example` permite compartir la plantilla vacía. Guarde las credenciales reales únicamente en la configuración local o en las variables del entorno de ejecución.

Esta carpeta contiene la adaptación del prototipo compartido. Se conservaron la barra lateral azul, los iconos, las tarjetas de colores, las tablas y los formularios del diseño original. `../Micro-Carmita-1` conserva la copia original sin modificaciones.

## Organización del código reescrito

- `index.html`: declara todas las pantallas y formularios, incluidos lotes, salidas y abonos. Carga los scripts con `defer`, primero el modelo y luego la interfaz.
- `app.js`: conecta los eventos de los formularios y botones, muestra las tablas, migra los datos anteriores y guarda operaciones completas en el navegador.
- `modelo.js`: contiene las reglas de inventario, FEFO, caducidad, créditos, cobros y permisos. También valida los registros guardados antes de utilizarlos.
- `estilos.css`: conserva los colores y componentes del prototipo original, con reglas de adaptación agrupadas al final.
- `modelo.test.cjs`: verifica las reglas y la validación del almacenamiento con las herramientas incluidas en Node.js.

No se necesitan Express, MySQL2, dotenv ni nodemon para ejecutar este prototipo. Sus instalaciones existentes quedan fuera de esta reescritura.

## Abrir

Abra `index.html` en un navegador o, desde esta carpeta, ejecute:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Visite `http://127.0.0.1:8765/`. Los datos pertenecen a ese navegador y origen: abrir el archivo directamente, cambiar de puerto o cambiar de navegador utiliza un almacenamiento diferente. Descargue una copia antes de borrar datos del navegador.

Para probar sin mezclar registros del negocio, visite `http://127.0.0.1:8765/?pruebas=1`. Ese modo utiliza otra clave de almacenamiento. Los ejemplos de la verificación se conservan únicamente allí.

## Requisitos representados

| Necesidad recuperada de las conversaciones | Adaptación |
| --- | --- |
| Registro de productos y consulta de stock | Catálogo con categoría y precio; edición de nombre, categoría y precio por administración; stock calculado a partir de lotes y unidades pendientes |
| Entradas y salidas de inventario | Entrada de lote, salida con motivo e historial; las ventas también generan una salida |
| Lotes con distintas caducidades | Cantidad y fecha por lote; fecha opcional para productos que no caducan |
| Rotación FEFO | Se consumen primero los lotes vigentes con caducidad más cercana; los lotes sin caducidad se utilizan después |
| Alertas con 7 días de anticipación | Inicio muestra lotes con existencias que caducan entre hoy y los próximos 7 días, ambos incluidos |
| Impedir venta de caducados | Se excluyen de la asignación; la venta se bloquea si las únicas existencias restantes están caducadas |
| Permitir stock negativo | Las unidades sin existencia quedan pendientes de conciliar; las nuevas entradas vigentes concilian primero ese faltante |
| Cuentas por cobrar y pagos parciales | Crédito con cliente obligatorio, saldo pendiente, abonos e historial de cobros |
| Ingresos y egresos | Contado y abonos crean ingresos automáticamente una sola vez; se conservan movimientos manuales |
| Reportes | Ventas, ingresos, egresos y balance por período; descarga de movimientos CSV |
| Usuarios con diferentes permisos | Inicio de sesión local, cuentas activas/inactivas y tres roles: vendedor, administrador y super usuario |
| Ventas internas | No se emiten facturas ni comprobantes tributarios |
| Interfaz sencilla y adaptable | Estilo original conservado, campos etiquetados, avisos, diálogo de abonos y tablas con desplazamiento horizontal |
| Tutorías de uso | Pantalla Guía de uso con pasos y reglas de operación |
| Respaldo | Descarga local JSON y pantalla que identifica Cloudflare R2 como integración pendiente |

Los requisitos se reconstruyeron del texto disponible de las dos conversaciones. Los archivos adjuntos del documento de titulación no estuvieron disponibles en esa lectura; por ello esta matriz no atribuye códigos RF/RN que no pudieron comprobarse.

## Decisiones para revisar con el negocio

- Un lote se considera vigente durante toda su fecha de caducidad y caducado a partir del día siguiente, según la fecha de Ecuador (`America/Guayaquil`).
- El stock general incluye todas las existencias físicas, incluso caducadas, menos las unidades pendientes de conciliar. La pantalla de ventas muestra además las unidades de lotes vigentes.
- Si se venden más unidades que las disponibles en lotes vigentes, la diferencia queda sin lote y pendiente de conciliar. Nunca se consume un lote caducado para cubrir esa diferencia.
- Una entrada caducada se registra para reflejar existencias físicas, pero no concilia unidades pendientes. Puede darse de baja con una salida por caducidad.
- El saldo financiero representa ingresos cobrados menos egresos registrados. No es una utilidad contable ni incluye un cálculo del costo de los productos.
- La venta a crédito genera una deuda, pero no un ingreso de efectivo hasta recibir el abono. No registre manualmente un cobro que ya se generó automáticamente.

## Accesos del sistema

El inicio de sesión utiliza cuentas de MySQL. El primer Administrador se aprovisiona mediante el procedimiento de `AUTH.md`. El Administrador gestiona las cuentas operativas. Superusuario queda reservado a desarrollo y pruebas y se bloquea en producción.

## Límites del prototipo y siguiente implementación

La autenticación y los usuarios utilizan el backend y MySQL. Los datos del negocio siguen en almacenamiento local, sin sincronización entre equipos ni soporte de edición simultánea. La descarga JSON descrita en el prototipo es una copia local. La integración de copias a la nube queda pendiente.

Para la versión definitiva quedan pendientes:

1. Backend Node.js/Express, base de datos MySQL y transacciones para ventas, lotes, abonos y movimientos.
2. Completar la integración del resto de operaciones del negocio con las sesiones y la autorización del servidor.
3. Copias periódicas de MySQL hacia un espacio privado en Cloudflare R2, política de conservación y prueba de restauración. Las credenciales deben permanecer en el servidor.
4. Validación del documento oficial y de los permisos definitivos por rol con los responsables del negocio.

No se añadieron facturación tributaria ni asistente de IA. Se mantuvo Ingresos y egresos porque ya forma parte del prototipo y del contexto más reciente; no se impuso un catálogo de gastos administrativos aún sin confirmar.

## Datos del prototipo anterior

En la primera apertura se leen, si existen, las claves originales `inventario`, `ventas`, `cuentas` y `movimientos` del mismo origen y se genera una nueva clave `micro-carmita-v2`. No se borran las claves anteriores. Las existencias iniciales se convierten en lotes sin caducidad para que administración pueda revisarlas.

El prototipo anterior no descontaba existencias al vender. Por eso la migración no reconstruye las salidas de ventas anteriores ni genera ingresos históricos automáticos: hacerlo podría duplicar registros. Revise stock e ingresos anteriores antes de utilizarlos como saldos reales.

## Verificación

```powershell
node --check app.js
node --check modelo.js
node --test modelo.test.cjs
```

Las 14 pruebas cubren FEFO, exclusión de caducados, alerta a siete días, stock negativo y conciliación, abonos parciales, rechazo de sobrepagos, redondeo de dinero, validación de entradas, permisos, validación del almacenamiento y edición de productos conservando lotes y ventas anteriores. La interfaz se verifica con el flujo producto → lote → venta a crédito → abono → reporte y el cambio de perfil. El precio del producto se muestra con un prefijo `$` y completa el formato `00.00` al salir del campo.

## Ventas y cobros

El módulo de ventas, fiados y abonos se documenta en [SALES.md](SALES.md). La migración administrativa 004 y el ensayo reversible están preparados y pendientes de ejecución autorizada. Inicie con `npm start` después de aplicar la migración; ejecute `npm test` para las comprobaciones aisladas.

## Movimientos financieros

Ingresos, egresos, gastos administrativos y filtros por fecha se documentan en [FINANCE.md](FINANCE.md). La consulta integra la caja de ventas sin copiar sus registros. La migración 005 y el ensayo reversible requieren autorización antes de ejecutarse.

## Reportes y PDF

Los reportes de ventas, cierre diario, pendientes, abonos semanales, finanzas, inventario y pedidos, con descarga PDF, están documentados en [REPORTS.md](REPORTS.md). Usan las tablas existentes sin migración adicional. El ensayo reversible queda preparado para ejecución autorizada.
