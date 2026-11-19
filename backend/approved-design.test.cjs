const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
test('traslado autorizado de Clientes conserva las demás pantallas y el CSS previo aprobado',()=>{
    const hash=s=>createHash('sha256').update(s).digest('hex');
    // Único cambio de texto autorizado fuera de Ventas/Inventario: Producto ID → Producto.
    const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').replace(/\r\n/g,'\n')
        .replace('<th>Producto</th><th>Cantidad</th><th>Precio de compra</th><th>Acción</th>', '<th>Producto ID</th><th>Cantidad</th><th>Precio de compra</th><th>Acción</th>');
    const seccion=id=>{const a=html.indexOf(`<section id="${id}"`),b=html.indexOf('<section ',a+1);return html.slice(a,b<0?html.indexOf('</main>',a):b)};
    assert.equal(hash(html.replace(seccion('ventas'),'').replace(seccion('inventario'),'')),'563dc86e90081b1baf1202f75079d610756a19a2e9db66d3f973dc0efed02684');
    const css=fs.readFileSync(path.join(__dirname,'..','estilos.css'),'utf8').replace(/\r\n/g,'\n');
    assert.equal(hash(css.slice(0,css.indexOf('/* Clientes en Ventas:')).replace(/\n+$/,'\n')),'b48eb7539dde0933ca592195763d8c6c88a0304ae3e92f524235127977bc295b');
});
