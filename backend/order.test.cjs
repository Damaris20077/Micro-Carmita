const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { crearPedidosServicio } = require('./order-service');
const { crearPedidosRepositorio } = require('./order-repository');
const { crearApp } = require('./app');
const { digest } = require('./auth-service');
const M = require('../modelo');

function preparar() {
    const admin = { id: 1, rol: 'administrador', activo: true };
    const vendedor = { id: 2, rol: 'vendedor', activo: true };
    const db = { pedidos: [], detalles: [], recepciones: [], recibidos: [], lotes: [], movimientos: [],
        productos: [{ id: 1, nombre: 'Leche', categoria: 'Lácteos', precio_venta: 1.2, precio_compra: 0.8, proveedor_id: 1, faltante: 0, activo: true },
            { id: 2, nombre: 'Pan', categoria: 'Panadería', precio_venta: 1, precio_compra: 0.5, proveedor_id: 1, faltante: 0, activo: true }] };
    const copy = v => structuredClone(v);
    let cola = Promise.resolve();
    let fallo;
    const fallar = etapa => { if (fallo === etapa) throw new Error('Fallo controlado'); };
    const inv = {
        async actor(id) { return copy(id === 1 ? admin : vendedor); },
        async contacto(tipo, id) { return id === 1 ? { id: 1 } : undefined; },
        async producto(id) { return copy(db.productos.find(p => p.id === id)); },
        async lotesProducto(id) { return copy(db.lotes.filter(l => l.producto_id === id)); },
        async crearLote(id, d, cantidad) {
            if (db.lotes.some(l => l.producto_id === id && l.codigo === d.codigo)) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
            const l = { id: db.lotes.length + 1, producto_id: id, codigo: d.codigo, cantidad,
                proveedor_id: d.proveedorId, fecha_ingreso: d.fechaIngreso, caducidad: d.caducidad, precio_compra: d.precioCompra };
            db.lotes.push(l); return l.id;
        },
        async guardarStock(id, faltante, lotes) {
            db.productos.find(p => p.id === id).faltante = faltante;
            for (const l of lotes) db.lotes.find(v => v.id === l.id).cantidad = l.cantidad;
        },
        async movimiento(m) { fallar('movement'); db.movimientos.push(copy(m)); }
    };
    const repo = {
        inventario: inv,
        async transaction(fn) {
            const anterior = cola; let liberar;
            cola = new Promise(resolve => { liberar = resolve; }); await anterior;
            const previo = copy(db);
            try { const r = await fn(repo); fallar('commit'); return r; }
            catch (error) { Object.assign(db, previo); throw error; }
            finally { liberar(); }
        },
        async lista() { return copy(db.pedidos); },
        async pedido(id) { return copy(db.pedidos.find(p => p.id === id)); },
        async detalles(id) { return copy(db.detalles.filter(d => d.pedido_id === id)); },
        async recepciones(id) { return copy(db.recepciones.filter(r => r.pedido_id === id)); },
        async crearPedido(d, a) {
            const p = { id: db.pedidos.length + 1, proveedor_id: d.proveedorId, creado_por: a.id, estado: 'Pendiente' };
            db.pedidos.push(p); return p.id;
        },
        async crearDetalle(id, d) { db.detalles.push({ id: db.detalles.length + 1, pedido_id: id, producto_id: d.productoId, cantidad: d.cantidad, recibida: 0, precio_compra: d.precioCompra }); },
        async cancelar(id, actor, motivo) { Object.assign(db.pedidos.find(p => p.id === id), { estado: 'Cancelado', cancelado_por: actor.id, motivo_cancelacion: motivo }); },
        async recepcionPorClave(id, clave) { return copy(db.recepciones.find(r => r.pedido_id === id && r.clave === clave)); },
        async crearRecepcion(id, a, clave, hash) {
            const r = { id: db.recepciones.length + 1, pedido_id: id, usuario_id: a.id, clave, contenido_hash: hash };
            db.recepciones.push(r); return r.id;
        },
        async recibirLinea(pedido, recepcion, d, lote) {
            fallar('receipt_detail');
            db.recibidos.push({ pedido, recepcion, lote, cantidad: d.cantidad });
            db.detalles.find(l => l.id === d.detalleId).recibida += d.cantidad;
        },
        async cambiarEstado(id, estado) { fallar('state'); db.pedidos.find(p => p.id === id).estado = estado; }
    };
    return { admin, vendedor, db, repo, servicio: crearPedidosServicio(repo), fallar(etapa) { fallo = etapa; } };
}
const pedido = (extra = {}) => ({ proveedorId: 1, observaciones: 'Ensayo', detalles: [{ productoId: 1, cantidad: 5, precioCompra: 0.8 }], ...extra });
const recepcion = (extra = {}) => ({ clave: 'recepcion_primera', lineas: [{ detalleId: 1, cantidad: 2, codigo: 'L1', fechaIngreso: M.hoy(), caducidad: '', precioCompra: 0.8 }], ...extra });

test('Administrador crea y consulta pedido con proveedor, detalles y estado Pendiente', async () => {
    const f = preparar();
    const r = await f.servicio.crear(f.admin, pedido());
    assert.equal(r.estado, 'Pendiente');
    assert.equal((await f.servicio.listar(f.vendedor)).length, 1);
    const p = await f.servicio.consultar(f.admin, r.id);
    assert.equal(p.proveedor_id, 1);
    assert.equal(p.detalles[0].cantidad, 5);
    assert.equal(p.creado_por, 1);
});

test('Vendedor recibe parcialmente y completamente con lotes e historial', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    assert.equal((await f.servicio.recibir(f.vendedor, 1, recepcion())).estado, 'Recibido parcialmente');
    assert.equal(f.db.detalles[0].recibida, 2);
    const segunda = recepcion({ clave: 'recepcion_segunda', lineas: [{ ...recepcion().lineas[0], cantidad: 3, codigo: 'L2' }] });
    assert.equal((await f.servicio.recibir(f.vendedor, 1, segunda)).estado, 'Recibido completo');
    assert.equal(f.db.detalles[0].recibida, 5);
    assert.equal(f.db.lotes.reduce((sum, l) => sum + l.cantidad, 0), 5);
    assert.equal(f.db.movimientos.length, 2);
    assert.ok(f.db.movimientos.every(m => m.usuarioId === 2));
    assert.equal(f.db.recibidos.length, 2);
});

test('reintento idempotente devuelve recepción existente sin duplicar stock', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    const r = await f.servicio.recibir(f.vendedor, 1, recepcion());
    const repetida = await f.servicio.recibir(f.vendedor, 1, recepcion());
    assert.equal(repetida.id, r.id);
    assert.equal(repetida.repetida, true);
    assert.equal(f.db.movimientos.length, 1);
    assert.equal(f.db.lotes[0].cantidad, 2);
    await assert.rejects(f.servicio.recibir(f.vendedor, 1, recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 1 }] })), { status: 409 });
});

test('idempotencia permite recuperar recepción completa tras perder la respuesta', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    const body = recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 5 }] });
    await f.servicio.recibir(f.admin, 1, body);
    assert.equal((await f.servicio.recibir(f.admin, 1, body)).repetida, true);
    await assert.rejects(f.servicio.recibir(f.admin, 1, { ...body, clave: 'otra_clave_123' }), { status: 409 });
});

test('Vendedor, Superusuario e inactivos no crean ni cancelan pedidos', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    for (const actor of [f.vendedor, { id: 3, rol: 'superusuario', activo: true }, { ...f.admin, activo: false }]) {
        await assert.rejects(f.servicio.crear(actor, pedido()), { status: 403 });
        await assert.rejects(f.servicio.cancelar(actor, 1, { motivo: 'Intento' }), { status: 403 });
    }
    f.vendedor.activo = false;
    await assert.rejects(f.servicio.recibir(f.vendedor, 1, recepcion()), { status: 403 });
});

test('cancelación parcial conserva unidades recibidas y bloquea nuevas recepciones', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    await f.servicio.recibir(f.vendedor, 1, recepcion());
    await f.servicio.cancelar(f.admin, 1, { motivo: 'Proveedor sin disponibilidad' });
    assert.equal(f.db.pedidos[0].estado, 'Cancelado');
    assert.equal(f.db.detalles[0].recibida, 2);
    assert.equal(f.db.lotes[0].cantidad, 2);
    await assert.rejects(f.servicio.recibir(f.vendedor, 1, recepcion({ clave: 'recepcion_otra' })), { status: 409 });
    assert.equal((await f.servicio.recibir(f.vendedor, 1, recepcion())).repetida, true);
    await assert.rejects(f.servicio.cancelar(f.admin, 1, { motivo: 'Otra' }), { status: 409 });
});

test('pedido pendiente puede cancelarse; completo no se cancela', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    await assert.rejects(f.servicio.cancelar(f.admin, 1, { motivo: '' }), { status: 400 });
    await f.servicio.cancelar(f.admin, 1, { motivo: 'Cambio de plan' });
    const g = preparar(); await g.servicio.crear(g.admin, pedido());
    await g.servicio.recibir(g.admin, 1, recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 5 }] }));
    await assert.rejects(g.servicio.cancelar(g.admin, 1, { motivo: 'Intento' }), { status: 409 });
});

for (const body of [pedido({ proveedorId: 99 }), pedido({ detalles: [] }), pedido({ detalles: [{ productoId: 99, cantidad: 1, precioCompra: 1 }] }),
    pedido({ detalles: [{ productoId: 1, cantidad: 0, precioCompra: 1 }] }), pedido({ detalles: [{ productoId: 1, cantidad: 1.5, precioCompra: 1 }] }),
    pedido({ detalles: [{ productoId: 1, cantidad: 1, precioCompra: -1 }] }), pedido({ detalles: [...pedido().detalles, ...pedido().detalles] })]) {
    test(`pedido inválido se rechaza sin escrituras ${JSON.stringify(body)}`, async () => {
        const f = preparar(); await assert.rejects(f.servicio.crear(f.admin, body), { status: 400 });
        assert.equal(f.db.pedidos.length, 0);
    });
}

for (const [nombre, body, status] of [
    ['vacía', recepcion({ lineas: [] }), 400], ['sin clave', recepcion({ clave: '' }), 400],
    ['cantidad cero', recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 0 }] }), 400],
    ['cantidad fraccionaria', recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 1.5 }] }), 400],
    ['fecha inválida', recepcion({ lineas: [{ ...recepcion().lineas[0], caducidad: '2026-02-30' }] }), 400],
    ['línea ajena', recepcion({ lineas: [{ ...recepcion().lineas[0], detalleId: 99 }] }), 400],
    ['exceso', recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 6 }] }), 409],
    ['exceso agregado', recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 3 }, { ...recepcion().lineas[0], cantidad: 3, codigo: 'L2' }] }), 409]
]) {
    test(`recepción ${nombre} rechazada y sin cambio de stock`, async () => {
        const f = preparar(); await f.servicio.crear(f.admin, pedido());
        await assert.rejects(f.servicio.recibir(f.vendedor, 1, body), { status });
        assert.equal(f.db.recepciones.length, 0); assert.equal(f.db.lotes.length, 0);
    });
}

for (const etapa of ['movement', 'receipt_detail', 'state', 'commit']) {
    test(`fallo ${etapa} revierte recepción, lote, deuda, cantidades e historial`, async () => {
        const f = preparar(); await f.servicio.crear(f.admin, pedido());
        f.db.productos[0].faltante = 3;
        const antes = structuredClone(f.db); f.fallar(etapa);
        await assert.rejects(f.servicio.recibir(f.vendedor, 1, recepcion()), /Fallo controlado/);
        assert.deepEqual(f.db, antes);
    });
}

test('recepciones concurrentes con misma clave no duplican inventario', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    const respuestas = await Promise.all([f.servicio.recibir(f.admin, 1, recepcion()), f.servicio.recibir(f.vendedor, 1, recepcion())]);
    assert.equal(respuestas.filter(r => r.repetida).length, 1);
    assert.equal(f.db.recepciones.length, 1);
    assert.equal(f.db.detalles[0].recibida, 2);
});

test('recepciones concurrentes con claves distintas no exceden lo pendiente', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    const resultados = await Promise.allSettled(['A', 'B'].map(c => f.servicio.recibir(f.vendedor, 1,
        recepcion({ clave: `recepcion_${c}`, lineas: [{ ...recepcion().lineas[0], cantidad: 4, codigo: c }] }))));
    assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(f.db.detalles[0].recibida, 4);
    assert.equal(f.db.movimientos.length, 1);
});

test('recepción regulariza faltante sin duplicar cantidades recibidas ni usar lotes vencidos', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    f.db.productos[0].faltante = 3;
    await f.servicio.recibir(f.vendedor, 1, recepcion());
    assert.equal(f.db.productos[0].faltante, 1);
    assert.equal(f.db.lotes[0].cantidad, 0);
    assert.equal(f.db.detalles[0].recibida, 2);
    await f.servicio.recibir(f.vendedor, 1, recepcion({ clave: 'recepcion_cad', lineas: [{ ...recepcion().lineas[0], codigo: 'CAD', cantidad: 1, caducidad: '2020-01-01' }] }));
    assert.equal(f.db.productos[0].faltante, 1);
    assert.equal(f.db.lotes[1].cantidad, 1);
});

test('multi-producto: el estado completo exige todas las líneas', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido({ detalles: [...pedido().detalles, { productoId: 2, cantidad: 1, precioCompra: 0.5 }] }));
    const r = await f.servicio.recibir(f.vendedor, 1, recepcion({ lineas: [{ ...recepcion().lineas[0], cantidad: 5 }] }));
    assert.equal(r.estado, 'Recibido parcialmente');
    await f.servicio.recibir(f.vendedor, 1, recepcion({ clave: 'recepcion_pan', lineas: [{ ...recepcion().lineas[0], detalleId: 2, cantidad: 1, codigo: 'PAN' }] }));
    assert.equal(f.db.pedidos[0].estado, 'Recibido completo');
});

test('dos partidas con el mismo código revierten también la primera entrada', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    const antes = structuredClone(f.db);
    const linea = recepcion().lineas[0];
    await assert.rejects(f.servicio.recibir(f.vendedor, 1, recepcion({ lineas: [linea, { ...linea, cantidad: 1 }] })), { status: 409 });
    assert.deepEqual(f.db, antes);
});

test('cancelación y recepción concurrentes conservan estado y cantidades', async () => {
    const f = preparar(); await f.servicio.crear(f.admin, pedido());
    await Promise.allSettled([
        f.servicio.cancelar(f.admin, 1, { motivo: 'Cancelación concurrente' }),
        f.servicio.recibir(f.vendedor, 1, recepcion())
    ]);
    assert.equal(f.db.pedidos[0].estado, 'Cancelado');
    assert.equal(f.db.detalles[0].recibida, 0);
    assert.equal(f.db.lotes.length, 0);
});

test('repositorio bloquea pedido y usa parámetros, con rollback al fallar', async () => {
    const llamadas = [];
    const c = { async beginTransaction() {}, async commit() { llamadas.push('commit'); },
        async rollback() { llamadas.push('rollback'); }, release() { llamadas.push('release'); },
        async execute(sql, params) { llamadas.push({ sql, params }); return [[], []]; } };
    const repo = crearPedidosRepositorio({ async getConnection() { return c; } });
    await assert.rejects(repo.transaction(async tx => { await tx.pedido(1, true); await tx.recepcionPorClave(1, 'entrada'); throw new Error('Prueba'); }), /Prueba/);
    assert.match(llamadas[0].sql, /FOR UPDATE/);
    assert.deepEqual(llamadas[0].params, [1]);
    assert.deepEqual(llamadas.slice(-2), ['rollback', 'release']);
});

test('HTTP real aplica sesión, CSRF, permisos y respuesta idempotente', async t => {
    const f = preparar(); const tokens = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
    const origin = 'http://micro.example';
    const authRepo = { async findSession(hash) { return hash.equals(digest(tokens[0])) ? f.admin : hash.equals(digest(tokens[1])) ? f.vendedor : undefined; }, async touchSession() {} };
    const server = crearApp({ repository: authRepo, orderRepository: f.repo, origin }).listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve))); await once(server, 'listening');
    async function pedir(ruta, metodo, body, token = tokens[0], csrf = true) {
        const r = await fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, { method: metodo,
            headers: { Origin: origin, Cookie: `mc_session=${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? digest(`csrf:${token}`).toString('hex') : '' },
            body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
    }
    assert.equal((await pedir('/orders', 'GET', undefined, '')).status, 401);
    assert.equal((await pedir('/orders', 'POST', pedido(), tokens[1])).status, 403);
    assert.equal((await pedir('/orders', 'POST', pedido(), tokens[0], false)).status, 403);
    assert.equal((await pedir('/orders', 'POST', pedido())).status, 201);
    assert.equal((await pedir('/orders/1', 'GET', undefined, tokens[1])).status, 200);
    assert.equal((await pedir('/orders/1/cancel', 'POST', { motivo: 'Intento' }, tokens[1])).status, 403);
    assert.equal((await pedir('/orders/1/receipts', 'POST', recepcion(), tokens[1])).status, 201);
    assert.equal((await pedir('/orders/1/receipts', 'POST', recepcion(), tokens[1])).status, 200);
});
