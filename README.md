# Micro Carmita — prototipo adaptado

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
| Registro de productos y consulta de stock | Catálogo con categoría y precio; stock calculado a partir de lotes y unidades pendientes |
| Entradas y salidas de inventario | Entrada de lote, salida con motivo e historial; las ventas también generan una salida |
| Lotes con distintas caducidades | Cantidad y fecha por lote; fecha opcional para productos que no caducan |
| Rotación FEFO | Se consumen primero los lotes vigentes con caducidad más cercana; los lotes sin caducidad se utilizan después |
| Alertas con 7 días de anticipación | Inicio muestra lotes con existencias que caducan entre hoy y los próximos 7 días, ambos incluidos |
| Impedir venta de caducados | Se excluyen de la asignación; la venta se bloquea si las únicas existencias restantes están caducadas |
| Permitir stock negativo | Las unidades sin existencia quedan pendientes de conciliar; las nuevas entradas vigentes concilian primero ese faltante |
| Cuentas por cobrar y pagos parciales | Crédito con cliente obligatorio, saldo pendiente, abonos e historial de cobros |
| Ingresos y egresos | Contado y abonos crean ingresos automáticamente una sola vez; se conservan movimientos manuales |
| Reportes | Ventas, ingresos, egresos y balance por período; descarga de movimientos CSV |
| Usuarios con diferentes permisos | Perfiles activos/inactivos; administración y operador; controles de acciones y navegación en el prototipo |
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

## Límites del prototipo y siguiente implementación

Este es un prototipo funcional local. Cambiar de perfil simula permisos y **no constituye autenticación ni una barrera de seguridad**. La información se guarda en `localStorage`, sin sincronización entre equipos y sin soporte de edición simultánea. La descarga JSON es una copia local; no existe restauración automática ni envío a la nube en esta versión.

Para la versión definitiva quedan pendientes:

1. Backend Node.js/Express, base de datos MySQL y transacciones para ventas, lotes, abonos y movimientos.
2. Inicio de sesión real, contraseñas protegidas, sesiones y autorización en cada operación del servidor.
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

Las 12 pruebas cubren FEFO, exclusión de caducados, alerta a siete días, stock negativo y conciliación, abonos parciales, rechazo de sobrepagos, redondeo de dinero, validación de entradas, permisos y validación del almacenamiento. La interfaz se verifica con el flujo producto → lote → venta a crédito → abono → reporte y el cambio de perfil.
