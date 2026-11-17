// Ensayo manual después de 004. Nunca ejecuta DDL ni confirma la transacción externa.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { crearPool } = require('./database');
const { crearRepositorio } = require('./auth-repository');
const { crearInventarioRepositorio } = require('./inventory-repository');
const { crearVentasRepositorio } = require('./sales-repository');
const { crearApp } = require('./app');
const { cerrarVerificacion } = require('./verification-cleanup');
const M = require('../modelo');

// Lista cerrada: nunca se interpolan identificadores introducidos por el usuario.
const TABLAS_PREVIAS = Object.freeze({ usuarios: 'id', sesiones: 'token_hash', auditoria_usuarios: 'id', roles: 'codigo',
    schema_migrations: 'version', clientes: 'id', proveedores: 'id', productos: 'id', lotes: 'id', movimientos_inventario: 'id',
    pedidos: 'id', pedido_detalles: 'id', recepciones: 'id', recepcion_detalles: 'id' });
async function capturarEstado(connection) {
    const estado = {};
    for (const [tabla, pk] of Object.entries(TABLAS_PREVIAS)) {
        const [filas] = await connection.execute(`SELECT * FROM \`${tabla}\` ORDER BY \`${pk}\``);
        estado[tabla] = filas;
    }
    return estado; // Solo en memoria; puede incluir datos sensibles. No imprimir.
}

async function verificar() {
    let pool, connection, server;
    let etapa = 'credenciales';
    const informe = { ok: false, rollback: false, comprobaciones: [] };
    try {
        if (!process.env.AUTH_CHECK_USER || !process.env.AUTH_CHECK_PASSWORD) throw new Error();
        pool = crearPool(); connection = await pool.getConnection();
        etapa = 'migracion_004';
        const [versiones] = await connection.execute('SELECT version FROM schema_migrations WHERE version IN (?,?,?,?)',
            ['001_auth','002_catalogo_inventario','003_pedidos_recepciones','004_ventas_cobros']);
        assert.equal(versiones.length, 4);
        const tablas = [...Object.keys(TABLAS_PREVIAS),
            'ventas','venta_detalles','venta_lotes','venta_abonos','venta_caja','venta_historial','venta_operaciones'];
        const [motores] = await connection.execute(`SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tablas.map(() => '?').join(',')})`, tablas);
        assert.equal(motores.length, tablas.length); assert.ok(motores.every(t => t.ENGINE === 'InnoDB'));
        await connection.beginTransaction();
        etapa = 'administrador';
        const [antes] = await connection.execute('SELECT * FROM usuarios WHERE usuario=?', [process.env.AUTH_CHECK_USER]);
        assert.equal(antes.length, 1); assert.equal(antes[0].rol, 'administrador'); assert.equal(antes[0].activo, 1);
        const [sesiones] = await connection.execute('SELECT * FROM sesiones WHERE usuario_id=? ORDER BY token_hash', [antes[0].id]);
        etapa = 'estado_previo';
        const estadoPrevio = await capturarEstado(connection);
        const puente = { execute: (...args) => connection.execute(...args), async getConnection() {
            return { execute: (...args) => connection.execute(...args),
                async beginTransaction() { await connection.query('SAVEPOINT ventas_ensayo'); },
                async commit() { await connection.query('RELEASE SAVEPOINT ventas_ensayo'); },
                async rollback() { await connection.query('ROLLBACK TO SAVEPOINT ventas_ensayo'); }, release() {} };
        } };
        const origin = 'http://127.0.0.1:3000';
        server = crearApp({ repository: crearRepositorio(puente), inventoryRepository: crearInventarioRepositorio(puente),
            salesRepository: crearVentasRepositorio(puente), origin }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        function cliente() {
            let cookie = '', csrf = '';
            return async (ruta, method = 'GET', body) => {
                const r = await fetch(base + ruta, { method, headers: { Origin: origin, Cookie: cookie,
                    'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
                if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
                const data = r.status === 204 ? {} : await r.json();
                if (data.csrfToken) csrf = data.csrfToken;
                return { status: r.status, data };
            };
        }
        const admin = cliente(); etapa = 'login';
        assert.equal((await admin('/auth/login', 'POST', { usuario: process.env.AUTH_CHECK_USER, clave: process.env.AUTH_CHECK_PASSWORD })).status, 200);
        delete process.env.AUTH_CHECK_PASSWORD;
        etapa = 'datos_temporales';
        const tag = randomBytes(8).toString('hex');
        const prov = await admin('/proveedores', 'POST', { nombre: `QA ventas ${tag}` }); assert.equal(prov.status, 201);
        const cli = await admin('/clientes', 'POST', { nombre: `QA cliente ${tag}` }); assert.equal(cli.status, 201);
        const proveedorId = prov.data.registro.id, clienteId = cli.data.registro.id;
        const caducidad = new Date(Date.parse(M.hoy() + 'T00:00:00Z') + 30 * 86400000).toISOString().slice(0,10);
        const producto = await admin('/products', 'POST', { nombre: `QA venta ${tag}`, categoria: 'Ensayo', precioCompra: 1, precioVenta: 2,
            proveedorId, codigo: `QA-${tag}`, cantidad: 2, fechaIngreso: M.hoy(),
            caducidad: new Date(Date.parse(caducidad + 'T00:00:00Z') + 30 * 86400000).toISOString().slice(0,10) }); assert.equal(producto.status, 201);
        const productoId = producto.data.productoId;
        // Lote ingresado después, pero con vencimiento anterior: detecta FIFO accidental.
        const temprano = await admin(`/products/${productoId}/lots`, 'POST', { proveedorId, codigo: `FEFO-${tag}`, cantidad: 1,
            precioCompra: 1, fechaIngreso: M.hoy(), caducidad }); assert.equal(temprano.status, 201);
        const vencida = new Date(Date.parse(M.hoy() + 'T00:00:00Z') - 86400000).toISOString().slice(0,10);
        const caducado = await admin('/products', 'POST', { nombre: `QA caducado ${tag}`, categoria: 'Ensayo', precioCompra: 1, precioVenta: 2,
            proveedorId, codigo: `CAD-${tag}`, cantidad: 1, fechaIngreso: vencida, caducidad: vencida }); assert.equal(caducado.status, 201);
        const caducadoId = caducado.data.productoId;
        const usuario = `qa_v_${tag}`, clave = randomBytes(32).toString('hex');
        const v = await admin('/users', 'POST', { nombre: 'QA ventas temporal', usuario, clave, rol: 'vendedor' }); assert.equal(v.status, 201);
        const vendedor = cliente(); assert.equal((await vendedor('/auth/login', 'POST', { usuario, clave })).status, 200);
        etapa = 'caducidad';
        assert.equal((await vendedor('/sales', 'POST', { clave: `CADUCADO-${tag}`, tipo: 'contado', clienteId,
            detalles: [{ productoId: caducadoId, cantidad: 1, precio: 2 }] })).status, 400);
        etapa = 'contado';
        const datos = { clave: `CONTADO-${tag}`, tipo: 'contado', clienteId, detalles: [{ productoId, cantidad: 2, precio: 2 }] };
        const contado = await vendedor('/sales', 'POST', datos); assert.equal(contado.status, 201);
        assert.equal((await vendedor('/sales', 'POST', datos)).status, 200);
        const ventaId = contado.data.id;
        let detalle = (await admin(`/sales/${ventaId}`)).data;
        assert.equal(detalle.caja.length, 1); assert.equal(Number(detalle.caja[0].importe), 4);
        assert.equal(detalle.detalles.length, 1); assert.equal(detalle.detalles[0].cantidad, 2); assert.equal(Number(detalle.total), 4);
        assert.equal((await vendedor('/sales', 'POST', { ...datos, detalles: [{ productoId, cantidad: 1, precio: 2 }] })).status, 409);
        assert.equal(detalle.detalles[0].asignaciones.find(l => l.loteId === temprano.data.loteId)?.cantidad, 1);
        assert.equal(detalle.detalles[0].asignaciones.find(l => l.loteId === producto.data.loteId)?.cantidad, 1);
        const trasContado = (await admin('/inventory')).data.productos.find(p => p.id === productoId);
        assert.equal(trasContado.stock, 1);
        assert.equal(trasContado.lotes.find(l => l.id === temprano.data.loteId).cantidad, 0);
        assert.equal(trasContado.lotes.find(l => l.id === producto.data.loteId).cantidad, 1);
        etapa = 'fiado_y_abonos';
        assert.equal((await vendedor('/sales', 'POST', { ...datos, clave: `SIN-CLIENTE-${tag}`, clienteId: null, tipo: 'fiado' })).status, 400);
        assert.equal((await vendedor('/sales', 'POST', { ...datos, clave: `SIN-FISICO-${tag}`, tipo: 'fiado',
            detalles: [{ productoId, cantidad: 3, precio: 2 }] })).status, 400);
        const fiado = await vendedor('/sales', 'POST', { ...datos, clave: `FIADO-${tag}`, tipo: 'fiado',
            detalles: [{ productoId, cantidad: 3, precio: 2, confirmarExistencia: true, caducidadFisica: caducidad }] }); assert.equal(fiado.status, 201);
        const fiadoId = fiado.data.id;
        const p = (await admin('/inventory')).data.productos.find(p => p.id === productoId); assert.equal(p.stock, -2);
        detalle = (await admin(`/sales/${fiadoId}`)).data; assert.equal(detalle.caja.length, 0); assert.equal(Number(detalle.saldo), 6);
        assert.equal(detalle.detalles[0].sin_existencia, 2);
        const abono = { clave: `ABONO-${tag}`, importe: 2 };
        const parcial = await vendedor(`/sales/${fiadoId}/payments`, 'POST', abono);
        assert.equal(parcial.status, 201); assert.equal(parcial.data.saldo, 4);
        assert.equal((await vendedor(`/sales/${fiadoId}/payments`, 'POST', abono)).status, 200);
        assert.equal((await vendedor(`/sales/${fiadoId}/payments`, 'POST', { clave: `EXCESO-${tag}`, importe: 5 })).status, 409);
        assert.equal((await vendedor(`/sales/${fiadoId}/payments`, 'POST', { clave: `FINAL-${tag}`, importe: 4 })).status, 201);
        const historial = (await vendedor(`/customers/${clienteId}/receivables`)).data;
        assert.equal(historial.totalAdeudado, 6); assert.equal(historial.abonado, 6); assert.equal(historial.saldo, 0);
        detalle = (await admin(`/sales/${fiadoId}`)).data; assert.equal(detalle.abonos.length, 2);
        assert.ok(detalle.abonos.every(a => a.usuario_id === v.data.usuario.id));
        etapa = 'permisos_y_correccion';
        const editar = { ...datos, clave: `EDITAR-${tag}`, version: 1, motivo: 'Ensayo de corrección', confirmarReembolso: true,
            detalles: [{ productoId, cantidad: 1, precio: 2 }] };
        assert.equal((await vendedor(`/sales/${ventaId}`, 'PATCH', editar)).status, 403);
        const anular = { clave: `ANULAR-${tag}`, version: 3, motivo: 'Ensayo de anulación', confirmarReembolso: true };
        assert.equal((await vendedor(`/sales/${fiadoId}/void`, 'POST', anular)).status, 403);
        assert.equal((await admin(`/sales/${ventaId}`, 'PATCH', editar)).status, 200);
        assert.equal((await admin(`/sales/${fiadoId}/void`, 'POST', anular)).status, 200);
        assert.equal((await admin(`/sales/${fiadoId}/void`, 'POST', anular)).status, 200);
        detalle = (await admin(`/sales/${fiadoId}`)).data;
        assert.equal(detalle.estado, 'Anulada'); assert.equal(detalle.abonos.length, 2);
        assert.equal(detalle.caja.reduce((n,c) => n + Number(c.importe), 0), 0);
        informe.comprobaciones.push('Contado, FEFO, fiado y stock negativo con confirmación física',
            'Abonos parciales y completos, sobrepago rechazado e idempotencia',
            'Historial por cliente y responsable; solo Administrador edita/anula; reembolso sin borrar pagos');
        assert.equal((await vendedor('/auth/logout', 'POST', {})).status, 204);
        assert.equal((await admin('/auth/logout', 'POST', {})).status, 204);
        etapa = 'rollback'; await connection.rollback();
        const [despues] = await connection.execute('SELECT * FROM usuarios WHERE id=?', [antes[0].id]); assert.deepEqual(despues, antes);
        const [sesionesDespues] = await connection.execute('SELECT * FROM sesiones WHERE usuario_id=? ORDER BY token_hash', [antes[0].id]); assert.deepEqual(sesionesDespues, sesiones);
        etapa = 'conservacion_estado_previo';
        assert.deepEqual(await capturarEstado(connection), estadoPrevio);
        const verificaciones = [
            ['SELECT COUNT(*) AS total FROM ventas WHERE id IN (?,?)', [ventaId, fiadoId]],
            ['SELECT COUNT(*) AS total FROM venta_detalles WHERE venta_id IN (?,?)', [ventaId, fiadoId]],
            ['SELECT COUNT(*) AS total FROM venta_abonos WHERE venta_id IN (?,?)', [ventaId, fiadoId]],
            ['SELECT COUNT(*) AS total FROM venta_caja WHERE venta_id IN (?,?)', [ventaId, fiadoId]],
            ['SELECT COUNT(*) AS total FROM venta_historial WHERE venta_id IN (?,?)', [ventaId, fiadoId]],
            ['SELECT COUNT(*) AS total FROM venta_operaciones WHERE clave IN (?,?,?,?,?,?)', [`CONTADO-${tag}`,`FIADO-${tag}`,`ABONO-${tag}`,`FINAL-${tag}`,`EDITAR-${tag}`,`ANULAR-${tag}`]],
            ['SELECT COUNT(*) AS total FROM lotes WHERE producto_id IN (?,?)', [productoId,caducadoId]],
            ['SELECT COUNT(*) AS total FROM movimientos_inventario WHERE producto_id IN (?,?)', [productoId,caducadoId]],
            ['SELECT COUNT(*) AS total FROM productos WHERE id IN (?,?)', [productoId,caducadoId]],
            ['SELECT COUNT(*) AS total FROM proveedores WHERE id=?', [proveedorId]],
            ['SELECT COUNT(*) AS total FROM clientes WHERE id=?', [clienteId]],
            ['SELECT COUNT(*) AS total FROM usuarios WHERE id=?', [v.data.usuario.id]],
            ['SELECT COUNT(*) AS total FROM sesiones WHERE usuario_id=?', [v.data.usuario.id]],
            ['SELECT COUNT(*) AS total FROM auditoria_usuarios WHERE usuario_afectado_id=?', [v.data.usuario.id]]
        ];
        for (const [sql, params] of verificaciones) { const [r] = await connection.execute(sql, params); assert.equal(r[0].total, 0); }
        informe.comprobaciones.push('Rollback confirmado; Administrador y sesiones previas conservados; datos temporales ausentes');
        informe.comprobaciones.push('Estado previo conservado en las catorce tablas de autenticación, catálogo, inventario y pedidos');
        informe.ok = true;
    } catch { informe.etapaFallida = etapa; process.exitCode = 1; }
    finally {
        delete process.env.AUTH_CHECK_PASSWORD;
        const cierre = await cerrarVerificacion({ server, connection, pool });
        informe.rollback = cierre.rollback;
        if (cierre.errores.length) { informe.ok = false; informe.erroresLimpieza = cierre.errores; process.exitCode = 1; }
        console.log(JSON.stringify(informe, null, 2));
    }
}
if (require.main === module) verificar().catch(() => { console.error('No se pudo cerrar la verificación.'); process.exitCode = 1; });
module.exports = { verificar, capturarEstado };
