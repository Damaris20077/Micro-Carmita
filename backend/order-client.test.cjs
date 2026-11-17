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
    const pedido = { id: 1, estado: 'Pendiente', proveedor: 'Proveedor',
        detalles: [{ id: 10, producto: 'Leche', cantidad: 5, recibida: 0, precio_compra: 0.8 }], recepciones: [] };
    const contexto = vm.createContext({
        document: {
            getElementById(id) { return campos[id] ??= { value: '', textContent: '', innerHTML: '', hidden: false, disabled: false }; },
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
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'orders-client.js'), 'utf8'), contexto);
    return { contexto, campos, peticiones, callbacks, perderRespuesta() { falloRecepcion = true; } };
}

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
