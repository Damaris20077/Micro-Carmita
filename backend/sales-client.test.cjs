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

function catalogoClientes(f,{identificado=true,falloConsulta=false}={}){
    let registros=[{id:1,nombre:'Cliente',telefono:'000'}];const peticiones=[];
    f.contexto.MicroCarmitaAuth.api=async(ruta,metodo='GET',datos)=>{
        peticiones.push({ruta,metodo,datos});
        if(ruta==='/clientes'&&metodo==='POST'){
            const registro={id:8,...datos,nombre:datos.nombre.trim()};registros.push(registro);
            return identificado?{registro}:{ok:true};
        }
        if(ruta==='/clientes'){if(falloConsulta&&registros.length>1)throw new Error('Sin conexión');return {registros:structuredClone(registros)}}
        if(ruta==='/sales')return {ventas:[]};
        throw new Error('Ruta inesperada');
    };
    for(const [id,v] of Object.entries({clientesNombre:' Cliente nuevo ',clientesIdentificacion:'id-ficticio',clientesTelefono:'000-000',clientesDireccion:'Dirección ficticia'}))f.contexto.document.getElementById(id).value=v;
    return peticiones;
}

test('etiquetas de clientes ocultan ID y distinguen nombres repetidos sin cambiar clienteId enviado',async()=>{
    const f=preparar(),posts=[];
    f.contexto.MicroCarmitaAuth.api=async(r,m='GET',d)=>{
        if(m==='POST'){posts.push({r,d});return {id:20}}
        return r==='/clientes'?{registros:[{id:6,nombre:'Cliente Prueba QA'},{id:7,nombre:'carlos',telefono:'0001'},{id:9,nombre:'carlos',telefono:'0002'},{id:10,nombre:'Comercial 2026'}]}:{ventas:[]};
    };
    await f.contexto.MicroCarmitaVentas.cargar();
    assert.doesNotMatch(f.campos.listaClientes.textContent,/\b(?:6|7|9|10) —/);
    assert.match(f.campos.listaClientes.textContent,/Cliente Prueba QA/);assert.match(f.campos.listaClientes.textContent,/Comercial 2026/);
    assert.match(f.campos.ventaCliente.innerHTML,/<option value="7">carlos — Tel\.: 0001/);
    assert.match(f.campos.ventaCliente.innerHTML,/<option value="9">carlos — Tel\.: 0002/);
    f.campos.ventaCliente.value='9';f.campos.ventaTipo.value='fiado';await f.contexto.registrarVenta();
    assert.equal(posts[0].d.clienteId,9);assert.equal(posts[0].r,'/sales');
});

test('historial muestra nombre del cliente conservando número de venta y endpoint por ID',async()=>{
    const f=preparar();await f.contexto.MicroCarmitaVentas.cargar();let ruta;
    f.contexto.MicroCarmitaAuth.api=async r=>{ruta=r;return {totalAdeudado:0,abonado:0,saldo:0,ventas:[{id:41,estado:'Anulada',total:2,saldo:0,abonos:[],caja:[]}]}};
    await f.contexto.MicroCarmitaVentas.cliente(1);
    assert.equal(ruta,'/customers/1/receivables');assert.match(f.campos.historialCobros.innerHTML,/<h3>Historial del cliente: Cliente<\/h3>/);
    assert.match(f.campos.historialCobros.innerHTML,/Venta 41/);assert.doesNotMatch(f.campos.historialCobros.innerHTML,/Historial del cliente 1/);
});

test('detalle de venta muestra código de lote disponible sin modificar asignación ni número de venta',async()=>{
    const f=preparar();const respuesta={id:20,estado:'Activa',total:2,saldo:0,detalles:[{nombre:'Producto',cantidad:1,precio:2,asignaciones:[{loteId:99,cantidad:1}]}],historial:[],caja:[]};
    const antes=JSON.stringify(respuesta);f.contexto.MicroCarmitaAuth.api=async()=>respuesta;
    f.contexto.MicroCarmitaInventario.codigoLote=id=>id===99?'LOTE-QA-2026':undefined;
    await f.contexto.MicroCarmitaVentas.detalle(20);
    assert.match(f.campos.historialVentas.innerHTML,/Venta 20/);assert.match(f.campos.historialVentas.innerHTML,/Lote LOTE-QA-2026: 1/);
    assert.equal(JSON.stringify(respuesta),antes);
});

test('Nuevo cliente desplaza y enfoca el formulario único sin cambiar tipo, cantidades ni carrito',()=>{
    const f=preparar();const nombre=f.contexto.document.getElementById('clientesNombre');let scroll=false,foco=false;
    nombre.scrollIntoView=()=>{scroll=true};nombre.focus=()=>{foco=true};
    f.contexto.document.getElementById('ventaTipo').value='fiado';f.contexto.document.getElementById('ventaCantidad').value='4';
    const antes=JSON.stringify(f.contexto.carrito);f.contexto.MicroCarmitaVentas.nuevoCliente();
    assert.ok(scroll&&foco);assert.equal(JSON.stringify(f.contexto.carrito),antes);assert.equal(f.campos.ventaTipo.value,'fiado');assert.equal(f.campos.ventaCantidad.value,'4');assert.equal(f.solicitudes.length,0);
});

test('Administrador y Vendedor registran cliente una vez, actualizan listado y selectores y conservan carrito',async()=>{
    for(const rol of ['administrador','vendedor']){
        const f=preparar(rol),peticiones=catalogoClientes(f);await f.contexto.MicroCarmitaVentas.cargar();
        const antes=JSON.stringify(f.contexto.carrito);f.campos.ventaTipo.value='fiado';
        await f.contexto.MicroCarmitaVentas.registrarCliente();
        assert.equal(peticiones.filter(p=>p.metodo==='POST').length,1);
        assert.match(f.campos.listaClientes.textContent,/Cliente nuevo/);assert.match(f.campos.ventaCliente.innerHTML,/value="8"/);assert.match(f.campos.cuentasCliente.innerHTML,/Cliente nuevo/);
        assert.equal(f.campos.ventaCliente.value,'8');assert.equal(JSON.stringify(f.contexto.carrito),antes);assert.equal(f.campos.ventaTipo.value,'fiado');
        assert.equal(f.campos.clientesNombre.value,'');assert.equal(f.campos.estadoClientes.atributos['data-estado'],'exito');
    }
});

test('cliente rechazado conserva los cuatro campos y muestra el error junto al formulario',async()=>{
    const f=preparar();catalogoClientes(f);const antes=['Nombre','Identificacion','Telefono','Direccion'].map(k=>f.campos['clientes'+k].value);
    f.contexto.MicroCarmitaAuth.api=async()=>{throw Object.assign(new Error('Identificación ya registrada'),{status:409})};
    await f.contexto.MicroCarmitaVentas.registrarCliente();
    assert.deepEqual(['Nombre','Identificacion','Telefono','Direccion'].map(k=>f.campos['clientes'+k].value),antes);
    assert.match(f.campos.estadoClientes.textContent,/Identificación ya registrada/);assert.equal(f.campos.estadoClientes.atributos['data-estado'],'error');
});

test('alta de cliente bloquea doble envío simultáneo y libera controles al terminar',async()=>{
    const f=preparar(),peticiones=catalogoClientes(f);const api=f.contexto.MicroCarmitaAuth.api;let resolver;
    f.contexto.MicroCarmitaAuth.api=async(...args)=>{if(args[1]==='POST')await new Promise(r=>{resolver=r});return api(...args)};
    const alta=f.contexto.MicroCarmitaVentas.registrarCliente();await f.contexto.MicroCarmitaVentas.registrarCliente();assert.ok(f.controles.every(b=>b.disabled));
    resolver();await alta;assert.equal(peticiones.filter(p=>p.metodo==='POST').length,1);assert.ok(f.controles.every(b=>!b.disabled));
});

test('respuesta sin ID inequívoco actualiza clientes sin inferir selección por nombre',async()=>{
    const f=preparar();catalogoClientes(f,{identificado:false});await f.contexto.MicroCarmitaVentas.cargar();
    f.campos.ventaCliente.value='1';await f.contexto.MicroCarmitaVentas.registrarCliente();
    assert.equal(f.campos.ventaCliente.value,'1');assert.match(f.campos.listaClientes.textContent,/Cliente nuevo/);assert.match(f.campos.estadoClientes.textContent,/Selecciónelo/);
});

test('alta confirmada con fallo de consulta conserva ID confirmado y no sugiere repetir POST',async()=>{
    const f=preparar(),peticiones=catalogoClientes(f,{falloConsulta:true});await f.contexto.MicroCarmitaVentas.cargar();
    await f.contexto.MicroCarmitaVentas.registrarCliente();
    assert.equal(f.campos.ventaCliente.value,'8');assert.match(f.campos.listaClientes.textContent,/Cliente nuevo/);
    assert.match(f.campos.estadoClientes.textContent,/Cliente registrado.*No vuelva a registrarlo/);assert.equal(peticiones.filter(p=>p.metodo==='POST').length,1);
});

test('una consulta anterior no sustituye el cliente recién creado ni el selector',async()=>{
    const f=preparar();catalogoClientes(f);const api=f.contexto.MicroCarmitaAuth.api;let resolver,primera=true;
    f.contexto.MicroCarmitaAuth.api=(r,m,d)=>r==='/clientes'&&m===undefined&&primera?(primera=false,new Promise(res=>{resolver=res})):api(r,m,d);
    const antigua=f.contexto.MicroCarmitaVentas.cargar();await f.contexto.MicroCarmitaVentas.registrarCliente();
    resolver({registros:[{id:1,nombre:'Cliente antiguo'}]});await antigua;
    assert.match(f.campos.listaClientes.textContent,/Cliente nuevo/);assert.equal(f.campos.ventaCliente.value,'8');
});

test('logout descarta alta tardía sin modificar formulario nuevo ni restaurar clientes de otra sesión',async()=>{
    const f=preparar();catalogoClientes(f);let resolver;
    f.contexto.MicroCarmitaAuth.api=()=>new Promise(res=>{resolver=res});
    const alta=f.contexto.MicroCarmitaVentas.registrarCliente();f.salir();f.campos.clientesNombre.value='Otro borrador';
    resolver({registro:{id:8,nombre:'Cliente anterior'}});await alta;
    assert.equal(f.campos.clientesNombre.value,'Otro borrador');assert.doesNotMatch(f.campos.listaClientes.textContent,/Cliente anterior/);assert.equal(f.campos.estadoClientes.textContent,'');
});

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
