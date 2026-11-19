const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'estilos.css'), 'utf8');
const hash = v => createHash('sha256').update(v).digest('hex');

test('rediseño conserva IDs, eventos y atributos funcionales de los 161 controles originales', () => {
    const controles = [...html.matchAll(/<([a-z][\w-]*)\b([^<>]*)>/gi)].map(m => {
        const a = {};
        for (const x of m[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
            if (/^(id|type|name|value|min|max|step|maxlength|minlength|autocomplete|data-permiso|required|disabled|hidden|readonly|onsubmit|onclick|onchange)$/.test(x[1])) a[x[1]] = x[2] ?? x[3] ?? x[4] ?? true;
        }
        return Object.keys(a).length && !['contenido-principal', 'finanzaRegistroEstado'].includes(a.id) && !a.id?.startsWith('inicioPanel') ? { tag: m[1], ...a } : null;
    }).filter(Boolean).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
    assert.equal(controles.length, 161);
    // Contrato anterior a esta fase, sin clases/estilos ni orden global de presentación.
    assert.equal(hash(JSON.stringify(controles)), 'd52e08c48f27e90b1c7e1234658d543cdc37c38e3847bed3178b63c83f79afc5');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'No duplicar un control al moverlo');
});

test('Inventario conserva sus secciones en flujo vertical y sin pestañas', () => {
    const inventario = html.slice(html.indexOf('<section id="inventario"'), html.indexOf('<section id="movimientos"'));
    const titulos = ['Agregar producto', 'Productos registrados', 'Lotes y caducidad', 'Entrada de lote', 'Ajuste manual de inventario', 'Historial de inventario', 'Clientes', 'Proveedores'];
    let posicion = -1;
    for (const titulo of titulos) { const siguiente = inventario.indexOf(titulo, posicion + 1); assert.ok(siguiente > posicion, titulo); posicion = siguiente; }
    assert.doesNotMatch(inventario, /role="tab(list|panel)?"/);
});

test('iteraciones visuales conservan las pantallas fuera de los módulos rediseñados', () => {
    const seccion = id => { const a = html.indexOf(`<section id="${id}"`), b = html.indexOf('<section ', a + 1); return html.slice(a, b < 0 ? html.indexOf('</main>', a) : b); };
    const otras = (seccion('cuentas') + seccion('reportes') + seccion('usuarios')).replace(/\r\n/g, '\n');
    assert.equal(hash(otras), '613118dd83758097ff3b62fc7f125945304e094cbd630e0de0ce8552d35d47da');
});

test('tokens compartidos mantienen contraste de texto y límites visibles de controles', () => {
    const root = css.match(/:root\s*\{([^}]+)\}/)[1];
    const tokens = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    function luminancia(hex) {
        const canales = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return canales[0] * .2126 + canales[1] * .7152 + canales[2] * .0722;
    }
    function contraste(a, b) { const x = luminancia(tokens[a]), y = luminancia(tokens[b]); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
    for (const [a, b] of [
        ['--color-text', '--color-surface'], ['--color-muted', '--color-surface'], ['--color-muted', '--color-background'],
        ['--color-brand', '--color-surface'], ['--color-navigation-text', '--color-navigation'],
        ['--color-success', '--color-success-soft'], ['--color-danger', '--color-danger-soft'], ['--color-warning', '--color-warning-soft']
    ]) assert.ok(contraste(a, b) >= 4.5, `${a} sobre ${b}`);
    assert.ok(contraste('--color-input-border', '--color-surface') >= 3);
});

test('navegación compartida ofrece salto al contenido y cierre de sesión fuera de los módulos', () => {
    assert.match(html, /class="saltar-contenido" href="#contenido-principal"/);
    assert.match(html, /<main[^>]*id="contenido-principal"[^>]*tabindex="-1"/);
    assert.match(html, /<nav aria-label="Navegación principal">/);
    const barra = html.slice(html.indexOf('<header class="barra-sesion">'), html.indexOf('<section id="inicio"'));
    assert.match(barra, /id="nombreSesion"/); assert.match(barra, /id="rolSesion"/);
    assert.match(barra, /onclick="MicroCarmitaAuth.cerrarSesion\(\)"/);
    assert.match(css, /:focus-visible\s*\{[^}]*outline:/);
    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none !important/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /--control-size:\s*2\.75rem/);
    // Esto protege el contrato accesible; no sustituye probar layout/foco en navegador.
});
