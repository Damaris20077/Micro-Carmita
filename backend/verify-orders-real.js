// Ensayo manual posterior a 003. Una conexión y ROLLBACK, sin registros permanentes.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { crearPool } = require('./database');
const { crearRepositorio } = require('./auth-repository');
const { crearInventarioRepositorio } = require('./inventory-repository');
const { crearPedidosRepositorio } = require('./order-repository');
const { crearApp } = require('./app');
const { cerrarVerificacion } = require('./verification-cleanup');
const M = require('../modelo');

async function verificar() {
    let pool, connection, server;
    let etapa = 'credenciales';
    const informe = { ok: false, rollback: false, comprobaciones: [] };
    try {
        if (!process.env.AUTH_CHECK_USER || !process.env.AUTH_CHECK_PASSWORD) throw new Error();
        pool = crearPool(); connection = await pool.getConnection();
        etapa = 'migracion_003';
        const [version] = await connection.execute('SELECT version FROM schema_migrations WHERE version=?', ['003_pedidos_recepciones']);
        assert.equal(version.length, 1);
        const [motores] = await connection.query(`SELECT ENGINE FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()
            AND TABLE_NAME IN ('usuarios','sesiones','auditoria_usuarios','proveedores','productos','lotes','movimientos_inventario',
            'pedidos','pedido_detalles','recepciones','recepcion_detalles')`);
        assert.equal(motores.length, 11); assert.ok(motores.every(t => t.ENGINE === 'InnoDB'));
        await connection.beginTransaction();
        const [adminAntes] = await connection.execute('SELECT * FROM usuarios WHERE usuario=?', [process.env.AUTH_CHECK_USER]);
        assert.equal(adminAntes.length, 1); assert.equal(adminAntes[0].rol, 'administrador'); assert.equal(adminAntes[0].activo, 1);
        const [sesionesAntes] = await connection.execute('SELECT * FROM sesiones WHERE usuario_id=? ORDER BY token_hash', [adminAntes[0].id]);
        const puente = {
            execute: (...args) => connection.execute(...args),
            async getConnection() { return {
                execute: (...args) => connection.execute(...args),
                async beginTransaction() { await connection.query('SAVEPOINT pedido_ensayo'); },
                async commit() { await connection.query('RELEASE SAVEPOINT pedido_ensayo'); },
                async rollback() { await connection.query('ROLLBACK TO SAVEPOINT pedido_ensayo'); }, release() {}
            }; }
        };
        const origin = 'http://127.0.0.1:3000';
        server = crearApp({ repository: crearRepositorio(puente), inventoryRepository: crearInventarioRepositorio(puente),
            orderRepository: crearPedidosRepositorio(puente), origin }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api`;
        function cliente() {
            let cookie = '', csrf = '';
            return async (ruta, method = 'GET', body) => {
                const r = await fetch(base + ruta, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
                if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
                const data = r.status === 204 ? {} : await r.json();
                if (data.csrfToken) csrf = data.csrfToken;
                return { status: r.status, data };
            };
        }
        etapa = 'login';
        const admin = cliente();
        assert.equal((await admin('/auth/login', 'POST', { usuario: process.env.AUTH_CHECK_USER, clave: process.env.AUTH_CHECK_PASSWORD })).status, 200);
        delete process.env.AUTH_CHECK_PASSWORD;
        const tag = randomBytes(8).toString('hex');
        etapa = 'datos_temporales';
        const proveedor = await admin('/proveedores', 'POST', { nombre: `QA pedido ${tag}` }); assert.equal(proveedor.status, 201);
        const proveedorId = proveedor.data.registro.id;
        const p = await admin('/products', 'POST', { nombre: `QA producto pedido ${tag}`, categoria: 'Ensayo', precioCompra: 1, precioVenta: 2,
            proveedorId, codigo: `BASE-${tag}`, cantidad: 0, fechaIngreso: M.hoy(), caducidad: '' }); assert.equal(p.status, 201);
        const productoId = p.data.productoId;
        assert.equal((await admin(`/products/${productoId}/adjustments`, 'POST', { cantidad: -2, motivo: 'Faltante temporal del ensayo' })).status, 200);
        const clave = randomBytes(32).toString('hex');
        const usuario = `qa_p_${tag}`;
        const v = await admin('/users', 'POST', { nombre: 'QA recepciones', usuario, clave, rol: 'vendedor' }); assert.equal(v.status, 201);
        const vendedor = cliente(); assert.equal((await vendedor('/auth/login', 'POST', { usuario, clave })).status, 200);
        const nuevo = { proveedorId, detalles: [{ productoId, cantidad: 5, precioCompra: 1 }] };
        etapa = 'permisos_y_pedido';
        assert.equal((await vendedor('/orders', 'POST', nuevo)).status, 403);
        const creado = await admin('/orders', 'POST', nuevo); assert.equal(creado.status, 201);
        const pedidoId = creado.data.id;
        const detalle = (await vendedor(`/orders/${pedidoId}`)).data.detalles[0];
        assert.equal((await vendedor(`/orders/${pedidoId}/cancel`, 'POST', { motivo: 'Intento' })).status, 403);
        informe.comprobaciones.push('Administrador crea; Vendedor consulta y recibe; crear y cancelar por Vendedor HTTP 403');
        const body = { clave: `QA-${tag}`, lineas: [{ detalleId: detalle.id, cantidad: 2, codigo: `REC1-${tag}`, fechaIngreso: M.hoy(), caducidad: '', precioCompra: 1 }] };
        etapa = 'recepcion_parcial';
        const recibido = await vendedor(`/orders/${pedidoId}/receipts`, 'POST', body);
        assert.equal(recibido.status, 201); assert.equal(recibido.data.estado, 'Recibido parcialmente');
        assert.equal((await vendedor(`/orders/${pedidoId}/receipts`, 'POST', body)).status, 200);
        let inventario = (await admin('/inventory')).data.productos.find(x => x.id === productoId);
        assert.equal(inventario.stock, 0); assert.equal(inventario.faltante, 0);
        assert.equal((await vendedor(`/orders/${pedidoId}/receipts`, 'POST', { ...body, clave: `OTRA-${tag}`, lineas: [{ ...body.lineas[0], cantidad: 4 }] })).status, 409);
        etapa = 'recepcion_completa';
        const segunda = { clave: `QA2-${tag}`, lineas: [{ ...body.lineas[0], cantidad: 3, codigo: `REC2-${tag}` }] };
        const final = await vendedor(`/orders/${pedidoId}/receipts`, 'POST', segunda);
        assert.equal(final.status, 201); assert.equal(final.data.estado, 'Recibido completo');
        assert.equal((await vendedor(`/orders/${pedidoId}/receipts`, 'POST', { ...segunda, clave: `EXTRA-${tag}` })).status, 409);
        inventario = (await admin('/inventory')).data.productos.find(x => x.id === productoId);
        assert.equal(inventario.stock, 3);
        const consulta = (await admin(`/orders/${pedidoId}`)).data;
        assert.equal(consulta.detalles[0].recibida, 5);
        assert.equal(consulta.recepciones.length, 2);
        assert.ok(consulta.recepciones.every(r => r.usuario_id === v.data.usuario.id));
        informe.comprobaciones.push('Parcial y completa, idempotencia, exceso rechazado, trazabilidad y conciliación de faltantes');
        etapa = 'cancelacion';
        const cancelable = await admin('/orders', 'POST', nuevo); assert.equal(cancelable.status, 201);
        assert.equal((await admin(`/orders/${cancelable.data.id}/cancel`, 'POST', { motivo: 'Ensayo reversible' })).status, 200);
        assert.equal((await vendedor(`/orders/${cancelable.data.id}/receipts`, 'POST', body)).status, 409);
        informe.comprobaciones.push('Cancelación administrativa y recepción de cancelado rechazada');
        await vendedor('/auth/logout', 'POST', {}); await admin('/auth/logout', 'POST', {});
        etapa = 'rollback'; await connection.rollback(); informe.rollback = true;
        const [despues] = await connection.execute('SELECT * FROM usuarios WHERE id=?', [adminAntes[0].id]); assert.deepEqual(despues, adminAntes);
        const [sesionesDespues] = await connection.execute('SELECT * FROM sesiones WHERE usuario_id=? ORDER BY token_hash', [adminAntes[0].id]); assert.deepEqual(sesionesDespues, sesionesAntes);
        for (const [tabla, id] of [['pedidos', pedidoId], ['pedidos', cancelable.data.id], ['productos', productoId], ['proveedores', proveedorId], ['usuarios', v.data.usuario.id]]) {
            const [r] = await connection.execute(`SELECT COUNT(*) AS total FROM ${tabla} WHERE id=?`, [id]); assert.equal(r[0].total, 0);
        }
        informe.comprobaciones.push('Rollback: cuentas y datos temporales ausentes, Administrador y sesiones conservados');
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
verificar().catch(() => { console.error('No se pudo cerrar la verificación.'); process.exitCode = 1; });
