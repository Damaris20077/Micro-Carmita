const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { crearInventarioServicio, snapshot } = require('./inventory-service');
const { crearInventarioRepositorio } = require('./inventory-repository');
const { crearApp } = require('./app');
const { digest } = require('./auth-service');

function preparar() {
    const admin = { id: 1, rol: 'administrador', activo: true };
    const vendedor = { id: 2, rol: 'vendedor', activo: true };
    const db = { productos: [], lotes: [], movimientos: [], clientes: [], proveedores: [{ id: 1, nombre: 'Proveedor' }] };
    let cola = Promise.resolve();
    let falloMovimiento = false;
    const copia = v => structuredClone(v);
    const repo = {
        async transaction(fn) {
            const anterior = cola;
            let liberar;
            cola = new Promise(resolve => { liberar = resolve; });
            await anterior;
            const antes = copia(db);
            try { return await fn(repo); }
            catch (error) { Object.assign(db, antes); throw error; }
            finally { liberar(); }
        },
        async actor(id) { return copia(id === 1 ? admin : vendedor); },
        async contactos(tipo) { return copia(db[tipo]); },
        async contacto(tipo, id) { return copia(db[tipo].find(v => v.id === id)); },
        async crearContacto(tipo, d) {
            if (d.identificacion && db[tipo].some(v => v.identificacion === d.identificacion)) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
            const nuevo = { id: db[tipo].length + 1, ...d };
            db[tipo].push(nuevo); return copia(nuevo);
        },
        async productos() { return copia(db.productos); },
        async lotes() { return copia(db.lotes); },
        async producto(id) { return copia(db.productos.find(p => p.id === id)); },
        async lotesProducto(id) { return copia(db.lotes.filter(l => l.producto_id === id)); },
        async crearProducto(d) {
            if (db.productos.some(p => p.nombre.toLowerCase() === d.nombre.toLowerCase())) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
            const p = { id: db.productos.length + 1, nombre: d.nombre, categoria: d.categoria,
                precio_compra: d.precioCompra, precio_venta: d.precioVenta, proveedor_id: d.proveedorId, faltante: 0, activo: true };
            db.productos.push(p); return copia(p);
        },
        async editarProducto(id, d) {
            Object.assign(db.productos.find(p => p.id === id), { nombre: d.nombre, categoria: d.categoria,
                precio_compra: d.precioCompra, precio_venta: d.precioVenta, proveedor_id: d.proveedorId, activo: d.activo });
        },
        async crearLote(id, d, cantidad) {
            const l = { id: db.lotes.length + 1, producto_id: id, proveedor_id: d.proveedorId, codigo: d.codigo,
                cantidad, precio_compra: d.precioCompra, fecha_ingreso: d.fechaIngreso, caducidad: d.caducidad };
            db.lotes.push(l); return l.id;
        },
        async guardarStock(id, faltante, lotes) {
            db.productos.find(p => p.id === id).faltante = faltante;
            for (const l of lotes) db.lotes.find(v => v.id === l.id).cantidad = l.cantidad;
        },
        async movimiento(d) { if (falloMovimiento) throw new Error('Fallo de historial simulado'); db.movimientos.push(copia(d)); },
        async historial(id) { return copia(db.movimientos.filter(m => m.productoId === id)); }
    };
    return { admin, vendedor, db, repo, servicio: crearInventarioServicio(repo, () => '2026-11-17'),
        fallarHistorial() { falloMovimiento = true; } };
}
function datos(extra = {}) {
    return { nombre: 'Leche', categoria: 'Lácteos', precioCompra: 0.8, precioVenta: 1.25, proveedorId: 1,
        codigo: 'L1', cantidad: 4, fechaIngreso: '2026-11-17', caducidad: '2026-11-22', ...extra };
}
function lote(extra = {}) {
    const { codigo, cantidad, precioCompra, proveedorId, fechaIngreso, caducidad } = datos(extra);
    return { codigo, cantidad, precioCompra, proveedorId, fechaIngreso, caducidad };
}

test('RF-09 y RF-20 crean y consultan clientes/proveedores con IDs estables', async () => {
    const f = preparar();
    const cliente = await f.servicio.crearContacto(f.vendedor, 'clientes', { nombre: ' María ', identificacion: 'C-1', telefono: '099', direccion: 'Quito' });
    assert.equal(cliente.nombre, 'María');
    assert.equal((await f.servicio.contactos(f.admin, 'clientes'))[0].id, cliente.id);
    await f.servicio.crearContacto(f.admin, 'proveedores', { nombre: 'Proveedor dos' });
    assert.equal((await f.servicio.contactos(f.vendedor, 'proveedores')).length, 2);
    await assert.rejects(f.servicio.crearContacto(f.vendedor, 'proveedores', { nombre: 'No autorizado' }), { status: 403 });
    await assert.rejects(f.servicio.crearContacto(f.admin, 'clientes', { nombre: 'Otra', identificacion: 'C-1' }), { status: 409 });
});

test('RF-14 registra catálogo, lote inicial e historial en una transacción', async () => {
    const f = preparar();
    const r = await f.servicio.crearProducto(f.admin, datos());
    assert.equal(r.stock, 4);
    const [p] = await f.servicio.inventario(f.vendedor);
    assert.equal(p.precio_compra, 0.8);
    assert.equal(p.precio_venta, 1.25);
    assert.equal(p.proveedor_id, 1);
    assert.equal(p.lotes[0].fecha_ingreso, '2026-11-17');
    assert.equal(p.lotes[0].caducidad, '2026-11-22');
    assert.equal(p.lotes[0].estado, 'Por caducar');
    assert.equal(f.db.movimientos[0].usuarioId, 1);
    assert.equal(f.db.movimientos[0].despues, 4);
});

for (const extra of [
    { precioCompra: -1 }, { precioVenta: 0 }, { precioVenta: Infinity }, { precioVenta: 1.234 },
    { cantidad: -1 }, { cantidad: 1.5 }, { cantidad: '4' }, { cantidad: null },
    { proveedorId: 999 }, { nombre: '' }, { categoria: ' ' },
    { fechaIngreso: '2026-02-30' }, { caducidad: '2026-02-30' }, { codigo: '' }, { extra: true }
]) {
    test(`RF-14 rechaza entrada inválida ${Object.keys(extra)[0]}=${String(Object.values(extra)[0])}`, async () => {
        const f = preparar();
        await assert.rejects(f.servicio.crearProducto(f.admin, datos(extra)), { status: 400 });
        assert.equal(f.db.productos.length, 0);
        assert.equal(f.db.movimientos.length, 0);
    });
}

test('RF-15 conserva diferentes lotes y rechaza códigos duplicados por producto', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    await f.servicio.entrada(f.admin, 1, lote({ codigo: 'L2', cantidad: 3, caducidad: '2026-11-30' }));
    const [p] = await f.servicio.inventario(f.admin);
    assert.equal(p.stock, 7);
    assert.equal(p.lotes.length, 2);
    assert.equal(p.lotes[0].cantidad, 4);
    await assert.rejects(f.servicio.entrada(f.admin, 1, lote({ codigo: 'l1' })), { status: 409 });
    assert.equal(f.db.lotes.length, 2);
});

for (const [fecha, esperado] of [['2026-11-16', 'Caducado'], ['2026-11-17', 'Por caducar'],
    ['2026-11-21', 'Por caducar'], ['2026-11-22', 'Por caducar'], ['2026-11-23', 'Vigente'], ['', 'Sin caducidad']]) {
    test(`RF-16 caducidad ${fecha || 'ausente'} produce ${esperado}`, async () => {
        const f = preparar();
        await f.servicio.crearProducto(f.admin, datos({ caducidad: fecha }));
        assert.equal((await f.servicio.inventario(f.admin))[0].lotes[0].estado, esperado);
    });
}

for (const stock of [-2, 0, 1, 2, 3]) {
    test(`RF-17 stock ${stock} con límite estricto menor a tres`, async () => {
        const f = preparar();
        await f.servicio.crearProducto(f.admin, datos({ cantidad: Math.max(0, stock) }));
        if (stock < 0) await f.servicio.ajustar(f.admin, 1, { cantidad: stock, motivo: 'Conteo físico' });
        const [p] = await f.servicio.inventario(f.admin);
        assert.equal(p.stock, stock);
        assert.equal(p.stockBajo, stock < 3);
    });
}

test('RF-18 ajuste registra motivo, responsable, lotes y balance', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    await f.servicio.ajustar(f.admin, 1, { cantidad: -6, motivo: 'Diferencia física' });
    assert.equal((await f.servicio.inventario(f.admin))[0].stock, -2);
    const m = (await f.servicio.historial(f.admin, 1)).at(-1);
    assert.equal(m.motivo, 'Diferencia física');
    assert.equal(m.usuarioId, 1);
    assert.equal(m.antes, 4);
    assert.equal(m.despues, -2);
    await f.servicio.ajustar(f.admin, 1, { cantidad: 3, loteId: 1, motivo: 'Regularización' });
    const [p] = await f.servicio.inventario(f.admin);
    assert.equal(p.stock, 1);
    assert.equal(p.faltante, 0);
});

test('entrada vigente concilia faltantes; lote vencido conserva deuda y se distingue', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos({ cantidad: 0 }));
    await f.servicio.ajustar(f.admin, 1, { cantidad: -3, motivo: 'Faltante' });
    await f.servicio.entrada(f.admin, 1, lote({ codigo: 'CAD', cantidad: 2, caducidad: '2026-11-16' }));
    assert.equal(f.db.productos[0].faltante, 3);
    await f.servicio.entrada(f.admin, 1, lote({ codigo: 'VIG', cantidad: 5 }));
    const [p] = await f.servicio.inventario(f.admin);
    assert.equal(p.faltante, 0);
    assert.equal(p.stock, 4);
    assert.equal(p.lotes.find(l => l.codigo === 'VIG').cantidad, 2);
});

test('Vendedor y Superusuario no pueden modificar inventario; sesión inactiva tampoco', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    for (const actor of [f.vendedor, { id: 3, rol: 'superusuario', activo: true }]) {
        await assert.rejects(f.servicio.crearProducto(actor, datos({ nombre: 'Otro' })), { status: 403 });
        await assert.rejects(f.servicio.entrada(actor, 1, lote()), { status: 403 });
        await assert.rejects(f.servicio.ajustar(actor, 1, { cantidad: -1, motivo: 'Intento' }), { status: 403 });
    }
    f.admin.activo = false;
    await assert.rejects(f.servicio.ajustar(f.admin, 1, { cantidad: -1, motivo: 'Intento' }), { status: 403 });
    assert.equal(f.db.lotes[0].cantidad, 4);
});

test('ajustes rechazan cero, fracciones, motivos vacíos y lote ajeno', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    for (const d of [{ cantidad: 0, motivo: 'X' }, { cantidad: 0.5, motivo: 'X' },
        { cantidad: -1, motivo: '' }, { cantidad: 1, motivo: 'X', loteId: 99 }]) {
        await assert.rejects(f.servicio.ajustar(f.admin, 1, d), { status: 400 });
    }
    assert.equal(f.db.lotes[0].cantidad, 4);
});

test('fallo de historial revierte catálogo, lote y ajustes sin estados parciales', async () => {
    const f = preparar();
    f.fallarHistorial();
    await assert.rejects(f.servicio.crearProducto(f.admin, datos()), /Fallo de historial/);
    assert.equal(f.db.productos.length, 0);
    assert.equal(f.db.lotes.length, 0);
});

test('fallo al registrar ajuste o entrada revierte existencias, deuda y lote nuevo', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    const antes = structuredClone(f.db);
    f.fallarHistorial();
    await assert.rejects(f.servicio.ajustar(f.admin, 1, { cantidad: -7, motivo: 'Conteo' }), /Fallo de historial/);
    assert.deepEqual(f.db, antes);
    await assert.rejects(f.servicio.entrada(f.admin, 1, lote({ codigo: 'L2' })), /Fallo de historial/);
    assert.deepEqual(f.db, antes);
});

test('ajustes concurrentes conservan el saldo y el historial', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    await Promise.all([1, 2, 3].map(() => f.servicio.ajustar(f.admin, 1, { cantidad: -1, motivo: 'Conteo' })));
    assert.equal((await f.servicio.inventario(f.admin))[0].stock, 1);
    assert.equal(f.db.movimientos.length, 4);
});

test('editar conserva lotes y stock; archivar exige cero y conserva historial', async () => {
    const f = preparar();
    await f.servicio.crearProducto(f.admin, datos());
    const d = { nombre: 'Leche entera', categoria: 'Bebidas', precioCompra: 1, precioVenta: 2, proveedorId: 1, activo: true };
    await f.servicio.editarProducto(f.admin, 1, d);
    assert.equal(f.db.lotes[0].cantidad, 4);
    await assert.rejects(f.servicio.editarProducto(f.admin, 1, { ...d, activo: false }), { status: 409 });
    await f.servicio.ajustar(f.admin, 1, { cantidad: -4, motivo: 'Baja física' });
    await f.servicio.editarProducto(f.admin, 1, { ...d, activo: false });
    assert.equal(f.db.productos[0].activo, false);
    assert.equal(f.db.movimientos.length, 2);
});

test('repositorio usa parámetros y bloqueos y revierte en errores', async () => {
    const calls = [];
    const c = {
        async execute(sql, params) { calls.push({ sql, params }); return [[], []]; },
        async beginTransaction() { calls.push('begin'); }, async commit() { calls.push('commit'); },
        async rollback() { calls.push('rollback'); }, release() { calls.push('release'); }
    };
    const repo = crearInventarioRepositorio({ async getConnection() { return c; } });
    await assert.rejects(repo.transaction(async tx => { await tx.producto(1); await tx.lotesProducto(1); throw new Error('Prueba'); }), /Prueba/);
    assert.match(calls[1].sql, /FOR UPDATE/);
    assert.deepEqual(calls[1].params, [1]);
    assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('HTTP integrado protege inventario, contactos y alertas por sesión y CSRF', async t => {
    const f = preparar();
    const tokens = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
    const authRepo = {
        async findSession(hash) { return hash.equals(digest(tokens[0])) ? f.admin : hash.equals(digest(tokens[1])) ? f.vendedor : undefined; },
        async touchSession() {}
    };
    const origin = 'http://micro.example';
    const server = crearApp({ repository: authRepo, inventoryRepository: f.repo, origin }).listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    async function pedir(ruta, metodo = 'GET', body, token = tokens[0], csrf = true) {
        const r = await fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
            method: metodo, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `mc_session=${token}`,
                'X-CSRF-Token': csrf ? digest(`csrf:${token}`).toString('hex') : '' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: r.status, body: await r.json() };
    }
    assert.equal((await pedir('/inventory', 'GET', undefined, '')).status, 401);
    assert.equal((await pedir('/products', 'POST', datos(), tokens[0], false)).status, 403);
    assert.equal((await pedir('/products', 'POST', datos(), tokens[1])).status, 403);
    assert.equal((await pedir('/products', 'POST', datos({ cantidad: 2 }))).status, 201);
    assert.equal((await pedir('/inventory', 'GET', undefined, tokens[1])).body.productos[0].stock, 2);
    assert.equal((await pedir('/inventory/alerts')).body.stockBajo.length, 1);
    assert.equal((await pedir('/inventory/alerts')).body.caducidad.length, 1);
    assert.equal((await pedir('/clientes', 'POST', { nombre: 'Cliente API' }, tokens[1])).status, 201);
    assert.equal((await pedir('/proveedores', 'POST', { nombre: 'Proveedor API' }, tokens[1])).status, 403);
    assert.equal((await pedir('/products/1/adjustments', 'POST', { cantidad: -3, motivo: 'Conteo' })).status, 200);
    assert.equal((await pedir('/products/1/history')).body.movimientos.length, 2);
});
