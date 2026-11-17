# Línea base de Micro Carmita — Fase 0

Fecha de verificación: 16 de noviembre de 2026, America/Guayaquil.

Commit de referencia: `43667ae`, rama `main`. Esta línea base queda pendiente de revisión y de registro en Git.

## Reproducción y resultados

Entorno verificado con Node.js `v26.10.0` y npm `11.11.0`.

```bash
npm test
```

El script ejecuta `node --test modelo.test.cjs app.test.cjs`.

| Resultado | Cantidad |
| --- | ---: |
| Pruebas ejecutadas | 46 |
| Exitosas | 46 |
| Fallidas | 0 |
| Omitidas | 0 |
| Canceladas | 0 |
| Pendientes declaradas por el ejecutor | 0 |

Código de salida `0`. Duración observada de `205.4865 ms`. Sin errores técnicos durante la ejecución.

## Archivos examinados y alcance

| Archivo | Uso en la revisión |
| --- | --- |
| `package.json` | Configuración y cambio exclusivo del script `test` para ejecutar ambas suites. |
| `modelo.test.cjs` | 14 pruebas de reglas del modelo, inventario, caducidad, crédito, abonos, permisos y validación de estado. |
| `modelo.js` | Implementación ejercitada por la suite del modelo. |
| `app.test.cjs` | 32 pruebas de caracterización de ventas, cobros, sesiones, permisos e inventario. |
| `app.js` | Código real ejercitado en contextos aislados de `node:vm`. |
| `index.html` | Confirmación de que carga únicamente `app.js`, mediante la etiqueta script de la línea 531. |
| `README.md` | Contraste de reglas documentadas y alcance del prototipo. |

Las pruebas de aplicación utilizan DOM mínimo y localStorage simulados en memoria. Cada caso prepara datos independientes. La persistencia se comprueba recuperando los datos serializados en otro contexto. Las funciones de negocio reales se ejecutan sin reemplazarlas por simulaciones.

Las pruebas de caracterización registran el comportamiento actual. El resultado exitoso de la suite deja pendientes las diferencias funcionales descritas abajo. La suite del modelo ejercita una implementación separada de la utilizada por la interfaz. Esta verificación utiliza Node.js y deja pendiente la validación integral en un navegador y la futura integración con Express y MySQL.

## Diferencias conocidas

Los códigos RF de esta sección corresponden a la identificación indicada por el responsable del proyecto en esta revisión. El documento original completo de los 38 requisitos funcionales sigue pendiente de contraste con los archivos disponibles.

| Referencia | Comportamiento actual y diferencia pendiente |
| --- | --- |
| RF-03, gestión de usuarios | Administrador carece del permiso `usuarios`. Se bloquean creación, activación/desactivación y acceso a esa sección. La definición acordada asigna la gestión de usuarios del negocio al Administrador. La prueba conserva el bloqueo actual como caracterización. |
| RF-06, stock negativo | `registrarVenta()` rechaza una venta cuando las existencias actuales son insuficientes, conservando almacenamiento y carrito. Permitir stock negativo y su conciliación posterior sigue pendiente en la aplicación. `modelo.js` ya tiene una regla separada de stock negativo cubierta por pruebas. |
| RF-17, alertas de stock bajo | Con 1 o 2 unidades se muestra Disponible y no se genera una alerta específica por stock menor a tres. Con 0 se muestra Agotado. Se verificó también el límite de 3 unidades. La alerta requerida sigue pendiente. |
| Validación de cantidades vacías | El registro convierte la cadena vacía en cantidad 0 y acepta el producto. La edición rechaza la misma entrada. Se conserva esta diferencia de validación, pendiente de unificación conforme a los requisitos. |

Los precios negativos y las cantidades negativas, fraccionarias o no numéricas se rechazan en registro y edición. Los duplicados por nombre se rechazan ignorando mayúsculas y espacios exteriores. El Vendedor tiene bloqueadas las modificaciones del inventario.

## Decisión sobre roles y separación de entornos

Se mantienen los 38 requisitos funcionales originales. La siguiente definición es una decisión técnica de seguridad y separación de entornos.

- Superusuario se utilizará exclusivamente por el desarrollador durante la construcción y las pruebas. Carece de función operativa en el emprendimiento.
- En producción, la cuenta de pruebas Superusuario deberá estar deshabilitada o inaccesible. Debe impedirse cualquier vía de acceso privilegiado basada en credenciales de desarrollo.
- Administrador será responsable de gestionar el negocio y sus usuarios conforme al RF-03, manteniendo separados los privilegios exclusivos del Superusuario.
- Vendedor tendrá únicamente los permisos operativos autorizados.

Estas decisiones deberán aplicarse al implementar autenticación y autorización con Express y MySQL. Las pruebas actuales de caracterización y los permisos de la aplicación se conservan en esta fase.

## Estado de los cambios para revisión

Antes de crear este documento se comprobó que los únicos cambios respecto de Git eran `package.json` y `app.test.cjs`. El primero contiene exclusivamente el cambio del script `test`. El segundo contiene la suite de caracterización desarrollada durante la Fase 0 y sigue sin seguimiento.

Este cierre añade `BASELINE.md` como tercer archivo autorizado. Los archivos de aplicación, modelo, interfaz y estilos se conservan. No se instalaron dependencias ni se realizaron migraciones o commits. El registro de la línea base en Git queda pendiente de revisión del responsable del proyecto.
