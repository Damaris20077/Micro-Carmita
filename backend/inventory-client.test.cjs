const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function preparar(rol = 'administrador', {stock=2,activo=true} = {}) {
    const campos = {};
    const llamadas = [];
    const avisos = [];
    const adminControls = [{ hidden: false }];
    const controles = [{ disabled:false, attrs:{}, setAttribute(k,v){this.attrs[k]=v}, removeAttribute(k){delete this.attrs[k]} }];
    let fallo = false;
    const productos = [{ id: 1, nombre: 'Leche', categoria: 'Lácteos', precio_compra: 0.8, precio_venta: 1.25,
        proveedor_id: 1, activo, stock, stockBajo: stock<3,
        lotes: [{ id: 1, codigo: 'L1', cantidad: stock, fecha_ingreso: '2026-11-17', caducidad: '2026-11-22', estado: 'Por caducar' }] }];
    const contexto = vm.createContext({
        crypto: { randomUUID: require('node:crypto').randomUUID },
        document: {
            getElementById(id) {
                if (!campos[id]) campos[id] = { value: '', textContent: '', innerHTML: '', hidden: false, attrs:{}, setAttribute(k,v){this.attrs[k]=v}, appendChild() {} };
                return campos[id];
            },
            createElement() { return { value: '', textContent: '' }; },
            querySelectorAll(selector) { return selector==='[data-inventario-control]'?controles:adminControls; },
            addEventListener() {}
        },
        localStorage: {
            getItem(clave) {
                assert.notEqual(clave, 'inventario', 'Se leyó el inventario local');
                return '[]';
            },
            setItem() { assert.fail('Se escribió en almacenamiento local'); }
        },
        alert(mensaje) { avisos.push(mensaje); },
        confirm:()=>true,
        MicroCarmitaAuth: {
            async api(ruta, metodo, datos) {
                llamadas.push({ ruta, metodo, datos });
                if (fallo) throw new Error('Inventario no disponible');
                if (ruta === '/inventory') return { productos: structuredClone(productos) };
                if (ruta === '/proveedores') return { registros: [{ id: 1, nombre: 'Proveedor' }] };
                if (ruta === '/clientes') return { registros: [{ id: 1, nombre: 'Cliente' }] };
                if (ruta === '/products/1' && metodo === 'PATCH') { productos[0].activo=datos.activo; return {id:1}; }
                return {};
            }
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'date-formatter.js'), 'utf8'), contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), contexto);
    vm.runInContext(`usuarioActual = () => ({ id: 1, rol: '${rol}', activo: true });`, contexto);
    // Mantener la identidad estable como lo hace el adaptador de autenticación.
    vm.runInContext('const identidadEnsayo = usuarioActual(); usuarioActual = () => identidadEnsayo;', contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'inventory-client.js'), 'utf8'), contexto);
    return { contexto, campos, llamadas, avisos, adminControls, controles, fallar() { fallo = true; } };
}

test('proveedores muestran nombres y contexto sin prefijo ID; selección conserva proveedorId del lote',async()=>{
    const f=preparar(),api=f.contexto.MicroCarmitaAuth.api,posts=[];
    f.contexto.MicroCarmitaAuth.api=(r,m,d)=>{
        if(r==='/proveedores')return Promise.resolve({registros:[{id:13,nombre:'Distribuidor',telefono:'0001'},{id:27,nombre:'Distribuidor',telefono:'0002'}]});
        if(m==='POST')posts.push({r,d});return api(r,m,d);
    };
    await f.contexto.MicroCarmitaInventario.cargar();
    assert.doesNotMatch(f.campos.listaProveedores.textContent,/\b(?:13|27) —/);
    assert.match(f.campos.productoProveedor.innerHTML,/<option value="13">Distribuidor — Tel\.: 0001/);
    assert.match(f.campos.productoProveedor.innerHTML,/<option value="27">Distribuidor — Tel\.: 0002/);
    for(const [id,value]of Object.entries({entradaProducto:'1',entradaProveedor:'27',entradaCodigo:'LOTE-QA',entradaCantidad:'1',entradaCompra:'2',entradaFecha:'2026-11-19',entradaCaducidad:''}))f.contexto.document.getElementById(id).value=value;
    await f.contexto.MicroCarmitaInventario.entrada();assert.equal(posts[0].d.proveedorId,27);assert.equal(posts[0].r,'/products/1/lots');
    assert.equal(f.contexto.MicroCarmitaInventario.codigoLote(1),'L1');assert.match(f.campos.listaLotes.innerHTML,/L1/);
});

test('edición mantiene la entrada numérica necesaria de proveedor con opciones contextualizadas en el propio diálogo',async()=>{
    const f=preparar();await f.contexto.MicroCarmitaInventario.cargar();
    const respuestas=['Leche','Lácteos','0.8','1.25','1'],preguntas=[];
    f.contexto.prompt=(mensaje,valor)=>{preguntas.push({mensaje,valor});return respuestas.shift()};
    await f.contexto.editarProducto(1);
    assert.match(preguntas[4].mensaje,/1: Proveedor/);assert.equal(preguntas[4].valor,1);
    assert.equal(f.llamadas.find(l=>l.metodo==='PATCH').datos.proveedorId,1);
});

test('archivar con stock positivo o negativo muestra la regla sin enviar PATCH',async()=>{
    for(const stock of [2,-1]){
        const f=preparar('administrador',{stock});await f.contexto.MicroCarmitaInventario.cargar();await f.contexto.eliminarProducto(1);
        assert.match(f.campos.estadoInventario.textContent,/existencias deben ser cero/);
        assert.equal(f.campos.estadoInventario.attrs['data-estado'],'error');
        assert.equal(f.llamadas.filter(l=>l.metodo==='PATCH').length,0);
    }
});

test('Archivar confirma, conserva datos y muestra Reactivar en la lista completa',async()=>{
    const f=preparar('administrador',{stock:0});await f.contexto.MicroCarmitaInventario.cargar();let confirmacion;
    f.contexto.confirm=m=>{confirmacion=m;return true};await f.contexto.eliminarProducto(1);
    assert.match(confirmacion,/conservando sus lotes, historial y registros relacionados/);
    const patches=f.llamadas.filter(l=>l.metodo==='PATCH');assert.equal(patches.length,1);assert.equal(patches[0].datos.activo,false);
    assert.match(f.campos.listaInventario.innerHTML,/Archivado/);assert.match(f.campos.listaInventario.innerHTML,/MicroCarmitaInventario.reactivar\(1\)/);
    assert.equal(f.contexto.obtenerDatos('inventario').length,0);
    assert.match(f.campos.estadoInventario.textContent,/Producto archivado correctamente/);assert.match(f.campos.listaLotes.innerHTML,/L1/);
});

test('Reactivar reutiliza PATCH, restaura selección operativa y conserva lote y precios',async()=>{
    const f=preparar('administrador',{stock:0,activo:false});await f.contexto.MicroCarmitaInventario.cargar();
    await f.contexto.MicroCarmitaInventario.reactivar(1);
    const patch=f.llamadas.find(l=>l.metodo==='PATCH');assert.equal(patch.datos.activo,true);
    assert.equal(patch.datos.precioCompra,0.8);assert.equal(patch.datos.precioVenta,1.25);
    assert.match(f.campos.listaInventario.innerHTML,/onclick="eliminarProducto\(1\)"/);
    assert.equal(f.contexto.obtenerDatos('inventario').length,1);assert.match(f.campos.listaLotes.innerHTML,/L1/);
    assert.match(f.campos.estadoInventario.textContent,/Producto reactivado correctamente/);
});

test('editar la ficha de un archivado no lo reactiva implícitamente',async()=>{
    const f=preparar('administrador',{stock:0,activo:false});await f.contexto.MicroCarmitaInventario.cargar();
    const respuestas=['Leche','Lácteos','0.8','1.25','1'];f.contexto.prompt=()=>respuestas.shift();
    await f.contexto.editarProducto(1);assert.equal(f.llamadas.find(l=>l.metodo==='PATCH').datos.activo,false);
    assert.match(f.campos.listaInventario.innerHTML,/Archivado/);
});

test('cancelar confirmación no escribe; Vendedor no puede archivar ni reactivar desde métodos directos',async()=>{
    const f=preparar('administrador',{stock:0});await f.contexto.MicroCarmitaInventario.cargar();f.contexto.confirm=()=>false;await f.contexto.eliminarProducto(1);
    assert.equal(f.llamadas.filter(l=>l.metodo==='PATCH').length,0);
    const v=preparar('vendedor',{stock:0,activo:false});await v.contexto.MicroCarmitaInventario.cargar();
    await v.contexto.MicroCarmitaInventario.reactivar(1);await v.contexto.eliminarProducto(1);
    assert.equal(v.llamadas.filter(l=>l.metodo==='PATCH').length,0);assert.doesNotMatch(v.campos.listaInventario.innerHTML,/>Reactivar<|>Archivar</);
    assert.match(v.campos.estadoInventario.textContent,/Solo el Administrador/);
});

test('archivo evita duplicados y errores HTTP quedan visibles con controles liberados',async()=>{
    const f=preparar('administrador',{stock:0});await f.contexto.MicroCarmitaInventario.cargar();let rechazar,patches=0;
    const api=f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api=(r,m,d)=>m==='PATCH'?(patches++,new Promise((res,j)=>{rechazar=j})):api(r,m,d);
    const archivo=f.contexto.eliminarProducto(1);await f.contexto.eliminarProducto(1);assert.equal(patches,1);assert.ok(f.controles[0].disabled);
    rechazar(Object.assign(new Error('Solo se archivan productos con stock cero.'),{status:409}));await archivo;
    assert.equal(f.campos.estadoInventario.attrs['data-estado'],'error');assert.match(f.campos.estadoInventario.textContent,/stock cero/);
    assert.equal(f.controles[0].disabled,false);
});

test('archivo confirmado seguido de error de consulta advierte no repetir la escritura',async()=>{
    const f=preparar('administrador',{stock:0});await f.contexto.MicroCarmitaInventario.cargar();const api=f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api=(r,m,d)=>r==='/inventory'?Promise.reject(new Error('Sin conexión')):api(r,m,d);
    await f.contexto.eliminarProducto(1);
    assert.equal(f.llamadas.filter(l=>l.metodo==='PATCH').length,1);
    assert.equal(f.campos.estadoInventario.attrs['data-estado'],'error');
    assert.match(f.campos.estadoInventario.textContent,/archivado correctamente.*No repita la operación/);
});

test('archivo confirmado no reutiliza una lectura pendiente anterior a la escritura',async()=>{
    const f=preparar('administrador',{stock:0});await f.contexto.MicroCarmitaInventario.cargar();
    const api=f.contexto.MicroCarmitaAuth.api;let resolver,pendiente=true;
    f.contexto.MicroCarmitaAuth.api=(r,m,d)=>r==='/inventory'&&pendiente?new Promise(res=>{resolver=res}):api(r,m,d);
    const vieja=f.contexto.MicroCarmitaInventario.cargar();const archivo=f.contexto.eliminarProducto(1);
    await new Promise(res=>setImmediate(res));pendiente=false;
    resolver({productos:[{id:1,nombre:'Leche',categoria:'Lácteos',precio_compra:0.8,precio_venta:1.25,proveedor_id:1,activo:true,stock:0,lotes:[]}]});
    await vieja;await archivo;
    assert.match(f.campos.listaInventario.innerHTML,/Reactivar/);assert.match(f.campos.estadoInventario.textContent,/archivado correctamente/);
});

test('inventario distingue stock y caducidad remotos y separa alertas sin recalcular sus reglas', async () => {
    const f=preparar(); await f.contexto.MicroCarmitaInventario.cargar();
    assert.match(f.campos.listaInventario.innerHTML,/estado-pendiente">Stock bajo/);
    assert.match(f.campos.listaLotes.innerHTML,/estado-pendiente">Por caducar/);
    assert.match(f.campos.listaInventario.innerHTML,/class="btn peligro"[^>]*onclick="eliminarProducto\(1\)"/);
    assert.match(f.campos.alertasInventario.textContent,/stock bajo.*\n.*Por caducar/);
    assert.equal(f.campos.alertasInventario.attrs['data-estado'],'aviso');
    assert.equal(f.campos.estadoInventario.attrs['data-estado'],'exito');
});

test('catálogo vacío informa ausencia de productos y lotes tras una consulta exitosa', async () => {
    const f=preparar();
    f.contexto.MicroCarmitaAuth.api=async r=>r==='/inventory'?{productos:[]}:{registros:[]};
    await f.contexto.MicroCarmitaInventario.cargar();
    assert.match(f.campos.listaInventario.innerHTML,/No hay productos registrados/);
    assert.match(f.campos.listaLotes.innerHTML,/No hay lotes registrados/);
    assert.equal(f.campos.alertasInventario.textContent,'Sin alertas de inventario.');
    assert.equal(f.campos.alertasInventario.attrs['data-estado'],'neutro');
});

test('inventario refleja bloqueo de escritura y hace visible un error liberando los botones', async () => {
    const f=preparar();let rechazar,posts=0,visible=false;
    const estado=f.contexto.document.getElementById('estadoInventario');estado.focus=()=>{visible=true};
    f.contexto.MicroCarmitaAuth.api=async()=>{posts++;return new Promise((r,j)=>{rechazar=j})};
    const ajuste=f.contexto.MicroCarmitaInventario.ajustar();
    assert.ok(f.controles[0].disabled);assert.equal(f.controles[0].attrs['aria-busy'],'true');
    await f.contexto.MicroCarmitaInventario.ajustar();assert.equal(posts,1);
    rechazar(Object.assign(new Error('Motivo obligatorio'),{status:400}));await ajuste;
    assert.equal(estado.attrs['data-estado'],'error');assert.ok(visible);
    assert.match(estado.textContent,/Motivo obligatorio/);
    assert.equal(f.controles[0].disabled,false);assert.equal(f.controles[0].attrs['aria-busy'],undefined);
});

test('inventario impide ajustes simultáneos y permite operar después de terminar', async () => {
    const f = preparar();
    let resolver, escrituras = 0;
    const anterior = f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api = async (...args) => {
        if (args[1] === 'POST') { escrituras++; await new Promise(r => { resolver = r; }); return {}; }
        return anterior(...args);
    };
    const uno = f.contexto.MicroCarmitaInventario.ajustar();
    await f.contexto.MicroCarmitaInventario.ajustar();
    assert.equal(escrituras, 1);
    resolver(); await uno;
    const siguiente = f.contexto.MicroCarmitaInventario.ajustar();
    assert.equal(escrituras, 2);
    resolver(); await siguiente;
});

test('inventario no presenta historial recibido después de cerrar sesión', async () => {
    const f = preparar();
    let resolver;
    f.contexto.MicroCarmitaAuth.api = () => new Promise(r => { resolver = r; });
    const consulta = f.contexto.MicroCarmitaInventario.historial(1);
    f.contexto.usuarioActual = () => null;
    resolver({ movimientos: [{ motivo: 'Información privada' }] });
    await consulta;
    assert.doesNotMatch(f.contexto.document.getElementById('historialInventario').textContent, /Información privada/);
});

test('pantalla inventario utiliza API y cálculo remoto sin leer stock local', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaInventario.cargar();
    assert.match(f.campos.listaInventario.innerHTML, /Stock bajo/);
    assert.match(f.campos.listaLotes.innerHTML, /Por caducar/);
    assert.match(f.campos.alertasInventario.textContent, /stock bajo \(2\)/);
    assert.equal(f.contexto.obtenerDatos('inventario')[0].cantidad, 2);
    assert.equal(f.campos.totalProductos.textContent, 2);
    assert.throws(() => f.contexto.guardarDatos('inventario', []), /mediante la API/);
    f.contexto.registrarVenta();
    assert.match(f.avisos[0], /siguiente fase/);
});

test('pantalla Vendedor consulta inventario y oculta controles administrativos', async () => {
    const f = preparar('vendedor');
    await f.contexto.MicroCarmitaInventario.cargar();
    assert.equal(f.campos.formularioProducto.hidden, true);
    assert.equal(f.adminControls[0].hidden, true);
    assert.doesNotMatch(f.campos.listaInventario.innerHTML, /Archivar/);
});

test('error remoto vacía el stock visible y no utiliza datos locales como sustituto', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaInventario.cargar();
    f.fallar();
    await f.contexto.MicroCarmitaInventario.cargar();
    assert.equal(f.contexto.obtenerDatos('inventario').length, 0);
    assert.equal(f.campos.totalProductos.textContent, 0);
    assert.match(f.campos.estadoInventario.textContent, /migración 002/);
});

test('formulario de alta envía todos los campos RF-14 a la API', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaInventario.cargar();
    for (const [id, value] of Object.entries({ productoNombre: 'Pan', productoCategoria: 'Panadería', productoCompra: '0.5',
        productoPrecio: '1', productoProveedor: '1', productoCodigo: 'PAN1', productoCantidad: '4',
        productoFecha: '2026-11-17', productoCaducidad: '2026-11-20' })) {
        f.contexto.document.getElementById(id).value = value;
    }
    await f.contexto.agregarProducto();
    const peticion = f.llamadas.find(p => p.ruta === '/products');
    assert.equal(peticion.metodo, 'POST');
    assert.match(peticion.datos.clave, /^[a-f0-9-]{36}$/);
    const { clave, ...datos } = JSON.parse(JSON.stringify(peticion.datos));
    assert.deepEqual(datos, { nombre: 'Pan', categoria: 'Panadería', precioCompra: 0.5,
        precioVenta: 1, proveedorId: 1, codigo: 'PAN1', cantidad: 4, fechaIngreso: '2026-11-17', caducidad: '2026-11-20' });
});

test('entrada automática conserva la clave y fechas ISO tras perder una respuesta', async () => {
    const f = preparar(); let intento = 0; const posts = [];
    const api = f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api = async (ruta, metodo, datos) => {
        if (metodo === 'POST') { posts.push(JSON.parse(JSON.stringify(datos))); if (++intento === 1) throw new Error('Respuesta perdida'); return {}; }
        return api(ruta, metodo, datos);
    };
    for (const [id, value] of Object.entries({ entradaProducto: '1', entradaCodigo: '', entradaCantidad: '2', entradaProveedor: '1', entradaCompra: '0.8', entradaFecha: '2026-11-17', entradaCaducidad: '2026-11-22' })) f.contexto.document.getElementById(id).value = value;
    await f.contexto.MicroCarmitaInventario.entrada();
    await f.contexto.MicroCarmitaInventario.entrada();
    assert.equal(posts.length, 2); assert.equal(posts[0].clave, posts[1].clave);
    assert.equal(posts[0].codigo, ''); assert.equal(posts[0].fechaIngreso, '2026-11-17'); assert.equal(posts[0].caducidad, '2026-11-22');
    assert.match(f.campos.listaLotes.innerHTML, /17.*nov.*2026/);
    assert.doesNotMatch(f.campos.listaLotes.innerHTML, /2026-11-17/);
});
