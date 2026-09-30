/* Reglas del prototipo: independientes de la interfaz para poder verificarlas. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MicroCarmita = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const redondear = n => Math.round((n + Number.EPSILON) * 100) / 100;
    const exigir = (ok, mensaje) => { if (!ok) throw new Error(mensaje); };
    const dinero = n => Number.isFinite(n) && n > 0 && redondear(n) === n;
    const cantidad = n => Number.isSafeInteger(n) && n > 0;
    const vacio = () => ({ version: 2, productos: [], lotes: [], ventas: [], cuentas: [], pagos: [], movimientos: [], inventarioMovimientos: [], usuarios: [{ id: 'admin-demo', nombre: 'Administración', rol: 'administrador', activo: true }, { id: 'operador-demo', nombre: 'Operador de ventas', rol: 'operador', activo: true }] });
    const permisos = { administrador: ['inicio', 'ventas', 'cuentas', 'inventario', 'movimientos', 'reportes', 'usuarios', 'respaldo', 'ayuda'], operador: ['inicio', 'ventas', 'cuentas', 'inventario', 'ayuda'] };
    const autorizar = (s, usuario, seccion) => {
        const u = s.usuarios.find(u => u.id === usuario && u.activo);
        exigir(u && permisos[u.rol]?.includes(seccion), 'Este perfil no tiene permiso para realizar esta operación.');
        return u;
    };
    const stock = (s, productoId) => s.lotes.filter(l => l.productoId === productoId).reduce((n, l) => n + l.cantidad, 0) - (s.productos.find(p => p.id === productoId)?.faltante || 0);
    const estadoLote = (l, fecha = hoy()) => {
        if (!l.caducidad) return 'Sin caducidad';
        if (l.caducidad < fecha) return 'Caducado';
        const dias = Math.round((Date.parse(l.caducidad + 'T00:00:00Z') - Date.parse(fecha + 'T00:00:00Z')) / 86400000);
        return dias <= 7 ? 'Por caducar' : 'Vigente';
    };
    function producto(s, datos, usuario) {
        autorizar(s, usuario, 'inventario');
        exigir(s.usuarios.find(u => u.id === usuario)?.rol === 'administrador', 'Solo administración puede registrar productos.');
        const nombre = datos.nombre.trim(), categoria = datos.categoria.trim();
        exigir(nombre && categoria && dinero(datos.precio), 'Ingrese nombre, categoría y un precio positivo con hasta dos decimales.');
        exigir(!s.productos.some(p => p.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase()), 'El producto ya existe. Registre una entrada de lote.');
        const p = { id: id(), nombre, categoria, precio: datos.precio, faltante: 0 };
        s.productos.push(p); return p;
    }
    function entrada(s, d, usuario, fecha = hoy()) {
        exigir(autorizar(s, usuario, 'inventario').rol === 'administrador', 'Solo administración puede registrar entradas.');
        const p = s.productos.find(p => p.id === d.productoId);
        exigir(p && cantidad(d.cantidad) && d.codigo.trim(), 'Seleccione un producto, un código de lote y una cantidad entera positiva.');
        exigir(!d.caducidad || /^\d{4}-\d{2}-\d{2}$/.test(d.caducidad) && Number.isFinite(Date.parse(d.caducidad)) && new Date(d.caducidad).toISOString().slice(0, 10) === d.caducidad, 'Fecha de caducidad inválida.');
        exigir(!s.lotes.some(l => l.productoId === p.id && l.codigo.toLocaleLowerCase() === d.codigo.trim().toLocaleLowerCase()), 'Este código de lote ya está registrado para el producto.');
        const l = { id: id(), productoId: p.id, codigo: d.codigo.trim(), cantidad: d.cantidad, caducidad: d.caducidad || '', fecha };
        // Una entrada vigente concilia primero las unidades vendidas sin existencia.
        const conciliado = estadoLote(l, fecha) === 'Caducado' ? 0 : Math.min(p.faltante, l.cantidad);
        l.cantidad -= conciliado; p.faltante -= conciliado; s.lotes.push(l);
        s.inventarioMovimientos.push({ id: id(), productoId: p.id, lote: l.codigo, tipo: 'Entrada', cantidad: d.cantidad, conciliado, fecha, usuario });
        return l;
    }
    function venta(s, d, usuario, fecha = hoy()) {
        autorizar(s, usuario, 'ventas');
        const p = s.productos.find(p => p.id === d.productoId);
        exigir(p && cantidad(d.cantidad) && dinero(d.precio) && ['contado', 'fiado'].includes(d.tipo), 'Seleccione un producto, cantidad entera y precio positivo válido.');
        exigir(d.tipo !== 'fiado' || d.cliente.trim(), 'Las ventas a crédito requieren el nombre del cliente.');
        const lotes = s.lotes.filter(l => l.productoId === p.id && l.cantidad > 0 && estadoLote(l, fecha) !== 'Caducado').sort((a, b) => (a.caducidad || '9999').localeCompare(b.caducidad || '9999') || a.fecha.localeCompare(b.fecha));
        exigir(lotes.length || !s.lotes.some(l => l.productoId === p.id && l.cantidad > 0 && estadoLote(l, fecha) === 'Caducado'), 'Solo hay existencias caducadas de este producto. No se permite venderlas.');
        const total = redondear(d.cantidad * d.precio);
        exigir(Number.isFinite(total) && total <= 999999999, 'El total de la venta excede el límite permitido.');
        let pendiente = d.cantidad; const asignaciones = [];
        for (const l of lotes) { const unidades = Math.min(pendiente, l.cantidad); if (!unidades) break; l.cantidad -= unidades; pendiente -= unidades; asignaciones.push({ loteId: l.id, codigo: l.codigo, cantidad: unidades }); }
        p.faltante += pendiente;
        const v = { id: id(), cliente: d.cliente.trim() || 'Consumidor final', productoId: p.id, producto: p.nombre, cantidad: d.cantidad, precio: d.precio, total, tipo: d.tipo, fecha, usuario, asignaciones, sinExistencia: pendiente };
        s.ventas.push(v);
        s.inventarioMovimientos.push({ id: id(), productoId: p.id, lote: asignaciones.map(a => a.codigo).join(', ') || 'Sin existencia', tipo: 'Venta', cantidad: -d.cantidad, fecha, usuario });
        if (d.tipo === 'fiado') s.cuentas.push({ id: v.id, cliente: v.cliente, producto: p.nombre, total, saldo: total, fecha });
        else s.movimientos.push({ id: id(), tipo: 'ingreso', descripcion: `Venta al contado: ${p.nombre}`, valor: total, fecha, origen: 'venta', referencia: v.id });
        return v;
    }
    function abono(s, cuentaId, valor, usuario, fecha = hoy()) {
        autorizar(s, usuario, 'cuentas'); const c = s.cuentas.find(c => c.id === cuentaId);
        exigir(c && dinero(valor) && valor <= c.saldo, 'El abono debe ser positivo, tener hasta dos decimales y no superar el saldo pendiente.');
        c.saldo = redondear(c.saldo - valor);
        const pago = { id: id(), cuentaId, cliente: c.cliente, valor, fecha, usuario }; s.pagos.push(pago);
        s.movimientos.push({ id: id(), tipo: 'ingreso', descripcion: `Abono de ${c.cliente}`, valor, fecha, origen: 'abono', referencia: pago.id });
    }
    function salida(s, loteId, unidades, motivo, usuario, fecha = hoy()) {
        exigir(autorizar(s, usuario, 'inventario').rol === 'administrador', 'Solo administración puede registrar salidas.');
        const l = s.lotes.find(l => l.id === loteId);
        exigir(l && cantidad(unidades) && unidades <= l.cantidad && motivo.trim(), 'Ingrese cantidad disponible y motivo de la salida.');
        l.cantidad -= unidades;
        s.inventarioMovimientos.push({ id: id(), productoId: l.productoId, lote: l.codigo, tipo: `Salida: ${motivo.trim()}`, cantidad: -unidades, fecha, usuario });
    }
    function movimiento(s, d, usuario) {
        autorizar(s, usuario, 'movimientos');
        exigir(['ingreso', 'egreso'].includes(d.tipo) && d.descripcion.trim() && dinero(d.valor), 'Ingrese descripción y valor positivo con hasta dos decimales.');
        s.movimientos.push({ id: id(), ...d, descripcion: d.descripcion.trim(), fecha: hoy(), origen: 'manual', usuario });
    }
    return { hoy, id, redondear, vacio, permisos, autorizar, stock, estadoLote, producto, entrada, venta, abono, salida, movimiento };
});
