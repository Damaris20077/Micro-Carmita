const { createHash } = require('node:crypto');
const M = require('../modelo');
const { fallo } = require('./auth-service');
const { crearInventarioServicio } = require('./inventory-service');

function campos(d, permitidos) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some(k => !permitidos.includes(k))) throw fallo(400, 'Campos inválidos.');
}
function id(v) {
    if (!Number.isSafeInteger(v) || v < 1 || v > 4294967295) throw fallo(400, 'Identificador inválido.');
    return v;
}
function cantidad(v) {
    if (!Number.isSafeInteger(v) || v < 1 || v > 2147483647) throw fallo(400, 'Cantidad inválida.');
    return v;
}
function precio(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 99999999.99 || M.redondear(v) !== v) throw fallo(400, 'Precio inválido.');
    return v;
}
function texto(v, max, vacio = false) {
    if (typeof v !== 'string' || v.trim().length > max || (!vacio && !v.trim())) throw fallo(400, 'Texto inválido.');
    return v.trim();
}
function lista(v) {
    if (!Array.isArray(v) || !v.length || v.length > 100) throw fallo(400, 'Se requieren de 1 a 100 líneas.');
}

function crearPedidosServicio(repo) {
    const inventario = crearInventarioServicio(repo.inventario);
    function autorizar(actor, soloAdmin = false) {
        if (!actor?.activo || !['administrador', 'vendedor'].includes(actor.rol)
            || (soloAdmin && actor.rol !== 'administrador')) throw fallo(403, 'Operación de pedidos no autorizada.');
    }
    async function transaccion(actor, admin, fn) {
        autorizar(actor, admin);
        try {
            return await repo.transaction(async tx => {
                const actual = await tx.inventario.actor(actor.id);
                autorizar(actual, admin);
                return fn(tx, actual);
            });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') throw fallo(409, 'Código de lote o recepción duplicado.');
            throw error;
        }
    }
    async function buscar(tx, pedidoId, bloquear = false) {
        const p = await tx.pedido(id(pedidoId), bloquear);
        if (!p) throw fallo(404, 'Pedido inexistente.');
        return p;
    }
    return {
        async listar(actor) { autorizar(actor); return repo.lista(); },
        async consultar(actor, pedidoId) {
            autorizar(actor);
            return repo.transaction(async tx => ({ ...await buscar(tx, pedidoId), detalles: await tx.detalles(pedidoId), recepciones: await tx.recepciones(pedidoId) }));
        },
        async crear(actor, d) {
            autorizar(actor, true);
            campos(d, ['proveedorId', 'observaciones', 'detalles']);
            const proveedorId = id(d.proveedorId);
            const observaciones = texto(d.observaciones ?? '', 255, true);
            lista(d.detalles);
            const detalles = d.detalles.map(linea => {
                campos(linea, ['productoId', 'cantidad', 'precioCompra']);
                return { productoId: id(linea.productoId), cantidad: cantidad(linea.cantidad), precioCompra: precio(linea.precioCompra) };
            }).sort((a,b) => a.productoId - b.productoId);
            if (new Set(detalles.map(l => l.productoId)).size !== detalles.length) throw fallo(400, 'Un producto solo puede aparecer una vez en el pedido.');
            return transaccion(actor, true, async (tx, actual) => {
                if (!await tx.inventario.contacto('proveedores', proveedorId)) throw fallo(400, 'Proveedor inexistente.');
                for (const linea of detalles) {
                    const producto = await tx.inventario.producto(linea.productoId);
                    if (!producto?.activo) throw fallo(400, 'Producto inexistente o archivado.');
                }
                const pedidoId = await tx.crearPedido({ proveedorId, observaciones }, actual);
                for (const linea of detalles) await tx.crearDetalle(pedidoId, linea);
                return { id: pedidoId, estado: 'Pendiente' };
            });
        },
        async cancelar(actor, pedidoId, d) {
            autorizar(actor, true);
            campos(d, ['motivo']);
            const motivo = texto(d.motivo, 255);
            return transaccion(actor, true, async (tx, actual) => {
                const p = await buscar(tx, pedidoId, true);
                if (['Cancelado', 'Recibido completo'].includes(p.estado)) throw fallo(409, 'El pedido ya está cerrado.');
                await tx.cancelar(p.id, actual, motivo);
                return { id: p.id, estado: 'Cancelado' };
            });
        },
        async recibir(actor, pedidoId, d) {
            autorizar(actor);
            campos(d, ['clave', 'lineas']);
            if (typeof d.clave !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(d.clave)) throw fallo(400, 'Clave de idempotencia inválida.');
            lista(d.lineas);
            const lineas = d.lineas.map(l => {
                campos(l, ['detalleId', 'cantidad', 'codigo', 'caducidad', 'fechaIngreso', 'precioCompra']);
                if (!M.fechaValida(l.fechaIngreso) || (l.caducidad !== '' && l.caducidad !== null && !M.fechaValida(l.caducidad))) throw fallo(400, 'Fecha inválida.');
                return { detalleId: id(l.detalleId), cantidad: cantidad(l.cantidad), codigo: texto(l.codigo, 60),
                    caducidad: l.caducidad || '', fechaIngreso: l.fechaIngreso, precioCompra: precio(l.precioCompra) };
            }).sort((a,b) => a.detalleId - b.detalleId || a.codigo.localeCompare(b.codigo));
            const hash = createHash('sha256').update(JSON.stringify(lineas)).digest('hex');
            return transaccion(actor, false, async (tx, actual) => {
                const p = await buscar(tx, pedidoId, true);
                const anterior = await tx.recepcionPorClave(p.id, d.clave);
                if (anterior) {
                    if (anterior.contenido_hash !== hash) throw fallo(409, 'La clave ya fue utilizada con otros datos.');
                    return { id: anterior.id, pedidoId: p.id, estado: p.estado, repetida: true };
                }
                if (['Cancelado', 'Recibido completo'].includes(p.estado)) throw fallo(409, 'El pedido no admite recepciones.');
                const detalles = await tx.detalles(p.id, true);
                const cantidades = new Map();
                for (const linea of lineas) {
                    const detalle = detalles.find(l => l.id === linea.detalleId);
                    if (!detalle) throw fallo(400, 'La línea no pertenece al pedido.');
                    cantidades.set(detalle.id, (cantidades.get(detalle.id) || 0) + linea.cantidad);
                    if (cantidades.get(detalle.id) > detalle.cantidad - detalle.recibida) throw fallo(409, 'La recepción supera la cantidad pendiente.');
                }
                const recepcion = await tx.crearRecepcion(p.id, actual, d.clave, hash);
                for (const linea of lineas) {
                    const detalle = detalles.find(l => l.id === linea.detalleId);
                    const entrada = await inventario.recibirPedido(tx.inventario, actual, detalle.producto_id,
                        { ...linea, proveedorId: p.proveedor_id });
                    await tx.recibirLinea(p.id, recepcion, linea, entrada.loteId);
                }
                const completo = detalles.every(l => l.recibida + (cantidades.get(l.id) || 0) === l.cantidad);
                const estado = completo ? 'Recibido completo' : 'Recibido parcialmente';
                await tx.cambiarEstado(p.id, estado);
                return { id: recepcion, pedidoId: p.id, estado, repetida: false };
            });
        }
    };
}
module.exports = { crearPedidosServicio };
