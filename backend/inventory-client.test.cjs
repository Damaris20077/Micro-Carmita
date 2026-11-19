const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function preparar(rol = 'administrador') {
    const campos = {};
    const llamadas = [];
    const avisos = [];
    const adminControls = [{ hidden: false }];
    const controles = [{ disabled:false, attrs:{}, setAttribute(k,v){this.attrs[k]=v}, removeAttribute(k){delete this.attrs[k]} }];
    let fallo = false;
    const productos = [{ id: 1, nombre: 'Leche', categoria: 'Lácteos', precio_compra: 0.8, precio_venta: 1.25,
        proveedor_id: 1, activo: true, stock: 2, stockBajo: true,
        lotes: [{ id: 1, codigo: 'L1', cantidad: 2, fecha_ingreso: '2026-11-17', caducidad: '2026-11-22', estado: 'Por caducar' }] }];
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
        MicroCarmitaAuth: {
            async api(ruta, metodo, datos) {
                llamadas.push({ ruta, metodo, datos });
                if (fallo) throw new Error('Inventario no disponible');
                if (ruta === '/inventory') return { productos: structuredClone(productos) };
                if (ruta === '/proveedores') return { registros: [{ id: 1, nombre: 'Proveedor' }] };
                if (ruta === '/clientes') return { registros: [{ id: 1, nombre: 'Cliente' }] };
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
