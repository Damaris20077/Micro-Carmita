const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const section=id=>{const a=html.indexOf(`<section id="${id}"`),b=html.indexOf('<section ',a+1);return html.slice(a,b<0?html.indexOf('</main>',a):b)};
test('Clientes aparece una sola vez en Ventas entre terminal e historial y sale de Inventario',()=>{
    const ventas=section('ventas'),inventario=section('inventario');
    const a=ventas.indexOf('class="formulario gestion-clientes"'),b=ventas.indexOf('class="tabla-contenedor ventas-historial"');
    assert.ok(a>ventas.indexOf('id="totalCarrito"')&&a<b);
    const panel=ventas.slice(a,b);assert.match(panel,/<h2>Gestión de clientes<\/h2>/);
    for(const id of ['clientesNombre','clientesIdentificacion','clientesTelefono','clientesDireccion','listaClientes']){
        assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);assert.ok(panel.includes(`id="${id}"`));assert.ok(!inventario.includes(`id="${id}"`));
    }
    assert.match(inventario,/id="listaProveedores"/);
    assert.match(panel,/onclick="MicroCarmitaInventario.contacto\('clientes'\)"/);
    assert.match(panel,/id="estadoClientes" role="status" aria-live="polite"/);
});
test('Nuevo cliente queda junto al selector y usa el formulario existente sin modal',()=>{
    const ventas=section('ventas'),selector=ventas.slice(ventas.indexOf('class="venta-cliente-selector"'),ventas.indexOf('<label for="ventaTipo"'));
    assert.match(selector,/id="ventaCliente"/);assert.match(selector,/onclick="MicroCarmitaVentas.nuevoCliente\(\)">\+ Nuevo cliente/);
    assert.equal((ventas.match(/id="clientesNombre"/g)||[]).length,1);assert.doesNotMatch(ventas,/role="dialog"/);
});
test('Inventario delega Clientes y Ventas conserva su única ruta y limpieza de creación tras recarga',()=>{
    const inventario=fs.readFileSync(path.join(__dirname,'..','inventory-client.js'),'utf8');
    const ventas=fs.readFileSync(path.join(__dirname,'..','sales-client.js'),'utf8');
    const auth=fs.readFileSync(path.join(__dirname,'..','auth-client.js'),'utf8');
    assert.doesNotMatch(inventario,/api\('\/clientes'\)|elemento\('listaClientes'\)/);
    assert.match(inventario,/tipo === 'clientes' \? globalThis.MicroCarmitaVentas.registrarCliente\(\)/);
    assert.match(ventas,/api\('\/clientes', 'POST'/);assert.match(auth,/#ventas \.gestion-clientes input/);
});
