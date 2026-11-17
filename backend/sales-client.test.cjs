const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function preparar(rol = 'administrador') {
    const campos = {}, solicitudes = [], eventos = {}, mensajes = [];
    let actor = { id: 1,rol }, intentos = 0, respuestaPerdida = false, rechazo = false;
    let esperar;
    const venta = { id: 1,tipo:'fiado',cliente_id:1,cliente:'Cliente',total:4,abonado:1,saldo:3,revision:1,version:1,estado:'Activa',creado_en:'2026-11-17',efectivo:1 };
    const contexto = vm.createContext({
        crypto: { randomUUID },
        document: { getElementById(id) { return campos[id] ??= { value:'',innerHTML:'',textContent:'',readOnly:true }; }, addEventListener(n,fn) { eventos[n]=fn; } },
        usuarioActual: () => actor, textoSeguro: v => String(v ?? '').replace(/</g,'&lt;'), dinero: v => String(v),
        obtenerDatos: clave => { if(clave!=='inventario')throw new Error('Acceso local prohibido');return [{id:1,nombre:'Producto',precio:2,cantidad:0,lotes:[]}] },
        guardarDatos: () => { throw new Error('Escritura local prohibida') }, carrito: [],
        mostrarVentas(){},mostrarCuentas(){},actualizarInicio(){},agregarAlCarrito(){},registrarVenta(){},abonarCuenta(){},mostrarCarrito(){},mostrarSeccion(){},exigirPermiso:()=>true,
        alert: m=>mensajes.push(m),confirm:()=>true,prompt:()=>'',
        MicroCarmitaInventario: {async cargar(){}},
        MicroCarmitaAuth: {async api(ruta,metodo='GET',datos){
            solicitudes.push({ruta,metodo,datos:datos&&JSON.parse(JSON.stringify(datos))});
            if(esperar)await esperar;
            if(ruta==='/sales'&&metodo==='POST'){
                intentos++;
                if(respuestaPerdida&&intentos===1)throw new Error('Respuesta perdida');
                if(rechazo&&intentos===1)throw Object.assign(new Error('Validación'),{status:400});
                return {id:1};
            }
            if(ruta==='/sales')return {ventas:[venta]};
            if(ruta==='/clientes')return {registros:[{id:1,nombre:'Cliente'}]};
            if(ruta==='/sales/1')return {...venta,detalles:[{producto_id:1,nombre:'Producto',cantidad:2,precio:2,existencia_confirmada:0,caducidad_fisica:null,asignaciones:[]}],historial:[],caja:[],abonos:[]};
            return {};
        }}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','sales-client.js'),'utf8'),contexto);
    contexto.document.getElementById('ventaTipo').value='contado';
    contexto.carrito=[{id:1,nombre:'Producto',cantidad:1,precio:2}];
    return {contexto,campos,solicitudes,eventos,mensajes,perder(){respuestaPerdida=true},rechazar(){rechazo=true},salir(){actor=null;eventos['microcarmita:sesion']()},pausar(p){esperar=p}};
}
test('ventas y cuentas consumen API sin leer ni guardar datos locales',async()=>{
    const f=preparar();await f.contexto.MicroCarmitaVentas.cargar();
    assert.match(f.campos.listaVentas.innerHTML,/Cliente/);assert.match(f.campos.listaCuentas.innerHTML,/Registrar abono/);
    assert.equal(f.contexto.obtenerDatos('ventas').length,1);assert.throws(()=>f.contexto.guardarDatos('ventas',[]),/API/);
    assert.match(f.campos.listaVentas.innerHTML,/Modificar/);assert.equal(f.campos.totalIngresos.textContent,'1');
});
test('Vendedor no ve edición ni anulación y sus métodos no llaman escrituras administrativas',async()=>{
    const f=preparar('vendedor');await f.contexto.MicroCarmitaVentas.cargar();await f.contexto.MicroCarmitaVentas.editar(1);await f.contexto.MicroCarmitaVentas.anular(1);
    assert.doesNotMatch(f.campos.listaVentas.innerHTML,/Modificar|Anular/);assert.ok(f.solicitudes.every(s=>s.metodo==='GET'));
});
test('reintento tras respuesta perdida conserva clave y evita doble envío simultáneo',async()=>{
    const f=preparar();f.perder();await f.contexto.registrarVenta();
    assert.match(f.campos.estadoVentas.textContent,/perdida/);
    await Promise.all([f.contexto.registrarVenta(),f.contexto.registrarVenta()]);
    const posts=f.solicitudes.filter(s=>s.metodo==='POST');assert.equal(posts.length,2);assert.equal(posts[0].datos.clave,posts[1].datos.clave);assert.equal(f.contexto.carrito.length,0);
});
test('rechazo HTTP controlado permite corregir datos y genera una nueva clave',async()=>{
    const f=preparar();f.rechazar();await f.contexto.registrarVenta();f.contexto.carrito[0].cantidad=2;await f.contexto.registrarVenta();
    const posts=f.solicitudes.filter(s=>s.metodo==='POST');assert.equal(posts.length,2);assert.notEqual(posts[0].datos.clave,posts[1].datos.clave);
});
test('RF-06 permite carrito con faltante solo tras confirmar existencia y caducidad',()=>{
    const f=preparar();f.contexto.carrito=[];f.contexto.confirm=()=>false;
    f.contexto.document.getElementById('ventaProducto').value='1';f.contexto.document.getElementById('ventaCantidad').value='2';f.contexto.document.getElementById('ventaPrecio').value='2';
    f.contexto.agregarAlCarrito();assert.equal(f.contexto.carrito.length,0);
    f.contexto.confirm=()=>true;f.contexto.prompt=()=>'';f.contexto.agregarAlCarrito();
    assert.equal(f.contexto.carrito[0].confirmarExistencia,true);assert.equal(f.contexto.carrito[0].caducidadFisica,null);
});
test('sesión cerrada borra caché y descarta consultas tardías',async()=>{
    const f=preparar();let resolver;f.pausar(new Promise(r=>{resolver=r}));const carga=f.contexto.MicroCarmitaVentas.cargar();
    f.salir();resolver();await carga;assert.equal(f.contexto.obtenerDatos('ventas').length,0);assert.doesNotMatch(f.campos.listaVentas.innerHTML,/Cliente/);
});
