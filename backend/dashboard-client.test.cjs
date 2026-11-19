const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function preparar({ permisos = ['inicio', 'inventario', 'pedidos', 'ventas'], rol = 'vendedor' } = {}) {
    let actor = { id: 2, rol, activo: true }, inicio = true;
    const campos = {}, llamadas = [], eventos = {};
    const datos = {
        '/inventory/alerts': { stockBajo: [{ nombre: '<Arroz>', stock: -2 }], caducidad: [
            { producto: 'Leche', codigo: 'L1', caducidad: '2026-11-22', estado: 'Por caducar' },
            { producto: 'Pan', codigo: 'L2', caducidad: '2026-11-16', estado: 'Caducado' }
        ] },
        '/orders': { pedidos: ['Pendiente', 'Recibido parcialmente', 'Cancelado', 'Recibido completo'].map((estado, i) => ({ id: i + 1, proveedor: '<Proveedor>', estado })) },
        '/sales': { ventas: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, cliente: '<Cliente>', total: i + 1, tipo: 'fiado',
            estado: i === 6 ? 'Anulada' : 'Activa', creado_en: `2026-11-${String(10 + i).padStart(2, '0')}T12:00:00Z` })) }
    };
    const contexto = vm.createContext({
        document: {
            getElementById(id) { return campos[id] ??= { textContent: '', innerHTML: '', disabled: false, hidden: false,
                setAttribute(n, v) { this[n] = v; }, removeAttribute(n) { delete this[n]; }, classList: { contains: () => inicio } }; },
            addEventListener(nombre, fn) { eventos[nombre] = fn; }
        },
        usuarioActual: () => actor, tienePermiso: p => Boolean(actor && permisos.includes(p)),
        textoSeguro: v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
        dinero: v => '$' + Number(v).toFixed(2),
        mostrarSeccion(nombre) { inicio = nombre === 'inicio'; },
        localStorage: { getItem() { assert.fail('No debe leer datos locales'); }, setItem() { assert.fail('No debe escribir datos locales'); } },
        MicroCarmitaAuth: { async api(ruta, metodo = 'GET') { llamadas.push({ ruta, metodo }); return structuredClone(datos[ruta]); } }
    });
    for (const archivo of ['date-formatter.js', 'dashboard-client.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'), contexto);
    return { contexto, campos, datos, llamadas, eventos, salir() { actor = null; eventos['microcarmita:sesion'](); } };
}

test('inicio del Vendedor usa solo consultas permitidas, alertas del servidor y estados pendientes', async () => {
    const f = preparar(); const originales = JSON.stringify(f.datos);
    await f.contexto.MicroCarmitaInicio.cargar();
    assert.deepEqual(f.llamadas.map(p => p.ruta).sort(), ['/inventory/alerts', '/orders', '/sales']);
    assert.ok(f.llamadas.every(p => p.metodo === 'GET'));
    assert.match(f.campos.inicioPanelStockLista.innerHTML, /-2 unidades/);
    assert.match(f.campos.inicioPanelStockLista.innerHTML, /&lt;Arroz&gt;/);
    assert.match(f.campos.inicioPanelCaducidadLista.innerHTML, /Por caducar/);
    assert.match(f.campos.inicioPanelCaducidadLista.innerHTML, /estado-agotado/);
    assert.match(f.campos.inicioPanelPedidosLista.innerHTML, /Recibido parcialmente/);
    assert.doesNotMatch(f.campos.inicioPanelPedidosLista.innerHTML, /Cancelado|Recibido completo/);
    assert.equal(JSON.stringify(f.datos), originales);
});

test('actividad usa cinco ventas reales de la respuesta, conserva anuladas y escapa nombres', async () => {
    const f = preparar({ rol: 'administrador' });
    await f.contexto.MicroCarmitaInicio.cargar();
    const html = f.campos.inicioPanelVentasLista.innerHTML;
    assert.equal((html.match(/<li>/g) || []).length, 5);
    assert.ok(html.indexOf('Venta 7') < html.indexOf('Venta 6'));
    assert.doesNotMatch(html, /Venta 1 ·|Venta 2 ·/);
    assert.match(html, /Anulada/); assert.match(html, /&lt;Cliente&gt;/); assert.match(html, /\$7\.00/);
});

test('panel muestra estados vacíos cuando las consultas no tienen datos', async () => {
    const f = preparar();
    f.datos['/inventory/alerts'] = { stockBajo: [], caducidad: [] }; f.datos['/orders'] = { pedidos: [] }; f.datos['/sales'] = { ventas: [] };
    await f.contexto.MicroCarmitaInicio.cargar();
    for (const grupo of ['Stock', 'Caducidad', 'Pedidos', 'Ventas']) assert.match(f.campos[`inicioPanel${grupo}Estado`].textContent, /No hay/);
});

test('sin permisos operativos no consulta ni expone tarjetas restringidas', async () => {
    const f = preparar({ permisos: ['inicio', 'inventario'] });
    await f.contexto.MicroCarmitaInicio.cargar();
    assert.deepEqual(f.llamadas.map(p => p.ruta), ['/inventory/alerts']);
    assert.equal(f.campos.inicioPanelPedidos.hidden, true); assert.equal(f.campos.inicioPanelVentas.hidden, true);
});

test('sin sesión no realiza solicitudes y borra datos del panel', async () => {
    const f = preparar(); await f.contexto.MicroCarmitaInicio.cargar(); f.salir();
    const cantidad = f.llamadas.length;
    await f.contexto.MicroCarmitaInicio.cargar();
    assert.equal(f.llamadas.length, cantidad);
    assert.equal(f.campos.inicioPanelStockLista.innerHTML, ''); assert.equal(f.campos.inicioPanelVentasLista.innerHTML, '');
});

test('peticiones simultáneas se agrupan, muestran carga y descartan respuestas tras logout', async () => {
    const f = preparar(); const resolver = [];
    f.contexto.MicroCarmitaAuth.api = ruta => { f.llamadas.push({ ruta }); return new Promise(r => resolver.push(() => r(structuredClone(f.datos[ruta])))); };
    const uno = f.contexto.MicroCarmitaInicio.cargar();
    const dos = f.contexto.MicroCarmitaInicio.cargar();
    assert.equal(f.llamadas.length, 3); assert.equal(f.campos.inicioPanelActualizar.disabled, true);
    assert.equal(f.campos.inicioPanelActualizar['aria-busy'], 'true');
    f.salir(); resolver.forEach(r => r()); await Promise.all([uno, dos]);
    assert.equal(f.campos.inicioPanelPedidosLista.innerHTML, ''); assert.equal(f.campos.inicioPanelStockLista.innerHTML, '');
});

test('un error parcial no oculta datos correctos de otros bloques ni rechaza la promesa', async () => {
    const f = preparar(); const api = f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api = ruta => ruta === '/orders' ? Promise.reject(new Error('Error interno ficticio')) : api(ruta);
    await f.contexto.MicroCarmitaInicio.cargar();
    assert.match(f.campos.inicioPanelPedidosEstado.textContent, /No se pudo cargar/);
    assert.match(f.campos.inicioPanelEstado.textContent, /Algunos datos/);
    assert.match(f.campos.inicioPanelStockLista.innerHTML, /Arroz/);
    assert.equal(f.campos.inicioPanelActualizar.disabled, false);
    assert.doesNotMatch(f.campos.inicioPanelEstado.textContent, /interno ficticio/);
});

test('volver al inicio consulta de nuevo; navegar a otro módulo conserva la función original', async () => {
    const f = preparar();
    f.contexto.mostrarSeccion('ventas'); assert.equal(f.llamadas.length, 0);
    f.contexto.mostrarSeccion('inicio'); await f.contexto.MicroCarmitaInicio.cargar();
    assert.equal(f.llamadas.length, 3);
    f.contexto.mostrarSeccion('inicio'); await f.contexto.MicroCarmitaInicio.cargar();
    assert.equal(f.llamadas.length, 6);
});
