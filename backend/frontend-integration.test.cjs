const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

function preparar(rol = 'vendedor') {
    const nodos = new Map(), eventos = new Map(), solicitudes = [], lecturas = [], escrituras = [];
    function nodo(id) {
        if (!nodos.has(id)) nodos.set(id, { value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
            classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
            appendChild() {}, focus() {}, setAttribute() {}, removeAttribute() {} });
        return nodos.get(id);
    }
    const menus = [...html.matchAll(/<button class="menu[^>]*data-permiso="([^"]+)"/g)]
        .map((m, i) => Object.assign(nodo(`menu${i}`), { dataset: { permiso: m[1] } }));
    const usuario = { id: 1, nombre: 'Ensayo aislado', rol, activo: true };
    const contexto = vm.createContext({
        Event, crypto: { randomUUID }, alert() {}, confirm: () => true, prompt: () => null,
        localStorage: { getItem(k) { lecturas.push(k); return '[]'; }, setItem(k) { escrituras.push(k); }, removeItem(k) { escrituras.push(k); } },
        document: {
            getElementById: nodo, createElement: () => nodo(Symbol()),
            querySelector: s => s === '.contenedor' ? nodo('panel') : null,
            querySelectorAll: s => s === '.menu[data-permiso]' ? menus : [],
            addEventListener(n, fn) { if (!eventos.has(n)) eventos.set(n, []); eventos.get(n).push(fn); },
            dispatchEvent(e) { for (const fn of eventos.get(e.type) || []) fn(e); }
        },
        async fetch(url, options = {}) {
            solicitudes.push({ url, options });
            const bodies = {
                '/api/auth/login': { usuario, csrfToken: 'csrf-simulado' },
                '/api/sales': { ventas: [] }, '/api/inventory': { productos: [] },
                '/api/proveedores': { registros: [] }, '/api/clientes': { registros: [] }, '/api/orders': { pedidos: [] },
                '/api/users': { usuarios: [] }, '/api/finance': { movimientos: [], ingresos: 0, egresos: 0, neto: 0 },
                '/api/reports/ventas': { titulo: 'Ventas verificables', generadoEn: '2026-11-17T12:00:00Z',
                    resumen: [], notas: [], columnas: [{ clave: 'cliente', titulo: 'Cliente' }], filas: [{ cliente: '<ensayo>' }] }
            };
            if (url === '/api/auth/logout') return { ok: true, status: 204 };
            assert.ok(bodies[url], `Petición inesperada: ${url}`);
            return { ok: true, status: 200, async json() { return bodies[url]; } };
        }
    });
    for (const [, archivo] of html.matchAll(/<script src="([^"]+)"/g)) {
        vm.runInContext(fs.readFileSync(path.join(raiz, archivo), 'utf8'), contexto, { filename: archivo });
    }
    return { contexto, nodo, menus, solicitudes, lecturas, escrituras };
}

test('scripts reales de index: sesión, lecturas y logout sin base de datos local paralela', async () => {
    const f = preparar();
    await f.contexto.iniciarSesion({ preventDefault() {} });
    await Promise.all([f.contexto.MicroCarmitaInventario.cargar(), f.contexto.MicroCarmitaPedidos.cargar(),
        f.contexto.MicroCarmitaVentas.cargar(), f.contexto.MicroCarmitaFinanzas.cargar()]);
    for (const clave of ['inventario', 'ventas', 'cuentas', 'movimientos']) {
        assert.equal(f.contexto.obtenerDatos(clave).length, 0);
        assert.throws(() => f.contexto.guardarDatos(clave, []), /API/);
    }
    assert.equal(f.menus.length, 8);
    assert.equal(f.menus.find(m => m.dataset.permiso === 'usuarios').hidden, true);
    assert.equal(f.menus.find(m => m.dataset.permiso === 'reportes').hidden, true);
    assert.equal(f.menus.find(m => m.dataset.permiso === 'movimientos').hidden, true);
    assert.equal(f.menus.find(m => m.dataset.permiso === 'pedidos').hidden, false);
    assert.equal(f.nodo('panel').inert, false);
    await f.contexto.cerrarSesion();
    assert.equal(f.nodo('panel').inert, true);
    assert.equal(f.contexto.usuarioActual(), null);
    assert.deepEqual(f.lecturas, []);
    assert.deepEqual(f.escrituras, []);
});

test('scripts reales de index: Administrador consulta finanzas y reportes sin alias ficticios', async () => {
    const f = preparar('administrador');
    f.nodo('reporteTipo').value = 'ventas';
    await f.contexto.iniciarSesion({ preventDefault() {} });
    await Promise.all([f.contexto.MicroCarmitaFinanzas.cargar(), f.contexto.MicroCarmitaReportes.cargar()]);
    assert.match(f.nodo('contenidoReportes').innerHTML, /Ventas verificables/);
    assert.match(f.nodo('contenidoReportes').innerHTML, /&lt;ensayo&gt;/);
    assert.equal(f.menus.find(m => m.dataset.permiso === 'usuarios').hidden, false);
    assert.equal(f.nodo('estadoFinanzas').textContent, '');
    assert.deepEqual(f.lecturas, []);
    assert.deepEqual(f.escrituras, []);
});

test('formulario accesible: etiquetas explícitas o contenedoras y diálogo con nombre', () => {
    assert.match(html, /id="pantallaLogin"[^>]*aria-labelledby="tituloLogin"/);
    assert.match(html, /class="contenedor" inert/);
    for (const label of html.matchAll(/<label([^>]*)>([\s\S]*?)<\/label>/g)) {
        const destino = /\bfor="([^"]+)"/.exec(label[1]);
        if (destino) assert.ok(html.includes(`id="${destino[1]}"`));
        else assert.match(label[2], /<(input|select|textarea)\b/);
    }
});

test('presentación conserva Inventario y ofrece historial, filtros separados e icono de pedidos', () => {
    assert.doesNotMatch(html, /nuevas ventas requiere la siguiente fase/);
    assert.match(html, /id="historialVentas"[^>]*hidden/);
    assert.match(html, /id="historialCobros" class="historial-panel"/);
    assert.match(html, /class="filtros-reportes"/);
    assert.match(html, /class="acciones-reportes"/);
    assert.match(html, /data-permiso="pedidos"[^>]*><i class="fa-solid fa-truck-ramp-box"/);
    assert.doesNotMatch(html, /role="tablist"/);
});
