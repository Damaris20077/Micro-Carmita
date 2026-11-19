const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').replace(/\r\n/g,'\n');
const css=fs.readFileSync(path.join(__dirname,'..','estilos.css'),'utf8').replace(/\r\n/g,'\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
const seccion=id=>{const a=html.indexOf(`<section id="${id}"`),b=html.indexOf('<section ',a+1);return html.slice(a,b<0?html.indexOf('</main>',a):b)};

test('bloque compartido conserva el HTML ajeno a Inventario/Pedidos y todos los estilos anteriores',()=>{
    assert.equal(hash(html.replace(seccion('inventario'),'').replace(seccion('pedidos'),'')),'9249de5423d3777fbe8a0516260376b069f0c417dbc917e31f258b462d58e380');
    const nuevos=css.indexOf('/* Bloque coordinado:');assert.ok(nuevos>0);
    assert.equal(hash(css.slice(0,nuevos).replace(/\n+$/,'\n')),'1dcae8043ffc0084f80ab1c69317792dad38794e9a74d3bc67520dec6bd158f7');
    assert.doesNotMatch(css.slice(nuevos),/\.sidebar|\.menu\b|\.barra-sesion/);
});

test('Inventario conserva sus tareas y tablas navegables sin pestañas ni acciones nuevas',()=>{
    const inv=seccion('inventario');
    assert.equal((inv.match(/class="form-grid"/g)||[]).length,5);
    assert.equal((inv.match(/class="tabla-scroll" tabindex="0" aria-label="[^"]+"/g)||[]).length,2);
    assert.match(inv,/id="estadoInventario" role="status" aria-live="polite" tabindex="-1"/);
    for(const accion of ['agregarProducto()','MicroCarmitaInventario.entrada()','MicroCarmitaInventario.ajustar()',"MicroCarmitaInventario.contacto('clientes')","MicroCarmitaInventario.contacto('proveedores')"]){
        assert.ok(inv.includes(`onclick="${accion}"`),accion);
    }
    assert.match(inv,/Seleccione Historial en un producto/);
    assert.doesNotMatch(inv,/role="tab/);
});

test('Pedidos separa creación, lista y recepción con ayuda condicional y scroll de teclado',()=>{
    const pedidos=seccion('pedidos');
    assert.ok(pedidos.indexOf('id="crearPedidoFormulario"')<pedidos.indexOf('id="listaPedidos"'));
    assert.ok(pedidos.indexOf('id="listaPedidos"')<pedidos.indexOf('id="detallePedido"'));
    assert.match(pedidos,/class="pedido-seleccion-ayuda texto-ayuda">Seleccione Ver y recibir/);
    assert.match(pedidos,/No se registrará una recepción hasta que la confirme/);
    assert.equal((pedidos.match(/class="tabla-scroll" tabindex="0" aria-label="[^"]+"/g)||[]).length,3);
    assert.match(pedidos,/id="recibirPedidoBoton"[^>]*onclick="MicroCarmitaPedidos.recibir\(\)"[^>]*disabled/);
    assert.match(css,/#pedidos #detallePedido\[data-seleccionado="true"\] \.pedido-seleccion-ayuda\s*\{ display: none/);
    assert.match(css,/\.acciones-fila\s*\{[^}]*flex-wrap: wrap;[^}]*gap: var\(--space-2\)/);
    assert.match(css,/button\.btn\.peligro\s*\{[^}]*color: var\(--color-danger\)/);
    assert.match(css,/@media \(max-width: 700px\)\s*\{\s*#inventario[^}]*width: 100%/);
    // Estructura/contratos; no certifica medidas reales sin navegador.
});
