/* Reglas de negocio del prototipo. No dependen del HTML ni de localStorage. */
(function (raiz, crearModelo) {
    const modelo = crearModelo();
    if (typeof module === 'object' && module.exports) {
        module.exports = modelo;
    } else {
        raiz.MicroCarmita = modelo;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const permisos = {
        administrador: ['inicio', 'ventas', 'cuentas', 'inventario', 'movimientos', 'reportes', 'usuarios', 'respaldo', 'ayuda'],
        operador: ['inicio', 'ventas', 'cuentas', 'inventario', 'ayuda']
    };

    function hoy() {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Guayaquil',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
        return `${valores.year}-${valores.month}-${valores.day}`;
    }

    function id() {
        return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function redondear(numero) {
        return Math.round((numero + Number.EPSILON) * 100) / 100;
    }

    function exigir(condicion, mensaje) {
        if (!condicion) throw new Error(mensaje);
    }

    function dinero(numero) {
        return Number.isFinite(numero) && numero > 0 && redondear(numero) === numero;
    }

    function cantidad(numero) {
        return Number.isSafeInteger(numero) && numero > 0;
    }

    function texto(valor) {
        return typeof valor === 'string' && valor.trim().length > 0;
    }

    function fechaValida(fecha) {
        if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
        const milisegundos = Date.parse(fecha);
        return Number.isFinite(milisegundos) && new Date(milisegundos).toISOString().slice(0, 10) === fecha;
    }

    function vacio() {
        return {
            version: 2,
            productos: [],
            lotes: [],
            ventas: [],
            cuentas: [],
            pagos: [],
            movimientos: [],
            inventarioMovimientos: [],
            usuarios: [
                { id: 'admin-demo', nombre: 'Administración', rol: 'administrador', activo: true },
                { id: 'operador-demo', nombre: 'Operador de ventas', rol: 'operador', activo: true }
            ]
        };
    }

    function autorizar(estado, usuarioId, seccion) {
        const usuario = estado.usuarios.find(usuario => usuario.id === usuarioId && usuario.activo);
        exigir(usuario && permisos[usuario.rol]?.includes(seccion), 'Este perfil no tiene permiso para realizar esta operación.');
        return usuario;
    }

    function exigirAdministrador(estado, usuarioId) {
        const usuario = autorizar(estado, usuarioId, 'inventario');
        exigir(usuario.rol === 'administrador', 'Solo administración puede modificar el inventario.');
    }

    function stock(estado, productoId) {
        const producto = estado.productos.find(producto => producto.id === productoId);
        const existencias = estado.lotes
            .filter(lote => lote.productoId === productoId)
            .reduce((total, lote) => total + lote.cantidad, 0);
        return existencias - (producto?.faltante || 0);
    }

    function estadoLote(lote, fecha = hoy()) {
        if (!lote.caducidad) return 'Sin caducidad';
        if (lote.caducidad < fecha) return 'Caducado';
        const diferencia = Date.parse(lote.caducidad + 'T00:00:00Z') - Date.parse(fecha + 'T00:00:00Z');
        const dias = Math.round(diferencia / 86400000);
        return dias <= 7 ? 'Por caducar' : 'Vigente';
    }

    function producto(estado, datos, usuarioId) {
        exigirAdministrador(estado, usuarioId);
        exigir(texto(datos.nombre) && texto(datos.categoria) && dinero(datos.precio),
            'Ingrese nombre, categoría y un precio positivo con hasta dos decimales.');
        const nombre = datos.nombre.trim();
        const repetido = estado.productos.some(producto => producto.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase());
        exigir(!repetido, 'El producto ya existe. Registre una entrada de lote.');
        const nuevo = {
            id: id(),
            nombre,
            categoria: datos.categoria.trim(),
            precio: datos.precio,
            faltante: 0
        };
        estado.productos.push(nuevo);
        return nuevo;
    }

    function entrada(estado, datos, usuarioId, fecha = hoy()) {
        exigirAdministrador(estado, usuarioId);
        const producto = estado.productos.find(producto => producto.id === datos.productoId);
        exigir(producto && cantidad(datos.cantidad) && texto(datos.codigo),
            'Seleccione un producto, un código de lote y una cantidad entera positiva.');
        exigir(!datos.caducidad || fechaValida(datos.caducidad), 'Fecha de caducidad inválida.');
        const codigo = datos.codigo.trim();
        const repetido = estado.lotes.some(lote =>
            lote.productoId === producto.id && lote.codigo.toLocaleLowerCase() === codigo.toLocaleLowerCase()
        );
        exigir(!repetido, 'Este código de lote ya está registrado para el producto.');
        const lote = {
            id: id(), productoId: producto.id, codigo,
            cantidad: datos.cantidad, caducidad: datos.caducidad || '', fecha
        };

        // Una entrada vigente concilia primero ventas registradas sin existencia.
        const conciliado = estadoLote(lote, fecha) === 'Caducado'
            ? 0
            : Math.min(producto.faltante, lote.cantidad);
        lote.cantidad -= conciliado;
        producto.faltante -= conciliado;
        estado.lotes.push(lote);
        estado.inventarioMovimientos.push({
            id: id(), productoId: producto.id, lote: codigo, tipo: 'Entrada',
            cantidad: datos.cantidad, conciliado, fecha, usuario: usuarioId
        });
        return lote;
    }

    function lotesFEFO(estado, productoId, fecha) {
        return estado.lotes.filter(lote =>
            lote.productoId === productoId && lote.cantidad > 0 && estadoLote(lote, fecha) !== 'Caducado'
        ).sort((primero, segundo) => {
            const caducidad = (primero.caducidad || '9999-12-31').localeCompare(segundo.caducidad || '9999-12-31');
            return caducidad || primero.fecha.localeCompare(segundo.fecha);
        });
    }

    function venta(estado, datos, usuarioId, fecha = hoy()) {
        autorizar(estado, usuarioId, 'ventas');
        const producto = estado.productos.find(producto => producto.id === datos.productoId);
        exigir(producto && cantidad(datos.cantidad) && dinero(datos.precio) && ['contado', 'fiado'].includes(datos.tipo),
            'Seleccione un producto, cantidad entera y precio positivo válido.');
        exigir(datos.tipo !== 'fiado' || texto(datos.cliente), 'Las ventas a crédito requieren el nombre del cliente.');
        const lotes = lotesFEFO(estado, producto.id, fecha);
        const hayCaducados = estado.lotes.some(lote =>
            lote.productoId === producto.id && lote.cantidad > 0 && estadoLote(lote, fecha) === 'Caducado'
        );
        exigir(lotes.length > 0 || !hayCaducados, 'Solo hay existencias caducadas de este producto. No se permite venderlas.');
        const total = redondear(datos.cantidad * datos.precio);
        exigir(Number.isFinite(total) && total <= 999999999, 'El total de la venta excede el límite permitido.');

        let pendiente = datos.cantidad;
        const asignaciones = [];
        for (const lote of lotes) {
            const unidades = Math.min(pendiente, lote.cantidad);
            if (unidades === 0) break;
            lote.cantidad -= unidades;
            pendiente -= unidades;
            asignaciones.push({ loteId: lote.id, codigo: lote.codigo, cantidad: unidades });
        }
        producto.faltante += pendiente;
        const nueva = {
            id: id(),
            cliente: texto(datos.cliente) ? datos.cliente.trim() : 'Consumidor final',
            productoId: producto.id, producto: producto.nombre,
            cantidad: datos.cantidad, precio: datos.precio, total,
            tipo: datos.tipo, fecha, usuario: usuarioId,
            asignaciones, sinExistencia: pendiente
        };
        estado.ventas.push(nueva);
        estado.inventarioMovimientos.push({
            id: id(), productoId: producto.id,
            lote: asignaciones.map(asignacion => asignacion.codigo).join(', ') || 'Sin existencia',
            tipo: 'Venta', cantidad: -datos.cantidad, fecha, usuario: usuarioId
        });

        if (datos.tipo === 'fiado') {
            estado.cuentas.push({
                id: nueva.id, cliente: nueva.cliente, producto: producto.nombre,
                total, saldo: total, fecha
            });
        } else {
            estado.movimientos.push({
                id: id(), tipo: 'ingreso', descripcion: `Venta al contado: ${producto.nombre}`,
                valor: total, fecha, origen: 'venta', referencia: nueva.id
            });
        }
        return nueva;
    }

    function abono(estado, cuentaId, importe, usuarioId, fecha = hoy()) {
        autorizar(estado, usuarioId, 'cuentas');
        const cuenta = estado.cuentas.find(cuenta => cuenta.id === cuentaId);
        exigir(cuenta && dinero(importe) && importe <= cuenta.saldo,
            'El abono debe ser positivo, tener hasta dos decimales y no superar el saldo pendiente.');
        cuenta.saldo = redondear(cuenta.saldo - importe);
        const pago = {
            id: id(), cuentaId, cliente: cuenta.cliente, valor: importe, fecha, usuario: usuarioId
        };
        estado.pagos.push(pago);
        estado.movimientos.push({
            id: id(), tipo: 'ingreso', descripcion: `Abono de ${cuenta.cliente}`,
            valor: importe, fecha, origen: 'abono', referencia: pago.id
        });
        return pago;
    }

    function salida(estado, loteId, unidades, motivo, usuarioId, fecha = hoy()) {
        exigirAdministrador(estado, usuarioId);
        const lote = estado.lotes.find(lote => lote.id === loteId);
        exigir(lote && cantidad(unidades) && unidades <= lote.cantidad && texto(motivo),
            'Ingrese cantidad disponible y motivo de la salida.');
        lote.cantidad -= unidades;
        estado.inventarioMovimientos.push({
            id: id(), productoId: lote.productoId, lote: lote.codigo,
            tipo: `Salida: ${motivo.trim()}`, cantidad: -unidades, fecha, usuario: usuarioId
        });
    }

    function movimiento(estado, datos, usuarioId) {
        autorizar(estado, usuarioId, 'movimientos');
        exigir(['ingreso', 'egreso'].includes(datos.tipo) && texto(datos.descripcion) && dinero(datos.valor),
            'Ingrese descripción y valor positivo con hasta dos decimales.');
        estado.movimientos.push({
            id: id(), tipo: datos.tipo, descripcion: datos.descripcion.trim(),
            valor: datos.valor, fecha: hoy(), origen: 'manual', usuario: usuarioId
        });
    }

    // Antes de dibujar o guardar, rechazar registros dañados sin sobrescribirlos.
    function validarEstado(estado) {
        exigir(estado && estado.version === 2, 'La versión de los datos no es compatible.');
        const colecciones = ['productos', 'lotes', 'ventas', 'cuentas', 'pagos', 'movimientos', 'inventarioMovimientos', 'usuarios'];
        for (const nombre of colecciones) {
            const registros = estado[nombre];
            exigir(Array.isArray(registros), `La colección ${nombre} no es válida.`);
            const ids = new Set();
            for (const registro of registros) {
                exigir(registro && texto(registro.id) && !ids.has(registro.id), `Identificador inválido o duplicado en ${nombre}.`);
                ids.add(registro.id);
            }
        }
        const noNegativo = numero => Number.isFinite(numero) && numero >= 0;
        for (const producto of estado.productos) {
            exigir(texto(producto.nombre) && texto(producto.categoria) && dinero(producto.precio) && noNegativo(producto.faltante), 'Datos de producto inválidos.');
        }
        for (const lote of estado.lotes) {
            exigir(estado.productos.some(producto => producto.id === lote.productoId) && texto(lote.codigo) && noNegativo(lote.cantidad) && fechaValida(lote.fecha) && (!lote.caducidad || fechaValida(lote.caducidad)), 'Datos de lote inválidos.');
        }
        for (const venta of estado.ventas) {
            exigir(texto(venta.cliente) && texto(venta.producto) && Number.isFinite(venta.cantidad) && venta.cantidad > 0 && dinero(venta.precio) && dinero(venta.total) && ['contado', 'fiado'].includes(venta.tipo) && fechaValida(venta.fecha) && Array.isArray(venta.asignaciones) && noNegativo(venta.sinExistencia), 'Datos de venta inválidos.');
            exigir(venta.asignaciones.every(asignacion => texto(asignacion.codigo) && Number.isFinite(asignacion.cantidad) && asignacion.cantidad > 0), 'Asignaciones de lote inválidas.');
        }
        for (const cuenta of estado.cuentas) {
            exigir(texto(cuenta.cliente) && texto(cuenta.producto) && dinero(cuenta.total) && noNegativo(cuenta.saldo) && cuenta.saldo <= cuenta.total && fechaValida(cuenta.fecha), 'Datos de cuenta por cobrar inválidos.');
        }
        for (const pago of estado.pagos) {
            exigir(texto(pago.cliente) && dinero(pago.valor) && fechaValida(pago.fecha) && estado.cuentas.some(cuenta => cuenta.id === pago.cuentaId), 'Datos de abono inválidos.');
        }
        for (const movimiento of estado.movimientos) {
            exigir(['ingreso', 'egreso'].includes(movimiento.tipo) && texto(movimiento.descripcion) && dinero(movimiento.valor) && fechaValida(movimiento.fecha), 'Datos de movimiento financiero inválidos.');
        }
        for (const movimiento of estado.inventarioMovimientos) {
            exigir(texto(movimiento.tipo) && texto(movimiento.lote) && Number.isFinite(movimiento.cantidad) && fechaValida(movimiento.fecha) && estado.productos.some(producto => producto.id === movimiento.productoId), 'Datos de movimiento de inventario inválidos.');
        }
        for (const usuario of estado.usuarios) {
            exigir(texto(usuario.nombre) && Object.hasOwn(permisos, usuario.rol) && typeof usuario.activo === 'boolean', 'Datos de perfil inválidos.');
        }
        exigir(estado.usuarios.some(usuario => usuario.activo && usuario.rol === 'administrador'), 'Debe existir un administrador activo.');
        return estado;
    }

    return {
        hoy, id, redondear, vacio, permisos, autorizar, stock, estadoLote,
        producto, entrada, venta, abono, salida, movimiento, validarEstado
    };
});
