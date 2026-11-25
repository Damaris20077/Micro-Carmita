[Volver al README](../README.md) · [Manual técnico](MANUAL_TECNICO.md) · [Estado de QA](FINAL_QA.md#estado-documental-actual)

Los comandos de terminal, rutas literales de código, migraciones y archivos privados se interpretan desde la **raíz del repositorio**, no desde `docs/`. Los enlaces de navegación sí son relativos a este documento. Los procedimientos históricos conservan sus condiciones y autorizaciones originales; esta reorganización no autoriza ejecutarlos.

<!-- INICIO FUENTE: UI_UX.md -->

# Sistema visual de Micro Carmita

Primera fase de rediseño: 18 de noviembre de 2026. Rama desarrollo-jose. Punto de partida comprobado: bea4413, árbol limpio; las correcciones anteriores ya estaban registradas. Esta fase no crea commits.

## Alcance y dirección

Interfaz para quienes gestionan y venden en un emprendimiento pequeño: lectura clara de ventas, saldos y existencias, acciones reconocibles y navegación sin conocimientos técnicos. Se mantienen HTML/CSS/JavaScript, el menú existente y todas las pantallas. El trabajo se concentra en estilos compartidos, navegación y panel principal; cada módulo recibe esos estilos, sin reorganizar sus funciones.

El inicio actual utiliza cuatro tarjetas independientes para ventas vigentes, saldo pendiente, unidades registradas y cobros netos de ventas. Esta segunda iteración sustituye la banda con divisores de la primera fase. Las cifras permanecen en sus elementos originales y no se añaden gráficos, datos ficticios ni promesas de actualización en tiempo real. Una nota distingue ventas fiadas de cobros. La etiqueta de inventario dice «Unidades registradas», coherente con la suma que ya calcula el sistema, sin cambiarla.

Antes de implementar se revisó el plan: se conservó la identidad azul/blanca y se separaron los indicadores en tarjetas conforme al objetivo de esta iteración. Las tarjetas usan bordes suaves y sombra tenue; la sombra más intensa sigue reservada al diálogo de acceso. La jerarquía se apoya en títulos, espacio y bordes. No se añaden ilustraciones, animaciones de entrada, fuentes remotas ni bibliotecas visuales.

## Distribución

Escritorio: navegación fija azul profundo; a la derecha, sesión común y contenido alineado a la izquierda.

```text
┌──────────────────┬────────────────────────────────────────┐
│ Micro Carmita    │ Gestión del negocio   Nombre / Rol Salir│
│                  ├────────────────────────────────────────┤
│ Inicio           │ Resumen del negocio                    │
│ Ventas           │ Texto de orientación                   │
│ Cuentas          │ Ventas | Pendientes | Unidades | Cobros │
│ Inventario       │ Nota sobre ventas y cobros             │
│ ...              │ Orientación para continuar desde menú  │
└──────────────────┴────────────────────────────────────────┘
```

Móvil: navegación en flujo normal, dos columnas con nombres completos; debajo, sesión y módulo activo. No se incorpora un menú desplegable que necesite otro estado JavaScript. Las tablas extensas se desplazan dentro de su contenedor.

## Tokens CSS

La fuente de verdad es `:root` en estilos.css. No se usa un framework CSS. Los valores se comparten por los componentes, sin una segunda hoja que acumule sobreescrituras.

| Token | Valor | Uso |
|---|---|---|
| `--color-brand` | `#1769aa` | Acción principal, foco, acentos |
| `--color-brand-hover` | `#11558b` | Hover y enlaces secundarios |
| `--color-navigation` | `#12375a` | Menú y fondo del acceso |
| `--color-surface` | `#ffffff` | Formularios, tablas, indicadores |
| `--color-background` | `#f2f6fa` | Fondo general |
| `--color-text` | `#203449` | Texto principal |
| `--color-muted` | `#526477` | Texto secundario legible |
| `--color-border` | `#cbd7e3` | Separadores y paneles |
| `--color-input-border` | `#7e93a8` | Límites de campos |
| `--color-success` / `--color-success-soft` | `#17673e` / `#eaf5ee` | Disponible, pagado y acción de pago |
| `--color-danger` / `--color-danger-soft` | `#a32638` / `#fff0f1` | Errores explícitos y acciones destructivas |
| `--color-warning` / `--color-warning-soft` | `#79520a` / `#fff6df` | Pendiente y resúmenes de deuda |

Tipografía: Segoe UI, Noto Sans, Arial, sans-serif; solo fuentes disponibles en el dispositivo. Texto base 1rem, secundario .875rem, títulos de sección 1.125rem y título principal fluido entre 1.6rem y 2.125rem. Cifras con numerales tabulares; textos explicativos de hasta 72–80 caracteres aproximados de ancho.

Espaciado: `--space-1` a `--space-7` = 4, 8, 12, 16, 24, 32 y 48px con tamaño raíz de 16px. Radio de control 8px y panel 14px. Sombra de panel tenue; diálogo con sombra más profunda. Alto mínimo de botones y campos 2.75rem (44px con raíz de 16px). Los números escalan con la tipografía del usuario.

## Componentes y estados

- **Navegación:** conserva ocho botones, `data-permiso`, eventos y clase `activo`. El menú activo se distingue por fondo, borde lateral y peso; no solo por color. La barra lateral puede desplazarse verticalmente en ventanas bajas. En móvil, los botones se distribuyen en dos columnas sin elipsis.
- **Sesión:** se movió el bloque existente a una cabecera compartida antes de las secciones. `nombreSesion`, `rolSesion` y el evento de Salir se conservan una sola vez. Cerrar sesión ya no exige regresar al inicio.
- **Botones:** primarios azules, secundarios blancos o azul claro, destructivos rojos y pago verde. Hover sin desplazamientos de tamaño. Los botones creados por los clientes JavaScript reciben el mismo estilo base. Deshabilitado usa cursor de prohibición; `aria-busy="true"` usa cursor de progreso y un indicador. No se asume que todo botón deshabilitado esté cargando.
- **Formularios/filtros:** campos de 16px, borde visible, etiquetas asociadas o contenedoras existentes y foco exterior. Checkbox/radio conservan disposición en línea. No se cambian límites, obligatoriedad, valores, validaciones ni tipos de input.
- **Paneles/tablas:** superficies blancas, bordes suaves, filas alternas y encabezado fijo dentro del scroll. Las tablas conservan su contenido y acciones; el desbordamiento se contiene en `.tabla-scroll`. No se transforman los registros en tarjetas ni se reordenan columnas.
- **Mensajes:** `role=status` muestra una superficie informativa neutral cuando contiene texto. No se clasifica automáticamente éxito/error por palabras del mensaje; el error de acceso y `role=alert` usan el color de error. La lógica que publica mensajes no cambia. No se incorporan mensajes de éxito ficticios ni nuevos avisos.
- **Acceso:** mantiene formulario, contraseña oculta, IDs, envío y panel subyacente `inert`. El diálogo puede desplazarse en una ventana baja. No se modifica autenticación ni permisos.

## Adaptación y accesibilidad

| Ancho | Comportamiento previsto por CSS |
|---|---|
| Más de 1200px | Cuatro indicadores, menú lateral de 256px |
| 901–1200px | Indicadores y filtros en dos columnas |
| 701–900px | Menú de 216px, formularios en una columna |
| Hasta 700px | Menú arriba en dos columnas; contenido a todo el ancho; filtros en una columna |
| Hasta 420px | Indicadores apilados con icono lateral |

Se añadió un enlace «Saltar al contenido» dentro del panel que se habilita al iniciar sesión. Su destino es el nuevo `contenido-principal`, con tabindex=-1. Los botones nativos continúan utilizando Tab/Shift+Tab/Enter; no se les asigna un rol de menú que exija navegación artificial con flechas. Se mantiene la autorización que oculta controles. Los contornos de foco no se eliminan. `prefers-reduced-motion` desactiva animaciones/transiciones; `forced-colors` distingue el elemento activo con borde.

Contraste calculado sobre colores sólidos, no verificación visual ni certificación WCAG completa:

| Combinación | Ratio |
|---|---:|
| Texto principal / blanco | 12.74:1 |
| Texto secundario / blanco | 6.09:1 |
| Texto secundario / fondo | 5.61:1 |
| Blanco / azul principal | 5.77:1 |
| Texto del menú / fondo del menú | 10.49:1 |
| Error / fondo de error | 6.57:1 |
| Pendiente / fondo de pendiente | 6.45:1 |
| Éxito / fondo de éxito | 6.17:1 |
| Borde de campo / blanco | 3.17:1 |

Los estados mantienen texto además de color. La compatibilidad de lectores de pantalla, reflow y zoom requiere revisión manual; no se declara resuelta solo por estos ratios.

## Protección contra regresiones

[backend/ui-contract.test.cjs](../backend/ui-contract.test.cjs) contiene cinco comprobaciones: contrato de los 161 controles originales, sección de Inventario intacta, resto de pantallas de negocio intactas, contraste de tokens y navegación accesible/sesión compartida. El contrato incluye IDs, tipos, valores, límites, obligatoriedad, estados iniciales y eventos inline; excluye clases/estilos y el orden global de presentación. La primera fase añadió el destino del enlace de salto; el panel añade nodos con el prefijo inicioPanel y el botón Actualizar panel. Este espacio de nombres nuevo se excluye del contrato anterior, que mantiene la misma huella y sus 161 controles. No se reemplazó la huella para ocultar cambios. Las huellas representan el contrato anterior a este rediseño: un cambio futuro intencional debe revisarse con su JavaScript antes de actualizarlas, nunca regenerarlas solo para hacer pasar la prueba.

Inventario conserva exactamente su HTML, campos, tablas, lotes, entradas, contactos y ajustes; recibe únicamente los estilos comunes. No se modifican los clientes JavaScript operativos originales, app.js, cálculos, SQL, permisos ni RF. El backend solo incorpora el nuevo recurso estático dashboard-client.js en su lista explícita de archivos públicos; no se añade una ruta de datos. Las pruebas integradas existentes siguen ejecutando los scripts de index.html y verifican sesión, permisos y ausencia de almacenamiento paralelo.

## Validación visual pendiente

La automatización del navegador devolvió «native pipe unavailable», error del sistema 2; no se abrió el navegador ni se tomaron capturas en esta fase. Python no está instalado y el intento de `search.py --design-system` de ui-ux-pro-max falló por intérprete inaccesible. Se aplicaron las reglas de accesibilidad, espaciado y adaptación de la Skill mediante inspección y pruebas, sin afirmar que se ejecutó su generador.

Procedimiento manual sin crear operaciones reales:

1. Recargar la aplicación servida por Express. Comprobar acceso, salto al contenido, sesión, menú activo y Salir desde un módulo distinto de Inicio.
2. Revisar a 375, 768, 1024 y 1440px, ventana baja, móvil horizontal y zoom de 200/400%. Confirmar nombres completos, cifras grandes, tablas con scroll local y ausencia de desplazamiento horizontal del documento.
3. Navegar solo con teclado: foco visible, salto a contenido, Tab/Shift+Tab, activación con Enter y controles ocultos inaccesibles. Revisar lector de pantalla, título de sección y cambios de estado. La clase visual activa no añade por sí sola un anuncio dinámico de la sección actual; evaluar esta mejora en una fase posterior.
4. Con perfiles existentes y sin escrituras, confirmar que los menús del Vendedor permanecen restringidos, que los módulos se consultan y que los indicadores corresponden a los mismos registros que antes.
5. Inspeccionar Inventario completo y los controles de recepción, fechas, checkbox de finanzas y filtros; esta fase no los divide en pestañas. Revisar deshabilitado, campo de solo lectura y estado vacío. Para probar errores/carga usar un entorno de prueba o herramientas de red, evitando repetir operaciones del negocio.
6. Comprobar colores forzados, movimiento reducido, foco en botones activos, contraste en hover y funcionamiento con iconos externos bloqueados. Los nombres de acciones permanecen visibles aunque Font Awesome no cargue.

Los resultados visuales no se inventan: la aceptación del diseño queda pendiente de ese recorrido y de capturas revisadas. No se ejecutaron cambios MySQL, migraciones, respaldos/R2, commits, merge ni push.

## Resultado automatizado de la primera fase

- npm test: 577 pruebas, 577 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes; salida 0. Duración de la última suite: 7109.6631 ms. Se conservan las 573 anteriores y se añaden cuatro regresiones de UI.
- npm audit --omit=dev --json: 0 vulnerabilidades de producción; salida 0. No se instalaron dependencias.
- git diff --check: sin errores; únicamente avisos LF/CRLF.
- Archivos de la fase: index.html, estilos.css, backend/ui-contract.test.cjs y [UI_UX.md](UI_UX.md). El HEAD permanece en bea4413.
- La sección de Inventario mantiene su huella íntegra y no se cambiaron archivos JavaScript de la aplicación, backend ni requisitos.


## Segunda iteración: panel principal operativo

Rama desarrollo-jose. Se conservaron los cuatro archivos pendientes de la primera fase. Antes de modificar se ejecutó npm test: 577 exitosas, 0 fallidas, 0 omitidas y 0 canceladas (6392.9424 ms). No se creó commit, merge ni push.

### Diseño del inicio

Las cuatro tarjetas tienen separación de 16px, borde completo, radio compartido y sombra tenue. Los importes se alinean a la derecha con numerales tabulares; títulos con altura mínima de dos líneas mantienen la jerarquía. Iconos del conjunto ya instalado, sin imágenes ni biblioteca nueva. La cuadrícula conserva cuatro columnas en escritorio amplio, dos en tablet y una en móvil estrecho. Usuario, rol, Salir y menú lateral permanecen como en la primera fase.

La tarjeta genérica «Continúa desde el menú» se sustituye por «Para revisar», con cuatro bloques: stock bajo, caducidad de lotes, pedidos por recibir y últimas ventas registradas. Se apilan en una columna hasta 900px; las listas extensas tienen scroll local y foco por teclado. Las listas vacías o en carga se ocultan para evitar focos en elementos sin contenido. Los estados de carga/error/vacío son visibles y no se sustituyen por datos inventados.

El nuevo botón Actualizar panel reutiliza mostrarSeccion('inicio', ...) con el botón de menú Inicio existente. Ese recorrido conserva actualizarTodo y los cálculos/cachés originales de los indicadores. dashboard-client.js envuelve únicamente la navegación al inicio para volver a consultar los bloques operativos; no altera el comportamiento de las otras secciones ni sus eventos. El botón no crea operaciones, ventas, pedidos o recepciones.

### Fuentes, reglas y permisos

| Información | Consulta existente | Presentación y autorización |
|---|---|---|
| Stock bajo y caducidad | GET /api/inventory/alerts | Se muestran stockBajo y caducidad tal como los calcula el servicio. Se requiere permiso de inventario. No se duplica la comparación stock<3 ni el cálculo de cinco días. |
| Pedidos por recibir | GET /api/orders | Se presentan estados Pendiente y Recibido parcialmente de la respuesta. Se requiere permiso de pedidos. No se recalculan cantidades ni se cargan detalles por cada fila. |
| Últimas ventas registradas | GET /api/sales | Orden de creación descendente, máximo cinco, incluidos estados de anulación identificados como historial. Se requiere permiso de ventas. El importe se etiqueta Total de la venta; no se interpreta como caja ni se acumula al indicador de cobros. |
| Cuatro indicadores | Adaptadores originales de ventas, cuentas e inventario | Se conservan IDs, actualizaciones y cálculos anteriores; el cliente nuevo no escribe sus cifras ni crea métricas paralelas. |

Las tres consultas de datos ya están autenticadas y autorizadas por Express; el nuevo cliente comprueba además tienePermiso para no solicitar ni mostrar bloques restringidos. Administrador y Vendedor utilizan solo los endpoints de lectura que ya tenían disponibles. No se consultan Usuarios, Finanzas, Reportes ni respaldos desde este cliente. No se utiliza localStorage/sessionStorage como fuente o persistencia.

No se requiere ninguna ruta nueva de datos, consulta SQL ni migración. El único cambio de backend es permitir servir /dashboard-client.js como JavaScript público igual que los otros adaptadores, sin información ni credenciales incluidas. Los textos del panel proceden de respuestas reales durante su uso; los datos ficticios existen exclusivamente en las pruebas Node/VM no publicadas por Express.

### Estados y consistencia

- La sesión restaurada carga los bloques si Inicio está activo. Volver a Inicio o pulsar Actualizar panel los vuelve a consultar; no hay sondeo continuo ni promesa de datos en tiempo real.
- Durante la consulta, el botón queda deshabilitado y tiene aria-busy. Las peticiones simultáneas del mismo actor comparten el trabajo pendiente. La actualización no realiza POST/PATCH/DELETE.
- Cada consulta admite error independiente: un fallo en Pedidos no oculta alertas recibidas correctamente. El mensaje invita a actualizar y no imprime detalles internos del error.
- Logout o cambio de sesión invalida los resultados pendientes, limpia listas y oculta bloques. Las respuestas antiguas no repueblan el panel después de cerrar sesión.
- La caducidad muestra las etiquetas del servidor Por caducar y Caducado, con texto además de color. Las fechas utilizan el formateador es-EC existente.
- Los estados vacíos distinguen falta de alertas, ausencia de pedidos pendientes y ausencia de ventas. Un error de red no se presenta como «no hay registros».
- Las consultas se resuelven por separado; no constituyen una fotografía transaccional ni un cierre contable. Los cuatro indicadores mantienen el comportamiento previo de sus adaptadores. Si una operación cambia mientras se consulta, volver a actualizar para comparar; no se alteraron esos cálculos.

### Verificación de esta iteración

- npm test: 586 pruebas, 586 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes, salida 0 (6322.5169 ms). Se conservan las 577 previas y se añaden ocho pruebas del cliente del inicio y una de preservación del resto de pantallas.
- npm audit --omit=dev --json: 0 vulnerabilidades de producción, salida 0. Sin instalaciones ni dependencias nuevas.
- git diff --check: sin errores; avisos LF/CRLF habituales.
- Las ocho pruebas nuevas del cliente cubren permisos del Vendedor/Administrador, solicitudes solo GET, resultados del servidor sin mutación, stock negativo, vencidos y próximos, exclusión de pedidos cerrados, cinco ventas ordenadas/anuladas, escape HTML, vacíos, permisos parciales, ausencia de sesión, carga, deduplicación, logout con respuestas tardías, error parcial y recarga al volver al inicio.
- Las pruebas integradas cargan dashboard-client.js en el orden real de index.html junto con los adaptadores originales; comprueban consultas del inicio, sesión y ausencia de almacenamiento paralelo. La prueba HTTP de archivos públicos verifica que Express sirve el nuevo script.
- Los 161 controles originales mantienen la misma huella de IDs/eventos/atributos. Se añade el nuevo botón y nodos con prefijo inicioPanel. Inventario conserva su huella íntegra. Todas las secciones desde Ventas hasta Usuarios conservan su HTML completo, normalizando únicamente CRLF para comparar.

### Validación visual y pendientes

Esta iteración no obtuvo una inspección visual nueva en navegador: la conexión nativa estuvo indisponible en la comprobación previa de esta sesión. No se generan capturas ni se declara aceptación visual. Tampoco se dispuso de un intérprete Python para ejecutar el generador de ui-ux-pro-max; se reutiliza el sistema de tokens definido y sus criterios de accesibilidad. No se recibió un export o enlace inspeccionable de Stitch; se sigue la dirección estética descrita sin copiar ni sustituir su código.

Reiniciar el backend para que publique dashboard-client.js y recargar la página. Revisar a 375/768/1024/1440px con una cuenta autorizada: cuatro tarjetas independientes y legibles, usuario/rol/Salir visibles, listas con scroll de teclado, colores de estados, nombres y cantidades largos y conservación del menú lateral. Sin crear operaciones reales, contrastar los bloques con las consultas de Inventario/Pedidos/Ventas y confirmar que Vendedor no accede a información administrativa. Probar cargas lentas, error parcial y cierre de sesión con respuestas pendientes en un entorno de prueba.

Las API actuales no tienen paginación de listas para esta vista: los pedidos abiertos y alertas se muestran con scroll, y el cliente recibe la lista de ventas existente antes de seleccionar cinco. Medir volumen antes de escalar; no se añadieron consultas complejas ni límites que cambien totales del negocio. No se ejecutó un ensayo de datos reales ni escrituras MySQL; las pruebas son aisladas. Los pendientes de R2, concurrencia/persistencia e idempotencia de [FINAL_QA.md](FINAL_QA.md) siguen vigentes.

Archivos de esta iteración: index.html, estilos.css, dashboard-client.js, backend/app.js (solo recurso estático), backend/dashboard-client.test.cjs, backend/frontend-integration.test.cjs, backend/ui-contract.test.cjs, backend/auth.test.cjs y [UI_UX.md](UI_UX.md). Los cambios previos de estilos, HTML, contrato y documentación se conservaron. No se modifican clientes operativos originales, modelo.js, app.js, servicios de negocio, permisos, SQL, credenciales ni datos MySQL. Sin migraciones, respaldos/R2, commits, merge o push.

## Iteración de Gestión de Ventas — 18 de noviembre de 2026

### Alcance y referencia

Se trabaja exclusivamente en Ventas, en desarrollo-jose, conservando los cambios pendientes del inicio y del sistema visual. No se encontraron archivos identificables del prototipo Stitch/Terminal POS en la búsqueda del proyecto (excluidos dependencias, Git y output); no se inspeccionó una referencia de Stitch. La dirección sigue los tokens existentes y la estructura solicitada. La línea base comprobada antes de editar fue de 586 pruebas exitosas, frente a las 577 reportadas en el contexto.

La composición reserva el énfasis para el total y Registrar venta. No se añaden indicadores ficticios, gráficos, QR, promociones, métodos de pago ni controles decorativos. Se mantienen Segoe UI/Noto Sans/Arial: títulos claros, etiquetas pequeñas, cuerpo de 16px e importes con numerales tabulares. Paleta heredada: azul de acción #1769aa, navegación #12375a, superficie #ffffff, fondo #f2f6fa, texto #203449 y borde #cbd7e3. Los estados reutilizan los tokens semánticos existentes y siempre llevan texto.

```text
Gestión de Ventas                 Actualizar / Limpiar carrito
┌ Preparar venta ────────────┐    ┌ Carrito de la venta ─────────┐
│ Cliente       Tipo        │    │ Productos / importes        │
│ Producto                  │    │ Total de la venta           │
│ Precio        Cantidad    │    │ Estado de la operación      │
│ Agregar al carrito        │    │ Registrar venta             │
└───────────────────────────┘    └─────────────────────────────┘
┌ Ventas registradas: historial, estados y acciones ────────────┐
└─────────────────────────────────────────────────────────────┘
```

### Disposición y accesibilidad

- En escritorio amplio, selección y carrito ocupan dos columnas (1:1,15), alineadas arriba. Producto ocupa una fila completa; cliente/tipo y precio/cantidad comparten filas. El total azul sobre superficie clara y el botón de ancho completo forman el punto de confirmación.
- A 1100px o menos se apilan selección y carrito; a 480px se apilan también los campos y las herramientas. La altura crece con el contenido. No se fija el carrito ni se altera el menú lateral.
- El historial queda debajo de las dos columnas. Contado/fiado y Activa/Anulada tienen etiquetas distintas, importes alineados y acciones separadas. Las ventas anuladas conservan Detalle; Modificar/Anular siguen sujetos al mismo rol y estado.
- Se conserva el foco visible global y el tamaño mínimo de controles existente. Las tablas conservan su semántica y scroll local con tabindex y nombre accesible, evitando imponer el ancho de la tabla a la página. Los textos largos pueden envolver; las columnas completas siguen accesibles mediante scroll cuando sea necesario.
- Todos los estilos nuevos se limitan a #ventas. Se conserva el HTML completo fuera de Ventas, incluidos Inventario, Cuentas y el inicio; se comprueba con huellas previas. No se rediseñan esos módulos.

### Estados y contrato funcional

Se mantienen los 161 controles originales con sus IDs, eventos y atributos funcionales. Solo se añaden agrupaciones, clases, atributos de presentación y acceso por teclado a los contenedores de tabla. El carrito y total originales siguen siendo la única fuente en memoria de la operación. No se incorpora almacenamiento local ni estados alternativos del negocio.

sales-client.js cambia la presentación de las filas y los mensajes. Los botones de herramientas, agregar, registrar y acciones del historial reflejan el bloqueo ocupado existente mediante disabled/aria-busy. Se muestran carga, error, éxito y vacío; el error de registro se desplaza a la vista junto a la acción. Si el servidor confirma la venta pero falla la consulta posterior, el mensaje distingue que fue guardada e indica actualizar sin registrarla otra vez. El fin de una consulta de detalle no deja un estado de procesamiento permanente. Logout limpia los mensajes y deshabilita los controles sin sesión.

Se conservan los métodos/rutas, cuerpos de solicitud, reglas de validación, permisos, versiones, claves de idempotencia y comprobaciones de identidad/orden de respuesta. No se cambian consultas SQL, cálculos de ventas/cobros, FEFO, stock, caducidad, abonos, reembolsos ni trazabilidad. El adaptador compartido de ventas/cobros conserva las operaciones y el renderizado de Cuentas; los nuevos mensajes y estilos pertenecen a Ventas.

### Verificación

- npm test final: **596 pruebas, 596 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes**, salida 0; duración 7034.4208 ms. Se conservan las 586 de la línea base y se añaden diez.
- Diez regresiones nuevas: estructura/parentesco de columnas e historial; conservación del HTML externo y CSS compartido; contrato adaptable/scroll/total; carga y vacío; bloqueo y POST único; validación con carrito conservado; venta guardada con refresco fallido; etiquetas y acciones por rol; fin de carga y logout; descarte de mensaje de respuesta obsoleta. Se mantienen las pruebas previas de reintentos e idempotencia, fechas, permisos y trazabilidad.
- backend/ui-contract.test.cjs conserva la huella de los 161 controles e Inventario. La comparación de otras pantallas se delimita ahora desde Cuentas, y la prueba nueva protege también todo el HTML anterior a Ventas. No se actualiza la huella de controles para admitir pérdidas.
- npm audit --omit=dev --json: **0 vulnerabilidades de producción**, salida 0. La primera consulta falló por acceso al registro en el entorno restringido; la repetición autorizada obtuvo el informe. Sin instalaciones ni dependencias nuevas.
- git diff --check: sin errores de formato; avisos habituales de conversión LF/CRLF. No se realizaron operaciones MySQL, migraciones, respaldos/R2, commits, merges ni push.

Archivos de esta iteración: index.html, estilos.css, sales-client.js, backend/sales-client.test.cjs, backend/sales-layout.test.cjs (nuevo), backend/ui-contract.test.cjs y [UI_UX.md](UI_UX.md). Los demás archivos pendientes pertenecen al trabajo previo y se conservan.

### Aceptación visual pendiente

El acceso nativo al navegador falló con «Computer Use native pipe is unavailable» (os error 2). No se inspeccionó la pantalla renderizada ni se obtuvieron capturas. Las regresiones Node/VM y de DOM/CSS no demuestran medidas reales, contraste en cada navegador ni aceptación táctil. Sigue sin estar disponible el intérprete Python de los auxiliares de ui-ux-pro-max; se aplicaron sus criterios de accesibilidad y disposición con las herramientas existentes.

En un entorno de prueba, recargar sin caché y revisar a 375/768/1024/1440px y zoom 200%: columnas/apilado, total visible, foco de teclado, herramientas largas, nombres largos y scroll local sin desbordamiento de página. Con Administrador y Vendedor comprobar Detalle y acciones permitidas, contado/fiado, Activa/Anulada, carrito vacío/múltiples líneas, edición/cancelación, carga lenta y errores. Verificar registro único y mensaje de guardado con consulta fallida usando API simulada o una base de prueba; no crear ventas de ensayo en el negocio. No se afirma una nueva validación contra MySQL real. Los riesgos generales de [FINAL_QA.md](FINAL_QA.md) permanecen pendientes según su propio alcance.

## Iteración de Ingresos y egresos — 18 de noviembre de 2026

### Dirección y alcance

Rediseño exclusivo de #movimientos en desarrollo-jose. Se conservan los cambios pendientes del inicio, Ventas y el sistema compartido. Línea base ejecutada: 596 pruebas exitosas. No se usa código de Stitch ni se afirma haber inspeccionado su prototipo.

Se sigue la identidad existente: azul de acción #1769aa, navegación #12375a, blanco #ffffff, fondo #f2f6fa, texto #203449 y borde #cbd7e3. Se mantiene Segoe UI/Noto Sans/Arial, cuerpo de 16px, etiquetas pequeñas y numerales tabulares para importes. Los tokens semánticos distinguen ingresos, egresos y saldo negativo mediante color y texto. El énfasis se reserva al registro y al saldo consultado; no se incorporan gráficos, métricas estáticas ni decoraciones sin función.

Antes de construir se revisó el plan contra el alcance: se optó por un formulario compacto de filas claras y un historial completo debajo, sin convertir cada campo en una tarjeta ni reorganizar otras pantallas. La composición alinea las etiquetas a la izquierda y las cifras a la derecha.

```text
Registrar movimiento
Tipo de movimiento       Valor
Descripción (ancho completo)
Categoría / origen       Fecha
Gasto administrativo (egreso)
Mensaje                  Registrar movimiento

Movimientos registrados
Desde       Hasta        Consultar    Todas las fechas
Mensaje de consulta
Ingresos          Egresos          Saldo neto
Tabla: tipo/origen, descripción/responsable, valor, fechas
```

### Componentes y estados

- Formulario de dos columnas cuando hay espacio; Descripción y Gasto administrativo ocupan la fila completa. La confirmación queda al final, separada por espacio y borde. El checkbox conserva su asociación de etiqueta y funcionamiento, sin activación automática ni cambios en la validación del servidor.
- Barra de filtros con separación explícita. Desde/Hasta siguen enviando ISO; Consultar y Todas las fechas conservan sus handlers originales. A 1100px o menos los filtros se distribuyen en dos columnas; a 600px o menos se apilan campos, filtros y resúmenes, y Registrar ocupa el ancho disponible.
- Ingresos, Egresos y Saldo neto se muestran en tres bloques de lectura dentro del mismo resumen existente. Se usan exclusivamente r.ingresos, r.egresos y r.neto de la API, formateados por dinero; no se vuelven a sumar movimientos ni cobros de ventas/abonos. El signo del neto solo determina su estilo.
- La tabla conserva tipo, origen, categoría, motivo, marca de gasto administrativo, responsable, identificador, importe, fecha de operación e instante de registro. Las fechas reutilizan los formateadores ecuatorianos existentes. Importes alineados y descripción separada de los metadatos. Los valores se escapan antes de insertarlos en HTML.
- Se muestra un vacío explícito para consultas exitosas sin movimientos. Ante error se limpian los importes y filas anteriores y se indica reintentar con Consultar; el error se distingue de un resultado vacío.
- estadoFinanzas continúa junto a los filtros. Se añade finanzaRegistroEstado, con role=status/aria-live, junto a Registrar para separar la confirmación o error de escritura de la consulta del historial. Los mensajes tienen texto y color, sin depender solo del color.
- El botón Registrar refleja el bloqueo ocupado existente con disabled y aria-busy; los filtros hacen lo mismo durante su consulta. No se añade un segundo estado financiero. Se mantienen las claves de idempotencia y los reintentos de respuestas perdidas, así como los guardas de identidad y orden de respuesta. Si el movimiento se guardó y la consulta falla después, se confirma el guardado y se indica no registrarlo otra vez.
- La tabla conserva scroll local con nombre accesible y tabindex para teclado. Se reutilizan foco visible, contraste, reducción de movimiento y tamaños mínimos del sistema compartido.

### Preservación y pruebas

Se mantienen los 161 controles originales con sus IDs, tipos, eventos y atributos funcionales: su huella sigue intacta. La única incorporación con ID es el mensaje finanzaRegistroEstado, comprobado por las regresiones nuevas. No se cambian endpoints, cuerpos de solicitud, permisos, validaciones financieras, fórmulas, lógica de ventas/abonos, backend ni almacenamiento MySQL. No hay localStorage paralelo.

backend/finance-layout.test.cjs protege con huellas anteriores todo el HTML fuera de Finanzas y todo el CSS previo, incluidos Ventas, inicio y menú. Comprueba parentesco y orden de los seis campos, posiciones de mensajes/acciones, filtros, tabla y reglas adaptables. Las pruebas de preservación anteriores se delimitan para permitir esta iteración en Finanzas; se conserva la protección de controles, Inventario y las demás pantallas. No se debilita ni actualiza la huella de los controles originales.

Se añaden ocho pruebas del cliente: carga/vacío y desbloqueo, cifras del servidor sin recálculo y escape HTML, registro único con confirmación, validación conservando campos, guardado seguido de error de lectura, error frente a vacío, consultas obsoletas y limpieza/bloqueo tras logout o para Vendedor. Las seis pruebas financieras previas siguen pasando, incluidos filtros, idempotencia, fechas y ausencia de almacenamiento local. La integración con los scripts reales de index comprueba ahora el mensaje de consulta completada.

Resultados finales:

- npm test: **607 pruebas, 607 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes**, salida 0; duración 6797.1509 ms. Se conservan las 596 iniciales y se añaden once regresiones.
- npm audit --omit=dev --json: **0 vulnerabilidades de producción**, salida 0. La primera consulta no pudo acceder al registro dentro del entorno restringido; la repetición autorizada obtuvo el informe. No se instalaron dependencias.
- git diff --check: sin errores; avisos habituales LF/CRLF.

Archivos de esta iteración: index.html, estilos.css (solo reglas nuevas de #movimientos), finance-client.js, backend/finance-client.test.cjs, backend/finance-layout.test.cjs (nuevo), backend/frontend-integration.test.cjs, backend/sales-layout.test.cjs, backend/ui-contract.test.cjs y [UI_UX.md](UI_UX.md). Los cambios en pruebas compartidas ajustan los límites de preservación y el mensaje esperado; no modifican otros módulos de la aplicación. Se conservan los demás cambios pendientes. Sin operaciones MySQL, migraciones, cambios de rama, commits, merges ni push.

### Revisión visual pendiente

La conexión al navegador devolvió «Computer Use native pipe is unavailable» (os error 2), por lo que no se obtuvo una inspección renderizada ni capturas. Python sigue sin poder ejecutarse desde el alias de WindowsApps; no se ejecutó el generador auxiliar de ui-ux-pro-max ni se instalaron herramientas. Se aplicaron sus criterios de accesibilidad e interacción sobre los tokens existentes. Las pruebas Node/VM y de estructura/CSS no sustituyen la validación visual.

En un entorno de prueba, revisar a 375/768/1024/1440px y zoom 200%: orden de filas, checkbox y etiqueta pulsables, foco con Tab/Shift+Tab, separación de filtros, resumen de importes largos/negativos y scroll de tabla sin desbordamiento de página. Comprobar vacío, errores, carga lenta, validaciones y confirmación del registro mediante API simulada o base de prueba, sin crear movimientos reales del negocio. Probar pérdida de respuesta, consulta posterior fallida y logout con solicitudes pendientes. Vendedor debe conservar la restricción del módulo; no se hizo una nueva comprobación contra MySQL real. Los riesgos generales registrados en [FINAL_QA.md](FINAL_QA.md) siguen fuera de esta iteración.

## Revisión coordinada — primer bloque, 18 de noviembre de 2026

### Auditoría global y prioridades

Rama desarrollo-jose; línea base 607/607. Se revisaron rf.txt (38 líneas), la estructura de los ocho módulos, estilos, adaptadores frontend y las comprobaciones de [FINAL_QA.md](FINAL_QA.md). No se encontraron las ocho capturas ni exportaciones identificables de Stitch entre los archivos del proyecto, incluido output; tampoco llegaron como adjuntos. Esta matriz procede de inspección de código y pruebas aisladas, no de comparar capturas o de una revisión renderizada. La longitud de una página completa no se considera un defecto.

| Área | Evidencia y clasificación | Prioridad | Resultado de este bloque |
|---|---|---|---|
| Compartidos | Acciones de consulta/archivo/cancelación con estilos semejantes; faltan agrupaciones de acciones y estados explícitos en algunos clientes. Diseño/retroalimentación. | Alta | Componentes reutilizables para acciones por fila, peligro, ayuda, registros y mensajes tipados; usados en Inventario/Pedidos. |
| Inicio | Tarjetas y bloques operativos ya definidos; falta aceptación visual tras cambios compartidos. | Baja | HTML y cliente preservados. |
| Ventas | Columnas, carrito y estados ya definidos; revisión visual pendiente. | Baja | HTML y cliente preservados en esta iteración. |
| Cuentas | Selector e historial dentro de cabecera; deuda/abonos requieren mejor jerarquía y separación. Diseño. | Media | Pendiente de siguiente bloque; HTML intacto y deudas filtradas conservadas. |
| Inventario | Tablas vacías sin orientación; alertas continuas y controles sin reflejo del bloqueo interno. Diseño/retroalimentación. | Alta | Vacíos, alertas por línea, etiquetas de estado, acciones diferenciadas, ayudas y bloqueo visible. Se mantienen todas las secciones en vertical. |
| Pedidos | Nuevo pedido/lista/recepción requieren separación; falta orientación sin selección. Diseño. | Alta | Tres tareas diferenciadas, ayuda sin selección, tablas navegables y botones diferenciados. |
| Pedidos | Tras cargar un pedido, un fallo al seleccionar otro dejaba filas e historial antiguos visibles; un fallo de lista posterior al logout podía publicar un mensaje antiguo. Defectos funcionales de presentación/sesión. | Alta | Limpieza previa a selección y guarda de identidad en el error de lista, con regresiones. Sin cambios a escrituras. |
| Finanzas | Formulario, filtros, resumen y estados ya definidos; falta revisión renderizada. | Baja | HTML y cliente preservados. |
| Reportes | Filtros y exportación agrupados; inicio/carga todavía poco explícitos; muestra Generado UTC como fecha técnica. Diseño. | Media | Pendiente; no se alteran consultas ni PDF. |
| Usuarios | Desactivar usa btn-pagar; campos de alta y modificación por prompts requieren mensajes más claros. Diseño. | Media | Pendiente; no se tocan credenciales ni permisos. |

### Decisión visual antes de construir

Se conserva la paleta de seis bases (acción #1769aa, navegación #12375a, blanco #ffffff, fondo #f2f6fa, texto #203449 y borde #cbd7e3), fuente Segoe UI/Noto Sans/Arial y escala de espaciados. La alineación sigue a la izquierda para contenido y etiquetas, con numerales tabulares en existencias e importes. Bordes azules distinguen la tarea de alta/recepción; el color semántico se reserva para acciones y estados con texto. No se cambian el menú ni los tokens.

```text
Inventario                    Pedidos
Alta de producto              Nuevo pedido (Administrador)
Productos y alertas           Lista de pedidos: Ver y recibir
Lotes y caducidad              Recepción del pedido seleccionado
Entrada / ajuste              Ayuda cuando no hay selección
Historial                     Historial de recepciones
Clientes / proveedores
```

El plan se contrastó con el alcance: se conserva el flujo vertical de Inventario y no se añaden pestañas para reducir una captura. Tampoco se añaden métricas, filtros o acciones ficticias. Los componentes compartidos se incorporan por clases explícitas, sin cambiar la estructura de las pantallas ya renovadas.

### Primer bloque implementado

- Botones secundarios de consulta/edición y de peligro para Archivar/Cancelar, conservando exactamente sus handlers y confirmaciones. Se mantiene la base azul de primarios, deshabilitado, foco y carga ya existente. El nuevo estilo peligro es reutilizable, pero no se cambian acciones de Usuarios en este bloque.
- acciones-fila permite envolver acciones con separación y sin márgenes contradictorios. texto-ayuda y registro-texto unifican ayudas e historiales de texto existentes, sin perder contenido. Los mensajes usan data-estado explícito; no se infiere severidad por palabras.
- Inventario conserva orden, campos, reglas, formularios de entrada/ajuste, catálogo, lotes, historial, clientes y proveedores. Se añaden ayudas, vacíos tras consultas exitosas, etiquetas de stock/caducidad según los valores remotos y alertas separadas por línea. No se recalculan umbrales ni se cambian existencias. Archivar conserva historial y usa su misma petición.
- El bloqueo operacionActiva existente se refleja en botones de Inventario; errores se anuncian y se llevan al foco visible mediante el estado existente. Se conservan las claves y firmas de lotes y el aviso de reconciliación de respuestas perdidas.
- Pedidos conserva sus tres tareas en el mismo orden. La ayuda sin selección explica Ver y recibir; se oculta únicamente cuando una consulta válida selecciona un pedido. El título de la región vuelve a Seleccione un pedido al cambiar de sesión, manteniendo su nombre accesible. Crear/recibir, validaciones, lote opcional, FEFO posterior, estados y claves de recepción no se modifican.
- Durante escrituras se deshabilitan los botones del módulo utilizando ocupado. Registrar recepción conserva su bloqueo específico por estado del pedido. Las cantidades y datos de recepción siguen viniendo del backend. Se agregan vacíos reales en lista y borrador.
- Se retiran filas/historial del pedido anterior al iniciar otra selección para evitar atribuir datos antiguos a un fallo de lectura; el fallo mantiene la recepción deshabilitada. El catch de la lista comprueba la identidad antes de publicar un error posterior a logout.
- Cinco contenedores de tabla (dos de Inventario y tres de Pedidos) tienen nombre accesible y acceso por teclado para su scroll local. En móvil los botones de formulario ocupan el ancho disponible y las acciones de fila envuelven. La estructura de tabla y los campos de recepción permanecen completos.

### Verificación y límites

Resultado final: **npm test 619 pruebas, 619 exitosas, 0 fallidas, 0 omitidas, 0 canceladas y 0 pendientes**, salida 0, duración 6780.8045 ms. Se conservan las 607 previas y se añaden doce: tres de Inventario, cinco de Pedidos, una de enlaces de eventos estáticos y tres de preservación/estructura/componentes.

Las pruebas cargan los scripts reales para comprobar que los eventos estáticos de index resuelven funciones existentes; no invocan escrituras reales. Se comprueban bloqueos y liberación, vacíos, etiquetas, escape, permisos conservados, limpieza de selección y error tardío. Las regresiones previas mantienen validaciones, respuestas obsoletas, fechas, generación de lotes y reintentos/idempotencia. La obligatoriedad de campos no se convierte en required indiscriminadamente: estos controles usan los validadores existentes de cliente/servicio y no se alteran sus reglas.

La huella de los 161 controles originales permanece idéntica. Se sustituye la comparación de todo el HTML de Inventario por comprobaciones de sus secciones/controles, porque su presentación ahora está autorizada a cambiar. Nuevas huellas tomadas antes de editar protegen todo el HTML fuera de Inventario/Pedidos y todo el CSS anterior; las pruebas de Ventas/Finanzas protegen sus secciones completas. No se actualiza la huella original de IDs/eventos para admitir pérdidas.

npm audit --omit=dev --json: **0 vulnerabilidades de producción**, salida 0, tras repetir la consulta al registro fuera del entorno restringido. git diff --check: sin errores, solo avisos habituales LF/CRLF. No se instalaron dependencias. No hubo MySQL, migraciones, respaldos/R2, cambios de rama, commits, merges ni push.

Archivos de esta iteración: index.html, estilos.css, inventory-client.js, orders-client.js; backend/inventory-client.test.cjs, backend/order-client.test.cjs, backend/frontend-integration.test.cjs, backend/ui-contract.test.cjs, backend/sales-layout.test.cjs, backend/finance-layout.test.cjs; nuevo backend/shared-ui.test.cjs; [UI_UX.md](UI_UX.md) y [FINAL_QA.md](FINAL_QA.md). Los cambios previos permanecen pendientes y se conservan.

### Punto de parada para revisión visual

El navegador volvió a fallar con Computer Use native pipe is unavailable (os error 2). No se obtuvieron capturas ni se verificaron medidas, ausencia de desbordamientos/solapamientos, interacción táctil o recorrido de foco real. Python sigue sin estar disponible para el generador auxiliar de ui-ux-pro-max; no se instalaron herramientas. Se aplicaron sus criterios de accesibilidad con Node y los tokens existentes.

Antes de otro bloque, revisar exclusivamente este resultado a 375/768/1024/1440px y zoom 200%: todas las secciones de Inventario accesibles, alertas legibles, ayudas y registros largos, Tab/Shift+Tab, tablas con desplazamiento local, separación de tareas en Pedidos y aviso sin selección. Con datos simulados/base aislada comprobar errores y bloqueo, elegir dos pedidos seguidos, selección fallida y logout con consultas pendientes; confirmar que el Vendedor conserva recepción y consulta sin alta/cancelación ni ajustes. No ensayar escrituras con los registros reales del negocio.

Después de esa revisión quedan Cuentas, Reportes y Usuarios. No se declara la interfaz global terminada ni se rehacen Inicio/Ventas/Finanzas. La prevención visual de doble clic no resuelve por sí sola la idempotencia persistente de ajustes/alta de pedidos ni la pérdida de claves al recargar; siguen vigentes P-02/P-03 y los pendientes de R2, concurrencia y persistencia de [FINAL_QA.md](FINAL_QA.md).

## Auditoría funcional sin rediseño — 18 de noviembre de 2026

El usuario aprueba la apariencia actual; las propuestas visuales anteriores quedan como opcionales y no son autorización para otro rediseño. Esta iteración conserva íntegros index.html y estilos.css, verificados por backend/approved-design.test.cjs, y la huella anterior de los 161 controles. No se cambian colores, distribución, componentes ni handlers del HTML.

Decisiones de usabilidad: las operaciones de usuarios reflejan un bloqueo de envío en sus botones existentes y conservan los campos ante rechazo; los reportes muestran carga y bloquean su acción durante la petición, liberándola al terminar. Una respuesta de reporte/PDF cuyos filtros cambiaron se descarta y solicita volver a consultar/descargar. Sesiones y listas tardías no sustituyen una sesión/consulta más reciente. Estas correcciones usan los componentes existentes y no cambian consultas ni reglas financieras. Evidencia, resultados y pendientes están en la auditoría funcional de [FINAL_QA.md](FINAL_QA.md).

El navegador continúa sin conexión nativa (os error 2): no se declara una nueva aceptación visual ni validación real de teclado/táctil/lector de pantalla. Las comprobaciones de DOM/CSS no sustituyen revisar a 375/768/1024/1440px, zoom 200%, foco tras login/error, tablas y controles largos. La revisión no requiere un nuevo sistema visual ni instala herramientas para generarlo; se respetan los tokens aprobados y los criterios de accesibilidad de ui-ux-pro-max.

## Archivo/reactivación y recarga — 18 de noviembre de 2026

Se conserva el diseño aprobado, sin cambios en index.html, estilos.css, estructura o IDs. La lista de Inventario ya incluye archivados: ahora su estado dice Archivado y el Administrador ve Reactivar con el componente secundario existente; Archivar mantiene el estilo de peligro. Editar la ficha de un archivado no lo reactiva implícitamente. No existe eliminación definitiva. Archivar exige stock cero por la regla existente del backend; se explica el rechazo y se conserva la confirmación, lotes, historial y relaciones. Tras un cambio se solicita una lista nueva y se anuncia éxito/error, distinguiendo guardado de fallo de refresco.

La última sección se conserva por pestaña en sessionStorage bajo micro-carmita-vista, con solo identificador interno del usuario y nombre de sección, sin datos de negocio ni credenciales. Se valida con la identidad/permisos obtenidos del backend y la existencia del módulo. Tras F5/Ctrl+F5 se intenta restaurar; si no corresponde, Inicio. Logout/401 limpian la clave y login explícito inicia una navegación nueva. Almacenamiento bloqueado no impide usar el menú.

En una carga nueva se limpian los campos de creación, sin borrar registros ni tocar login/filtros/recepción. Se restauran valores predeterminados y la fecha operativa de hoy en Ecuador. No se limpia al cambiar de módulo ni al retornar por bfcache, para conservar edición en curso. El navegador o extensiones pueden restaurar/autocompletar campos pese a autocomplete=off; la corrección distingue ese estado de los registros realmente recuperados de la API.

Resultado: npm test 652/652, sin fallidas/omitidas; auditoría de producción 0 vulnerabilidades; diff --check sin errores. Las pruebas de diseño íntegro y los 161 controles originales se conservan. Evidencia detallada y 18 nuevas regresiones en [FINAL_QA.md](FINAL_QA.md). La conexión al navegador sigue indisponible: quedan pendientes F5/Ctrl+F5, autocompletado, foco real y archivo/reactivación con datos ficticios en un entorno de prueba. No se afirma una nueva validación MySQL real ni se realizan commits, migraciones o R2.


## Gestión de clientes en Ventas — 19 de noviembre de 2026

El formulario/listado único de Clientes se traslada íntegro desde Inventario a Gestión de Ventas, entre la terminal (selección/carrito) y el historial de ventas. Se conservan clientesNombre, clientesIdentificacion, clientesTelefono, clientesDireccion y listaClientes, sus etiquetas, límites y evento de Registrar cliente. El título pasa a Gestión de clientes. No hay modal ni segundo formulario; Inventario conserva todos sus otros formularios, lotes, archivo/reactivación y proveedores.

Junto al selector existente se añade + Nuevo cliente, con el botón secundario actual. Desplaza hasta Nombre y lo enfoca, sin limpiar carrito, tipo de venta ni cantidades. La fila del selector admite envolver y se apila en móvil, usando únicamente tokens existentes. Se añade estadoClientes con anuncio accesible junto al registro. Se conservan los 161 controles originales; los únicos controles/nodos adicionales identificados en sus contratos son ese mensaje y el nuevo acceso rápido.

Ventas mantiene la única caché de clientes en memoria para listado, selector de ventas e historial por cliente de Cuentas. Inventory deja de consultar/pintar Clientes; su contacto('clientes') se conserva como delegación al registro de Ventas para no romper el evento. No hay endpoint nuevo, cambio de permisos ni almacenamiento local paralelo. Administrador y Vendedor conservan GET/POST /api/clientes.

Al registrar se bloquean botones mediante la operación de Ventas existente. Los campos se conservan ante rechazo. Solo una respuesta con registro.id entero positivo permite seleccionar automáticamente el nuevo cliente; no se infiere por nombre. Si el usuario cambió de selección mientras esperaba, se conserva esa elección. Sin ID se actualiza catálogo y se invita a seleccionar manualmente. Una escritura confirmada con lectura fallida no invita a repetir el POST. Las respuestas de clientes anteriores al alta o a un cambio de sesión no sustituyen el catálogo actualizado. No se cambian fiados, Consumidor final, importes, stock, FEFO ni abonos.

La limpieza de creación en auth-client.js incluye ahora los inputs trasladados a Ventas; sigue sin ejecutarse al cambiar de módulo. La restauración previa de Ventas tras F5 permanece, y su carga autenticada consulta el mismo catálogo para lista y selector. Las pruebas de sesión/restauración anteriores siguen pasando.

Resultado: 665 pruebas exitosas, 0 fallidas/omitidas; 0 vulnerabilidades de producción; diff --check sin errores. Se añaden trece regresiones (ocho de cliente de ventas, tres de ubicación/contrato y dos de integración). Las huellas de presentación se delimitan a esta reorganización autorizada: conservan el HTML de las otras seis pantallas, el historial de ventas completo y todo el CSS anterior. La huella de los 161 controles originales permanece intacta.

Pendiente manual: navegador nativo indisponible (os error 2); comprobar separación entre carrito, Clientes e historial, nombres largos, envoltura del selector/botón, foco, Tab y tamaños 375/768/1024/1440px. En entorno de prueba revisar alta para ambos roles, campos ante error, selección por ID, carrito intacto y F5/Ctrl+F5 en Ventas. No se declara aceptación visual nueva ni ensayo MySQL real. No hubo commits, migraciones ni escrituras sobre el negocio.


## Identificadores visibles — 19 de noviembre de 2026

Se revisan los ocho módulos sin rediseñar ni alterar datos. Clientes y Proveedores muestran nombres sin prefijo numérico interno. Se conserva el teléfono ya disponible; en nombres repetidos se añade contexto comercial existente (identificación, teléfono y/o dirección), tanto en listado como en selectores. No se cambia ningún value. Si dos registros carecen de datos que los distingan, la etiqueta lo advierte; no se inventa una identidad ni se utiliza automáticamente el ID como nombre.

El borrador de pedido muestra el nombre del producto en vez de productoId; la cabecera cambia únicamente de Producto ID a Producto. El POST conserva productoId. El historial de cliente usa su nombre del catálogo o un título genérico si no está disponible, sin inferir un nombre desde el número. Finanzas deja de mostrar claves internas compuestas de movimiento. Reportes HTML omite columnas técnicas de cliente/producto/movimiento donde ya existen nombres/conceptos, conservando intacta la respuesta y sus cálculos.

Se conservan números de venta, pedido, recepción y abono, códigos de lote, precios, cantidades, fechas y usuarios. En detalle de venta se prefiere el código de lote del catálogo existente, incluidos archivados; si no se dispone de código, se conserva la referencia numérica histórica para no perder trazabilidad. El diálogo heredado de edición de producto sigue requiriendo un número de proveedor: se mantiene ese valor y se muestran ahí sus opciones identificadas para que quitar IDs del catálogo no vuelva imposible editar. Esta es una excepción funcional explícita, no un ID decorativo en los listados. Los PDF originales no cambian: su presentación depende del backend y conserva sus referencias previas.

No hay cambios de CSS, layout, atributos, IDs HTML, permisos, endpoints o SQL. Las funciones de etiqueta y consulta de nombres/códigos solo leen los catálogos ya cargados. Resultado: 673 pruebas exitosas, 0 fallidas/omitidas; 0 vulnerabilidades de producción; diff --check correcto. Se añaden ocho regresiones de etiquetas/selección/DTO y referencias conservadas. Las pruebas de preservación de HTML admiten únicamente el cambio de una cabecera de texto; los 161 contratos originales se mantienen.

Pendiente manual: navegador nativo indisponible (os error 2). Revisar Clientes/Proveedores con nombres únicos y repetidos, selección correcta, ficha de proveedor, nombre del producto en borrador, números de venta/pedido, códigos de lote y reportes HTML. Revisar homónimos sin datos de contacto: sin información distintiva real, las etiquetas no pueden garantizar desambiguación. No se hicieron escrituras MySQL ni commits.

<!-- FIN FUENTE: UI_UX.md -->
