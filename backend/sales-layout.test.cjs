const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    // Normaliza solo la ruta documental; conserva las huellas del diseño aprobado.
const css = fs.readFileSync(path.join(__dirname, '..', 'estilos.css'), 'utf8').replace(/\r\n/g, '\n')
        .replace('/* Micro Carmita · base visual compartida. Ver docs/UI_UX.md. */', '/* Micro Carmita · base visual compartida. Ver UI_UX.md. */');
const hash = v => createHash('sha256').update(v).digest('hex');
const inicio = html.indexOf('<section id="ventas"'), fin = html.indexOf('<section id="cuentas"');
const ventas = html.slice(inicio, fin);

test('traslado de Clientes conserva íntegro el historial de Ventas y sus estilos previos', () => {
    assert.equal(hash(ventas.slice(ventas.indexOf('<div class="tabla-contenedor ventas-historial"'))), 'facdc472427a25f3de06644c60e629eb3e197478ab6a428a23b5484af3ff1895');
    const marcador = '/* Ventas: terminal de registro.';
    // El único CSS nuevo se añade al final y todos sus selectores pertenecen a Ventas.
    assert.equal(hash(css.slice(0, css.indexOf(marcador)).replace(/\n+$/, '\n')), '5196c0ddc7225461454c24f82eb1ab4f66768899ae5e6a089ccdf5fcfae35b74');
    for (const m of css.slice(css.indexOf(marcador), css.indexOf('/* Finanzas: registro manual')).matchAll(/([^{}]+)\{/g)) {
        const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (!selector.startsWith('@media')) assert.ok(selector.split(',').every(s => s.trim().startsWith('#ventas ')), selector);
    }
});

test('terminal de ventas agrupa selección y carrito; historial queda debajo sin duplicar controles', () => {
    // Pila de etiquetas reales: verifica parentesco, no solo orden de cadenas.
    const raiz = { hijos: [] }, pila = [raiz];
    const nodos = [];
    for (const m of ventas.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
        const tag = m[1].toLowerCase();
        if (m[0].startsWith('</')) {
            assert.equal(pila.pop().tag, tag, `Cierre ${tag}`);
        } else {
            const n = { tag, padre:pila.at(-1), hijos:[], attrs:m[0] };
            n.padre.hijos.push(n); nodos.push(n);
            if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) pila.push(n);
        }
    }
    assert.equal(pila.length, 1);
    const porClase = c => nodos.find(n => n.attrs.match(/class="([^"]*)"/)?.[1].split(' ').includes(c));
    const porId = id => nodos.find(n => n.attrs.includes(`id="${id}"`));
    function dentro(n, ancestro) { for (; n; n = n.padre) if (n === ancestro) return true; return false; }
    const terminal = porClase('ventas-terminal'), seleccion = porClase('ventas-seleccion'), carrito = porClase('ventas-carrito');
    assert.deepEqual(terminal.hijos, [seleccion, carrito]);
    for (const id of ['ventaCliente','ventaTipo','ventaProducto','ventaPrecio','ventaCantidad']) assert.ok(dentro(porId(id), seleccion), id);
    for (const id of ['listaCarrito','totalCarrito','estadoVentas']) assert.ok(dentro(porId(id), carrito), id);
    assert.ok(dentro(nodos.find(n => n.attrs.includes('onclick="registrarVenta()"')), carrito));
    assert.equal(porClase('ventas-historial').padre, terminal.padre);
    assert.ok(nodos.indexOf(porClase('ventas-historial')) > nodos.indexOf(carrito));
    assert.ok(dentro(porId('listaVentas'), porClase('ventas-historial')));
    assert.match(porId('estadoVentas').attrs, /role="status" aria-live="polite"/);
});

test('ventas ofrece columnas adaptables, scroll local accesible y total destacado con tokens actuales', () => {
    assert.match(css, /#ventas \.ventas-terminal\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.15fr\)/);
    assert.match(css, /@media \(max-width: 1100px\)\s*\{\s*#ventas \.ventas-terminal\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /#ventas \.ventas-terminal > div\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /#ventas \.ventas-registrar\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*3rem/);
    assert.match(css, /#ventas #totalCarrito\s*\{[^}]*text-align:\s*right/);
    assert.match(ventas, /class="tabla-scroll" tabindex="0" aria-label="Productos del carrito"/);
    assert.match(ventas, /class="tabla-scroll" tabindex="0" aria-label="Historial de ventas"/);
    // Contrato de CSS/DOM; la aceptación de medidas reales requiere navegador.
});
