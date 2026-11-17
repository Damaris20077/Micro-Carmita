// Ensayo manual contra MySQL. Todas las escrituras se revierten al terminar.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { crearPool } = require('./database');
const { crearRepositorio } = require('./auth-repository');
const { crearApp } = require('./app');
const { digest } = require('./auth-service');
const { hashPassword } = require('./passwords');

async function verificar() {
    const informe = { ok: false, comprobaciones: [], rollback: false };
    let etapa = 'credenciales';
    let pool;
    let conexion;
    let server;
    let productionServer;
    let superusuarioTemporal;
    let usuarioTemporal;
    const sesiones = [];
    const rutaInforme = path.join(__dirname, '..', '.auth-validation-result.tmp');
    try {
        if (!process.env.AUTH_CHECK_USER || !process.env.AUTH_CHECK_PASSWORD) throw new Error();
        pool = crearPool();
        etapa = 'conexion';
        conexion = await pool.getConnection();
        await conexion.beginTransaction();
        const [previo] = await conexion.execute('SELECT id, nombre, usuario, rol, activo FROM usuarios WHERE usuario = ?', [process.env.AUTH_CHECK_USER]);
        assert.equal(previo.length, 1);
        assert.equal(previo[0].rol, 'administrador');
        assert.equal(previo[0].activo, 1);
        // Las transacciones del repositorio se convierten en savepoints de esta
        // conexión exclusiva. Ninguna operación puede confirmar la transacción externa.
        const puente = {
            execute: (...args) => conexion.execute(...args),
            async getConnection() {
                return {
                    execute: (...args) => conexion.execute(...args),
                    async beginTransaction() { await conexion.query('SAVEPOINT auth_check'); },
                    async commit() { await conexion.query('RELEASE SAVEPOINT auth_check'); },
                    async rollback() { await conexion.query('ROLLBACK TO SAVEPOINT auth_check'); },
                    release() {}
                };
            }
        };
        const origin = 'http://127.0.0.1:3000';
        server = crearApp({ repository: crearRepositorio(puente), origin, allowSuperuser: false }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}`;
        function cliente() {
            let cookie = '';
            let csrf = '';
            return async (ruta, metodo = 'GET', datos) => {
                const respuesta = await fetch(base + ruta, {
                    method: metodo, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
                    body: datos === undefined ? undefined : JSON.stringify(datos), signal: AbortSignal.timeout(10000)
                });
                // Tras logout conservamos deliberadamente la cookie antigua para
                // comprobar el rechazo por revocación, incluso si se reutiliza el token.
                if (respuesta.headers.has('set-cookie') && ruta.endsWith('/login')) {
                    cookie = respuesta.headers.get('set-cookie').split(';')[0];
                    sesiones.push(digest(cookie.slice('mc_session='.length)));
                }
                const body = respuesta.status === 204 ? {} : await respuesta.json();
                if (body.csrfToken) csrf = body.csrfToken;
                return { status: respuesta.status, body };
            };
        }
        const admin = cliente();
        etapa = 'login_administrador';
        assert.equal((await admin('/api/auth/login', 'POST', {
            usuario: process.env.AUTH_CHECK_USER, clave: process.env.AUTH_CHECK_PASSWORD
        })).status, 200);
        delete process.env.AUTH_CHECK_PASSWORD;
        informe.comprobaciones.push('RF-01: login Administrador HTTP 200');
        assert.equal((await admin('/api/auth/me')).status, 200);
        assert.equal((await admin('/api/users')).status, 200);
        etapa = 'crear_vendedor_temporal';
        usuarioTemporal = `qa_${randomBytes(10).toString('hex')}`;
        const claveTemporal = randomBytes(32).toString('hex');
        const creado = await admin('/api/users', 'POST', { nombre: 'Ensayo reversible', usuario: usuarioTemporal, clave: claveTemporal, rol: 'vendedor' });
        assert.equal(creado.status, 201);
        const id = creado.body.usuario.id;
        informe.comprobaciones.push('RF-03: crear usuario HTTP 201');
        const vendedor = cliente();
        etapa = 'permisos_vendedor';
        assert.equal((await vendedor('/api/auth/login', 'POST', { usuario: usuarioTemporal, clave: claveTemporal })).status, 200);
        assert.equal((await vendedor('/api/users')).status, 403);
        assert.equal((await vendedor('/api/users', 'POST', {})).status, 403);
        assert.equal((await vendedor(`/api/users/${previo[0].id}`, 'PATCH', { activo: false })).status, 403);
        informe.comprobaciones.push('RF-02: Vendedor sin acceso a listar, crear o modificar usuarios HTTP 403');
        etapa = 'modificacion_y_revocacion';
        assert.equal((await admin(`/api/users/${id}`, 'PATCH', { nombre: 'Ensayo modificado' })).status, 200);
        assert.equal((await vendedor('/api/auth/me')).status, 401);
        assert.equal((await admin(`/api/users/${id}`, 'PATCH', { activo: false })).status, 200);
        assert.equal((await vendedor('/api/auth/login', 'POST', { usuario: usuarioTemporal, clave: claveTemporal })).status, 401);
        assert.equal((await admin(`/api/users/${id}`, 'PATCH', { activo: true })).status, 200);
        assert.equal((await vendedor('/api/auth/login', 'POST', { usuario: usuarioTemporal, clave: claveTemporal })).status, 200);
        informe.comprobaciones.push('RF-03: modificar, desactivar y activar HTTP 200; revocación y cuenta inactiva HTTP 401');
        etapa = 'logout';
        for (const pedir of [vendedor, admin]) {
            assert.equal((await pedir('/api/auth/logout', 'POST', {})).status, 204);
            assert.equal((await pedir('/api/auth/me')).status, 401);
        }
        for (const hash of sesiones) {
            const [rows] = await conexion.execute('SELECT revocada_en IS NOT NULL AS revocada FROM sesiones WHERE token_hash = ?', [hash]);
            assert.equal(rows[0].revocada, 1);
        }
        informe.comprobaciones.push('RF-01: logout HTTP 204, rechazo del token revocado HTTP 401 y revocación persistida en transacción MySQL');
        etapa = 'superusuario_produccion';
        // Cuenta y catálogo de ensayo dentro de la misma transacción reversible.
        await conexion.execute("INSERT INTO roles (codigo) SELECT 'superusuario' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE codigo = 'superusuario')");
        superusuarioTemporal = `qs_${randomBytes(10).toString('hex')}`;
        const claveSuper = randomBytes(32).toString('hex');
        const repo = crearRepositorio(puente);
        const superuser = await repo.createUser({ nombre: 'Ensayo de bloqueo en producción', usuario: superusuarioTemporal,
            password_hash: await hashPassword(claveSuper), rol: 'superusuario', activo: true });
        const tokenSuper = randomBytes(32).toString('hex');
        await repo.createSession(digest(tokenSuper), superuser.id);
        sesiones.push(digest(tokenSuper));
        const origenProduccion = 'https://micro.example';
        productionServer = crearApp({ repository: repo, production: true, origin: origenProduccion, allowSuperuser: true }).listen(0, '127.0.0.1');
        await once(productionServer, 'listening');
        const baseProduccion = `http://127.0.0.1:${productionServer.address().port}`;
        const loginSuper = await fetch(baseProduccion + '/api/auth/login', {
            method: 'POST', headers: { Origin: origenProduccion, 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: superusuarioTemporal, clave: claveSuper }), signal: AbortSignal.timeout(10000)
        });
        assert.equal(loginSuper.status, 401);
        await loginSuper.text();
        const sesionSuper = await fetch(baseProduccion + '/api/auth/me', {
            headers: { Cookie: `mc_session=${tokenSuper}` }, signal: AbortSignal.timeout(10000)
        });
        assert.equal(sesionSuper.status, 401);
        await sesionSuper.text();
        informe.comprobaciones.push('Superusuario con MySQL real: login y sesión preexistente HTTP 401 en aplicación configurada como producción');
        etapa = 'rollback';
        await conexion.rollback();
        informe.rollback = true;
        const [restante] = await conexion.execute('SELECT COUNT(*) AS total FROM usuarios WHERE usuario = ?', [usuarioTemporal]);
        assert.equal(restante[0].total, 0);
        const [restanteSuper] = await conexion.execute('SELECT COUNT(*) AS total FROM usuarios WHERE usuario = ?', [superusuarioTemporal]);
        assert.equal(restanteSuper[0].total, 0);
        const [posterior] = await conexion.execute('SELECT id, nombre, usuario, rol, activo FROM usuarios WHERE id = ?', [previo[0].id]);
        assert.deepEqual(posterior, previo);
        for (const hash of sesiones) {
            const [rows] = await conexion.execute('SELECT COUNT(*) AS total FROM sesiones WHERE token_hash = ?', [hash]);
            assert.equal(rows[0].total, 0);
        }
        informe.comprobaciones.push('Limpieza: cuenta temporal y sesiones ausentes, Administrador conservado');
        informe.ok = true;
    } catch {
        informe.etapaFallida = etapa;
        process.exitCode = 1;
    } finally {
        delete process.env.AUTH_CHECK_PASSWORD;
        if (productionServer) await new Promise(resolve => productionServer.close(resolve));
        if (server) await new Promise(resolve => server.close(resolve));
        if (conexion) {
            try { await conexion.rollback(); informe.rollback = true; }
            catch { informe.ok = false; informe.rollback = false; process.exitCode = 1; }
            conexion.release();
        }
        if (pool) await pool.end();
        fs.writeFileSync(rutaInforme, JSON.stringify(informe, null, 2));
        console.log(JSON.stringify(informe, null, 2));
    }
}

verificar().catch(() => {
    console.error('No se pudo completar la comprobación o su cierre. Revise el estado antes de repetir.');
    process.exitCode = 1;
});
