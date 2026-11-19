const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function preparar(rol = 'administrador') {
    const campos = {}, solicitudes = [], eventos = {}, mensajes = [];
    const nodo = () => ({ value:'', innerHTML:'', textContent:'', readOnly:true, disabled:false, atributos:{},
        setAttribute(k,v) { this.atributos[k]=v; }, removeAttribute(k) { delete this.atributos[k]; } });
    const controles = Array.from({ length:4 }, nodo);
    let actor = { id: 1,rol }, intentos = 0, respuestaPerdida = false, rechazo = false;
    let esperar;
    const venta = { id: 1,tipo:'fiado',cliente_id:1,cliente:'Cliente',total:4,abonado:1,saldo:3,revision:1,version:1,estado:'Activa',creado_en:'2026-11-17',efectivo:1 };
    const contexto = vm.createContext({
        crypto: { randomUUID },
        document: { getElementById(id) { return campos[id] ??= nodo(); }, querySelectorAll: () => controles, addEventListener(n,fn) { eventos[n]=fn; } },
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
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'date-formatter.js'), 'utf8'), contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','sales-client.js'),'utf8'),contexto);
    contexto.document.getElementById('ventaTipo').value='contado';
    contexto.carrito=[{id:1,nombre:'Producto',cantidad:1,precio:2}];
    return {contexto,campos,controles,solicitudes,eventos,mensajes,perder(){respuestaPerdida=true},rechazar(){rechazo=true},salir(){actor=null;eventos['microcarmita:sesion']()},pausar(p){esperar=p}};
}

test('ventas comunica carga, consulta terminada y vacío real sin inventar registros', async () => {
    const f = preparar(); let resolver;
    f.contexto.MicroCarmitaAuth.api = ruta => ruta === '/sales'
        ? new Promise(r => { resolver = r; }) : Promise.resolve({ registros: [] });
    const carga = f.contexto.MicroCarmitaVentas.cargar();
    assert.equal(f.campos.estadoVentas.atributos['data-estado'], 'cargando');
    resolver({ ventas: [] }); await carga;
    assert.match(f.campos.listaVentas.innerHTML, /No hay ventas registradas/);
    assert.equal(f.campos.estadoVentas.atributos['data-estado'], 'neutro');
    assert.match(f.campos.estadoVentas.textContent, /actualizados/);
});

test('registro bloquea controles visibles durante el envío, evita doble POST y comunica éxito', async () => {
    const f = preparar(); let resolver;
    const api = f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api = async (...args) => {
        if (args[1] === 'POST') await new Promise(r => { resolver = r; });
        return api(...args);
    };
    const registro = f.contexto.registrarVenta();
    assert.ok(f.controles.every(b => b.disabled && b.atributos['aria-busy'] === 'true'));
    await f.contexto.registrarVenta();
    resolver(); await registro;
    assert.equal(f.solicitudes.filter(s => s.metodo === 'POST').length, 1);
    assert.equal(f.contexto.carrito.length, 0);
    assert.ok(f.controles.every(b => !b.disabled && !b.atributos['aria-busy']));
    assert.equal(f.campos.estadoVentas.atributos['data-estado'], 'exito');
    assert.equal(f.campos.estadoVentas.textContent, 'Venta registrada correctamente.');
});

test('validación fallida mantiene carrito, muestra error próximo a la acción y libera controles', async () => {
    const f = preparar(); f.rechazar();
    let visible = false;
    f.contexto.document.getElementById('estadoVentas').scrollIntoView = () => { visible = true; };
    await f.contexto.registrarVenta();
    assert.equal(f.campos.estadoVentas.atributos['data-estado'], 'error');
    assert.match(f.campos.estadoVentas.textContent, /Validación/);
    assert.ok(visible);
    assert.equal(f.contexto.carrito.length, 1);
    assert.ok(f.controles.every(b => !b.disabled));
});

test('venta confirmada con refresco fallido informa que fue guardada sin invitar a duplicarla', async () => {
    const f = preparar(); const api = f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api = async (ruta, metodo = 'GET', datos) => {
        if (metodo === 'GET') throw new Error('Sin conexión');
        return api(ruta, metodo, datos);
    };
    await f.contexto.registrarVenta();
    assert.match(f.campos.estadoVentas.textContent, /fue guardada/);
    assert.match(f.campos.estadoVentas.textContent, /No vuelva a registrarla/);
    assert.match(f.campos.estadoVentas.textContent, /Actualizar ventas y cuentas/);
    assert.equal(f.contexto.carrito.length, 0);
    assert.equal(f.solicitudes.filter(s => s.metodo === 'POST').length, 1);
    assert.equal(f.campos.estadoVentas.atributos['data-estado'], 'error');
});

test('historial diferencia tipo y estado con etiquetas de texto conservando anuladas y permisos', async () => {
    for (const rol of ['administrador', 'vendedor']) {
        const f = preparar(rol);
        f.contexto.MicroCarmitaAuth.api = async ruta => ruta === '/sales' ? { ventas: [
            { id:1, cliente:'<Cliente>', tipo:'contado', estado:'Activa', total:4 },
            { id:2, tipo:'fiado', estado:'Anulada', total:8 }
        ] } : { registros:[] };
        await f.contexto.MicroCarmitaVentas.cargar();
        const html = f.campos.listaVentas.innerHTML;
        assert.match(html, /venta-tipo--contado">contado/);
        assert.match(html, /venta-tipo--fiado">fiado/);
        assert.match(html, /estado-disponible">Activa/);
        assert.match(html, /estado-agotado">Anulada/);
        assert.match(html, /&lt;Cliente>/);
        assert.doesNotMatch(html, /<Cliente>/);
        assert.equal((html.match(/MicroCarmitaVentas.detalle/g) || []).length, 2);
        assert.equal((html.match(/MicroCarmitaVentas.anular/g) || []).length, rol === 'administrador' ? 1 : 0);
        assert.equal((html.match(/MicroCarmitaVentas.editar/g) || []).length, rol === 'administrador' ? 1 : 0);
    }
});

test('detalle termina el estado de carga y logout elimina mensajes y bloquea controles', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaVentas.detalle(1);
    assert.notEqual(f.campos.estadoVentas.atributos['data-estado'], 'cargando');
    assert.ok(f.controles.every(b => !b.disabled));
    f.salir();
    assert.equal(f.campos.estadoVentas.textContent, '');
    assert.ok(f.controles.every(b => b.disabled));
});

test('respuesta antigua no sustituye mensaje de error de la consulta vigente', async () => {
    const f = preparar(), resolver = [], rechazar = [];
    f.contexto.MicroCarmitaAuth.api = ruta => ruta === '/sales'
        ? new Promise((r,j) => { resolver.push(r); rechazar.push(j); }) : Promise.resolve({ registros: [] });
    const vieja = f.contexto.MicroCarmitaVentas.cargar(), actual = f.contexto.MicroCarmitaVentas.cargar();
    rechazar[1](new Error('Red no disponible')); await actual;
    const mensaje = f.campos.estadoVentas.textContent;
    resolver[0]({ ventas: [] }); await vieja;
    assert.equal(f.campos.estadoVentas.textContent, mensaje);
    assert.equal(f.campos.estadoVentas.atributos['data-estado'], 'error');
});

test('consulta antigua no sobrescribe ventas de una consulta posterior de la misma sesión', async () => {
    const f = preparar();
    const resolver = [];
    f.contexto.MicroCarmitaAuth.api = ruta => ruta === '/sales'
        ? new Promise(r => resolver.push(r)) : Promise.resolve({ registros: [] });
    const antigua = f.contexto.MicroCarmitaVentas.cargar();
    const nueva = f.contexto.MicroCarmitaVentas.cargar();
    resolver[1]({ ventas: [{ id: 2, estado: 'Activa', tipo: 'contado', total: 20 }] });
    await nueva;
    resolver[0]({ ventas: [{ id: 1, estado: 'Activa', tipo: 'contado', total: 10 }] });
    await antigua;
    assert.equal(f.contexto.obtenerDatos('ventas')[0].id, 2);
});
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

test('pendientes excluye fiados anulados y pagados sin quitarlos del historial de ventas', async () => {
    const f = preparar();
    const filas = [
        { id: 1, cliente: 'Pendiente', cliente_id: 1, tipo: 'fiado', estado: 'Activa', total: 4, abonado: 1, saldo: 3 },
        { id: 2, cliente: 'Anulada', cliente_id: 2, tipo: 'fiado', estado: 'Anulada', total: 8, abonado: 0, saldo: 0 },
        { id: 3, cliente: 'Pagada', cliente_id: 3, tipo: 'fiado', estado: 'Activa', total: 6, abonado: 6, saldo: 0 }
    ];
    f.contexto.MicroCarmitaAuth.api = async ruta => ruta === '/sales' ? { ventas: filas } : { registros: [] };
    await f.contexto.MicroCarmitaVentas.cargar();
    assert.match(f.campos.listaCuentas.innerHTML, /Pendiente/);
    assert.doesNotMatch(f.campos.listaCuentas.innerHTML, /Anulada|Pagada/);
    assert.match(f.campos.listaVentas.innerHTML, /Anulada/);
    assert.equal(f.campos.saldoPendiente.textContent, '3');
});

test('detalle de venta presenta tablas, trazabilidad y texto escapado en la propia pantalla', async () => {
    const f = preparar();
    f.contexto.MicroCarmitaAuth.api = async () => ({ id: 1, estado: 'Anulada', total: 4, saldo: 0,
        detalles: [{ nombre: '<Producto>', cantidad: 2, precio: 2, asignaciones: [{ loteId: 7, cantidad: 2 }], sin_existencia: 0 }],
        historial: [{ creado_en: '2026-11-17T15:00:00Z', responsable: '<Operador>', accion: 'anular', motivo: '<Motivo>' }],
        caja: [{ creado_en: '2026-11-17T15:00:00Z', tipo: 'reembolso', importe: -4 }] });
    await f.contexto.MicroCarmitaVentas.detalle(1);
    const html = f.campos.historialVentas.innerHTML;
    assert.match(html, /<table>/);
    assert.match(html, /Venta 1 · Anulada/);
    assert.match(html, /&lt;Producto>/);
    assert.match(html, /Lote 7: 2/);
    assert.match(html, /Historial de cambios/);
    assert.match(html, /reembolso/);
    assert.doesNotMatch(html, /<Motivo>|<Operador>|<Producto>/);
    assert.equal(f.campos.historialVentas.hidden, false);
    f.salir();
    assert.equal(f.campos.historialVentas.innerHTML, '');
    assert.equal(f.campos.historialVentas.hidden, true);
});

test('historial del cliente conserva ventas anuladas, pagos y devoluciones en tablas', async () => {
    const f = preparar();
    f.contexto.MicroCarmitaAuth.api = async () => ({ totalAdeudado: 0, abonado: 0, saldo: 0, ventas: [
        { id: 2, estado: 'Anulada', total: 8, saldo: 0, abonos: [{ creado_en: '2026-11-17T15:00:00Z', responsable: '<Nombre>', importe: 2 }],
            caja: [{ creado_en: '2026-11-17T15:00:00Z', importe: -2 }] }
    ] });
    await f.contexto.MicroCarmitaVentas.cliente(2);
    assert.match(f.campos.historialCobros.innerHTML, /Venta 2 · Anulada/);
    assert.match(f.campos.historialCobros.innerHTML, /Devolución/);
    assert.match(f.campos.historialCobros.innerHTML, /&lt;Nombre>/);
    assert.match(f.campos.historialCobros.innerHTML, /<table>/);
});

test('ventas y fiados muestran la misma fecha ecuatoriana conservando datos UTC del API', async () => {
    const f = preparar();
    const venta = { id: 1, tipo: 'fiado', cliente_id: 1, cliente: 'Cliente', estado: 'Activa', total: 4, abonado: 0, saldo: 4, creado_en: '2026-11-18T04:59:00Z' };
    f.contexto.MicroCarmitaAuth.api = async ruta => ruta === '/sales' ? { ventas: [venta] } : { registros: [] };
    await f.contexto.MicroCarmitaVentas.cargar();
    assert.match(f.campos.listaVentas.innerHTML, /17.*nov.*2026.*23:59/);
    assert.match(f.campos.listaCuentas.innerHTML, /17.*nov.*2026.*23:59/);
    assert.equal(f.contexto.obtenerDatos('ventas')[0].creado_en, '2026-11-18T04:59:00Z');
});
