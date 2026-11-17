const productoCampos = `p.*, CAST(p.precio_compra AS CHAR) AS precio_compra,
    CAST(p.precio_venta AS CHAR) AS precio_venta`;
const loteCampos = `l.*, DATE_FORMAT(l.fecha_ingreso,'%Y-%m-%d') AS fecha_ingreso,
    DATE_FORMAT(l.caducidad,'%Y-%m-%d') AS caducidad`;

function crearInventarioRepositorio(db) {
    async function query(sql, params = []) { return (await db.execute(sql, params))[0]; }
    return {
        async transaction(fn) {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                const resultado = await fn(crearInventarioRepositorio(connection));
                await connection.commit();
                return resultado;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally { connection.release(); }
        },
        async actor(id) { return (await query('SELECT id,rol,activo FROM usuarios WHERE id = ? FOR UPDATE', [id]))[0]; },
        async contactos(tipo) { return query(`SELECT * FROM ${tipo === 'clientes' ? 'clientes' : 'proveedores'} ORDER BY id`); },
        async contacto(tipo, id) { return (await query(`SELECT id FROM ${tipo === 'clientes' ? 'clientes' : 'proveedores'} WHERE id = ?`, [id]))[0]; },
        async crearContacto(tipo, datos) {
            const r = await query(`INSERT INTO ${tipo === 'clientes' ? 'clientes' : 'proveedores'} (nombre,identificacion,telefono,direccion) VALUES (?,?,?,?)`,
                [datos.nombre, datos.identificacion, datos.telefono, datos.direccion]);
            return { id: r.insertId, ...datos };
        },
        async productos() { return query(`SELECT ${productoCampos} FROM productos p ORDER BY p.id`); },
        async lotes() { return query(`SELECT ${loteCampos} FROM lotes l ORDER BY l.id`); },
        async producto(id) { return (await query(`SELECT ${productoCampos} FROM productos p WHERE p.id = ? FOR UPDATE`, [id]))[0]; },
        async lotesProducto(id) { return query(`SELECT ${loteCampos} FROM lotes l WHERE l.producto_id = ? ORDER BY l.id FOR UPDATE`, [id]); },
        async crearProducto(d) {
            const r = await query('INSERT INTO productos (nombre,categoria,precio_compra,precio_venta,proveedor_id) VALUES (?,?,?,?,?)',
                [d.nombre, d.categoria, d.precioCompra, d.precioVenta, d.proveedorId]);
            return { id: r.insertId, nombre: d.nombre, categoria: d.categoria, precio_compra: d.precioCompra,
                precio_venta: d.precioVenta, proveedor_id: d.proveedorId, faltante: 0, activo: 1 };
        },
        async editarProducto(id, d) {
            await query('UPDATE productos SET nombre=?, categoria=?, precio_compra=?, precio_venta=?, proveedor_id=?, activo=? WHERE id=?',
                [d.nombre, d.categoria, d.precioCompra, d.precioVenta, d.proveedorId, d.activo, id]);
        },
        async crearLote(id, d, cantidad) {
            const r = await query('INSERT INTO lotes (producto_id,proveedor_id,codigo,cantidad,precio_compra,fecha_ingreso,caducidad) VALUES (?,?,?,?,?,?,?)',
                [id, d.proveedorId, d.codigo, cantidad, d.precioCompra, d.fechaIngreso, d.caducidad || null]);
            return r.insertId;
        },
        async guardarStock(id, faltante, lotes) {
            await query('UPDATE productos SET faltante=? WHERE id=?', [faltante, id]);
            for (const lote of lotes) await query('UPDATE lotes SET cantidad=? WHERE id=? AND producto_id=?', [lote.cantidad, lote.id, id]);
        },
        async movimiento(d) {
            await query(`INSERT INTO movimientos_inventario
                (producto_id,usuario_id,tipo,cantidad,stock_antes,stock_despues,motivo,detalle) VALUES (?,?,?,?,?,?,?,?)`,
            [d.productoId, d.usuarioId, d.tipo, d.cantidad, d.antes, d.despues, d.motivo, JSON.stringify(d.detalle)]);
        },
        async historial(id) { return query(`SELECT m.*,u.nombre AS responsable FROM movimientos_inventario m
            JOIN usuarios u ON u.id=m.usuario_id WHERE m.producto_id=? ORDER BY m.id`, [id]); }
    };
}
module.exports = { crearInventarioRepositorio };
