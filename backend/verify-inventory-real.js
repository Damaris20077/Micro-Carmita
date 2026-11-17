// Ejecución manual posterior a 002. Datos de ensayo aislados con ROLLBACK final.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { crearPool } = require('./database');
const { crearRepositorio } = require('./auth-repository');
const { crearInventarioRepositorio } = require('./inventory-repository');
const { crearApp } = require('./app');
const M = require('../modelo');
const { cerrarVerificacion } = require('./verification-cleanup');

async function verificar() {
    const informe = { ok: false, comprobaciones: [], rollback: false };
    let etapa = 'credenciales';
    let pool;
    let connection;
    let server;
    try {
        if (!process.env.AUTH_CHECK_USER || !process.env.AUTH_CHECK_PASSWORD) throw new Error();
        pool = crearPool();
        connection = await pool.getConnection();
        etapa = 'migracion_002';
        const [versiones] = await connection.execute('SELECT version FROM schema_migrations WHERE version=?', ['002_catalogo_inventario']);
        assert.equal(versiones.length, 1);
        etapa = 'tablas_transaccionales';
        const [motores] = await connection.query(`SELECT TABLE_NAME, ENGINE FROM information_schema.tables
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
            ('usuarios','sesiones','auditoria_usuarios','clientes','proveedores','productos','lotes','movimientos_inventario')`);
        assert.equal(motores.length, 8);
        assert.ok(motores.every(tabla => tabla.ENGINE === 'InnoDB'));
        await connection.beginTransaction();
        // Los datos privados se comparan únicamente en memoria. El catch nunca
        // imprime las excepciones de assert ni sus valores.
        const [previo] = await connection.execute('SELECT * FROM usuarios WHERE usuario=?', [process.env.AUTH_CHECK_USER]);
        assert.equal(previo.length, 1);
        assert.equal(previo[0].rol, 'administrador');
        assert.equal(previo[0].activo, 1);
        const [sesionesPrevias] = await connection.execute('SELECT * FROM sesiones WHERE usuario_id=? ORDER BY token_hash', [previo[0].id]);
        const cuentasTemporales = [];
        const puente = {
            execute: (...args) => connection.execute(...args),
            async getConnection() {
                return {
                    execute: (...args) => connection.execute(...args),
                    async beginTransaction() { await connection.query('SAVEPOINT inventario_ensayo'); },
                    async commit() { await connection.query('RELEASE SAVEPOINT inventario_ensayo'); },
                    async rollback() { await connection.query('ROLLBACK TO SAVEPOINT inventario_ensayo'); },
                    release() {}
                };
            }
        };
        const origin = 'http://127.0.0.1:3000';
        server = crearApp({ repository: crearRepositorio(puente), inventoryRepository: crearInventarioRepositorio(puente), origin })
            .listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}`;
        function cliente() {
            let cookie = '';
            let csrf = '';
            return async (ruta, metodo = 'GET', body) => {
                const r = await fetch(base + '/api' + ruta, { method: metodo,
                    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
                    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
                if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
                const datos = r.status === 204 ? {} : await r.json();
                if (datos.csrfToken) csrf = datos.csrfToken;
                return { status: r.status, datos };
            };
        }
        const admin = cliente();
        etapa = 'login';
        assert.equal((await admin('/auth/login', 'POST', { usuario: process.env.AUTH_CHECK_USER, clave: process.env.AUTH_CHECK_PASSWORD })).status, 200);
        delete process.env.AUTH_CHECK_PASSWORD;
        const tag = randomBytes(8).toString('hex');
        etapa = 'contactos';
        const proveedor = await admin('/proveedores', 'POST', { nombre: `QA proveedor ${tag}`, identificacion: `QA-P-${tag}` });
        assert.equal(proveedor.status, 201);
        const proveedorId = proveedor.datos.registro.id;
        cuentasTemporales.push(['proveedores', proveedorId]);
        const persona = await admin('/clientes', 'POST', { nombre: `QA cliente ${tag}`, identificacion: `QA-C-${tag}` });
        assert.equal(persona.status, 201);
        cuentasTemporales.push(['clientes', persona.datos.registro.id]);
        assert.ok((await admin('/clientes')).datos.registros.some(c => c.id === persona.datos.registro.id));
        assert.ok((await admin('/proveedores')).datos.registros.some(p => p.id === proveedorId));
        informe.comprobaciones.push('RF-09 y RF-20: alta HTTP 201 y consulta de cliente/proveedor');
        const fecha = M.hoy();
        const dias = n => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
        const producto = { nombre: `QA producto ${tag}`, categoria: 'Ensayo', precioCompra: 0.8, precioVenta: 1.2,
            proveedorId, codigo: `L1-${tag}`, cantidad: 2, fechaIngreso: fecha, caducidad: dias(5) };
        etapa = 'producto_lotes';
        const alta = await admin('/products', 'POST', producto);
        assert.equal(alta.status, 201);
        const productoId = alta.datos.productoId;
        cuentasTemporales.push(['productos', productoId]);
        const leerProducto = async () => (await admin('/inventory')).datos.productos.find(p => p.id === productoId);
        assert.equal((await leerProducto()).stock, 2);
        assert.equal((await leerProducto()).precio_compra, 0.8);
        const lote = (codigo, caducidad, cantidad = 1) => ({ codigo, caducidad, cantidad, fechaIngreso: fecha, proveedorId, precioCompra: 0.9 });
        assert.equal((await admin(`/products/${productoId}/lots`, 'POST', lote(`L2-${tag}`, dias(6)))).status, 201);
        assert.equal((await leerProducto()).stock, 3);
        assert.equal((await leerProducto()).stockBajo, false);
        assert.equal((await admin(`/products/${productoId}/lots`, 'POST', lote(`CAD-${tag}`, dias(-1)))).status, 201);
        let p = await leerProducto();
        assert.equal(p.lotes.length, 3);
        assert.equal(p.lotes.find(l => l.codigo === producto.codigo).estado, 'Por caducar');
        assert.equal(p.lotes.find(l => l.codigo === `L2-${tag}`).estado, 'Vigente');
        assert.equal(p.lotes.find(l => l.codigo === `CAD-${tag}`).estado, 'Caducado');
        const alertas = (await admin('/inventory/alerts')).datos;
        assert.ok(alertas.caducidad.some(l => l.producto_id === productoId && l.estado === 'Caducado'));
        informe.comprobaciones.push('RF-14, RF-15 y RF-16: precios, tres lotes, límite cinco/seis días y vencidos');
        etapa = 'validaciones';
        for (const extra of [{ precioCompra: -1 }, { cantidad: 1.5 }, { caducidad: '2026-02-30' }, { proveedorId: 4294967295 }]) {
            assert.equal((await admin('/products', 'POST', { ...producto, ...extra })).status, 400);
        }
        assert.equal((await admin('/products', 'POST', producto)).status, 409);
        assert.equal((await admin(`/products/${productoId}/lots`, 'POST', lote(producto.codigo, dias(5)))).status, 409);
        assert.equal((await admin(`/products/${productoId}/adjustments`, 'POST', { cantidad: -1, motivo: '' })).status, 400);
        informe.comprobaciones.push('Validación: precios, cantidades, fechas, proveedor, motivo y duplicados rechazados');
        etapa = 'ajustes';
        for (const [cantidad, esperado] of [[-2, 2], [-2, 0], [-2, -2]]) {
            assert.equal((await admin(`/products/${productoId}/adjustments`, 'POST', { cantidad, motivo: 'Ensayo reversible' })).status, 200);
            p = await leerProducto();
            assert.equal(p.stock, esperado);
            assert.equal(p.stockBajo, true);
        }
        assert.equal((await admin(`/products/${productoId}/lots`, 'POST', lote(`REG-${tag}`, dias(10), 5))).status, 201);
        p = await leerProducto();
        assert.equal(p.stock, 3);
        assert.equal(p.faltante, 0);
        assert.equal(p.stockBajo, false);
        const historial = (await admin(`/products/${productoId}/history`)).datos.movimientos;
        assert.ok(historial.some(m => m.tipo === 'ajuste' && m.usuario_id === previo[0].id && m.motivo === 'Ensayo reversible'));
        for (const m of historial) assert.equal(Number(m.stock_despues), Number(m.stock_antes) + m.cantidad);
        informe.comprobaciones.push('RF-17 y RF-18: stock 2, 0, negativo, 3; motivo, responsable e historial; conciliación');
        etapa = 'permisos';
        const usuarioTemporal = `qa_${tag}`;
        const claveTemporal = randomBytes(32).toString('hex');
        const vendedorAlta = await admin('/users', 'POST', { nombre: 'QA reversible', usuario: usuarioTemporal, clave: claveTemporal, rol: 'vendedor' });
        assert.equal(vendedorAlta.status, 201);
        cuentasTemporales.push(['usuarios', vendedorAlta.datos.usuario.id]);
        const vendedor = cliente();
        assert.equal((await vendedor('/auth/login', 'POST', { usuario: usuarioTemporal, clave: claveTemporal })).status, 200);
        assert.equal((await vendedor('/inventory')).status, 200);
        assert.equal((await vendedor('/products', 'POST', producto)).status, 403);
        assert.equal((await vendedor(`/products/${productoId}/lots`, 'POST', lote(`DEN-${tag}`, dias(10)))).status, 403);
        assert.equal((await vendedor(`/products/${productoId}/adjustments`, 'POST', { cantidad: -1, motivo: 'Intento' })).status, 403);
        assert.equal((await vendedor('/proveedores', 'POST', { nombre: 'Intento' })).status, 403);
        const clienteVendedor = await vendedor('/clientes', 'POST', { nombre: `QA cliente vendedor ${tag}` });
        assert.equal(clienteVendedor.status, 201);
        cuentasTemporales.push(['clientes', clienteVendedor.datos.registro.id]);
        informe.comprobaciones.push('Permisos: Administrador escribe; Vendedor consulta y registra cliente, escrituras administrativas HTTP 403');
        await vendedor('/auth/logout', 'POST', {});
        await admin('/auth/logout', 'POST', {});
        etapa = 'limpieza';
        await connection.rollback();
        informe.rollback = true;
        const [restos] = await connection.execute('SELECT COUNT(*) AS total FROM productos WHERE id=?', [productoId]);
        assert.equal(restos[0].total, 0);
        const [cuenta] = await connection.execute('SELECT * FROM usuarios WHERE id=?', [previo[0].id]);
        assert.deepEqual(cuenta, previo);
        const [sesionesPosteriores] = await connection.execute('SELECT * FROM sesiones WHERE usuario_id=? ORDER BY token_hash', [previo[0].id]);
        assert.deepEqual(sesionesPosteriores, sesionesPrevias);
        const [temporal] = await connection.execute('SELECT COUNT(*) AS total FROM usuarios WHERE usuario=?', [usuarioTemporal]);
        assert.equal(temporal[0].total, 0);
        for (const [tabla, id] of cuentasTemporales) {
            const [filas] = await connection.execute(`SELECT COUNT(*) AS total FROM ${tabla} WHERE id=?`, [id]);
            assert.equal(filas[0].total, 0);
        }
        const [lotesRestantes] = await connection.execute('SELECT COUNT(*) AS total FROM lotes WHERE producto_id=?', [productoId]);
        const [movimientosRestantes] = await connection.execute('SELECT COUNT(*) AS total FROM movimientos_inventario WHERE producto_id=?', [productoId]);
        assert.equal(lotesRestantes[0].total, 0);
        assert.equal(movimientosRestantes[0].total, 0);
        informe.comprobaciones.push('Limpieza: registros temporales ausentes; Administrador y sesiones previas conservados');
        informe.ok = true;
    } catch {
        informe.etapaFallida = etapa;
        process.exitCode = 1;
    } finally {
        delete process.env.AUTH_CHECK_PASSWORD;
        const cierre = await cerrarVerificacion({ server, connection, pool });
        informe.rollback = cierre.rollback;
        if (cierre.errores.length) {
            informe.ok = false;
            informe.erroresLimpieza = cierre.errores;
            process.exitCode = 1;
        }
        console.log(JSON.stringify(informe, null, 2));
    }
}
verificar().catch(() => { console.error('No se pudo completar el cierre de la verificación.'); process.exitCode = 1; });
