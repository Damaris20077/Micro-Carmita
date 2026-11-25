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
const inicio = html.indexOf('<section id="movimientos"'), fin = html.indexOf('<section id="reportes"');
const seccion = html.slice(inicio, fin), marcador = '/* Finanzas: registro manual';

test('bloques posteriores conservan Finanzas y sus estilos previos', () => {
    assert.equal(hash(seccion), 'f3fc245af0b0d33218382027eef8bc0882f12dbc58ff0b00d39e89eee2b4be27');
    assert.equal(hash(css.slice(0, css.indexOf(marcador)).replace(/\n+$/, '\n')), '645f187c9e890ecd0ae504fff5719748ed3f86f1610a337a4e55a0fea1ca98a0');
    for (const m of css.slice(css.indexOf(marcador), css.indexOf('/* Bloque coordinado:')).matchAll(/([^{}]+)\{/g)) {
        const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (!selector.startsWith('@media')) assert.ok(selector.split(',').every(s => s.trim().startsWith('#movimientos ')), selector);
    }
});

test('formulario mantiene orden de campos, filas, checkbox y mensajes próximos a sus acciones', () => {
    const raiz = { hijos: [] }, pila = [raiz], nodos = [];
    for (const m of seccion.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
        const tag = m[1].toLowerCase();
        if (m[0].startsWith('</')) assert.equal(pila.pop().tag, tag, `Cierre ${tag}`);
        else {
            const n = { tag, attrs:m[0], padre:pila.at(-1), hijos:[] };
            n.padre.hijos.push(n); nodos.push(n);
            if (!['input','br','hr','img'].includes(tag)) pila.push(n);
        }
    }
    assert.equal(pila.length, 1);
    const porId = id => nodos.find(n => n.attrs.includes(`id="${id}"`));
    const porClase = c => nodos.find(n => n.attrs.match(/class="([^"]*)"/)?.[1].split(' ').includes(c));
    const campos = porClase('form-grid').hijos;
    const ids = ['movimientoTipo','movimientoValor','movimientoDescripcion','finanzaCategoria','finanzaFecha','finanzaAdministrativo'];
    function dentro(n, a) { for (; n; n = n.padre) if (n === a) return true; return false; }
    ids.forEach((id,i) => assert.ok(dentro(porId(id), campos[i]), id));
    assert.match(campos[2].attrs, /finanzas-descripcion/);
    assert.equal(porId('finanzaAdministrativo').padre.tag, 'label');
    const boton = nodos.find(n => n.attrs.includes('onclick="registrarMovimiento()"'));
    assert.equal(porId('finanzaRegistroEstado').padre, boton.padre);
    assert.match(porId('finanzaRegistroEstado').attrs, /role="status" aria-live="polite"/);
    const filtros = porClase('finanzas-filtros'), historial = porClase('finanzas-historial');
    for (const id of ['finanzaDesde','finanzaHasta']) assert.ok(dentro(porId(id), filtros));
    assert.ok(filtros.hijos.some(n => n.attrs.includes('onclick="MicroCarmitaFinanzas.cargar()"')));
    assert.ok(filtros.hijos.some(n => n.attrs.includes('onclick="MicroCarmitaFinanzas.todos()"')));
    assert.equal(porId('estadoFinanzas').padre, historial);
    assert.equal(porId('resumenFinanzas').tag, 'p');
    assert.ok(dentro(porId('listaMovimientos'), historial));
});

test('finanzas define dos columnas y apilado móvil, filtros separados y tabla accesible', () => {
    assert.match(css, /#movimientos \.finanzas-registro \.form-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /#movimientos \.finanzas-descripcion, #movimientos \.finanzas-administrativo\s*\{\s*grid-column: 1 \/ -1/);
    assert.match(css, /#movimientos \.finanzas-filtros\s*\{[^}]*gap: var\(--space-3\)/);
    assert.match(css, /@media \(max-width: 600px\)\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /#movimientos \.finanzas-confirmacion button\s*\{[^}]*min-height: 3rem/);
    assert.match(seccion, /class="tabla-scroll" tabindex="0" aria-label="Historial de ingresos y egresos"/);
    assert.equal((seccion.match(/id="resumenFinanzas"/g) || []).length, 1);
    // Verifica contrato y semántica. El tamaño real y desbordamiento requieren navegador.
});
