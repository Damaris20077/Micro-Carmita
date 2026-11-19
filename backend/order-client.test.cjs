const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function preparar(rol = 'administrador') {
    const campos = {};
    const peticiones = [];
    let falloRecepcion = false;
    let intentos = 0;
    const actor = { id: 1, rol };
    const callbacks = {};
    const controles=[{disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}}];
    const pedido = { id: 1, estado: 'Pendiente', proveedor: 'Proveedor',
        detalles: [{ id: 10, producto: 'Leche', cantidad: 5, recibida: 0, precio_compra: 0.8 }], recepciones: [] };
    const contexto = vm.createContext({
        document: {
            getElementById(id) { return campos[id] ??= { value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, attrs:{},setAttribute(k,v){this.attrs[k]=v} }; },
            querySelectorAll() { return controles; },
            addEventListener(nombre, fn) { callbacks[nombre] = fn; }
        },
        crypto: { randomUUID }, Intl, Date,
        permisosPorRol: { administrador: [], vendedor: [] },
        usuarioActual: () => actor,
        textoSeguro: v => String(v).replace(/</g, '&lt;'),
        dinero: v => String(v),
        prompt: () => 'Motivo de ensayo',
        MicroCarmitaInventario: { async cargar() {} },
        MicroCarmitaAuth: { async api(ruta, metodo, datos) {
            peticiones.push({ ruta, metodo, datos: datos && JSON.parse(JSON.stringify(datos)) });
            if (ruta.endsWith('/receipts')) {
                intentos += 1;
                if (falloRecepcion && intentos === 1) throw new Error('Respuesta perdida');
                return { id: 1 };
            }
            if (ruta === '/orders') return metodo === 'POST' ? { id: 1 } : { pedidos: [pedido] };
            if (ruta === '/orders/1') return pedido;
            if (ruta === '/proveedores') return { registros: [{ id: 1, nombre: 'Proveedor' }] };
            if (ruta === '/inventory') return { productos: [{ id: 1, nombre: 'Leche', activo: true }] };
            return {};
        } }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'date-formatter.js'), 'utf8'), contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'orders-client.js'), 'utf8'), contexto);
    return { contexto, campos, peticiones, callbacks, controles, perderRespuesta() { falloRecepcion = true; } };
}

test('lista de pedidos descarta una consulta anterior de la misma sesión',async()=>{
    const f=preparar(),resolver=[],api=f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api=(r,...a)=>r==='/orders'?new Promise(res=>resolver.push(res)):api(r,...a);
    const vieja=f.contexto.MicroCarmitaPedidos.cargar(),nueva=f.contexto.MicroCarmitaPedidos.cargar();
    resolver[1]({pedidos:[{id:2,proveedor:'Actual',estado:'Pendiente'}]});await nueva;
    resolver[0]({pedidos:[{id:1,proveedor:'Antiguo',estado:'Pendiente'}]});await vieja;
    assert.match(f.campos.listaPedidos.innerHTML,/Actual/);assert.doesNotMatch(f.campos.listaPedidos.innerHTML,/Antiguo/);
});

test('seleccionar otro pedido retira el detalle anterior incluso si falla su lectura', async () => {
    const f=preparar();await f.contexto.MicroCarmitaPedidos.consultar(1);
    assert.equal(f.campos.detallePedido.attrs['data-seleccionado'],'true');
    assert.match(f.campos.recepcionDetalles.innerHTML,/Leche/);
    f.contexto.MicroCarmitaAuth.api=async()=>{throw new Error('Sin conexión')};
    await f.contexto.MicroCarmitaPedidos.consultar(3);
    assert.equal(f.campos.detallePedido.attrs['data-seleccionado'],'false');
    assert.equal(f.campos.recepcionDetalles.innerHTML,'');assert.equal(f.campos.historialRecepciones.textContent,'');
    assert.equal(f.campos.detallePedidoTitulo.textContent,'Seleccione un pedido');
    assert.equal(f.campos.recibirPedidoBoton.disabled,true);
    assert.equal(f.campos.estadoPedidos.attrs['data-estado'],'error');
});

test('lista de pedidos y borrador vacíos ofrecen orientación sin filas ficticias', async () => {
    const f=preparar();const api=f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api=(r,...args)=>r==='/orders'?Promise.resolve({pedidos:[]}):api(r,...args);
    await f.contexto.MicroCarmitaPedidos.cargar();
    assert.match(f.campos.listaPedidos.innerHTML,/No hay pedidos registrados/);
    f.contexto.usuarioActual=()=>null;f.callbacks['microcarmita:sesion']();
    assert.match(f.campos.pedidoDetalles.innerHTML,/Agregue los productos/);
    assert.equal(f.campos.detallePedido.attrs['data-seleccionado'],'false');
});

test('creación pendiente deshabilita acciones y evita un segundo pedido simultáneo', async () => {
    const f=preparar();let resolver,posts=0;const api=f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api=async(r,m,d)=>{
        if(r==='/orders'&&m==='POST'){posts++;await new Promise(res=>{resolver=res})}return api(r,m,d);
    };
    const creacion=f.contexto.MicroCarmitaPedidos.crear();
    assert.ok(f.controles[0].disabled);assert.equal(f.controles[0].attrs['aria-busy'],'true');
    await f.contexto.MicroCarmitaPedidos.crear();assert.equal(posts,1);
    resolver();await creacion;
    assert.equal(f.controles[0].disabled,false);assert.equal(f.controles[0].attrs['aria-busy'],undefined);
});

test('estados de pedidos conservan texto y cancelar permanece exclusivo del Administrador', async () => {
    for(const rol of ['administrador','vendedor']){
        const f=preparar(rol),api=f.contexto.MicroCarmitaAuth.api;
        f.contexto.MicroCarmitaAuth.api=(r,...a)=>r==='/orders'?Promise.resolve({pedidos:['Pendiente','Recibido parcialmente','Recibido completo','Cancelado'].map((estado,i)=>({id:i+1,proveedor:'<QA>',estado}))}):api(r,...a);
        await f.contexto.MicroCarmitaPedidos.cargar();const h=f.campos.listaPedidos.innerHTML;
        assert.match(h,/estado-pendiente">Pendiente/);assert.match(h,/estado-disponible">Recibido completo/);
        assert.match(h,/estado-agotado">Cancelado/);assert.match(h,/&lt;QA>/);assert.doesNotMatch(h,/<QA>/);
        assert.equal((h.match(/MicroCarmitaPedidos.cancelar/g)||[]).length,rol==='administrador'?2:0);
    }
});

test('error de lista recibido después de logout no recupera un mensaje de la sesión anterior', async () => {
    const f=preparar();let rechazar;
    f.contexto.MicroCarmitaAuth.api=()=>new Promise((r,j)=>{rechazar=j});
    const carga=f.contexto.MicroCarmitaPedidos.cargar();
    f.contexto.usuarioActual=()=>null;f.callbacks['microcarmita:sesion']();
    rechazar(new Error('Error anterior'));await carga;
    assert.equal(f.campos.estadoPedidos.textContent,'');
});

test('pantalla pedidos consulta la API y oculta la creación al Vendedor', async () => {
    const f = preparar('vendedor');
    await f.contexto.MicroCarmitaPedidos.cargar();
    assert.equal(f.campos.crearPedidoFormulario.hidden, true);
    assert.doesNotMatch(f.campos.listaPedidos.innerHTML, /Cancelar/);
    assert.ok(f.contexto.permisosPorRol.vendedor.includes('pedidos'));
    await f.contexto.MicroCarmitaPedidos.consultar(1);
    assert.match(f.campos.recepcionDetalles.innerHTML, /Leche/);
    assert.equal(f.campos.recibirPedidoBoton.disabled, false);
});

test('pantalla crea un pedido con detalle y datos exclusivos de la API', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaPedidos.cargar();
    for (const [id, value] of Object.entries({ pedidoProveedor: '1', pedidoProducto: '1', pedidoCantidad: '5', pedidoPrecio: '0.8', pedidoObservaciones: 'Pedido de ensayo' })) {
        f.contexto.document.getElementById(id).value = value;
    }
    f.contexto.MicroCarmitaPedidos.agregar();
    await f.contexto.MicroCarmitaPedidos.crear();
    const p = f.peticiones.find(r => r.ruta === '/orders' && r.metodo === 'POST');
    assert.deepEqual(p.datos, { proveedorId: 1, observaciones: 'Pedido de ensayo', detalles: [{ productoId: 1, cantidad: 5, precioCompra: 0.8 }] });
});

test('recepción conserva la misma clave al reintentar una respuesta perdida', async () => {
    const f = preparar('vendedor');
    await f.contexto.MicroCarmitaPedidos.consultar(1);
    for (const [id, value] of Object.entries({ recCantidad10: '2', recCodigo10: 'L1', recFecha10: '2026-11-17', recCaducidad10: '', recPrecio10: '0.8' })) {
        f.contexto.document.getElementById(id).value = value;
    }
    f.perderRespuesta();
    await f.contexto.MicroCarmitaPedidos.recibir();
    await f.contexto.MicroCarmitaPedidos.recibir();
    const envios = f.peticiones.filter(r => r.ruta.endsWith('/receipts'));
    assert.equal(envios.length, 2);
    assert.equal(envios[0].datos.clave, envios[1].datos.clave);
    assert.deepEqual(envios[0].datos.lineas, envios[1].datos.lineas);
});

test('Ver y recibir transmite el id 3 y lleva el detalle cargado a la vista sin registrar recepciones', async () => {
    const f = preparar();
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const panel = f.contexto.document.getElementById('detallePedido');
    let desplazamientos = 0, focos = 0;
    panel.scrollIntoView = () => { desplazamientos++; };
    panel.focus = () => { focos++; };
    const pedido = { id: 3, estado: 'Pendiente', proveedor: 'Ficticio', observaciones: 'Ensayo aislado',
        detalles: [{ id: 30, producto: 'Producto ficticio', cantidad: 5, recibida: 0, precio_compra: 1 }], recepciones: [] };
    f.contexto.MicroCarmitaAuth.api = async (ruta, metodo = 'GET') => {
        f.peticiones.push({ ruta, metodo });
        if (ruta === '/orders') return { pedidos: [pedido] };
        if (ruta === '/orders/3') return pedido;
        if (ruta === '/proveedores') return { registros: [] };
        if (ruta === '/inventory') return { productos: [] };
        assert.fail('Petición inesperada');
    };
    await f.contexto.MicroCarmitaPedidos.cargar();
    const handler = /onclick="([^"]+)">Ver y recibir/.exec(f.campos.listaPedidos.innerHTML)[1];
    assert.equal(handler, 'MicroCarmitaPedidos.consultar(3)');
    await vm.runInContext(handler, f.contexto);
    assert.match(f.campos.detallePedidoTitulo.textContent, /Pedido 3/);
    assert.match(f.campos.recepcionDetalles.innerHTML, /Producto ficticio/);
    assert.equal(f.campos.recibirPedidoBoton.disabled, false);
    assert.equal(desplazamientos, 1, 'El detalle debe llevarse a la vista tras cargar');
    assert.equal(focos, 1);
    assert.match(html, /id="detallePedido"[^>]*tabindex="-1"/);
    assert.ok(f.peticiones.every(p => p.metodo === 'GET'));
});

test('selección más reciente descarta detalle y errores obsoletos', async () => {
    const f = preparar();
    const pendientes = [];
    f.contexto.MicroCarmitaAuth.api = () => new Promise((resolve, reject) => pendientes.push({ resolve, reject }));
    const anterior = f.contexto.MicroCarmitaPedidos.consultar(1);
    const nueva = f.contexto.MicroCarmitaPedidos.consultar(3);
    pendientes[1].resolve({ id: 3, estado: 'Pendiente', detalles: [], recepciones: [] });
    await nueva;
    pendientes[0].resolve({ id: 1, estado: 'Cancelado', detalles: [], recepciones: [] });
    await anterior;
    assert.match(f.campos.detallePedidoTitulo.textContent, /Pedido 3/);
    assert.equal(f.campos.recibirPedidoBoton.disabled, false);
    const errorAnterior = f.contexto.MicroCarmitaPedidos.consultar(1);
    const ultima = f.contexto.MicroCarmitaPedidos.consultar(3);
    pendientes[3].resolve({ id: 3, estado: 'Pendiente', detalles: [], recepciones: [] });
    await ultima;
    pendientes[2].reject(new Error('Respuesta antigua'));
    await errorAnterior;
    assert.equal(f.campos.estadoPedidos.textContent, 'Pedido 3 cargado.');
});

test('fallo de HTTP se comunica y mantiene recepción deshabilitada', async () => {
    const f = preparar();
    f.contexto.MicroCarmitaAuth.api = async () => { throw Object.assign(new Error('Sin autorización'), { status: 403 }); };
    await f.contexto.MicroCarmitaPedidos.consultar(3);
    assert.match(f.campos.estadoPedidos.textContent, /No se pudo cargar el pedido 3: Sin autorización/);
    assert.equal(f.campos.recibirPedidoBoton.disabled, true);
});

test('cerrar sesión descarta detalle pendiente sin volver a habilitar recepción', async () => {
    const f = preparar();
    let resolver;
    f.contexto.MicroCarmitaAuth.api = () => new Promise(r => { resolver = r; });
    const consulta = f.contexto.MicroCarmitaPedidos.consultar(3);
    f.contexto.usuarioActual = () => null;
    f.callbacks['microcarmita:sesion']();
    resolver({ id: 3, estado: 'Pendiente', detalles: [], recepciones: [] });
    await consulta;
    assert.equal(f.campos.detallePedidoTitulo.textContent, 'Seleccione un pedido');
    assert.equal(f.campos.recibirPedidoBoton.disabled, true);
});

test('recepción vacía no envía POST y explica junto al botón qué cantidad falta', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaPedidos.consultar(1);
    f.contexto.document.getElementById('recCantidad10').value = '0';
    await f.contexto.MicroCarmitaPedidos.recibir();
    assert.equal(f.peticiones.filter(p => p.ruta.endsWith('/receipts')).length, 0);
    assert.match(f.contexto.document.getElementById('estadoRecepcion').textContent, /cantidad mayor a cero/i);
});

test('rechazo HTTP de recepción es visible junto al botón y permite corregir o reintentar', async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaPedidos.consultar(1);
    for (const [id, value] of Object.entries({ recCantidad10: '2', recCodigo10: 'L1', recFecha10: '2026-11-17', recCaducidad10: '', recPrecio10: '0.8' })) f.contexto.document.getElementById(id).value = value;
    const api = f.contexto.MicroCarmitaAuth.api;
    f.contexto.MicroCarmitaAuth.api = (...args) => args[0].endsWith('/receipts')
        ? Promise.reject(Object.assign(new Error('Código de lote o recepción duplicado.'), { status: 409 })) : api(...args);
    await f.contexto.MicroCarmitaPedidos.recibir();
    assert.match(f.contexto.document.getElementById('estadoRecepcion').textContent, /Código de lote o recepción duplicado/);
    assert.equal(f.campos.recibirPedidoBoton.disabled, false);
});

for (const [campo, valor, mensaje] of [
    ['recCantidad10', '6', /cantidad entera entre 1 y 5/],
    ['recCantidad10', '-1', /cantidad entera/],
    ['recCantidad10', '1.5', /cantidad entera/],
    ['recCodigo10', 'x'.repeat(61), /código de lote/],
    ['recFecha10', '', /fecha de ingreso/],
    ['recFecha10', '2026-02-30', /fecha de ingreso/],
    ['recCaducidad10', '2026-02-30', /fecha de caducidad/],
    ['recPrecio10', '', /precio de compra/],
    ['recPrecio10', '-1', /precio de compra/],
    ['recPrecio10', '1.234', /precio de compra/]
]) test(`recepción inválida ${campo}=${JSON.stringify(valor)} se explica sin enviar POST`, async () => {
    const f = preparar();
    await f.contexto.MicroCarmitaPedidos.consultar(1);
    for (const [id, value] of Object.entries({ recCantidad10: '2', recCodigo10: 'L1', recFecha10: '2026-11-17', recCaducidad10: '', recPrecio10: '0.8' })) f.contexto.document.getElementById(id).value = value;
    f.campos[campo].value = valor;
    await f.contexto.MicroCarmitaPedidos.recibir();
    assert.equal(f.peticiones.filter(p => p.ruta.endsWith('/receipts')).length, 0);
    assert.match(f.campos.estadoRecepcion.textContent, mensaje);
});

test('recepción válida muestra progreso y éxito, sin permitir doble envío simultáneo', async () => {
    const f = preparar('vendedor');
    await f.contexto.MicroCarmitaPedidos.consultar(1);
    for (const [id, value] of Object.entries({ recCantidad10: '2', recCodigo10: 'L1', recFecha10: '2026-11-17', recCaducidad10: '', recPrecio10: '0' })) f.contexto.document.getElementById(id).value = value;
    const api = f.contexto.MicroCarmitaAuth.api;
    let resolver, posts = 0;
    f.contexto.MicroCarmitaAuth.api = (...args) => {
        if (args[0].endsWith('/receipts')) { posts++; return new Promise(r => { resolver = r; }); }
        return api(...args);
    };
    const primera = f.contexto.MicroCarmitaPedidos.recibir();
    assert.equal(f.campos.recibirPedidoBoton.disabled, true);
    assert.equal(f.campos.estadoRecepcion.textContent, 'Registrando recepción…');
    await f.contexto.MicroCarmitaPedidos.recibir();
    assert.equal(posts, 1);
    resolver({ id: 1 }); await primera;
    assert.match(f.campos.estadoRecepcion.textContent, /Recepción registrada para el pedido 1/);
    assert.equal(f.campos.recibirPedidoBoton.disabled, false);
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="recibirPedidoBoton"[^>]*onclick="MicroCarmitaPedidos.recibir\(\)"/);
    assert.match(html, /id="estadoRecepcion"[^>]*aria-live="polite"/);
});

test('recepción permite código vacío y conserva calendario ISO al enviar', async () => {
    const f = preparar(); await f.contexto.MicroCarmitaPedidos.consultar(1);
    for (const [id, value] of Object.entries({ recCantidad10: '2', recCodigo10: '', recFecha10: '2026-11-17', recCaducidad10: '2026-11-22', recPrecio10: '0.8' })) f.contexto.document.getElementById(id).value = value;
    await f.contexto.MicroCarmitaPedidos.recibir();
    const post = f.peticiones.find(p => p.ruta.endsWith('/receipts'));
    assert.equal(post.datos.lineas[0].codigo, '');
    assert.equal(post.datos.lineas[0].fechaIngreso, '2026-11-17');
    assert.equal(post.datos.lineas[0].caducidad, '2026-11-22');
});
