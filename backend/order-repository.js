const { crearInventarioRepositorio } = require('./inventory-repository');

function crearPedidosRepositorio(db) {
    async function query(sql, params = []) { return (await db.execute(sql, params))[0]; }
    return {
        inventario: crearInventarioRepositorio(db),
        async transaction(fn) {
            const c = await db.getConnection();
            try {
                await c.beginTransaction();
                const r = await fn(crearPedidosRepositorio(c));
                await c.commit();
                return r;
            } catch (error) { await c.rollback(); throw error; }
            finally { c.release(); }
        },
        async lista() { return query(`SELECT p.*,v.nombre AS proveedor FROM pedidos p
            JOIN proveedores v ON v.id=p.proveedor_id ORDER BY p.id DESC`); },
        async pedido(id, bloquear = false) { return (await query(`SELECT * FROM pedidos WHERE id=?${bloquear ? ' FOR UPDATE' : ''}`, [id]))[0]; },
        async detalles(id, bloquear = false) { return query(`SELECT d.*,p.nombre AS producto FROM pedido_detalles d
            JOIN productos p ON p.id=d.producto_id WHERE d.pedido_id=? ORDER BY d.producto_id${bloquear ? ' FOR UPDATE' : ''}`, [id]); },
        async recepciones(id) { return query(`SELECT r.id,r.pedido_id,r.usuario_id,r.creado_en,u.nombre AS responsable,
            d.pedido_detalle_id,d.lote_id,d.cantidad,l.codigo,DATE_FORMAT(l.fecha_ingreso,'%Y-%m-%d') AS fecha_ingreso,
            DATE_FORMAT(l.caducidad,'%Y-%m-%d') AS caducidad FROM recepciones r
            JOIN usuarios u ON u.id=r.usuario_id JOIN recepcion_detalles d ON d.recepcion_id=r.id
            JOIN lotes l ON l.id=d.lote_id WHERE r.pedido_id=? ORDER BY r.id,d.id`, [id]); },
        async crearPedido(d, actor) {
            return (await query('INSERT INTO pedidos (proveedor_id,creado_por,observaciones) VALUES (?,?,?)', [d.proveedorId, actor.id, d.observaciones])).insertId;
        },
        async crearDetalle(id, d) {
            await query('INSERT INTO pedido_detalles (pedido_id,producto_id,cantidad,precio_compra) VALUES (?,?,?,?)', [id, d.productoId, d.cantidad, d.precioCompra]);
        },
        async cancelar(id, actor, motivo) {
            await query("UPDATE pedidos SET estado='Cancelado',cancelado_por=?,cancelado_en=UTC_TIMESTAMP(6),motivo_cancelacion=? WHERE id=?", [actor.id, motivo, id]);
        },
        async recepcionPorClave(id, clave) { return (await query('SELECT * FROM recepciones WHERE pedido_id=? AND clave=?', [id, clave]))[0]; },
        async crearRecepcion(id, actor, clave, hash) {
            return (await query('INSERT INTO recepciones (pedido_id,usuario_id,clave,contenido_hash) VALUES (?,?,?,?)', [id, actor.id, clave, hash])).insertId;
        },
        async recibirLinea(pedido, recepcion, d, lote) {
            await query('INSERT INTO recepcion_detalles (pedido_id,recepcion_id,pedido_detalle_id,lote_id,cantidad) VALUES (?,?,?,?,?)', [pedido, recepcion, d.detalleId, lote, d.cantidad]);
            await query('UPDATE pedido_detalles SET recibida=recibida+? WHERE id=? AND pedido_id=?', [d.cantidad, d.detalleId, pedido]);
        },
        async cambiarEstado(id, estado) { await query('UPDATE pedidos SET estado=? WHERE id=?', [estado, id]); }
    };
}
module.exports = { crearPedidosRepositorio };
