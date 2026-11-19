const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes, createHash } = require('node:crypto');
const { crearApp } = require('./app');
const { crearAuth, digest } = require('./auth-service');
const { hashPassword, verifyPassword } = require('./passwords');
const { crearRepositorio } = require('./auth-repository');

for (const rol of ['administrador', 'vendedor']) {
    for (const longitud of [7, 8, 128, 129]) {
        test(`creación y cambio de contraseña ${rol} con ${longitud} caracteres`, async () => {
            const f = await preparar();
            const clave = randomBytes(65).toString('hex').slice(0, longitud);
            const datos = { nombre: 'Cuenta de límites', usuario: 'limites', rol, clave };
            if (longitud < 8 || longitud > 128) {
                await assert.rejects(f.auth.create(f.admin, datos), { status: 400 });
                await assert.rejects(f.auth.update(f.admin, rol === 'administrador' ? 1 : 2, { clave }), { status: 400 });
                assert.equal(f.estado.audits.length, 0);
                assert.equal(f.estado.users.length, 3);
                return;
            }
            const creado = await f.auth.create(f.admin, datos);
            assert.equal((await f.auth.login({ usuario: creado.usuario, clave })).usuario.id, creado.id);
            const nueva = randomBytes(65).toString('hex').slice(0, longitud);
            await f.auth.update(f.admin, creado.id, { clave: nueva });
            await assert.rejects(f.auth.login({ usuario: creado.usuario, clave }), { status: 401 });
            assert.equal((await f.auth.login({ usuario: creado.usuario, clave: nueva })).usuario.id, creado.id);
        });
    }
}

test('creación y cambio rechazan contraseñas comunes sin alterar cuentas', async () => {
    const f = await preparar();
    await assert.rejects(f.auth.create(f.admin, { nombre: 'Cuenta', usuario: 'cuenta', rol: 'vendedor', clave: 'Password123!' }), { status: 400 });
    await assert.rejects(f.auth.update(f.admin, 2, { clave: 'Password123!' }), { status: 400 });
    await assert.rejects(f.auth.update(f.admin, 2, { clave: 'venta.prueba2026!' }), { status: 400 });
    assert.equal(f.estado.audits.length, 0);
});

test('login sigue aceptando una contraseña histórica que la nueva política rechaza', async () => {
    const f = await preparar();
    const antigua = randomBytes(3).toString('hex');
    f.estado.users[1].password_hash = await cryptoSimulado.hashPassword(antigua);
    assert.equal((await f.auth.login({ usuario: f.vendedor.usuario, clave: antigua })).usuario.id, 2);
});

// Sustituto rápido para aislar validación, permisos y transacciones.
// El algoritmo de producción se verifica por separado y mediante HTTP real.
const cryptoSimulado = {
    async hashPassword(clave) { return createHash('sha256').update(clave).digest('hex'); },
    async verifyPassword(clave, hash) { return await this.hashPassword(clave) === hash; }
};

async function preparar({ crypto = cryptoSimulado, allowSuperuser = false } = {}) {
    const clave = randomBytes(24).toString('hex');
    const hash = await crypto.hashPassword(clave);
    const estado = {
        users: [
            { id: 1, nombre: 'Administración', usuario: 'admin.prueba', password_hash: hash, rol: 'administrador', activo: true },
            { id: 2, nombre: 'Ventas', usuario: 'venta.prueba', password_hash: hash, rol: 'vendedor', activo: true },
            { id: 3, nombre: 'Desarrollo', usuario: 'dev.prueba', password_hash: hash, rol: 'superusuario', activo: true }
        ], sessions: new Map(), audits: []
    };
    let cola = Promise.resolve();
    const repo = {
        async transaction(fn) {
            const anterior = cola;
            let liberar;
            cola = new Promise(resolve => { liberar = resolve; });
            await anterior;
            const copia = structuredClone(estado);
            try { return await fn(repo); }
            catch (error) { Object.assign(estado, copia); throw error; }
            finally { liberar(); }
        },
        async lockUsers() {},
        async findByUsername(usuario) { return estado.users.find(user => user.usuario === usuario); },
        async getUser(id) { return estado.users.find(user => user.id === id); },
        async listUsers() { return estado.users; },
        async createUser(user) {
            if (estado.users.some(item => item.usuario === user.usuario)) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
            const nuevo = { ...user, id: Math.max(...estado.users.map(item => item.id), 0) + 1 };
            estado.users.push(nuevo);
            return nuevo;
        },
        async updateUser(id, datos) {
            if (estado.users.some(user => user.id !== id && user.usuario === datos.usuario)) {
                throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
            }
            estado.users[estado.users.findIndex(user => user.id === id)] = { ...datos };
        },
        async countAdmins() { return estado.users.filter(user => user.rol === 'administrador' && user.activo).length; },
        async createSession(hashToken, id) {
            estado.sessions.set(hashToken.toString('hex'), { id, creada: Date.now(), actividad: Date.now(), revocada: false });
        },
        async findSession(hashToken) {
            const sesion = estado.sessions.get(hashToken.toString('hex'));
            if (!sesion || sesion.revocada || Date.now() - sesion.creada >= 8 * 3600000
                || Date.now() - sesion.actividad >= 30 * 60000) return undefined;
            return repo.getUser(sesion.id);
        },
        async touchSession(hashToken) { estado.sessions.get(hashToken.toString('hex')).actividad = Date.now(); },
        async revokeSession(hashToken) {
            const sesion = estado.sessions.get(hashToken.toString('hex'));
            if (sesion) sesion.revocada = true;
        },
        async revokeUserSessions(id) {
            for (const sesion of estado.sessions.values()) if (sesion.id === id) sesion.revocada = true;
        },
        async audit(actor, id, accion, anterior, posterior) {
            estado.audits.push({ actor, id, accion, anterior, posterior });
        }
    };
    const auth = crearAuth(repo, { crypto, allowSuperuser });
    return { clave, hash, estado, repo, auth, admin: estado.users[0], vendedor: estado.users[1] };
}

async function servidor(t, repo, opciones = {}) {
    const origin = opciones.production ? 'https://micro.example' : 'http://micro.example';
    const app = crearApp({ repository: repo, origin, ...opciones });
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    let csrf = '';
    return async (ruta, metodo = 'GET', body, extras = {}) => {
        const response = await fetch(base + ruta, {
            method: metodo,
            headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie,
                'X-CSRF-Token': csrf, ...extras },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
        });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        const datos = response.status === 204 ? null : await response.json();
        if (datos?.csrfToken) csrf = datos.csrfToken;
        return { response, datos };
    };
}

test('scrypt usa sal aleatoria y verifica contraseñas sin aceptar hashes malformados', async () => {
    const clave = randomBytes(24).toString('hex');
    const primero = await hashPassword(clave);
    const segundo = await hashPassword(clave);
    assert.notEqual(primero, segundo);
    assert.match(primero, /^scrypt\$131072\$8\$1\$/);
    assert.equal(await verifyPassword(clave, primero), true);
    assert.equal(await verifyPassword(randomBytes(24).toString('hex'), primero), false);
    assert.equal(await verifyPassword(clave, 'hash-inválido'), false);
});

test('HTTP real con scrypt inicia sesión, consulta identidad y cierra sesión', async t => {
    const f = await preparar({ crypto: { hashPassword, verifyPassword } });
    const pedir = await servidor(t, f.repo);
    const login = await pedir('/api/auth/login', 'POST', { usuario: ' ADMIN.PRUEBA ', clave: f.clave });
    assert.equal(login.response.status, 200);
    assert.equal(login.datos.usuario.rol, 'administrador');
    assert.equal(login.datos.usuario.password_hash, undefined);
    assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.response.headers.get('set-cookie'), /SameSite=Strict/);
    assert.equal((await pedir('/api/auth/me')).response.status, 200);
    const logout = await pedir('/api/auth/logout', 'POST', {});
    assert.equal(logout.response.status, 204);
    assert.equal((await pedir('/api/auth/me')).response.status, 401);
    assert.equal(f.estado.sessions.size, 1);
    assert.equal([...f.estado.sessions.values()][0].revocada, true);
});

test('login rechaza contraseña incorrecta, usuario inexistente y cuenta inactiva', async () => {
    const f = await preparar();
    await assert.rejects(f.auth.login({ usuario: f.admin.usuario, clave: randomBytes(24).toString('hex') }), { status: 401 });
    await assert.rejects(f.auth.login({ usuario: 'inexistente', clave: f.clave }), { status: 401 });
    f.admin.activo = false;
    await assert.rejects(f.auth.login({ usuario: f.admin.usuario, clave: f.clave }), { status: 401 });
    assert.equal(f.estado.sessions.size, 0);
});

test('sesiones guardan digest y rechazan tokens inventados, expirados y cuentas desactivadas', async () => {
    const f = await preparar();
    const login = await f.auth.login({ usuario: f.vendedor.usuario, clave: f.clave });
    assert.equal(f.estado.sessions.has(login.token), false);
    const sesion = f.estado.sessions.get(digest(login.token).toString('hex'));
    assert.ok(sesion);
    await assert.rejects(f.auth.authenticate('f'.repeat(64)), { status: 401 });
    sesion.actividad -= 31 * 60000;
    await assert.rejects(f.auth.authenticate(login.token), { status: 401 });
    sesion.actividad = Date.now();
    sesion.creada -= 9 * 3600000;
    await assert.rejects(f.auth.authenticate(login.token), { status: 401 });
    sesion.creada = Date.now();
    f.vendedor.activo = false;
    await assert.rejects(f.auth.authenticate(login.token), { status: 401 });
});

test('Administrador crea, modifica, desactiva y activa usuarios con auditoría y revocación', async () => {
    const f = await preparar();
    const nuevo = await f.auth.create(f.admin, { nombre: ' Nueva cuenta ', usuario: ' NUEVA ', clave: f.clave, rol: 'vendedor' });
    assert.equal(nuevo.usuario, 'nueva');
    assert.equal(nuevo.password_hash, undefined);
    const login = await f.auth.login({ usuario: nuevo.usuario, clave: f.clave });
    const editado = await f.auth.update(f.admin, nuevo.id, { nombre: 'Editado', usuario: 'editado', rol: 'administrador' });
    assert.equal(editado.rol, 'administrador');
    await assert.rejects(f.auth.authenticate(login.token), { status: 401 });
    await f.auth.update(f.admin, nuevo.id, { activo: false });
    await assert.rejects(f.auth.login({ usuario: 'editado', clave: f.clave }), { status: 401 });
    await f.auth.update(f.admin, nuevo.id, { activo: true });
    assert.equal((await f.auth.login({ usuario: 'editado', clave: f.clave })).usuario.activo, true);
    assert.deepEqual(f.estado.audits.map(item => item.accion), ['crear', 'modificar', 'desactivar', 'activar']);
    assert.equal(JSON.stringify(f.estado.audits).includes('password_hash'), false);
    assert.equal(JSON.stringify(f.estado.audits).includes(f.clave), false);
});

test('cambio de contraseña invalida sesiones y la contraseña anterior', async () => {
    const f = await preparar();
    const login = await f.auth.login({ usuario: f.vendedor.usuario, clave: f.clave });
    const nueva = randomBytes(24).toString('hex');
    await f.auth.update(f.admin, 2, { clave: nueva });
    await assert.rejects(f.auth.authenticate(login.token), { status: 401 });
    await assert.rejects(f.auth.login({ usuario: f.vendedor.usuario, clave: f.clave }), { status: 401 });
    assert.equal((await f.auth.login({ usuario: f.vendedor.usuario, clave: nueva })).usuario.id, 2);
    assert.equal(f.estado.audits.at(-1).accion, 'cambiar_password');
});

test('validación rechaza roles de desarrollo, campos inesperados y entradas inválidas', async () => {
    const f = await preparar();
    const valido = { nombre: 'Cuenta', usuario: 'cuenta', clave: f.clave, rol: 'vendedor' };
    for (const datos of [
        { ...valido, rol: 'superusuario' }, { ...valido, rol: 'otro' },
        { ...valido, nombre: ' ' }, { ...valido, usuario: '../x' },
        { ...valido, clave: '' }, { ...valido, activo: 'false' }, { ...valido, id: 9 }
    ]) await assert.rejects(f.auth.create(f.admin, datos), { status: 400 });
    await assert.rejects(f.auth.update(f.admin, NaN, { activo: false }), { status: 400 });
    await assert.rejects(f.auth.update(f.admin, 2, {}), { status: 400 });
    await assert.rejects(f.auth.update(f.admin, 999, { activo: false }), { status: 404 });
    assert.equal(f.estado.audits.length, 0);
});

test('Vendedor no puede listar, crear ni modificar usuarios en el servicio', async () => {
    const f = await preparar();
    await assert.rejects(f.auth.list(f.vendedor), { status: 403 });
    await assert.rejects(f.auth.create(f.vendedor, {}), { status: 403 });
    await assert.rejects(f.auth.update(f.vendedor, 1, { activo: false }), { status: 403 });
    assert.equal(f.estado.audits.length, 0);
});

test('último Administrador activo no puede ser desactivado ni perder el rol', async () => {
    const f = await preparar();
    await assert.rejects(f.auth.update(f.admin, 1, { activo: false }), { status: 409 });
    await assert.rejects(f.auth.update(f.admin, 1, { rol: 'vendedor' }), { status: 409 });
    assert.equal(f.estado.users[0].activo, true);
});

test('cambios concurrentes conservan al menos un Administrador activo', async () => {
    const f = await preparar();
    const segundo = await f.auth.create(f.admin, { nombre: 'Otra administración', usuario: 'admin.dos', clave: f.clave, rol: 'administrador' });
    const resultados = await Promise.allSettled([
        f.auth.update(f.admin, segundo.id, { activo: false }),
        f.auth.update(segundo, f.admin.id, { activo: false })
    ]);
    assert.equal(resultados.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(await f.repo.countAdmins(), 1);
});

test('fallo de auditoría revierte usuario y revocación de sesiones', async () => {
    const f = await preparar();
    const login = await f.auth.login({ usuario: f.vendedor.usuario, clave: f.clave });
    f.repo.audit = async () => { throw new Error('Fallo simulado'); };
    await assert.rejects(f.auth.update(f.admin, 2, { activo: false }), /Fallo simulado/);
    assert.equal((await f.auth.authenticate(login.token)).activo, true);
    await assert.rejects(f.auth.create(f.admin, { nombre: 'Otra', usuario: 'otra', clave: f.clave, rol: 'vendedor' }), /Fallo simulado/);
    assert.equal(f.estado.users.length, 3);
});

test('duplicados se rechazan sin alterar usuarios ni auditoría', async () => {
    const f = await preparar();
    await assert.rejects(f.auth.create(f.admin, { nombre: 'Duplicado', usuario: 'ADMIN.PRUEBA', clave: f.clave, rol: 'vendedor' }), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(f.auth.update(f.admin, 2, { usuario: 'admin.prueba' }), { code: 'ER_DUP_ENTRY' });
    assert.equal(f.estado.users.length, 3);
    assert.equal(f.estado.audits.length, 0);
});

test('Superusuario requiere habilitación explícita y queda fuera de gestión de usuarios', async () => {
    const f = await preparar();
    await assert.rejects(f.auth.login({ usuario: 'dev.prueba', clave: f.clave }), { status: 401 });
    const dev = crearAuth(f.repo, { allowSuperuser: true, crypto: cryptoSimulado });
    const login = await dev.login({ usuario: 'dev.prueba', clave: f.clave });
    assert.equal(login.usuario.rol, 'superusuario');
    await assert.rejects(f.auth.authenticate(login.token), { status: 401 });
    await assert.rejects(f.auth.update(f.admin, 3, { activo: false }), { status: 403 });
    assert.equal((await f.auth.list(f.admin)).some(user => user.rol === 'superusuario'), false);
});

test('HTTP protege rutas con 401, origen y CSRF, y aplica permisos del Vendedor', async t => {
    const f = await preparar();
    // Usamos hashes reales para pasar por la aplicación Express de producción.
    f.estado.users[1].password_hash = await hashPassword(f.clave);
    const pedir = await servidor(t, f.repo);
    assert.equal((await pedir('/api/users')).response.status, 401);
    assert.equal((await pedir('/api/auth/login', 'POST', {}, { Origin: 'https://ajeno.example' })).response.status, 403);
    assert.equal((await pedir('/api/auth/login', 'POST', { usuario: f.vendedor.usuario, clave: f.clave })).response.status, 200);
    assert.equal((await pedir('/api/users')).response.status, 403);
    assert.equal((await pedir('/api/users', 'POST', {})).response.status, 403);
    assert.equal((await pedir('/api/users/1', 'PATCH', { activo: false })).response.status, 403);
    assert.equal((await pedir('/api/auth/logout', 'POST', {}, { 'X-CSRF-Token': '' })).response.status, 403);
    assert.equal((await pedir('/api/auth/me')).response.status, 200);
});

test('HTTP Administrador gestiona usuarios, detecta duplicados y omite hashes', async t => {
    const f = await preparar();
    f.estado.users[0].password_hash = await hashPassword(f.clave);
    const pedir = await servidor(t, f.repo);
    await pedir('/api/auth/login', 'POST', { usuario: f.admin.usuario, clave: f.clave });
    const entrada = { nombre: 'Cuenta HTTP', usuario: 'http.prueba', clave: f.clave, rol: 'vendedor' };
    const creado = await pedir('/api/users', 'POST', entrada);
    assert.equal(creado.response.status, 201);
    const id = creado.datos.usuario.id;
    assert.equal((await pedir('/api/users', 'POST', entrada)).response.status, 409);
    assert.equal((await pedir(`/api/users/${id}`, 'PATCH', { nombre: 'Editado', usuario: 'http.editado' })).response.status, 200);
    assert.equal((await pedir(`/api/users/${id}`, 'PATCH', { activo: false })).datos.usuario.activo, false);
    assert.equal((await pedir(`/api/users/${id}`, 'PATCH', { activo: true })).datos.usuario.activo, true);
    assert.equal((await pedir('/api/users', 'POST', { ...entrada, rol: 'superusuario' })).response.status, 400);
    assert.equal((await pedir('/api/users/3', 'PATCH', { activo: false })).response.status, 403);
    const lista = await pedir('/api/users');
    assert.equal(lista.response.status, 200);
    assert.equal(JSON.stringify(lista.datos).includes('password_hash'), false);
    assert.equal(lista.datos.usuarios.some(user => user.rol === 'superusuario'), false);
});

test('producción bloquea sesiones de Superusuario aunque la opción de desarrollo esté activa', async t => {
    const f = await preparar({ allowSuperuser: true });
    const login = await f.auth.login({ usuario: 'dev.prueba', clave: f.clave });
    const pedir = await servidor(t, f.repo, { production: true, allowSuperuser: true });
    const respuesta = await pedir('/api/auth/me', 'GET', undefined, { Cookie: `mc_session=${login.token}` });
    assert.equal(respuesta.response.status, 401);
    f.estado.users[2].password_hash = await hashPassword(f.clave);
    assert.equal((await pedir('/api/auth/login', 'POST', { usuario: 'dev.prueba', clave: f.clave })).response.status, 401);
});

test('HTTP limita intentos y oculta errores internos de MySQL', async t => {
    const f = await preparar();
    const pedir = await servidor(t, f.repo);
    for (let i = 0; i < 20; i += 1) assert.equal((await pedir('/api/auth/login', 'POST', {})).response.status, 400);
    assert.equal((await pedir('/api/auth/login', 'POST', {})).response.status, 429);
    f.repo.findSession = async () => { throw new Error('Detalle sensible simulado'); };
    const resultado = await pedir('/api/auth/me', 'GET', undefined, { Cookie: `mc_session=${'a'.repeat(64)}` });
    assert.equal(resultado.response.status, 503);
    assert.deepEqual(resultado.datos, { error: 'Servicio temporalmente no disponible.' });
});

test('repositorio parametriza valores y libera conexiones al revertir transacciones', async () => {
    const llamadas = [];
    const conexion = {
        async beginTransaction() { llamadas.push('begin'); },
        async commit() { llamadas.push('commit'); },
        async rollback() { llamadas.push('rollback'); },
        release() { llamadas.push('release'); },
        async execute(sql, params) { llamadas.push({ sql, params }); return [[], []]; }
    };
    const repo = crearRepositorio({ async getConnection() { return conexion; }, execute: conexion.execute });
    const entrada = "x' OR 1=1 --";
    await repo.findByUsername(entrada);
    assert.equal(llamadas[0].sql.includes(entrada), false);
    assert.deepEqual(llamadas[0].params, [entrada]);
    await assert.rejects(repo.transaction(async tx => {
        await tx.lockUsers();
        throw new Error('Revertir');
    }), /Revertir/);
    assert.deepEqual(llamadas.slice(-2), ['rollback', 'release']);
    assert.equal(llamadas.includes('commit'), false);
});

test('Express sirve la interfaz integrada y bloquea archivos privados del proyecto', async t => {
    const app = crearApp();
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const pagina = await fetch(base);
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /src="auth-client.js"/);
    for (const ruta of ['/app.js', '/auth-client.js', '/dashboard-client.js', '/estilos.css']) {
        assert.equal((await fetch(base + ruta)).status, 200);
    }
    for (const ruta of ['/.env', '/backend/database.js', '/backend/migrations/001_auth.sql', '/package.json']) {
        assert.equal((await fetch(base + ruta)).status, 404);
    }
});
