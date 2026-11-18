const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { crearApp } = require('./app');
const { digest } = require('./auth-service');

// Datos ficticios válidos: los rechazos deben venir del rol, no de CSRF o validación.
const producto = { nombre: 'Producto aislado', categoria: 'Prueba', precioCompra: 1, precioVenta: 2, proveedorId: 1,
    codigo: 'L-aislado', cantidad: 2, fechaIngreso: '2026-11-17', caducidad: '' };
const venta = { clave: 'venta_aislada', tipo: 'contado', clienteId: null, detalles: [{ productoId: 1, cantidad: 1, precio: 2 }] };
const administrativas = [
    ['GET', '/users'],
    ['POST', '/users', { nombre: 'Usuario ficticio', usuario: 'usuario.ficticio', rol: 'administrador', clave: randomBytes(20).toString('hex') }],
    ['PATCH', '/users/1', { nombre: 'Cambio ficticio' }],
    ['PATCH', '/users/1', { activo: false }],
    ['PATCH', '/users/1', { activo: true }],
    ['POST', '/orders', { proveedorId: 1, detalles: [{ productoId: 1, cantidad: 2, precioCompra: 1 }] }],
    ['POST', '/orders/1/cancel', { motivo: 'Cancelación ficticia' }],
    ['POST', '/products', producto],
    ['PATCH', '/products/1', { nombre: producto.nombre, categoria: producto.categoria, precioCompra: 1, precioVenta: 2, proveedorId: 1, activo: true }],
    ['PATCH', '/products/1', { nombre: producto.nombre, categoria: producto.categoria, precioCompra: 1, precioVenta: 2, proveedorId: 1, activo: false }],
    ['POST', '/products/1/lots', { codigo: 'L-aislado', cantidad: 2, precioCompra: 1, proveedorId: 1, fechaIngreso: '2026-11-17', caducidad: '' }],
    ['POST', '/products/1/adjustments', { cantidad: 1, loteId: 1, motivo: 'Ajuste ficticio' }],
    ['POST', '/proveedores', { nombre: 'Proveedor ficticio' }],
    ['PATCH', '/sales/1', { ...venta, version: 1, motivo: 'Edición ficticia', confirmarReembolso: true }],
    ['POST', '/sales/1/void', { clave: 'anulacion_aislada', version: 1, motivo: 'Anulación ficticia', confirmarReembolso: true }],
    ['GET', '/finance'],
    ['POST', '/finance', { clave: 'finanzas_aislada', tipo: 'ingreso', categoria: 'Operación', motivo: 'Ingreso ficticio', importe: 1, fecha: '2026-11-17' }],
    ...['ventas', 'cierre', 'pendientes', 'pagos', 'finanzas', 'inventario', 'pedidos']
        .flatMap(tipo => [['GET', `/reports/${tipo}`], ['GET', `/reports/${tipo}/pdf`]])
];
const operativas = [
    ['GET', '/inventory'], ['GET', '/inventory/alerts'], ['GET', '/products/1/history'],
    ['GET', '/clientes'], ['GET', '/proveedores'], ['GET', '/orders'], ['GET', '/orders/1'],
    ['GET', '/sales'], ['GET', '/sales/1'], ['GET', '/customers/1/receivables'],
    ['POST', '/clientes', { nombre: 'Cliente ficticio' }],
    ['POST', '/sales', venta], ['POST', '/sales/1/payments', { clave: 'abono_aislado', importe: 1 }],
    ['POST', '/orders/1/receipts', { clave: 'recepcion_aislada', lineas: [{ detalleId: 1, cantidad: 1, codigo: 'L1', fechaIngreso: '2026-11-17', caducidad: '', precioCompra: 1 }] }],
    ['GET', '/auth/me'], ['POST', '/auth/logout', {}]
];

async function preparar(t, estado = 'vendedor') {
    let activo = estado !== 'desactivado';
    let llamadasNegocio = 0, accesos = 0;
    const token = randomBytes(32).toString('hex');
    const protegido = new Proxy({}, { get(_, nombre) {
        if (nombre === 'inventario' || nombre === 'pedidos' || nombre === 'finanzas') return protegido;
        return async () => { llamadasNegocio++; throw new Error('Un rechazo no debe acceder al repositorio de negocio'); };
    } });
    const authRepo = new Proxy({
        async findSession(hash) { return hash.equals(digest(token)) ? { id: 2, rol: 'vendedor', activo } : undefined; },
        async touchSession() { accesos++; }
    }, { get(target, nombre) { return nombre in target ? target[nombre] : protegido[nombre]; } });
    const app = crearApp({ repository: authRepo, inventoryRepository: protegido, orderRepository: protegido,
        salesRepository: protegido, financeRepository: protegido, reportRepository: protegido, origin: 'http://micro.example' });
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    async function pedir([metodo, ruta, datos], conSesion = estado !== 'anonimo') {
        const respuesta = await fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
            method: metodo, headers: { Origin: 'http://micro.example', 'Content-Type': 'application/json',
                Cookie: conSesion ? `mc_session=${token}` : '', 'X-CSRF-Token': digest(`csrf:${token}`).toString('hex'),
                'X-Role': 'administrador', 'X-User-Id': '1' },
            body: datos === undefined ? undefined : JSON.stringify(datos)
        });
        await respuesta.arrayBuffer();
        return respuesta.status;
    }
    return { pedir, desactivar() { activo = false; }, get llamadasNegocio() { return llamadasNegocio; }, get accesos() { return accesos; } };
}

for (const estado of ['vendedor', 'anonimo', 'desactivado']) {
    test(`matriz HTTP ${estado}: restricciones administrativas y sesión`, async t => {
        const f = await preparar(t, estado);
        for (const [indice, ruta] of [...administrativas, ...(estado === 'vendedor' ? [] : operativas)].entries()) {
            await t.test(`${indice + 1}: ${ruta[0]} ${ruta[1]}`, async () => {
                assert.equal(await f.pedir(ruta), estado === 'vendedor' ? 403 : 401);
                assert.equal(f.llamadasNegocio, 0, 'No debe consultar ni modificar datos de negocio');
            });
        }
        assert.equal(f.accesos, estado === 'vendedor' ? administrativas.length : 0);
    });
}

test('misma sesión queda inutilizable tras desactivar la cuenta entre solicitudes', async t => {
    const f = await preparar(t);
    assert.equal(await f.pedir(['GET', '/auth/me']), 200);
    f.desactivar();
    assert.equal(await f.pedir(['GET', '/auth/me']), 401);
    assert.equal(await f.pedir(['POST', '/clientes', { nombre: 'Cliente ficticio' }]), 401);
    assert.equal(f.accesos, 1); assert.equal(f.llamadasNegocio, 0);
});

test('variantes de rutas y HEAD no permiten eludir autorización', async t => {
    const f = await preparar(t);
    for (const ruta of [['GET', '/USERS/'], ['GET', '/reports/ventas/?rol=administrador'], ['HEAD', '/reports/ventas/pdf'],
        ['GET', '/users/1'], ['DELETE', '/sales/1', {}], ['POST', '/users/1/delete', {}]]) {
        assert.ok([403, 404].includes(await f.pedir(ruta)), `${ruta[0]} ${ruta[1]}`);
        assert.equal(f.llamadasNegocio, 0);
    }
});
