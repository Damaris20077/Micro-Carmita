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
    let fallo = false;
    const productos = [{ id: 1, nombre: 'Leche', categoria: 'Lácteos', precio_compra: 0.8, precio_venta: 1.25,
        proveedor_id: 1, activo: true, stock: 2, stockBajo: true,
        lotes: [{ id: 1, codigo: 'L1', cantidad: 2, fecha_ingreso: '2026-11-17', caducidad: '2026-11-22', estado: 'Por caducar' }] }];
    const contexto = vm.createContext({
        document: {
            getElementById(id) {
                if (!campos[id]) campos[id] = { value: '', textContent: '', innerHTML: '', hidden: false, appendChild() {} };
                return campos[id];
            },
            createElement() { return { value: '', textContent: '' }; },
            querySelectorAll() { return adminControls; },
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
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), contexto);
    vm.runInContext(`usuarioActual = () => ({ id: 1, rol: '${rol}', activo: true });`, contexto);
    // Mantener la identidad estable como lo hace el adaptador de autenticación.
    vm.runInContext('const identidadEnsayo = usuarioActual(); usuarioActual = () => identidadEnsayo;', contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'inventory-client.js'), 'utf8'), contexto);
    return { contexto, campos, llamadas, avisos, adminControls, fallar() { fallo = true; } };
}

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
    assert.deepEqual(JSON.parse(JSON.stringify(peticion.datos)), { nombre: 'Pan', categoria: 'Panadería', precioCompra: 0.5,
        precioVenta: 1, proveedorId: 1, codigo: 'PAN1', cantidad: 4, fechaIngreso: '2026-11-17', caducidad: '2026-11-20' });
});
