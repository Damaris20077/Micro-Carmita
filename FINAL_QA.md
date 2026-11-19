# Revisión integral de Micro Carmita

Fecha: 17 de noviembre de 2026. Rama comprobada: desarrollo-jose. Entrega prevista: 19 de noviembre de 2026.

## Dictamen y alcance

El corte vigente del 18 de noviembre de 2026 queda en 634 pruebas exitosas; véase la auditoría funcional y de usabilidad al final. Las 573 de la auditoría de permisos y los demás resultados anteriores se conservan como evidencia histórica. El sistema tiene implementación de los 38 RF, pero no se declara aceptación integral de producción: RF-37/38 continúan desactivados y sin ensayo real; faltan navegación visual, concurrencia con conexiones independientes y persistencia tras commit/reinicio. No se ejecutaron escrituras sobre MySQL real, migraciones, respaldos, restauraciones ni transferencias a R2.

Las integraciones reales satisfactorias de RF-01 a RF-36 proceden del contexto confirmado por el usuario. Esta revisión ejecutó pruebas aisladas, inspección de código y consultas MySQL exclusivamente SELECT; no volvió a autenticar usuarios reales ni a tocar sesiones. Un ensayo con rollback comprueba operaciones dentro de una transacción, pero no demuestra persistencia tras commit ni carreras entre dos conexiones independientes.

## Conservación de avances

Antes de corregir el frontend se ejecutaron npm test (389/389, cero fallos y omitidas), git diff --check y auditoría de secretos de los 14 candidatos. npm audit --omit=dev --json: cero vulnerabilidades de producción. Se creó únicamente el commit LOCAL abf11826bd9dac457a0790c9c0174626d4daa451, mensaje: feat: registrar respaldos cifrados y programacion quincenal. Registra BACKUP.md, README.md, .env.example, .gitignore, package.json, package-lock.json y los ocho archivos backup de backend. No hubo push ni cambio de rama. Las correcciones de esta revisión permanecen pendientes de commit.

## Evidencias verificadas en esta sesión

- MySQL mediante el pool configurado de la aplicación: versión 8.0.46; 22 tablas base; schema_migrations registra 001_auth, 002_catalogo_inventario, 003_pedidos_recepciones y 005_finanzas, además de 004_ventas_cobros. Un Administrador activo y cero Superusuarios activos. No se seleccionaron contraseñas, hashes ni tokens.
- Configuración efectiva cargada desde .env: respaldo desactivado, entorno local fuera de producción y autorización de Superusuario desactivada. Esto no sustituye comprobar la configuración del futuro servidor de producción.
- Express sirve una lista explícita de archivos frontend, sin publicar .env, SQL, documentación privada ni temporales. API con sesiones de cookie, validación de Origin/CSRF, autorización en servicios y respuestas no-store. Superusuario bloqueado por configuración de producción aunque se habilitase el indicador de desarrollo; las pruebas auth.test cubren ese bloqueo. Administrador conserva gestión de usuarios; Superusuario no es un rol operativo ni sustituye al Administrador.
- Repositorios parametrizan valores SQL. Escrituras de ventas/abonos, recepciones, ajustes y finanzas usan transacciones; ventas/recepciones/finanzas poseen controles de idempotencia. No se reinterpretan las ventas fiadas como efectivo.
- Finanzas consulta movimientos manuales UNION ALL venta_caja: no copia los cobros a otra tabla. Reembolsos se muestran como egresos. Reportes reutilizan las fuentes de ventas, saldos, abonos e inventario. Cierre diario distingue ventas de caja; semana lunes a domingo, America/Guayaquil. Dinero con dos decimales; fechas operativas ecuatorianas y marcas UTC identificadas.
- PDF pasa por autorización del servicio antes de generarse. Hay pruebas de sesión, permisos, tipo MIME, estructura PDF, paginación y texto escapado. Los caracteres fuera de Latin-1 se sustituyen por ?, limitación documentada. En la auditoría inicial no se abrió visualmente ningún PDF. La actualización de presentación posterior sí revisó las muestras ficticias renderizadas descritas al final.
- index.html carga app.js, auth-client.js, inventory-client.js, orders-client.js, sales-client.js, finance-client.js y reports-client.js en ese orden. La nueva prueba VM ejecuta esa cadena real y comprueba sesión, consultas, logout, permisos y acceso a reportes sin lecturas/escrituras locales. Las escrituras a inventario/ventas/cuentas/movimientos mediante guardarDatos se rechazan.
- app.js conserva el prototipo local y sus pruebas de caracterización. Los adaptadores de index.html sustituyen esas operaciones; no se elimina su historial. La exportación explícita del inventario local antiguo es una descarga de archivo, no una fuente operativa del backend. No debe abrirse app.js de forma aislada como aplicación de producción; se usa npm start y el index servido por Express.

## Hallazgos corregidos y regresiones

| ID / criticidad | Defecto demostrado | Corrección y prueba |
|---|---|---|
| QA-01 Alta | reports-client.js en modo estricto asignaba mostrarReportes sin existir esa función en app.js. La cadena real de scripts falló con ReferenceError, antes de exportar MicroCarmitaReportes. Los mocks ocultaban el defecto. | Eliminada la asignación innecesaria. frontend-integration.test.cjs carga todos los scripts reales y consulta reportes como Administrador; se retiró el alias ficticio del fixture de reports-client.test.cjs. |
| QA-02 Media | Seis menús no tenían data-permiso y escapaban al ocultamiento del perfil Vendedor. La API sí rechazaba operaciones administrativas. | Atributos en todos los menús. Prueba integrada comprueba que Usuarios/Finanzas/Reportes se ocultan y Pedidos permanece disponible al Vendedor. |
| QA-03 Media | Dos envíos de login podían ejecutarse al mismo tiempo. | Exclusión durante la petición y botón deshabilitado/aria-busy; prueba de doble envío y liberación. |
| QA-04 Media | Ajustes/entradas de inventario podían enviarse en paralelo desde la misma pestaña. | Bloqueo de operación por identidad de sesión y mensaje para reconciliar una respuesta perdida antes de repetir. Prueba de exclusión y liberación. No proporciona idempotencia persistente entre reintentos. |
| QA-05 Media | Un historial de inventario recibido después del logout podía volver a mostrarse. | Descartar respuesta si cambia la identidad; prueba de respuesta tardía. |
| QA-06 Media | Dos consultas de ventas de la misma sesión podían resolverse en orden inverso y mostrar una lista anterior. | Número de consulta y descarte de respuestas obsoletas; prueba con dos promesas controladas. |
| QA-07 Media | Panel subyacente al login navegable por teclado y etiquetas sin asociación explícita. | Panel inert hasta sesión válida, foco al login, nombre accesible del diálogo, atributos for. Pruebas de estado y asociaciones; interacción real pendiente. |
| QA-08 Media | Contraste insuficiente del botón Pagar con texto blanco y textos secundarios claros; controles pequeños y riesgo de desbordamiento móvil de la sesión. | Botón verde más oscuro, texto secundario más oscuro, foco visible, tamaño mínimo 44 px, límites de ancho y tablas con scroll, campos móviles 16 px y reducción de movimiento. Inspección estática; no se afirma aceptación visual. |
| QA-09 Baja / técnica | Una ejecución completa falló en el after de backup.test.cjs con ENOTEMPTY al retirar un directorio temporal propio de Windows. | Reintento acotado de fs.rm (3, 100 ms) en la limpieza del fixture; conserva verificación de ruta absoluta antes de borrar. No cambia reglas del respaldo ni borra directorios ajenos. |

La primera ejecución tras las correcciones también detectó un mock de document incompleto en report-download.test.cjs; se añadió getElementById para representar el nuevo manejo de foco. No era un fallo de autenticación real. La suite final debe pasar completa; estos fallos intermedios no se ocultan como resultados exitosos.

## Riesgos pendientes y criterios de salida

| ID / prioridad | Evidencia y efecto | Acción antes de aceptación |
|---|---|---|
| P-01 Alta | RF-37/38 implementados pero desactivados; sin bucket real, recuperación MySQL efectiva ni programación instalada y probada tras reinicio. | Autorizar el ensayo aislado de BACKUP.md, comprobar R2 privado, restauración en destino NUEVO, retención, custodia de clave, alertas operativas y RPO/RTO. No habilitar copias reales desde esta revisión. |
| P-02 Alta | Ajustes y creación de pedidos siguen sin clave persistente de idempotencia. Las altas y entradas de lote ahora registran la clave en el historial transaccional cuando se proporciona; el frontend siempre la envía (actualización descrita al final). Un POST confirmado en servidor cuya respuesta se pierde puede repetirse. El bloqueo de botón solo evita simultaneidad en la pestaña. | Reconciliar historial antes de repetir ajustes o pedidos; preparar su idempotencia persistente y pruebas de carrera. La mejora de lotes reutiliza JSON y bloqueos existentes, sin migración. No se alteró el esquema en esta auditoría. |
| P-03 Media | Claves de ventas, abonos, finanzas y recepciones se conservan en memoria del cliente. Cerrar/recargar la pestaña tras una respuesta perdida puede perder la clave aunque el servidor sí deduplica claves repetidas. | Ensayo de respuesta perdida + recarga en entorno aislado. Definir recuperación de operaciones pendientes por servidor o almacenamiento de identificadores sin datos de negocio ni credenciales. No afirmar garantía exactamente una vez. |
| P-04 Alta para aceptación | No fue posible abrir navegador: la automatización nativa devolvió pipe no disponible (error del sistema 2). | Ejecutar manualmente PC/móvil, teclado y lector de pantalla. No hay capturas ni resultados visuales aprobados. Python tampoco está instalado; no pudo ejecutarse el generador de diseño de ui-ux-pro-max. Se aplicaron sus reglas de accesibilidad por inspección. |
| P-05 Media | Los ensayos SQL reversibles se ejecutan bajo rollback; la simulación de concurrencia no sustituye conexiones reales. | Ensayar C y P descritos abajo sobre base de prueba con conexiones independientes, nunca sobre datos del negocio. |
| P-06 Media | Reportes reúnen filas y PDF en memoria y efectúan consultas por detalles; no hay ensayo de volumen ni paginación de consultas. Fuente PDF estándar limita alfabetos. | Medir con datos ficticios representativos, verificar PDF extenso y nombres reales de prueba; acotar períodos o introducir límites sin truncar totales. |
| P-07 Baja | Existen avisos de desarrollo de la cadena nodemon ya documentados en REPORTS.md; producción arroja cero. | Mantener fuera del despliegue con npm ci --omit=dev. Revisar actualización compatible cuando esté disponible; no se usó audit fix --force. |
| P-08 Baja | Documentos de entregas anteriores contienen estados y conteos históricos que pueden confundirse con el actual. | Tomar esta matriz como corte fechado; los ensayos anteriores no equivalen a una nueva certificación completa. AUTH.md identifica ahora su estado inicial como histórico. |

## Matriz de los 38 requisitos

Texto de cada fila leído directamente de rf.txt (38 líneas, sin añadir requisitos). Implementado significa que se encontró el servicio, persistencia/API o mecanismo indicado y sus pruebas en el repositorio; no equivale a aceptación completa del despliegue. Los nombres de pruebas de la tabla pertenecen a backend/ y llevan sufijo .cjs salvo indicación; se conservan además modelo.test.cjs y app.test.cjs de caracterización.

Pendientes: **M** = recorrido manual real en navegador y pruebas de pérdida de sesión/red; **C** = concurrencia MySQL con conexiones independientes; **P** = persistencia después de commit y reinicio en entorno aislado; **D** = revisión visual y volumen PDF; **R** = activación/recuperación R2 aislada. No todos los RF necesitan escritura concurrente individual; se evalúan en los flujos compartidos correspondientes.

| RF | Texto oficial | Implementación localizada | Evidencia automatizada | Integración MySQL/R2 real | Validación pendiente |
|---|---|---|---|---|---|
| RF-01 | El sistema deberá permitir el inicio de sesión mediante usuario y contraseña. | Implementado: auth-service / auth-repository / auth-client | auth.test, password-policy.test, bootstrap.test, auth-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-02 | El sistema deberá diferenciar los permisos de acceso correspondientes a los roles Administrador y Vendedor. | Implementado: auth-service / auth-repository / auth-client | auth.test, password-policy.test, bootstrap.test, auth-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-03 | El Administrador deberá poder crear, modificar, activar o desactivar usuarios del sistema. | Implementado: auth-service / auth-repository / auth-client | auth.test, password-policy.test, bootstrap.test, auth-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-04 | El sistema deberá permitir registrar ventas indicando los productos, cantidades, valores y total de la operación. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-05 | El sistema deberá descontar automáticamente del inventario las cantidades correspondientes a los productos vendidos. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-06 | El sistema deberá permitir registrar ventas con stock igual a cero o insuficiente cuando el producto exista físicamente, generando temporalmente inventario negativo hasta que este sea regularizado mediante la recepción de mercadería o un ajuste autorizado por el Administrador. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-07 | El sistema deberá impedir la venta de productos cuya fecha de caducidad haya vencido. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-08 | Únicamente el Administrador podrá modificar o eliminar una venta previamente registrada. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-09 | El sistema deberá permitir registrar clientes cuando sea necesario asociarlos con una venta o valor pendiente de pago. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-10 | El sistema deberá permitir registrar ventas fiadas asociándolas con el cliente correspondiente. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-11 | El sistema deberá registrar el valor total adeudado, los abonos realizados y el saldo pendiente de cada cliente. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-12 | El sistema deberá permitir registrar pagos parciales o abonos y actualizar automáticamente el saldo restante. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-13 | El sistema deberá permitir consultar el historial de valores pendientes y pagos realizados por cada cliente. | Implementado: sales-service / sales-repository / sales-client | sales.test, sales-client.test, verify-sales.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-14 | El sistema deberá permitir registrar productos con nombre, categoría, precio de compra, precio de venta, cantidad disponible, proveedor, fecha de ingreso y fecha de caducidad. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-15 | El sistema deberá manejar diferentes lotes de un mismo producto, diferenciándolos mediante su fecha de caducidad. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-16 | El sistema deberá generar una alerta cuando un producto se encuentre a cinco días de su fecha de caducidad. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-17 | El sistema deberá generar una alerta de stock bajo cuando la cantidad disponible sea menor a tres unidades. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-18 | El Administrador deberá poder realizar ajustes manuales de inventario para corregir diferencias entre las existencias físicas y las registradas en el sistema, indicando el motivo del ajuste. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-19 | El sistema deberá incrementar las existencias del inventario cuando se registre la recepción de nueva mercadería. | Implementado: order-service / order-repository / orders-client | order.test, order-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-20 | El sistema deberá permitir registrar proveedores y relacionarlos con los productos y pedidos correspondientes. | Implementado: inventory-service / inventory-repository / inventory-client | inventory.test, inventory-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-21 | El Administrador deberá poder crear pedidos a proveedores indicando los productos y cantidades solicitadas. | Implementado: order-service / order-repository / orders-client | order.test, order-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-22 | El sistema deberá manejar los estados de pedido: Pendiente, Recibido parcialmente, Recibido completo y Cancelado. | Implementado: order-service / order-repository / orders-client | order.test, order-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-23 | El sistema deberá permitir registrar la recepción total o parcial de la mercadería correspondiente a un pedido. | Implementado: order-service / order-repository / orders-client | order.test, order-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-24 | El Vendedor podrá registrar la recepción de pedidos, pero no podrá crear pedidos nuevos sin intervención del Administrador. | Implementado: order-service / order-repository / orders-client | order.test, order-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-25 | El sistema deberá permitir registrar ingresos relacionados con las operaciones del emprendimiento. | Implementado: finance-service / finance-repository / finance-client | finance.test, finance-client.test, verify-finance.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-26 | El sistema deberá permitir registrar egresos y clasificarlos según su origen. | Implementado: finance-service / finance-repository / finance-client | finance.test, finance-client.test, verify-finance.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-27 | El sistema deberá permitir registrar gastos administrativos relacionados con el funcionamiento del negocio. | Implementado: finance-service / finance-repository / finance-client | finance.test, finance-client.test, verify-finance.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-28 | El sistema deberá permitir consultar ingresos y egresos por fecha o rango de fechas. | Implementado: finance-service / finance-repository / finance-client | finance.test, finance-client.test, verify-finance.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-29 | El sistema deberá generar reportes de ventas aplicando filtros por fecha o rango de fechas. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-30 | El sistema deberá generar un reporte de cierre diario que muestre el total de ventas y egresos registrados durante el día. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-31 | El sistema deberá generar un reporte de clientes con valores pendientes de pago, mostrando deuda, abonos y saldo. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-32 | El sistema deberá generar un reporte semanal de los pagos o abonos realizados por los clientes. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-33 | El sistema deberá generar reportes de ingresos y egresos por período. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-34 | El sistema deberá generar un reporte del inventario que permita identificar existencias, productos con stock bajo y productos próximos a caducar. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-35 | El sistema deberá permitir consultar información relacionada con los pedidos realizados a proveedores y su estado. | Implementado: order-service / order-repository / orders-client | order.test, order-client.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, C, P |
| RF-36 | El sistema deberá permitir exportar o imprimir los reportes en formato PDF. | Implementado: report-service / report-repository / report-pdf / reports-client | report.test, reports-client.test, report-download.test, report-security.test, verify-reports.test | Ensayo previo satisfactorio informado por el usuario; no repetido aquí | M, P, D |
| RF-37 | El sistema deberá permitir generar copias de seguridad de la base de datos para su almacenamiento en Cloudflare R2. | Implementado: backup-service / backup-runtime / backup-store / backup-crypto / backup-cli | backup.test (simulaciones) | No validado en servicio real; desactivado | R; sin ensayo R2/MySQL de recuperación real |
| RF-38 | Los respaldos de la información deberán realizarse con una periodicidad quincenal. | Implementado: backup-service / backup-runtime / backup-store / backup-crypto / backup-cli | backup.test (simulaciones) | No validado en servicio real; desactivado | R; sin ensayo R2/MySQL de recuperación real |

## Procedimiento de validación manual y adicional (pendiente)

1. Preparar un entorno de ensayo aislado, con datos ficticios y cuentas creadas por un operador autorizado. Para pruebas de escritura no usar la base del emprendimiento ni reutilizar el Administrador real. No copiar sesiones reales. Aplicar migraciones solo en el entorno de ensayo mediante cuenta administrativa separada, fuera de esta revisión.
2. Desde la raíz ejecutar npm test, npm audit --omit=dev y git diff --check. Para leer la aplicación ejecutar npm start y abrir el APP_ORIGIN configurado (valor habitual http://127.0.0.1:3000). No abrir index.html como file:// ni introducir contraseñas en el chat. En producción verificar HTTPS, NODE_ENV=production, origen exacto y cookie Secure.
3. En Chrome/Edge y un móvil real comprobar 320, 375, 768 y 1440 px, zoom 200 %, Tab/Shift+Tab/Enter, foco visible, login sin acceso al fondo, etiquetas, textos largos, tablas con scroll y ausencia de botones ocultos accesibles. Revisar cada sección y volver a Inicio para cerrar sesión. Conservar capturas sin información personal.
4. Probar login correcto/incorrecto/inactivo, logout, expiración/401 y cambio de sesión mientras existen solicitudes pendientes. Verificar que no reaparezcan datos de otra identidad. Como Administrador gestionar solo usuarios ficticios y como Vendedor comprobar rechazos 403 de usuarios, ajustes, creación/cancelación de pedidos, finanzas y reportes. Verificar recepción permitida y prohibición de modificar/anular ventas.
5. Registrar cliente/proveedor ficticios, producto completo y lotes. Validar campos vacíos, negativos, fracciones, duplicados y fechas inválidas. Confirmar caducidad a 6, 5, 0 y -1 días; stock a 3, 2, 0 y negativo. Ajustar solo como Administrador con motivo e historial del responsable.
6. Crear pedido; recibir parcial/completo; intentar cantidad superior, duplicado, cancelado y completado. Contrastar lotes, faltantes y movimientos. Abrir dos sesiones independientes para recibir el mismo pendiente: nunca superar lo solicitado ni duplicar una recepción con la misma clave.
7. Registrar contado, fiado, abono parcial y total; rechazar sobrepago, caducados y faltante sin confirmación física. Comprobar FEFO, regularización posterior y permiso de edición/anulación con historial. Conciliar saldo y caja: fiado sin abono no es efectivo; cada cobro/reembolso aparece una vez. En dos conexiones competir por saldo/abono, venta/ajuste y recepción/venta, registrando resultados, bloqueos y errores sin secretos.
8. Registrar ingresos, egresos y gasto administrativo ficticios; consultar extremos inclusivos y rango invertido. Comparar los siete reportes y PDF con las mismas operaciones: ventas, cierre, pendientes, pagos semanales, finanzas, inventario y pedidos. Revisar cabeceras, fecha, totales, dos decimales, columnas, varias páginas, impresión y ausencia de duplicados. Vendedor y usuario sin sesión no deben descargar PDF.
9. Simular offline, lentitud, doble clic y pérdida de respuesta después de que el servidor confirme escritura. Reintentar con la misma clave donde exista; comprobar historial antes de repetir ajustes/entradas/pedidos. Recargar pestaña para evaluar P-03. Inspeccionar Application/Storage: no deben escribirse nuevas colecciones de negocio ni sesiones/credenciales en localStorage.
10. En la base aislada confirmar operaciones, cerrar pool/servidor, reiniciar y volver a leer desde una conexión nueva. Comparar ventas/saldos/caja/stock/estados. Forzar fallos intermedios para confirmar rollback sin efectos parciales. Los ensayos verify-*-real.js documentados no sustituyen este ensayo de commit real. No se ejecutaron aquí.
11. Para R2 seguir exclusivamente el ensayo ficticio y el destino aislado de BACKUP.md después de autorización. Revisar ACL del directorio, bucket sin acceso público, token limitado al bucket, clave de cifrado fuera del repositorio y retención. Comprobar carga/descarga cifrada, rechazo de corrupción, recuperación SQL sobre servidor distinto y vacío, quincena exacta, ejecución perdida tras reinicio y bloqueo simultáneo. Nunca restaurar sobre micro_carmita. Registrar tiempo y tamaño sin imprimir secretos.

## Configuración y seguridad de respaldos

Se revisaron los módulos backup y BACKUP.md: habilitación explícita, cuenta lectora separada de micro_app/root, mysqldump single-transaction, validación de InnoDB, compresión, AES-256-GCM y verificación de bytes cifrados en R2. Credenciales por variables/archivo privado ignorado, directorio externo al proyecto, estado persistido y bloqueo exclusivo. No existe endpoint público de descarga de copias ni restauración automática. La política de retención y privacidad del bucket requieren verificación operativa; un booleano de configuración no certifica el servicio remoto. Límite actual de SQL: 512 MiB; estado/clave deben sobrevivir a reinicios; recuperación de lock huérfano es manual y conservadora.

La documentación oficial indica que la exposición pública de R2 requiere habilitación explícita y puede hacerse tanto por r2.dev como por dominio personalizado; comprobar ambos accesos antes de activar. [Cloudflare: buckets públicos](https://developers.cloudflare.com/r2/buckets/public-buckets/). La consistencia de single-transaction presupone tablas transaccionales y evitar DDL concurrente; esa opción no valida por sí misma una recuperación. [MySQL 8.0: mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).

## Archivos de esta revisión

Modificados: auth-client.js, inventory-client.js, sales-client.js, reports-client.js, index.html, estilos.css; backend/auth-client.test.cjs, inventory-client.test.cjs, sales-client.test.cjs, reports-client.test.cjs, report-download.test.cjs y backup.test.cjs; AUTH.md para distinguir su registro inicial histórico. Nuevos: backend/frontend-integration.test.cjs y FINAL_QA.md. Sin cambios a reglas de negocio backend, modelo.js, app.js ni migraciones. Sin dependencias nuevas.

## Resultado reproducible de la auditoría inicial (397 pruebas)

- npm test: 397 pruebas, 397 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes; salida 0. Última ejecución completa: 8061.2792 ms. Se conservan las 389 anteriores y se añaden ocho regresiones.
- npm audit --omit=dev --json: 0 vulnerabilidades de producción (críticas, altas, moderadas, bajas e informativas: todas 0); salida 0. No se instalaron dependencias en esta revisión.
- git diff --check: salida 0, sin errores de espacios. Git avisa conversión LF/CRLF; no es un fallo de formato.
- Escaneo final de 97 archivos versionados/candidatos: cero coincidencias de los secretos locales comparados y cero patrones de clave privada/token/URL con credenciales. No se encontraron temporales publicables. No es garantía de detección de todo secreto arbitrario.
- .env, .env.backup, .auth-provision.ps1 y .auth-real-check.cjs coinciden con git check-ignore y no aparecen entre archivos versionados. .env.example no contiene coincidencias con los secretos locales comparados; conserva valores de ejemplo.
- SQL real: únicamente SELECT; esquema y cuentas preservados. No se habilitó R2, no se ejecutaron ensayos reales con escrituras, migraciones ni transferencias externas.
- Dictamen: preparado para revisión y aceptación manual; no certificado todavía para entrega productiva completa por P-01, P-02 y P-04. No confundir cero fallos automatizados con cierre de esos pendientes.


## Actualización de presentación e interfaz

Rama confirmada: desarrollo-jose. Se revisó git status antes de editar y se conservaron todos los cambios pendientes de la auditoría anterior. No se crearon commits en esta actualización.

### Cambios y alcance

- PDFKit conserva Helvetica/Helvetica-Bold y la normalización Latin-1. Los siete tipos comparten encabezado azul y blanco, título, período o fecha de consulta, generación en es-EC/America/Guayaquil y página actual/total. La tabla utiliza encabezados repetidos, franjas discretas, alturas medidas y cantidades monetarias con dos decimales alineadas a la derecha. Los reportes con siete o más columnas son A4 horizontal; el resto A4 vertical. Las filas largas continúan en otra página sin recortar datos y repiten su identificador. Se corrigió la reserva inferior para que el pie no cree páginas vacías.
- El generador presenta los totales recibidos del servicio, sin recalcular ni mutar el reporte. Anuladas permanecen en las tablas con total vigente cero; las notas conservan la distinción entre total vendido, fiados, caja y deuda. No se cambiaron SQL, report-service, sales-service, finance-service, modelo.js ni reglas contables.
- Se retiró de Ventas el mensaje obsoleto de integración pendiente. La lista de cuentas muestra únicamente fiados activos con saldo positivo; ventas pagadas/anuladas siguen en Ventas registradas y en el selector de historial por cliente. Los saldos totales mantienen su cálculo existente.
- El detalle de venta aparece en la propia pantalla de Ventas, en un panel con tablas de productos/lotes, acciones/motivos/responsables y movimientos de caja. El historial por cliente usa tablas de abonos y devoluciones y conserva anuladas. Todo texto dinámico se escapa antes de incorporarlo a HTML; los paneles se limpian al cerrar sesión.
- Reportes separa filtros y acciones con espacios y cuadrícula adaptable (cuatro, dos y una columna). Botones secundarios consistentes con la identidad azul; Pedidos usa un icono de Font Awesome ya disponible. Inventario conserva su estructura, sin pestañas. No se añadieron dependencias ni fuentes externas.

### Evidencia de PDF ficticios

Se generaron siete archivos en output/pdf/: ventas-ficticio.pdf, cierre-ficticio.pdf, pendientes-ficticio.pdf, pagos-ficticio.pdf, finanzas-ficticio.pdf, inventario-ficticio.pdf y pedidos-ficticio.pdf. Los datos proceden de fixtures en memoria, sin consultas MySQL. Pendientes contiene 45 clientes ficticios en dos páginas (deuda 540.00, abonos 90.00, saldo 450.00); las otras seis muestras ocupan una página cada una. Ventas incluye una anulación visible, excluida del total vigente de 10.00; cierre distingue ese total de ingresos 5.00, egresos 3.00 y neto de caja 2.00.

Se renderizaron las ocho páginas con Windows.Data.Pdf y se inspeccionaron sus imágenes: encabezados, acentos, alineación monetaria, tablas, totales y pies legibles, sin superposiciones observadas en estas muestras. Se ajustaron el ancho de la columna de identificador y el acento azul del encabezado tras la primera inspección. Los PNG intermedios no son entregables; los PDF ficticios quedan disponibles para revisión. Esto no certifica todos los volúmenes o contenidos reales posibles.

El navegador nativo devolvió nuevamente pipe no disponible (error del sistema 2); no se verificó visualmente la nueva interfaz web. El usuario informó comprobaciones visuales previas satisfactorias de ventas, fiados, abonos, inventario, finanzas y un PDF; no se presentan como inspección de esta nueva versión. El generador Python de ui-ux-pro-max tampoco pudo ejecutarse por falta de un intérprete accesible. Se aplicaron sus criterios de contraste, foco, espacio, controles y adaptación responsiva mediante inspección y pruebas.

### Pruebas y pendientes

- npm test: 410 pruebas, 410 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes; salida 0, 11242.8594 ms. Se conservan las 397 anteriores y se añaden 13 (nueve PDF, tres de historial/saldos y una de estructura de interfaz).
- npm audit --omit=dev --json: 0 vulnerabilidades de producción; salida 0.
- git diff --check: sin errores de espacios; persisten únicamente avisos de conversión LF/CRLF.
- Regresiones: siete formatos PDF, encabezados/fechas/totales y una página para muestras pequeñas, tabla compacta de 45 filas con encabezados repetidos, fecha UTC cerca de medianoche, exclusión de anuladas/pagadas de pendientes, permanencia en historial, HTML escapado y limpieza del panel tras logout. Se mantiene la prueba de contenido largo y multipágina.
- Validación manual pendiente del rediseño: refrescar el frontend y reiniciar el backend para cargar el nuevo generador; entrar a Ventas y abrir detalle de una venta activa y una anulada, consultar historial por cliente, comprobar la lista pendiente, los filtros y botones de Reportes a 375/768/1440 px, foco por teclado y descarga de los siete PDF. Revisar registros largos y períodos grandes con datos ficticios. No ejecutar nuevas escrituras en el negocio para esta comprobación.
- Permanecen los riesgos P-01/P-02/P-03/P-05/P-06 de la auditoría: R2 real y recuperación, idempotencia persistente pendiente, recuperación de claves tras recarga, concurrencia y persistencia tras commit/reinicio, volumen. La revisión visual de las muestras cubre parcialmente D, no la aceptación de todos los documentos reales.

Archivos modificados en este bloque: backend/report-pdf.js, backend/report.test.cjs, sales-client.js, backend/sales-client.test.cjs, backend/frontend-integration.test.cjs, index.html, estilos.css y FINAL_QA.md. Creados: los siete PDF ficticios indicados. Otros cambios de git status pertenecen a la auditoría anterior y se conservaron. Sin migraciones, cambios de credenciales, escrituras MySQL, respaldos/R2, commits ni push.


## Actualización: lotes opcionales y fechas ecuatorianas

Rama desarrollo-jose confirmada y cambios pendientes conservados. Suite previa: 427 pruebas. El usuario informa que el pedido 3 fue recibido completamente y dejó stock 15; esta actualización no modifica ni vuelve a recibir ese pedido y no certifica nuevamente ese saldo mediante escrituras de prueba.

### Correspondencia con requisitos y esquema

Se leyó rf.txt completo. RF-14 pide proveedor, fechas, precios y existencias; RF-15 diferencia lotes por caducidad; RF-19/RF-23 regulan entradas y recepciones. Ninguno exige que la persona invente un código de lote. RF-06/RF-07, FEFO y alertas RF-16/RF-17 conservan sus cálculos originales. Los permisos de Administrador y Vendedor no cambian.

No se necesita migración: la consulta de solo lectura a information_schema.STATISTICS confirmó en MySQL real uq_lote_producto_codigo, NON_UNIQUE=0, columnas producto_id y codigo, en ese orden. Se conserva ese alcance de unicidad por producto; no se impone una nueva restricción global sobre códigos proporcionados. No se altera la columna NOT NULL ni el CHECK: al persistir, el código interno ya está resuelto y nunca está vacío.

### Códigos internos y protección de reintentos

- Se acepta código omitido, null, vacío o espacios. Un código proporcionado se conserva con el recorte de espacios que ya hacía la validación; tipos incorrectos y más de 60 caracteres se rechazan. Los códigos dados por el usuario siguen sujetos al índice único y generan conflicto 409 si se repiten para el producto.
- Dentro de la transacción se genera MC- seguido de randomUUID de node:crypto. Se evitan colisiones visibles en los lotes bloqueados y se reintenta exclusivamente el INSERT si MySQL devuelve ER_DUP_ENTRY para un código generado. Los intentos son acotados; al agotarlos se devuelve 409 y se revierte toda la transacción. No se regeneran códigos proporcionados ni se repite el incremento de stock para resolver una colisión.
- Recepciones: se normaliza el código a null antes de calcular la firma de idempotencia. La consulta por clave del pedido ocurre antes de generar el código. Un reintento devuelve la recepción existente y conserva su lote; el código aleatorio no altera la firma. Se reutilizan las transacciones, bloqueos y UNIQUE de recepciones existentes.
- Altas y entradas manuales: el frontend envía clave estable por operación y la conserva si la respuesta se pierde; evita cambiar los datos de una operación sin confirmar. El backend guarda clave, hash y respuesta en detalle.operacion del movimiento de inventario ya existente. La lectura de esa clave se hace después del bloqueo FOR UPDATE del usuario y antes de crear producto/lote o tocar stock. Las instancias que usan este servicio serializan operaciones del mismo usuario, devuelven el resultado previo o 409 si la clave se reutiliza con otros datos. No hay tabla nueva ni caché de deduplicación en memoria del servidor.
- Contrato API: POST /api/products y POST /api/products/:id/lots aceptan clave de 8–80 caracteres ASCII de letras, números, guion o guion bajo. Cuando se omite el código, esa clave es obligatoria para que el reintento sea seguro. El frontend la añade automáticamente. Se mantiene compatibilidad con clientes anteriores que envían código explícito sin clave; en ellos un duplicado sigue rechazándose, sin añadir stock. La respuesta incluye el código finalmente guardado.
- Los formularios indican Código de lote (opcional) y explican su generación automática. No se modifican lotes antiguos. El código generado se consulta en la lista de lotes y el historial de recepción existentes.

### Fechas y defecto demostrado de serialización

Se incorporó date-formatter.js, compartido por inventario, pedidos/recepciones, ventas/cuentas y finanzas. Las fechas de calendario se muestran en es-EC sin convertir su medianoche en un instante del día anterior. Los instantes se presentan en America/Guayaquil, con hora de 24 horas; DATETIME sin sufijo se interpreta como UTC conforme al esquema. Valores desconocidos se muestran como texto, sin ejecutar HTML. Se conserva el escape en las plantillas.

En una consulta de solo lectura se comparó CAST(UTC_TIMESTAMP(6) AS DATETIME(6)), recibido por mysql2 como Date, con su representación UTC explícita. Antes del ajuste del pool, la diferencia era +300 minutos: el driver asumía hora local para un dato UTC. Se añadió timezone: Z a crearPool y se actualizó su prueba de configuración. Repetida la consulta, la diferencia fue exactamente 0 minutos. No se actualizó ningún valor almacenado. Las respuestas de fechas afectadas ahora representan correctamente el instante UTC; los valores de calendario y las fechas enviadas por formularios/filtros a la API siguen siendo AAAA-MM-DD. El ajuste no cambia la zona de MySQL ni las reglas de sesión: sus consultas y escrituras siguen usando UTC_TIMESTAMP como antes.

No cambian los cálculos de caducidad, FEFO, filtros SQL ni reportes financieros. Los inputs date y el JSON de escrituras conservan sus formatos técnicos; el formato legible solo se utiliza al presentar datos. Se corrigió también la fecha técnica que aún mostraba la lista de cuentas por cobrar.

### Verificación y limitaciones

- npm test: 442 pruebas, 442 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes; salida 0. Última ejecución: 7507.8058 ms. Las 427 anteriores se conservan; se añadieron 15 regresiones.
- npm audit --omit=dev --json: 0 vulnerabilidades de producción; salida 0. Sin dependencias nuevas.
- git diff --check: sin errores de espacios, con avisos LF/CRLF habituales.
- Pruebas aisladas nuevas: alta y entrada automáticas, conservación de código dado, claves repetidas y contenido distinto, colisiones en snapshot e INSERT, límite de reintentos, rollback al fallar auditoría, recepción repetida sin código, recuperación parametrizada del historial JSON, conservación de la clave frontend tras respuesta perdida, fechas enviadas intactas, bisiesto, fecha imposible, medianoche UTC/Ecuador y formato visible en ventas, fiados y finanzas.
- MySQL real: solo se consultaron metadatos del índice y el reloj para verificar serialización. No se crearon lotes, productos, movimientos, pedidos, ventas, recepciones ni sesiones. No se ejecutaron migraciones, respaldos/R2, commits o push.
- Pendientes: probar inserciones/carreras reales con códigos automáticos, rollback y persistencia tras commit en una base aislada autorizada. Los mocks simulan transacciones y colisiones; no se presentan como ese ensayo real. El índice existente garantiza unicidad por producto en MySQL, pero la ejecución de nuevas escrituras reales sigue sin validarse.
- La clave de operación del frontend se conserva en memoria de la pestaña. Tras recargar/cerrar o perder sesión, consultar historial antes de volver a crear una operación: una clave nueva identifica una operación nueva. No se promete exactamente una vez si el cliente descarta la clave. La búsqueda en JSON no tiene índice específico para la clave; medir el historial con volumen y preparar un índice/tabla mediante migración futura solo si hace falta. Ajustes y creación de pedidos mantienen los pendientes anteriores de idempotencia.
- Reiniciar npm start para cargar los servicios y el nuevo archivo permitido por Express; después recargar la página. En un entorno aislado, comprobar alta/entrada/recepción con y sin código, colisión explícita, reintento de misma clave, nombre del lote en pantalla y caducidad en los límites de 5/0/-1 días. No repetir la recepción real del pedido 3.
- No se realizó inspección visual nueva en navegador. Los criterios de ui-ux-pro-max se aplicaron a etiquetas, instrucciones y consistencia de fechas; el generador Python continúa sin intérprete accesible según la comprobación previa. La adaptación visual debe comprobarse manualmente. Se conservan los demás riesgos de FINAL_QA, incluidos R2, concurrencia real y recuperación.

Archivos de este bloque: backend/app.js, backend/database.js, backend/database.test.cjs, backend/inventory-service.js, backend/inventory-repository.js, backend/order-service.js; backend/inventory.test.cjs, backend/order.test.cjs, backend/inventory-client.test.cjs, backend/order-client.test.cjs, backend/sales-client.test.cjs y backend/finance-client.test.cjs; inventory-client.js, orders-client.js, sales-client.js, finance-client.js, index.html y FINAL_QA.md. Nuevos: backend/lot-code.js, date-formatter.js y backend/date-formatter.test.cjs. Otros cambios de git status son anteriores y se conservaron. Sin cambios de permisos, tablas, migraciones, estilos ni reglas de cálculo de modelo.js.


## Auditoría de permisos HTTP

Rama comprobada: desarrollo-jose. Se leyó rf.txt completo y se inspeccionaron backend/app.js, auth-service.js, auth-repository.js y todos los servicios/rutas de inventario, pedidos, ventas, finanzas y reportes. Los cambios anteriores se conservaron. No se modificaron permisos ni código de producción en este bloque.

### Autenticación y autorización

Todos los routers de negocio están montados después de auth.authenticate en /api. La cookie se valida por formato y digest contra el repositorio de sesiones, que consulta al usuario actual; cuentas inactivas y sesiones revocadas/expiradas se rechazan. El rol no procede del cuerpo ni de cabeceras X-Role/X-User-Id. Los servicios exigen el rol en el backend. Las escrituras críticas vuelven a consultar/bloquear al actor dentro de sus transacciones. La desactivación de usuarios revoca sus sesiones mediante auth-repository; la suite de autenticación conserva sus pruebas de gestión de cuentas y revocación.

Las pruebas nuevas usan crearApp y los middleware/servicios reales en servidores HTTP locales con puerto aleatorio. Solo las sesiones y repositorios se simulan. Se envían Origin, JSON y CSRF válidos para que los 403 administrativos provengan de autorización por rol. Los repositorios trampa cuentan accesos y fallan si una ruta denegada intenta consultar o escribir datos de negocio: todos los casos de denegación terminaron con contador cero. No se usa la cuenta vendedor-qa ni sus credenciales.

### Rutas administrativas comprobadas: Vendedor 403

Todas las rutas de la tabla llevan prefijo /api. Son 31 solicitudes de matriz, incluidas las variantes de modificación/activación/desactivación que comparten endpoint.

| Operación | Método/ruta | Resultado Vendedor |
|---|---|---|
| Listar usuarios | GET /users | 403 |
| Crear usuario, incluso intentando asignar Administrador | POST /users | 403 |
| Modificar, activar y desactivar usuario | PATCH /users/1 (tres cuerpos válidos) | 403 en los tres casos |
| Crear pedido | POST /orders | 403 |
| Cancelar pedido | POST /orders/1/cancel | 403 |
| Crear producto | POST /products | 403 |
| Modificar y archivar producto | PATCH /products/1 (dos cuerpos válidos) | 403 en ambos casos |
| Entrada manual libre | POST /products/1/lots | 403 |
| Ajustar inventario | POST /products/1/adjustments | 403 |
| Crear proveedor | POST /proveedores | 403 |
| Editar venta | PATCH /sales/1 | 403 |
| Anular venta | POST /sales/1/void | 403 |
| Consultar finanzas | GET /finance | 403 |
| Registrar ingreso financiero | POST /finance | 403 |
| Consultar siete reportes | GET /reports/{ventas,cierre,pendientes,pagos,finanzas,inventario,pedidos} | 403 en los siete |
| Descargar siete PDF | GET /reports/{ventas,cierre,pendientes,pagos,finanzas,inventario,pedidos}/pdf | 403 en los siete |

RF-03, RF-08, RF-18 y RF-21/RF-24 establecen explícitamente responsabilidades de Administrador y Vendedor. RF-14/RF-19/RF-20, cancelación de pedidos y RF-25 a RF-36 no detallan por sí solos toda la matriz por rol. Las restricciones adicionales de productos, entrada libre, proveedores, finanzas/reportes y cancelación corresponden a la política actual documentada y al contexto autorizado de esta auditoría; no se presentan como frases literales añadidas a rf.txt ni se ampliaron/redujeron permisos.

### Operaciones permitidas comprobadas: Vendedor

| Operación | Método/ruta / evidencia aislada | Resultado |
|---|---|---|
| Consultar inventario y alertas | GET /inventory, /inventory/alerts | 200 |
| Consultar historial de producto | GET /products/1/history | 200 |
| Consultar clientes y proveedores | GET /clientes, /proveedores | 200 |
| Registrar cliente | POST /clientes | 201 |
| Consultar pedidos y detalle | GET /orders, /orders/1 | 200 |
| Recibir pedido existente | POST /orders/1/receipts | 201; reintento con la misma clave 200 |
| Registrar venta fiada | POST /sales | 201 |
| Registrar abono | POST /sales/1/payments | 201 |
| Consultar ventas, detalle e historial del cliente | GET /sales, /sales/1, /customers/1/receivables | 200 |

El flujo HTTP nuevo de ventas usa repositorio en memoria y lógica real: venta ficticia de 4.00, stock de lote 10 a 8, abono 1.00, saldo 3.00, un pago y un movimiento de caja. No basta con comprobar que la API no devolvió 403: se contrastan los efectos simulados. Los flujos HTTP existentes de inventario y pedidos se ampliaron para consultar con Vendedor también alertas, catálogos, historial y lista de pedidos.

### Ausencia de sesión, desactivación y rutas alternativas

- Sin cookie: las 31 solicitudes administrativas y otras 16 operativas/autenticadas devuelven 401. El mismo conjunto devuelve 401 cuando el repositorio de sesiones devuelve una cuenta desactivada; no hay accesos a repositorios de negocio ni actualización de actividad.
- Con la misma cookie simulada: GET /auth/me primero devuelve 200; tras cambiar activo a false en memoria, GET /auth/me y POST /clientes devuelven 401. Se comprueban nuevas solicitudes después de desactivar la cuenta, sin fabricar una sesión nueva.
- Las variantes GET /api/USERS/, GET /api/reports/ventas/?rol=administrador y HEAD /api/reports/ventas/pdf no eluden autorización. GET /api/users/1, DELETE /api/sales/1 y POST /api/users/1/delete no habilitan operaciones alternativas: rutas inexistentes devuelven 404. Todos estos casos reciben 403/404 sin accesos de negocio. X-Role: administrador y X-User-Id: 1 no elevan privilegios.
- No se encontró router de negocio montado antes de autenticación ni un endpoint alternativo de administración. GET /api/health es público intencionalmente; POST /api/auth/login debe ser accesible sin sesión. HTML/JS/CSS públicos no conceden permisos. Los archivos .env, SQL y backend no están publicados por el listado estático; se conservan sus pruebas anteriores. No existen endpoints HTTP de respaldos ni restauración.
- El 401 descrito corresponde a solicitudes correctamente formadas a rutas protegidas. JSON malformado, Origin incorrecto o tipo de contenido inválido pueden ser rechazados antes con 400/403/415; esto no concede acceso. Las comprobaciones de rol tampoco prometen un 403 para cualquier cuerpo inválido: algunos servicios validan campos antes de autorizar la operación administrativa.

### Resultado y riesgos pendientes

npm test: 573 pruebas, 573 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes; salida 0, 9378.2541 ms. Se conservan las 442 anteriores. permissions-http.test.cjs aporta 125 combinaciones por ruta (31 Vendedor + 47 anónimo + 47 desactivado), tres contenedores y dos pruebas adicionales: 130 entradas en node:test. Se añade una prueba HTTP del flujo permitido de ventas/abonos: 131 entradas nuevas en total. No confundir el conteo de pruebas/contenedores con 131 endpoints distintos.

npm audit --omit=dev --json: 0 vulnerabilidades de producción, salida 0. git diff --check: salida 0, sin errores de espacios; avisos LF/CRLF habituales.

No se detectó un defecto de autorización reproducible en las rutas evaluadas. Se añadieron regresiones, sin cambiar los permisos. La auditoría es de Express real con persistencia simulada: no revalida configuración de proxy/HTTPS/despliegue ni permisos MySQL reales de vendedor-qa. Queda pendiente la revocación concurrente con solicitudes ya en curso y dos conexiones MySQL, además de los riesgos de R2, persistencia e idempotencia ya descritos. Las lecturas aceptadas antes de una desactivación no se consideran canceladas retroactivamente por esta prueba. Toda ruta futura debe incorporarse a esta matriz y aplicar autorización en el servicio.

Archivos de este bloque: nuevo backend/permissions-http.test.cjs; modificados backend/sales.test.cjs, backend/inventory.test.cjs, backend/order.test.cjs y FINAL_QA.md. No se conectó a MySQL, no se usaron credenciales personales, no se crearon sesiones reales ni se ejecutaron migraciones u operaciones administrativas reales. Sin cambios de rama, commits o push.


## Revisión final de Git antes del commit de correcciones

Rama desarrollo-jose y HEAD inicial abf1182 comprobados; seis commits locales por delante de origin/desarrollo-jose según la referencia local (sin fetch ni push). Se revisaron los 28 archivos modificados y seis nuevos candidatos. Se añadió output/ a .gitignore para excluir de forma permanente los siete PDF ficticios generados. El commit previsto incluye 35 archivos: código, pruebas, documentación y esta regla de exclusión; no incluye PDFs ni archivos temporales.

rf.txt ya estaba versionado y su blob de trabajo coincide con HEAD; mantiene los 38 requisitos y se conserva como referencia sin cambios. Tampoco hay cambios en app.js, modelo.js, migraciones, package.json, package-lock.json ni .env.example en este bloque.

El escaneo de candidatos no detectó coincidencias con secretos locales ni patrones de claves privadas, tokens o URLs con credenciales; no se imprimieron valores sensibles. .env, .env.backup, .auth-provision.ps1 y .auth-real-check.cjs están ignorados y no versionados. El área de preparación se verificará con una lista explícita antes de registrar el commit local. El escaneo es una comprobación acotada, no una garantía absoluta de detección de cualquier secreto arbitrario.

Verificación repetida: npm test, 573 exitosas, 0 fallidas, 0 omitidas, 0 canceladas, salida 0 (6708.0595 ms); npm audit --omit=dev --json, 0 vulnerabilidades de producción, salida 0; git diff --check sin errores, con avisos LF/CRLF habituales. No se ejecutaron operaciones en MySQL ni migraciones. No se cambia de rama, no se hace merge ni push. Los riesgos funcionales y validaciones reales pendientes de las secciones anteriores no se consideran resueltos por este commit.

## Revisión coordinada de interfaz — 18 de noviembre de 2026

Rama desarrollo-jose y cambios pendientes conservados. Línea base ejecutada: 607/607. El alcance autorizado de implementación se detiene en componentes compartidos e Inventario/Pedidos. La matriz global se presentó antes de editar y queda detallada en UI_UX.md. No se encontraron las ocho capturas ni archivos identificables de Stitch; esta revisión es de código y pruebas aisladas. No se juzga la longitud de una captura como defecto.

| ID / criticidad | Clasificación y evidencia | Estado |
|---|---|---|
| UI-01 Media | Diseño: Archivar/Cancelar se confundían con consultas; acciones por fila sin agrupación consistente. | Estilos reutilizables secundario/peligro y acciones con separación, aplicados en Inventario/Pedidos. |
| UI-02 Media | Diseño: catálogos/lotes/pedidos sin filas vacías informativas y alertas en texto continuo. | Vacíos tras consultas exitosas, alertas por línea, etiquetas según estados remotos. Error se distingue de vacío mediante mensaje. |
| UI-03 Media | Retroalimentación: los bloqueos internos de escritura no deshabilitaban los botones de alta/ajuste/creación. | disabled y aria-busy derivados del bloqueo existente; regresiones de doble envío y liberación. No equivale a idempotencia entre recargas. |
| UI-04 Media | Diseño: recepción sin pedido con escasa orientación. | Ayuda condicional Ver y recibir y título accesible al restaurar/limpiar sesión. Campos, botón y validaciones conservados. |
| UI-05 Media | Defecto demostrado: cargar un pedido y fallar al seleccionar otro dejaba filas e historial de la selección previa. | Limpieza previa al GET, selección invalidada y recepción deshabilitada; prueba con datos ficticios. |
| UI-06 Baja | Defecto demostrado: catch de lista de pedidos sin guarda de identidad podía publicar un error después del logout. | Guarda de identidad y regresión de respuesta tardía. No modifica autenticación del servidor. |
| UI-07 Media, pendiente | Diseño: Cuentas requiere separar selector/historial y jerarquía de deuda; Reportes necesita estado inicial/carga y fecha legible; Usuarios conserva estilo de pago para Desactivar. | Siguiente bloque, después de revisión visual. No se modifican sus clientes ni HTML aquí. |
| UI-08 Alta para aceptación, pendiente | No hay inspección renderizada; la conexión nativa al navegador falló (os error 2). | No se certifican responsividad, ausencia de desbordamientos/solapamientos, foco real ni legibilidad visual. |

### Evidencia del bloque

- npm test: **619 pruebas, 619 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes**, salida 0, 6780.8045 ms. Doce nuevas sobre las 607 conservadas: tres de Inventario, cinco de Pedidos, una de enlace de eventos y tres de preservación/estructura visual.
- npm audit --omit=dev --json: **0 vulnerabilidades de producción**, salida 0. Primera consulta bloqueada en entorno restringido; repetición autorizada al registro exitosa. Sin instalaciones.
- git diff --check: sin errores, con avisos LF/CRLF habituales.
- Los scripts reales resuelven todos los eventos estáticos de index a funciones existentes. Esto verifica conexión de handlers, no sustituye ejecutar manualmente cada flujo ni prueba todos los controles dinámicos. Las acciones dinámicas de inventario/pedidos tienen comprobaciones del HTML renderizado y pruebas operativas previas.
- Los 161 controles originales mantienen su huella de IDs, tipos, eventos y atributos funcionales. La comparación de presentación de Inventario se sustituye por sus secciones y controles porque ahora está autorizado rediseñarlo. Huellas anteriores nuevas protegen todo el HTML ajeno a Inventario/Pedidos y todo el CSS previo; Ventas/Finanzas conservan su HTML completo. El menú y los tokens quedan intactos.
- Se mantienen los validadores existentes de cantidades, precios, fechas, lote opcional y recepción vacía, así como permisos de Administrador/Vendedor, claves de lotes/recepciones, descarte de respuestas obsoletas y fechas ecuatorianas. No se añade obligatoriedad indiscriminada a campos opcionales ni se reinterpretan los RF.
- Backend, API, consultas SQL, datos y reglas financieras/inventario no se modifican. Pruebas con Node/VM y persistencia simulada; no hubo escrituras MySQL, migraciones, respaldos/R2, cambio de rama, commits, merges ni push.

Archivos de esta iteración: index.html, estilos.css, inventory-client.js, orders-client.js; backend/inventory-client.test.cjs, backend/order-client.test.cjs, backend/frontend-integration.test.cjs, backend/ui-contract.test.cjs, backend/sales-layout.test.cjs, backend/finance-layout.test.cjs; nuevo backend/shared-ui.test.cjs; UI_UX.md y FINAL_QA.md. Los demás cambios pendientes pertenecen a iteraciones anteriores y se conservan.

### Validación manual antes de continuar

Detener el rediseño aquí para revisión de este bloque. Usar un entorno de prueba, no los datos del negocio. Comprobar 375/768/1024/1440px y zoom 200%, teclado y lectura de mensajes; tablas con scroll local; alertas/nombres/códigos largos; todas las secciones de Inventario en flujo vertical; ayuda sin pedido seleccionado; selección exitosa/fallida y recepción parcial/completa con estados correctos. Verificar límites de formularios y ausencia de solapamientos sin considerar la longitud de la página un defecto.

Con Administrador y Vendedor revisar los mismos permisos; con API simulada/base aislada probar errores HTTP/red, doble clic, respuesta perdida y logout con consultas pendientes. Reconciliar historial antes de repetir ajustes o pedidos cuya respuesta se perdió. No se afirma un nuevo ensayo MySQL real ni aceptación visual de las ocho pantallas. Continúan pendientes P-01 a P-08 según su alcance: especialmente R2, idempotencia persistente de ajustes/creación de pedidos, concurrencia y persistencia tras commit/reinicio. Cuentas/Reportes/Usuarios quedan para el bloque posterior y no se declara concluida la revisión visual global.


## Auditoría funcional y de usabilidad — 18 de noviembre de 2026

Rama desarrollo-jose. Línea base ejecutada: 619 exitosas, 0 fallidas/omitidas (7079.4744 ms). Cambios pendientes conservados. Se aplicaron senior-qa, ui-ux-pro-max y senior-backend mediante inspección y Node/VM/HTTP aislado. Se leyeron rf.txt, UI_UX.md y esta evidencia histórica. El diseño aprobado se conserva: no se editan index.html ni estilos.css. No se realizaron escrituras MySQL, migraciones, respaldos R2, cambios de rama, commits, merges ni push.

### Inventario de controles y eventos de los ocho módulos

Inventario extraído del HTML actual. Los controles sin ID se identifican por su evento, sin renombrarlos. La matriz siguiente añade las acciones dinámicas y sus validaciones. Los valores del formulario y las credenciales no forman parte del inventario.

| Módulo | IDs de campos de entrada/selección/botones | Eventos estáticos existentes |
|---|---|---|
| inicio | `inicioPanelActualizar` | `mostrarSeccion('inicio', document.querySelector('.menu'))` |
| ventas | `ventaCliente`, `ventaTipo`, `ventaProducto`, `ventaPrecio`, `ventaCantidad` | `MicroCarmitaVentas.cargar()`<br>`MicroCarmitaVentas.cancelarEdicion()`<br>`actualizarPrecioVenta()`<br>`agregarAlCarrito()`<br>`registrarVenta()` |
| cuentas | `cuentasCliente` | `MicroCarmitaVentas.cliente(Number(document.getElementById('cuentasCliente').value))` |
| inventario | `productoNombre`, `productoCategoria`, `productoPrecio`, `productoCantidad`, `productoCompra`, `productoProveedor`, `productoCodigo`, `productoFecha`, `productoCaducidad`, `entradaProducto`, `entradaProveedor`, `entradaCodigo`, `entradaCantidad`, `entradaCompra`, `entradaFecha`, `entradaCaducidad`, `ajusteProducto`, `ajusteCantidad`, `ajusteLote`, `ajusteMotivo`, `clientesNombre`, `clientesIdentificacion`, `clientesTelefono`, `clientesDireccion`, `proveedoresNombre`, `proveedoresIdentificacion`, `proveedoresTelefono`, `proveedoresDireccion` | `agregarProducto()`<br>`MicroCarmitaInventario.exportarAnterior()`<br>`MicroCarmitaInventario.entrada()`<br>`MicroCarmitaInventario.lotesAjuste()`<br>`MicroCarmitaInventario.ajustar()`<br>`MicroCarmitaInventario.contacto('clientes')`<br>`MicroCarmitaInventario.contacto('proveedores')` |
| movimientos | `movimientoTipo`, `movimientoValor`, `movimientoDescripcion`, `finanzaCategoria`, `finanzaFecha`, `finanzaAdministrativo`, `finanzaDesde`, `finanzaHasta` | `registrarMovimiento()`<br>`MicroCarmitaFinanzas.cargar()`<br>`MicroCarmitaFinanzas.todos()` |
| reportes | `reporteTipo`, `reporteFecha`, `reporteDesde`, `reporteHasta` | `MicroCarmitaReportes.seleccionar()`<br>`MicroCarmitaReportes.cargar()`<br>`MicroCarmitaReportes.descargar()` |
| pedidos | `pedidoProveedor`, `pedidoObservaciones`, `pedidoProducto`, `pedidoCantidad`, `pedidoPrecio`, `recibirPedidoBoton` | `MicroCarmitaPedidos.agregar()`<br>`MicroCarmitaPedidos.crear()`<br>`MicroCarmitaPedidos.recibir()` |
| usuarios | `usuarioNombre`, `usuarioCuenta`, `usuarioClave`, `usuarioRol` | `MicroCarmitaAuth.crearUsuario()` |

Comunes: ocho botones de navegación con mostrarSeccion, salto al contenido, Salir; loginUsuario/loginClave y envío del formulario mediante iniciarSesion(event). La sesión subyacente conserva inert, y el menú conserva data-permiso. Los mensajes e indicadores mantienen sus IDs (estado*, total*, lista*, resumen*) y no se convierten en nuevos estados de negocio.

Controles dinámicos: recCantidadN, recCodigoN, recFechaN, recCaducidadN y recPrecioN de cada detalle de recepción; Quitar en líneas/carrito; Historial/Editar/Archivar en productos; Ver y recibir/Cancelar en pedidos; Detalle/Modificar/Anular en ventas; Registrar abono/Historial del cliente en cuentas; Editar/Activar/Desactivar en usuarios. Sus datos proceden de API o del borrador en memoria, sin almacenamiento paralelo. Los prompts de edición/motivo y confirmaciones existentes permanecen intactos.

### Matriz de pruebas funcionales

A = probado de forma aislada en esta suite (Node/VM o Express con repositorios simulados); P = parcial/pendiente. Una fila A no afirma ensayo MySQL nuevo ni aceptación visual. Los archivos citados están en backend/ salvo app.test.cjs y modelo.test.cjs.

| Módulo | Acción / controles | Resultado esperado | Cobertura automatizada | Resultado | Evidencia |
|---|---|---|---|---|---|
| Sesión | Login válido, incorrecto e inactivo | Autenticar o rechazar sin sesión operativa; limpiar clave al éxito | auth.test.cjs, auth-client.test.cjs, password-policy.test.cjs | A | API/VM; perfiles ficticios, scrypt y límites por rol |
| Sesión | Doble login y restauración /auth/me | Un login en vuelo; restauración antigua no sustituye login/logout posterior | auth-client.test.cjs | A, corregido | Promesas controladas; restauración 200/401/500 y logout |
| Sesión | Logout, 401, descarga protegida | Revocar sesión en servicio; limpiar estado local incluso si 401 no contiene JSON | auth.test.cjs, auth-client.test.cjs, report-download.test.cjs | A, corregido | Repositorio simulado; proxy HTML ficticio |
| Comunes | Navegación ocho menús, handlers estáticos y dinámicos | Cada evento apunta a función real; permisos de menús conservados | frontend-integration.test.cjs, ui-contract.test.cjs | A para enlaces; P para recorrido real | Scripts de index cargados juntos; controles originales y roles |
| Inicio | Actualizar panel / volver a Inicio | GET existentes, sin escrituras; indicadores y alertas con reglas remotas | dashboard-client.test.cjs, frontend-integration.test.cjs | A | Permisos, vacíos, errores parciales, deduplicación y logout |
| Inicio | Stock, caducidad, pedidos abiertos y últimas ventas | No inventar cifras; no sumar fiados como efectivo | dashboard-client.test.cjs, sales-client.test.cjs | A | Respuestas ficticias, estados y cálculo original conservado |
| Ventas | Selección de producto/precio/cantidad, Agregar/Quitar carrito | Líneas y total del borrador; exigir producto/cantidad válida | sales-client.test.cjs, app.test.cjs | A | Carrito en memoria y enlace de Quitar; no localStorage operativo |
| Ventas | Registrar contado/fiado | Cliente obligatorio para fiado; stock y caja/saldo coherentes | sales.test.cjs, sales-client.test.cjs | A | Contado, fiado, precio, FEFO, caducados y faltante físico |
| Ventas | Reintentar registro / respuesta perdida | Misma clave; POST simultáneo bloqueado; no duplicar inventario/caja | sales.test.cjs, sales-client.test.cjs | A | Idempotencia y fallo tras confirmación con refresco fallido |
| Ventas | Limpiar/cancelar edición | Limpiar borrador solo cuando no hay operación pendiente | sales-client.test.cjs y revisión de cancelarEdicion | P | Registros y bloqueo probados; recorrido de cancelación visual pendiente |
| Ventas | Detalle / Modificar / Anular | Historial accesible; edición/anulación solo Administrador; restitución y reembolso trazables | sales.test.cjs, sales-client.test.cjs, permissions-http.test.cjs | A | Versiones, caja, confirmaciones y HTTP 403 |
| Cuentas | Listado de deudas activas | Excluir anuladas/pagadas; conservarlas en el historial | sales-client.test.cjs, sales.test.cjs | A | Fiados con saldo positivo frente a anulados/pagados |
| Cuentas | Registrar abono parcial/completo y sobrepago | Actualizar saldo e ingreso único; rechazar importe superior al saldo | sales.test.cjs, sales-client.test.cjs, permissions-http.test.cjs | A | Servicio simulado y flujo HTTP permitido del Vendedor |
| Cuentas | Selector e historial por cliente | Deuda/abonos/saldo e historial con anulaciones y reembolsos | sales-client.test.cjs, sales.test.cjs | A | Tablas, escape, fechas y trazabilidad; interacción real pendiente |
| Inventario | Alta producto | Campos RF-14 completos; lote opcional generado sin duplicar por reintento | inventory.test.cjs, inventory-client.test.cjs | A | Datos completos, firmas, colisiones y transacción simulada |
| Inventario | Editar / Archivar | Solo Administrador; conservar lotes, historial y datos asociados | inventory.test.cjs, inventory-client.test.cjs, permissions-http.test.cjs | A | Rechazos de Vendedor y servicio; handlers reales |
| Inventario | Lotes y alertas | Estados y umbrales remotos; cinco días, stock inferior a tres incluyendo negativos | inventory.test.cjs, inventory-client.test.cjs, modelo.test.cjs | A | Límites, calendario, etiquetas, vacíos y alertas |
| Inventario | Entrada de lote / ajuste con motivo | Stock/movimientos consistentes; motivo y rol validados; bloqueo visual | inventory.test.cjs, inventory-client.test.cjs | A | Claves de lote, validaciones, rollback simulado y doble envío |
| Inventario | Historial del producto | Conservar responsable, fecha, variación y motivo; descartar logout tardío | inventory-client.test.cjs, inventory.test.cjs | A | Lectura de historial y sesión estable |
| Inventario | Registrar clientes / proveedores | Validar entradas; cliente permitido al Vendedor; proveedor administrativo | inventory.test.cjs, permissions-http.test.cjs | A | Rutas de escritura con datos ficticios |
| Inventario | Descargar inventario local anterior | Exportación explícita heredada; no alimentar la API con datos locales | frontend-integration.test.cjs y revisión de exportarAnterior | P | Handler enlazado; descarga Blob real en navegador pendiente |
| Pedidos | Agregar/Quitar líneas y Crear | Producto/cantidad/precio válidos, sin duplicado de línea; alta solo Administrador | order-client.test.cjs, order.test.cjs, permissions-http.test.cjs | A | Validadores, carga útil y bloqueo de escritura |
| Pedidos | Lista / Ver y recibir | Selección reciente, título correcto; no mostrar detalle anterior si falla otro | order-client.test.cjs | A, corregido | Listas resueltas en orden inverso; selección y sesión |
| Pedidos | Cancelar | Solo Administrador, motivo; conservar recibido e historial | order.test.cjs, permissions-http.test.cjs | A | Estados y autorización; sin cancelaciones reales |
| Pedidos | Registrar recepción | Parcial/completa; Vendedor permitido; cantidades, fechas, lote y precio válidos | order.test.cjs, order-client.test.cjs | A | Rechazo de vacío/exceso/fecha imposible y precio; idempotencia |
| Pedidos | Historial y estados | Pendiente, parcial, completo, cancelado; no recibir cerrado/cancelado | order.test.cjs, order-client.test.cjs | A | Estado remoto y cantidades; tablas y ayuda sin selección |
| Finanzas | Registrar ingreso/egreso/gasto | Permiso administrativo actual, origen/motivo/importe/fecha válidos | finance.test.cjs, finance-client.test.cjs, permissions-http.test.cjs | A | Validaciones, rollback y bloqueo; RF no concede acceso adicional al Vendedor |
| Finanzas | Desde/Hasta/Consultar/Todas las fechas | Rango inclusivo validado; limpiar filtros; fechas ISO en API | finance.test.cjs, finance-client.test.cjs | A | Rango invertido y límites; fechas Ecuador sin cambio SQL |
| Finanzas | Resumen, reintento y vacío/error | Usar totales de API, sin duplicar venta_caja; clave estable y mensaje de guardado | finance.test.cjs, finance-client.test.cjs | A | Fiados/cobros/reembolsos; neto negativo y refresco fallido |
| Reportes | Tipo, fecha/rango y Consultar | Habilitar filtros por tipo; datos de los criterios actuales | report.test.cjs, reports-client.test.cjs | A, corregido | Filtros cambiados durante GET ya no muestran filas anteriores |
| Reportes | Descargar PDF / imprimir | Sesión/rol; mismos criterios; no duplicar descarga; archivo PDF válido | report.test.cjs, report-download.test.cjs, reports-client.test.cjs | A, corregido | Filtros cambiados durante descarga; cabeceras/filas/paginación PDF |
| Reportes | Carga/error/vacío | Acciones bloqueadas durante su petición y liberadas tras error | reports-client.test.cjs | A, corregido | Red fallida, doble clic, reintento y logout |
| Usuarios | Listar usuarios | Solo Administrador; consulta reciente prevalece; error tardío no repuebla lista | auth-client.test.cjs, permissions-http.test.cjs | A, corregido | GET resueltos en orden inverso y guardas de sesión |
| Usuarios | Crear / Editar / Activar / Desactivar | Validación de rol/cuenta/clave en backend; un envío por sesión, conservar campos tras rechazo | auth.test.cjs, auth-client.test.cjs, password-policy.test.cjs | A, corregido | CSRF, rechazo, botón ocupado, alta simultánea y respuesta posterior a logout |
| Comunes | Teclado, foco, etiquetas y responsividad | Orden coherente, controles accesibles, sin desbordamientos ni solapamientos | frontend-integration.test.cjs, ui-contract.test.cjs, *layout.test.cjs | P | Solo atributos, CSS y llamadas de foco simuladas; navegador no disponible |
| Respaldos (sin controles en los ocho módulos) | Estado, ejecución y programación CLI | RF-37/38 privados, cifrado y exclusión; desactivados sin autorización | backup.test.cjs | A simulado; P real | No se ejecutan CLI real, R2 ni restauraciones |

### Hallazgos reproducidos y correcciones

Primero se añadieron siete regresiones que fallaron contra el código anterior: 46 pruebas del subconjunto, 39 exitosas y 7 fallidas, sin canceladas/omitidas. Después pasan todas. Se añadieron casos complementarios de sesión, carga y preservación: quince pruebas nuevas en total. No se cambiaron reglas del servidor para hacerlas pasar.

| ID | Criticidad | Defecto real / evidencia | Corrección mínima |
|---|---|---|---|
| F-01 | Alta | HTTP 401 con cuerpo HTML fallaba al parsear JSON antes de limpiar sesión: interfaz local seguía autenticada. No se demostró acceso permitido por Express. | Invalidar sesión vigente antes de decodificar; error genérico seguro para respuesta inválida. |
| F-02 | Alta | Restauración /auth/me tardía podía sustituir un login reciente o borrarlo al fallar; también podía reabrir el estado local tras logout. | Revisión monotónica de sesión; descartar restauraciones antiguas. Un 401 de restauración anterior tampoco invalida login nuevo pendiente. |
| F-03 | Media | Dos GET /users de la misma sesión podían pintar el resultado antiguo al resolverse al revés. | Secuencia de consulta y guardas en éxito/error. |
| F-04 | Media | Crear usuario dos veces durante una petición enviaba dos POST. No implica dos filas reales: la restricción de usuario único sigue en MySQL. | Exclusión de operaciones de usuarios por sesión y botón ocupado; liberar tras error. Evitar limpiar un borrador por respuesta de otra sesión. |
| F-05 | Media | Dos cargas de lista de pedidos podían sobrescribir la lista reciente con una antigua. | Secuencia de lista independiente del detalle, invalidada con la sesión. |
| F-06 | Media | Cambiar fechas durante GET de reportes permitía mostrar datos anteriores bajo filtros nuevos. | Comparar ruta/criterios al resolver y solicitar nueva consulta sin publicar esas filas. |
| F-07 | Media | Cambiar filtros durante descarga permitía entregar un PDF del criterio anterior sin advertencia. | Verificar criterios antes de crear/enlazar Blob y solicitar nueva descarga si cambiaron. |
| F-08 | Baja | Reportes no reflejaba consulta/descarga activa en los botones; faltaba retroalimentación durante la espera. | Mensaje y disabled/aria-busy de los botones existentes, liberados en finally. La descarga conserva su exclusión previa. |

No se encontraron defectos críticos reproducidos en los escenarios auditados. Esto no demuestra ausencia total de defectos. Las propuestas previas de reorganización de Cuentas, fecha técnica UTC en Reportes, color de Desactivar y sustitución de prompts se consideran mejoras opcionales: el usuario aprobó el diseño y no se aplican aquí.

### Resultado final y alcance real

- npm test: **634 pruebas, 634 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes**, salida 0, duración 6557.7555 ms. Se conservan las 619 de la línea base.
- npm audit --omit=dev --json: **0 vulnerabilidades de producción**, salida 0. La consulta inicial falló por acceso al registro dentro del entorno restringido; se repitió autorizada con éxito. Sin instalaciones.
- git diff --check: sin errores; avisos habituales LF/CRLF.
- backend/approved-design.test.cjs comprueba SHA-256 del HTML y CSS aprobados normalizando solo CRLF. La huella de los 161 controles originales sigue pasando; no se modificó DOM estático, IDs, atributos, eventos, clases ni estilos.
- Las 15 nuevas regresiones se reparten en ocho de autenticación, una de lista de pedidos, cuatro de reportes, una integrada de enlaces dinámicos y una de preservación visual. El fixture integrado incorpora appendChild para representar el carrito; no es un motor de navegador.
- La suite conserva HTTP 401 para anónimo/desactivado, 403 para Vendedor en rutas administrativas y recorridos operativos permitidos. Los permisos y el bloqueo de Superusuario en producción siguen siendo del backend; no se cambian con esta auditoría.
- No se volvió a ejecutar la integración con MySQL real: los ensayos satisfactorios previos de RF-01 a RF-36 proceden del contexto del usuario y siguen separados de estas simulaciones. No se usaron credenciales personales.

Archivos de esta iteración: auth-client.js, orders-client.js y reports-client.js; backend/auth-client.test.cjs, backend/order-client.test.cjs, backend/reports-client.test.cjs y backend/frontend-integration.test.cjs; nuevo backend/approved-design.test.cjs; FINAL_QA.md y una nota relevante de usabilidad en UI_UX.md. Los demás cambios pendientes son anteriores y se conservan. No se modifica backend de negocio, app.js, modelo.js, rf.txt, migraciones, dependencias, HTML ni CSS.

### Clasificación de los 38 RF

Son ejes separados: implementado no equivale a aceptación de producción; probado indica evidencia aislada vigente y pendiente indica lo que falta fuera de esa evidencia. El texto literal oficial se mantiene en rf.txt y en la matriz histórica de este documento, sin cambios. M = navegador/accesibilidad; C = concurrencia con conexiones independientes; P = persistencia tras commit/reinicio; D = aceptación visual/volumen PDF; R = R2 privado, programación operativa y recuperación aislada. C/P se aplican a los flujos compartidos correspondientes, no implican que cada consulta requiera una carrera propia.

| RF | Función | Implementado | Probado en suite vigente | Pendiente de validación |
|---|---|---|---|---|
| RF-01 | Login | Sí | Aislado: auth.test.cjs y clientes/permisos asociados | M, C, P |
| RF-02 | Roles | Sí | Aislado: auth.test.cjs y clientes/permisos asociados | M, C, P |
| RF-03 | Gestión de usuarios | Sí | Aislado: auth.test.cjs y clientes/permisos asociados | M, C, P |
| RF-04 | Registro de ventas | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-05 | Descuento de inventario | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-06 | Stock negativo físico | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-07 | Prohibición de caducados | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-08 | Edición/anulación administrativa | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-09 | Clientes | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-10 | Ventas fiadas | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-11 | Deuda y saldo | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-12 | Abonos | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-13 | Historial de cliente | Sí | Aislado: sales.test.cjs y clientes/permisos asociados | M, C, P |
| RF-14 | Registro de producto | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-15 | Lotes | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-16 | Alerta de caducidad | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-17 | Alerta de stock | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-18 | Ajustes con motivo | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-19 | Ingreso por recepción | Sí | Aislado: order.test.cjs y clientes/permisos asociados | M, C, P |
| RF-20 | Proveedores | Sí | Aislado: inventory.test.cjs y clientes/permisos asociados | M, C, P |
| RF-21 | Crear pedidos | Sí | Aislado: order.test.cjs y clientes/permisos asociados | M, C, P |
| RF-22 | Estados de pedidos | Sí | Aislado: order.test.cjs y clientes/permisos asociados | M, C, P |
| RF-23 | Recepción parcial/completa | Sí | Aislado: order.test.cjs y clientes/permisos asociados | M, C, P |
| RF-24 | Recepción por Vendedor | Sí | Aislado: order.test.cjs y clientes/permisos asociados | M, C, P |
| RF-25 | Ingresos | Sí | Aislado: finance.test.cjs y clientes/permisos asociados | M, C, P |
| RF-26 | Egresos | Sí | Aislado: finance.test.cjs y clientes/permisos asociados | M, C, P |
| RF-27 | Gastos administrativos | Sí | Aislado: finance.test.cjs y clientes/permisos asociados | M, C, P |
| RF-28 | Filtro financiero por fecha | Sí | Aislado: finance.test.cjs y clientes/permisos asociados | M, C, P |
| RF-29 | Reporte de ventas | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-30 | Cierre diario | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-31 | Reporte de pendientes | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-32 | Reporte semanal de abonos | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-33 | Reporte financiero | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-34 | Reporte de inventario | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-35 | Consulta de pedidos | Sí | Aislado: order.test.cjs y clientes/permisos asociados | M, C, P |
| RF-36 | PDF | Sí | Aislado: report.test.cjs y clientes/permisos asociados | M, P, D |
| RF-37 | Respaldo R2 | Sí | Simulado: backup.test.cjs | R, C/P del trabajador; sin ensayo real |
| RF-38 | Programación quincenal | Sí | Simulado: backup.test.cjs | R, C/P del trabajador; sin ensayo real |

### Pendientes, mejoras opcionales y procedimiento de aceptación

1. **Navegador real pendiente.** La comprobación de disponibilidad devolvió Computer Use native pipe is unavailable (os error 2). No se ejecutó una prueba visual, de móvil, teclado real, lector de pantalla ni ausencia de solapamientos. El diseño está aprobado por el usuario; esa aprobación no se presenta como una comprobación nueva del agente. Python continúa indisponible para auxiliares de ui-ux-pro-max; no se instalaron herramientas ni se generó otro sistema visual.
2. **Recorrido visual exacto.** En entorno aislado revisar 375/768/1024/1440px, zoom 200%, Tab/Shift+Tab/Enter/Espacio, foco de login/errores, etiquetas, desplazamiento local de tablas, botones bloqueados, mensajes en espera y recuperación de conexión. Navegar los ocho módulos con ambos roles, comprobar cada acción de la matriz, campos vacíos/límites y filtros inclusivos/invertidos. No usar el negocio para escrituras de prueba.
3. **Carreras del navegador y servidor.** Las pruebas de revisión local de sesión no certifican el orden real de cookies Set-Cookie entre login/logout concurrentes ni revocación de solicitudes ya admitidas. Ensayar con navegador y servidor de prueba, pestañas independientes y conexiones MySQL separadas. Una cuenta desactivada sigue siendo rechazada por el backend en las solicitudes evaluadas.
4. **Respuesta perdida y recarga.** Ajustes y alta de pedidos conservan sus limitaciones de idempotencia persistente. La exclusión de usuarios solo evita simultaneidad de la misma sesión/pestaña: no garantiza exactamente una vez ni deduplica tras recarga. Nombres únicos y transacciones del backend permanecen. Si una respuesta de escritura se pierde, consultar el resultado/historial antes de repetir; no se añaden reintentos automáticos. Las claves de ventas/lotes/recepciones/finanzas permanecen en memoria y pueden perderse al recargar. No se certifica recuperación durable de borradores.
5. **Red bloqueada indefinidamente.** No hay cancelación/timeout uniforme para todos los fetch; un botón puede seguir ocupado mientras una petición no termina. No se introduce abortar/repetir escrituras sin una política de reconciliación. Ensayar conectividad y definir esa política sin cambiar reglas de negocio.
6. **Persistencia/volumen.** Ensayos históricos con rollback no demuestran commit y reinicio ni volumen. Mantener las pruebas independientes de caja, saldos, stock/lotes y pedidos en base de prueba, comparando lo persistido desde otra conexión. PDF mantiene limitaciones de fuente y memoria; validar nombres largos, paginación e impresión con datos ficticios. El exportador local histórico requiere comprobar Blob/descarga real sin importar esos datos a la API.
7. **Opcionales sin ejecutar.** Reorganizar Cuentas/Reportes/Usuarios, cambiar colores o reemplazar prompts son propuestas de diseño anteriores; no son defectos reproducibles que autoricen rediseñar. Se preserva la interfaz aprobada.
8. **Respaldos.** RF-37/38 implementados y simulados; siguen desactivados y sin R2 real/recuperación operativa. No se habilitaron ni ejecutaron en esta auditoría.

Dictamen: suite aislada correcta y defectos reproducidos corregidos, con diseño preservado. RF-01 a RF-36 conservan implementación, pruebas aisladas y los ensayos previos informados; no se certifica de nuevo MySQL ni producción. RF-37/38 requieren validación real autorizada. Los pendientes M/C/P/D/R impiden declarar aceptación técnica integral de producción únicamente con el conteo de pruebas.

## Preparación del cierre local — 18 de noviembre de 2026

Rama desarrollo-jose confirmada, con los cambios acumulados de código, pruebas y documentación conservados. Se revisan 27 archivos candidatos, incluida la ampliación de .gitignore a .auth-* para excluir cualquier auxiliar local de ese prefijo. .env/.env.*, output/, PDF de prueba, credenciales y respaldos permanecen excluidos; no hay archivos sensibles de esas rutas versionados. .env.example conserva vacíos sus campos de usuario/contraseña MySQL y claves/cuenta/bucket R2; Superusuario de desarrollo, respaldo y confirmación de bucket privado permanecen deshabilitados en el ejemplo.

El escaneo completo de los candidatos no encontró coincidencias con el secreto local comparado ni patrones de clave privada, token conocido o URL con credenciales. Los literales aparentes corresponden a credenciales/tokens ficticios de pruebas y claves de columnas, sin credenciales personales detectadas. Es una revisión acotada, no una garantía de detección de cualquier secreto arbitrario. No se imprimieron valores sensibles.

Verificación para cierre: npm test, **634 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes**, salida 0 (6745.6426 ms); npm audit --omit=dev --json, **0 vulnerabilidades de producción**, salida 0 tras consultar el registro fuera del entorno restringido; git diff --check sin errores. rf.txt está versionado e idéntico a HEAD; app.js, modelo.js, migraciones y dependencias no tienen cambios. UI_UX.md y este documento se incluyen con sus decisiones, matrices y limitaciones. El área de preparación estaba vacía antes del cierre y se utilizará una lista explícita de candidatos revisados.

Este cierre solo autoriza un commit LOCAL. No cambia el diseño aprobado ni constituye autorización de push, merge, migraciones, datos MySQL o R2. Las verificaciones manuales, de concurrencia, persistencia y respaldo real descritas arriba siguen pendientes para publicación/aceptación posterior.
