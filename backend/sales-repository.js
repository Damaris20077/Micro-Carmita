const { crearInventarioRepositorio } = require('./inventory-repository');

function crearVentasRepositorio(db) {
    const q = async (sql, params = []) => (await db.execute(sql, params))[0];
    return {
        inventario: crearInventarioRepositorio(db),
        async transaction(fn) {
            const c = await db.getConnection();
            try { await c.beginTransaction(); const r = await fn(crearVentasRepositorio(c)); await c.commit(); return r; }
            catch (error) { await c.rollback(); throw error; }
            finally { c.release(); }
        },
        async operacion(actor, clave) { return (await q('SELECT * FROM venta_operaciones WHERE usuario_id=? AND clave=?', [actor, clave]))[0]; },
        async guardarOperacion(actor, clave, hash, respuesta) {
            await q('INSERT INTO venta_operaciones (usuario_id,clave,contenido_hash,respuesta) VALUES (?,?,?,?)', [actor, clave, hash, JSON.stringify(respuesta)]);
        },
        async lista(clienteId = null) {
            return q(`SELECT v.*,c.nombre AS cliente,
                (SELECT COALESCE(SUM(importe),0) FROM venta_caja WHERE venta_id=v.id) AS efectivo
                FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id
                ${clienteId === null ? '' : `WHERE v.cliente_id=? OR EXISTS (SELECT 1 FROM venta_historial h WHERE h.venta_id=v.id
                    AND (JSON_EXTRACT(h.anterior,'$.cliente_id')=? OR JSON_EXTRACT(h.posterior,'$.cliente_id')=?))`}
                ORDER BY v.id DESC`, clienteId === null ? [] : [clienteId,clienteId,clienteId]);
        },
        async venta(id) { return (await q('SELECT * FROM ventas WHERE id=? FOR UPDATE', [id]))[0]; },
        async detalles(id, revision) {
            const detalles = await q(`SELECT d.*,DATE_FORMAT(d.caducidad_fisica,'%Y-%m-%d') AS caducidad_fisica
                FROM venta_detalles d WHERE venta_id=? AND revision=? ORDER BY producto_id`, [id, revision]);
            for (const d of detalles) d.asignaciones = await q('SELECT lote_id AS loteId,cantidad FROM venta_lotes WHERE detalle_id=? ORDER BY lote_id', [d.id]);
            return detalles;
        },
        async abonos(id) { return q(`SELECT a.*,u.nombre AS responsable FROM venta_abonos a JOIN usuarios u ON u.id=a.usuario_id WHERE venta_id=? ORDER BY a.id`, [id]); },
        async historial(id) { return q(`SELECT h.*,u.nombre AS responsable FROM venta_historial h JOIN usuarios u ON u.id=h.usuario_id WHERE venta_id=? ORDER BY h.id`, [id]); },
        async caja(id) { return q('SELECT * FROM venta_caja WHERE venta_id=? ORDER BY id', [id]); },
        async crear(d, actor) {
            return (await q('INSERT INTO ventas (cliente_id,usuario_id,tipo,total,saldo) VALUES (?,?,?,?,?)',
                [d.clienteId, actor.id, d.tipo, d.total, d.tipo === 'fiado' ? d.total : 0])).insertId;
        },
        async actualizar(id, d) {
            await q('UPDATE ventas SET cliente_id=?,tipo=?,estado=?,revision=?,version=?,total=?,abonado=?,saldo=? WHERE id=?',
                [d.cliente_id, d.tipo, d.estado, d.revision, d.version, d.total, d.abonado, d.saldo, id]);
        },
        async detalle(ventaId, revision, d) {
            const r = await q(`INSERT INTO venta_detalles
                (venta_id,revision,producto_id,nombre,cantidad,precio,sin_existencia,existencia_confirmada,caducidad_fisica) VALUES (?,?,?,?,?,?,?,?,?)`,
            [ventaId, revision, d.productoId, d.nombre, d.cantidad, d.precio, d.sinExistencia, d.confirmarExistencia, d.caducidadFisica]);
            for (const a of d.asignaciones) await q('INSERT INTO venta_lotes (detalle_id,lote_id,cantidad) VALUES (?,?,?)', [r.insertId, a.loteId, a.cantidad]);
        },
        async abonar(id, actor, importe) {
            return (await q('INSERT INTO venta_abonos (venta_id,usuario_id,importe) VALUES (?,?,?)', [id, actor.id, importe])).insertId;
        },
        async efectivo(id, actor, tipo, importe) {
            if (importe) await q('INSERT INTO venta_caja (venta_id,usuario_id,tipo,importe) VALUES (?,?,?,?)', [id, actor.id, tipo, importe]);
        },
        async auditar(id, actor, accion, motivo, anterior, posterior) {
            await q('INSERT INTO venta_historial (venta_id,usuario_id,accion,motivo,anterior,posterior) VALUES (?,?,?,?,?,?)',
                [id, actor.id, accion, motivo, JSON.stringify(anterior), JSON.stringify(posterior)]);
        }
    };
}
module.exports = { crearVentasRepositorio };
