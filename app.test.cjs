const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function prepararEscenario({
    tipo = 'contado', cuentas = [], abono = '', rol = 'vendedor',
    activo = true, conSesion = true
} = {}) {
    const almacenamiento = new Map(Object.entries({
        inventario: JSON.stringify([
            { id: 101, nombre: 'Leche de prueba', categoria: 'Lácteos', precio: 1.25, cantidad: 10 }
        ]),
        ventas: '[]', movimientos: '[]', cuentas: JSON.stringify(cuentas),
        'micro-carmita-usuarios': JSON.stringify([
            { id: 'vendedor-prueba', nombre: 'Usuario de prueba', usuario: 'prueba', clave: 'clave123', rol, activo }
        ]),
        'micro-carmita-sesion': JSON.stringify({ id: 'vendedor-prueba' })
    }));
    if (!conSesion) almacenamiento.delete('micro-carmita-sesion');
    const clasesLogin = new Set();
    const menus = ['inicio', 'ventas', 'inventario', 'movimientos', 'reportes', 'usuarios'].map(permiso => ({
        dataset: { permiso }, hidden: false
    }));
    const campos = {
        loginUsuario: { value: 'prueba' },
        loginClave: { value: 'clave123' },
        errorLogin: { textContent: '' },
        pantallaLogin: {
            classList: {
                toggle(clase, habilitada) {
                    if (habilitada) clasesLogin.add(clase);
                    else clasesLogin.delete(clase);
                }
            }
        },
        nombreSesion: { textContent: '' },
        rolSesion: { textContent: '' },
        formularioProducto: { hidden: false },
        productoNombre: { value: 'Pan de prueba' },
        productoCategoria: { value: 'Panadería' },
        productoPrecio: { value: '0.50' },
        productoCantidad: { value: '8' },
        ventaCliente: { value: 'Cliente de prueba' },
        ventaTipo: { value: tipo },
        ventaProducto: { value: '101', innerHTML: '', appendChild() {} },
        ventaCantidad: { value: '3' },
        ventaPrecio: { value: '1.25' }
    };
    const avisos = [];
    const contexto = vm.createContext({
        localStorage: {
            getItem(clave) { return almacenamiento.get(clave) ?? null; },
            setItem(clave, valor) { almacenamiento.set(clave, String(valor)); },
            removeItem(clave) { almacenamiento.delete(clave); }
        },
        document: {
            getElementById(id) { return campos[id] ?? null; },
            createElement() { return { value: '', textContent: '' }; },
            querySelectorAll(selector) {
                assert.equal(selector, '.menu[data-permiso]');
                return menus;
            },
            querySelector(selector) {
                assert.equal(selector, '.seccion.activa-seccion');
                return null;
            },
            addEventListener() {}
        },
        alert(mensaje) { avisos.push(mensaje); },
        prompt() { return abono; }
    });
    const archivoApp = path.join(__dirname, 'app.js');
    vm.runInContext(fs.readFileSync(archivoApp, 'utf8'), contexto, { filename: archivoApp });
    return { almacenamiento, contexto, avisos, campos, clasesLogin, menus };
}

function cuentaDePrueba() {
    return {
        id: 201, cliente: 'Cliente de prueba', producto: 'Leche de prueba',
        total: 10, abonado: 2, saldo: 8, fecha: '01/11/2026',
        estado: 'Pendiente', abonos: [{ valor: 2, fecha: '01/11/2026' }]
    };
}

test('app.js registra una venta al contado, descuenta inventario y genera un único ingreso', () => {
    const producto = {
        id: 101, nombre: 'Leche de prueba', categoria: 'Lácteos',
        precio: 1.25, cantidad: 10
    };
    const almacenamiento = new Map(Object.entries({
        inventario: JSON.stringify([producto]),
        ventas: '[]',
        movimientos: '[]',
        cuentas: '[]',
        'micro-carmita-usuarios': JSON.stringify([
            { id: 'vendedor-prueba', nombre: 'Vendedor de prueba', rol: 'vendedor', activo: true }
        ]),
        'micro-carmita-sesion': JSON.stringify({ id: 'vendedor-prueba' })
    }));
    const campos = {
        ventaCliente: { value: 'Cliente de prueba' },
        ventaTipo: { value: 'contado' },
        ventaProducto: { value: '101', innerHTML: '', appendChild() {} },
        ventaCantidad: { value: '3' },
        ventaPrecio: { value: '1.25' }
    };
    const avisos = [];
    const contexto = vm.createContext({
        localStorage: {
            getItem(clave) { return almacenamiento.get(clave) ?? null; },
            setItem(clave, valor) { almacenamiento.set(clave, String(valor)); }
        },
        document: {
            getElementById(id) { return campos[id] ?? null; },
            createElement() { return { value: '', textContent: '' }; },
            // La sesión está preparada. El arranque de la pantalla queda fuera de este caso.
            addEventListener() {}
        },
        alert(mensaje) { avisos.push(mensaje); }
    });
    const archivoApp = path.join(__dirname, 'app.js');
    vm.runInContext(fs.readFileSync(archivoApp, 'utf8'), contexto, { filename: archivoApp });

    vm.runInContext('agregarAlCarrito(); registrarVenta();', contexto);

    const ventas = JSON.parse(almacenamiento.get('ventas'));
    assert.equal(ventas.length, 1);
    assert.equal(ventas[0].cliente, 'Cliente de prueba');
    assert.equal(ventas[0].tipo, 'contado');
    assert.equal(ventas[0].cantidad, 3);
    assert.equal(ventas[0].total, 3.75);
    assert.deepEqual(ventas[0].productos, [
        { id: 101, nombre: 'Leche de prueba', precio: 1.25, cantidad: 3, subtotal: 3.75 }
    ]);

    const inventario = JSON.parse(almacenamiento.get('inventario'));
    assert.deepEqual(inventario, [{ ...producto, cantidad: 7 }]);

    const movimientos = JSON.parse(almacenamiento.get('movimientos'));
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].tipo, 'ingreso');
    assert.equal(movimientos[0].valor, 3.75);
    assert.equal(movimientos[0].descripcion, 'Venta al contado: Leche de prueba');
    assert.deepEqual(JSON.parse(almacenamiento.get('cuentas')), []);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /Venta registrada correctamente/);
});

test('venta fiada crea una cuenta vinculada sin anticipar ingresos de efectivo', () => {
    const { almacenamiento, contexto, avisos } = prepararEscenario({ tipo: 'fiado' });
    vm.runInContext('agregarAlCarrito(); registrarVenta();', contexto);

    const ventas = JSON.parse(almacenamiento.get('ventas'));
    const cuentas = JSON.parse(almacenamiento.get('cuentas'));
    assert.equal(ventas.length, 1);
    assert.equal(ventas[0].tipo, 'fiado');
    assert.equal(ventas[0].total, 3.75);
    assert.equal(cuentas.length, 1);
    assert.equal(cuentas[0].id, ventas[0].id);
    assert.equal(cuentas[0].cliente, ventas[0].cliente);
    assert.equal(cuentas[0].producto, ventas[0].producto);
    assert.equal(cuentas[0].total, 3.75);
    assert.equal(cuentas[0].saldo, 3.75);
    assert.equal(cuentas[0].abonado, 0);
    assert.equal(cuentas[0].estado, 'Pendiente');
    assert.deepEqual(cuentas[0].abonos, []);
    assert.deepEqual(JSON.parse(almacenamiento.get('movimientos')), []);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /Venta registrada correctamente/);
});

test('abono parcial reduce el saldo y registra exactamente un ingreso', () => {
    const cuenta = cuentaDePrueba();
    const { almacenamiento, contexto, avisos } = prepararEscenario({ cuentas: [cuenta], abono: '3' });
    const inventarioAntes = almacenamiento.get('inventario');
    const ventasAntes = almacenamiento.get('ventas');
    vm.runInContext('abonarCuenta(201);', contexto);

    const cuentas = JSON.parse(almacenamiento.get('cuentas'));
    assert.equal(cuentas.length, 1);
    assert.equal(cuentas[0].id, cuenta.id);
    assert.equal(cuentas[0].total, 10);
    assert.equal(cuentas[0].saldo, 5);
    assert.equal(cuentas[0].abonado, 5);
    assert.equal(cuentas[0].estado, 'Pendiente');
    assert.equal(cuentas[0].abonos.length, 2);
    assert.deepEqual(cuentas[0].abonos[0], cuenta.abonos[0]);
    assert.equal(cuentas[0].abonos[1].valor, 3);
    const movimientos = JSON.parse(almacenamiento.get('movimientos'));
    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].tipo, 'ingreso');
    assert.equal(movimientos[0].valor, 3);
    assert.equal(movimientos[0].descripcion, 'Abono de Cliente de prueba - Leche de prueba');
    assert.equal(almacenamiento.get('inventario'), inventarioAntes);
    assert.equal(almacenamiento.get('ventas'), ventasAntes);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /Abono registrado correctamente/);
});

test('sobrepago se rechaza sin modificar ningún dato almacenado', () => {
    const { almacenamiento, contexto, avisos } = prepararEscenario({ cuentas: [cuentaDePrueba()], abono: '9' });
    const antes = new Map(almacenamiento);
    vm.runInContext('abonarCuenta(201);', contexto);

    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, ['El abono no puede superar el saldo pendiente.']);
});

test('registrarVenta rechaza stock insuficiente y conserva datos y carrito', () => {
    const { almacenamiento, contexto, avisos } = prepararEscenario();
    vm.runInContext('agregarAlCarrito();', contexto);
    // El stock baja después de preparar el carrito para alcanzar la validación
    // propia de registrarVenta, además de la validación previa del carrito.
    const inventario = JSON.parse(almacenamiento.get('inventario'));
    inventario[0].cantidad = 2;
    almacenamiento.set('inventario', JSON.stringify(inventario));
    const antes = new Map(almacenamiento);
    const carritoAntes = vm.runInContext('JSON.stringify(carrito)', contexto);

    vm.runInContext('registrarVenta();', contexto);

    // Caracterización actual. README permite stock negativo y conciliación.
    assert.deepEqual(almacenamiento, antes);
    assert.equal(vm.runInContext('JSON.stringify(carrito)', contexto), carritoAntes);
    assert.deepEqual(avisos, [
        'No hay suficientes unidades de Leche de prueba. Existencias actuales: 2'
    ]);
});

test('inicio de sesión válido guarda la sesión y aplica el perfil del usuario', () => {
    const { almacenamiento, contexto, campos, clasesLogin, avisos } = prepararEscenario({ conSesion: false });
    campos.loginUsuario.value = ' PRUEBA ';
    campos.errorLogin.textContent = 'Error anterior';
    let enviado = false;
    contexto.iniciarSesion({ preventDefault() { enviado = true; } });

    assert.equal(enviado, true);
    assert.deepEqual(JSON.parse(almacenamiento.get('micro-carmita-sesion')), { id: 'vendedor-prueba' });
    assert.equal(contexto.usuarioActual().id, 'vendedor-prueba');
    assert.equal(campos.nombreSesion.textContent, 'Usuario de prueba');
    assert.equal(campos.rolSesion.textContent, 'vendedor');
    assert.equal(campos.loginClave.value, '');
    assert.equal(campos.errorLogin.textContent, '');
    assert.equal(clasesLogin.has('oculta'), true);
    assert.deepEqual(avisos, []);
});

test('credenciales incorrectas se rechazan sin crear sesión ni modificar datos', () => {
    const { almacenamiento, contexto, campos, clasesLogin } = prepararEscenario({ conSesion: false });
    campos.loginClave.value = 'incorrecta';
    const antes = new Map(almacenamiento);
    contexto.iniciarSesion({ preventDefault() {} });

    assert.deepEqual(almacenamiento, antes);
    assert.equal(almacenamiento.has('micro-carmita-sesion'), false);
    assert.equal(contexto.usuarioActual(), null);
    assert.equal(campos.errorLogin.textContent, 'Usuario, contraseña o estado de cuenta inválido.');
    assert.equal(clasesLogin.has('oculta'), false);
});

test('usuario inactivo con credenciales válidas no puede iniciar sesión', () => {
    const { almacenamiento, contexto, campos, clasesLogin } = prepararEscenario({ activo: false, conSesion: false });
    const antes = new Map(almacenamiento);
    contexto.iniciarSesion({ preventDefault() {} });

    assert.deepEqual(almacenamiento, antes);
    assert.equal(almacenamiento.has('micro-carmita-sesion'), false);
    assert.equal(contexto.usuarioActual(), null);
    assert.equal(campos.errorLogin.textContent, 'Usuario, contraseña o estado de cuenta inválido.');
    assert.equal(clasesLogin.has('oculta'), false);
});

test('cerrar sesión elimina la sesión activa, vacía el carrito y muestra el login', () => {
    const { almacenamiento, contexto, clasesLogin } = prepararEscenario();
    contexto.aplicarSesion();
    contexto.agregarAlCarrito();
    assert.equal(clasesLogin.has('oculta'), true);
    assert.equal(vm.runInContext('carrito.length', contexto), 1);
    const esperado = new Map(almacenamiento);
    esperado.delete('micro-carmita-sesion');

    contexto.cerrarSesion();

    assert.equal(almacenamiento.has('micro-carmita-sesion'), false);
    assert.deepEqual(almacenamiento, esperado);
    assert.equal(contexto.usuarioActual(), null);
    assert.equal(vm.runInContext('carrito.length', contexto), 0);
    assert.equal(clasesLogin.has('oculta'), false);
    assert.equal(contexto.tienePermiso('ventas'), false);
});

test('Vendedor tiene restringidas las operaciones administrativas y sus menús', () => {
    const { almacenamiento, contexto, campos, menus, avisos } = prepararEscenario();
    contexto.aplicarSesion();
    assert.equal(campos.formularioProducto.hidden, true);
    assert.equal(contexto.tienePermiso('ventas'), true);
    assert.equal(contexto.tienePermiso('cuentas'), true);
    for (const permiso of ['movimientos', 'reportes', 'usuarios']) {
        assert.equal(contexto.tienePermiso(permiso), false);
        assert.equal(menus.find(menu => menu.dataset.permiso === permiso).hidden, true);
    }
    const antes = new Map(almacenamiento);
    contexto.agregarProducto();
    contexto.editarProducto(101);
    contexto.eliminarProducto(101);
    contexto.registrarMovimiento();
    contexto.crearUsuario();
    contexto.cambiarEstadoUsuario('vendedor-prueba');
    contexto.mostrarSeccion('reportes');

    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, [
        ...Array(3).fill('Solo administración puede modificar el inventario.'),
        ...Array(3).fill('No tiene permiso para realizar esta acción.'),
        'No tiene permiso para acceder a este módulo.'
    ]);
});

test('Administrador actualmente no puede gestionar usuarios', () => {
    const { almacenamiento, contexto, menus, avisos } = prepararEscenario({ rol: 'administrador' });
    // Caracterización de permisos actuales. La matriz README reserva usuarios al superusuario.
    const usuarios = JSON.parse(almacenamiento.get('micro-carmita-usuarios'));
    usuarios.push({ id: 'otro', nombre: 'Otro usuario', usuario: 'otro', clave: 'clave456', rol: 'vendedor', activo: true });
    almacenamiento.set('micro-carmita-usuarios', JSON.stringify(usuarios));
    contexto.aplicarSesion();
    assert.equal(contexto.tienePermiso('usuarios'), false);
    assert.equal(menus.find(menu => menu.dataset.permiso === 'usuarios').hidden, true);
    const antes = new Map(almacenamiento);

    contexto.crearUsuario();
    contexto.cambiarEstadoUsuario('otro');
    contexto.mostrarSeccion('usuarios');

    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, [
        'No tiene permiso para realizar esta acción.',
        'No tiene permiso para realizar esta acción.',
        'No tiene permiso para acceder a este módulo.'
    ]);
});

test('Administrador registra un producto válido y lo guarda en inventario', () => {
    const { contexto, almacenamiento, avisos } = prepararEscenario({ rol: 'administrador' });
    contexto.agregarProducto();
    const inventario = JSON.parse(almacenamiento.get('inventario'));
    assert.equal(inventario.length, 2);
    assert.equal(typeof inventario[1].id, 'number');
    assert.deepEqual(inventario[1], {
        id: inventario[1].id, nombre: 'Pan de prueba', categoria: 'Panadería', precio: 0.5, cantidad: 8
    });
    assert.deepEqual(avisos, ['Producto agregado correctamente.']);
});

test('Administrador edita precio y cantidad conservando identidad y categoría', () => {
    const { contexto, almacenamiento, avisos } = prepararEscenario({ rol: 'administrador' });
    const respuestas = ['Leche de prueba', '2.50', '6'];
    contexto.prompt = () => respuestas.shift();
    contexto.editarProducto(101);
    assert.deepEqual(JSON.parse(almacenamiento.get('inventario')), [
        { id: 101, nombre: 'Leche de prueba', categoria: 'Lácteos', precio: 2.5, cantidad: 6 }
    ]);
    assert.equal(respuestas.length, 0);
    assert.deepEqual(avisos, ['Producto actualizado correctamente.']);
});

for (const caso of [
    { nombre: 'precio negativo', precio: '-1', cantidad: '8' },
    { nombre: 'cantidad negativa', precio: '1', cantidad: '-1' },
    { nombre: 'cantidad fraccionaria', precio: '1', cantidad: '1.5' },
    { nombre: 'cantidad no numérica', precio: '1', cantidad: 'abc' }
]) {
    test(`registro rechaza ${caso.nombre} sin modificar datos`, () => {
        const { contexto, almacenamiento, campos, avisos } = prepararEscenario({ rol: 'administrador' });
        campos.productoPrecio.value = caso.precio;
        campos.productoCantidad.value = caso.cantidad;
        const antes = new Map(almacenamiento);
        contexto.agregarProducto();
        assert.deepEqual(almacenamiento, antes);
        assert.deepEqual(avisos, ['Complete todos los campos correctamente.']);
    });
    test(`edición rechaza ${caso.nombre} sin modificar datos`, () => {
        const { contexto, almacenamiento, avisos } = prepararEscenario({ rol: 'administrador' });
        const respuestas = ['Leche de prueba', caso.precio, caso.cantidad];
        contexto.prompt = () => respuestas.shift();
        const antes = new Map(almacenamiento);
        contexto.editarProducto(101);
        assert.deepEqual(almacenamiento, antes);
        assert.deepEqual(avisos, [caso.precio === '-1'
            ? 'Ingrese un precio válido mayor que cero.'
            : 'Ingrese una cantidad válida. Debe ser un número entero igual o mayor que cero.']);
    });
}

test('registro actualmente convierte cantidad vacía en cero', () => {
    const { contexto, almacenamiento, campos, avisos } = prepararEscenario({ rol: 'administrador' });
    campos.productoCantidad.value = '';
    contexto.agregarProducto();
    const inventario = JSON.parse(almacenamiento.get('inventario'));
    assert.equal(inventario.length, 2);
    assert.equal(inventario[1].cantidad, 0);
    assert.deepEqual(avisos, ['Producto agregado correctamente.']);
});

test('edición rechaza cantidad vacía sin modificar datos', () => {
    const { contexto, almacenamiento, avisos } = prepararEscenario({ rol: 'administrador' });
    const respuestas = ['Leche de prueba', '1.25', ''];
    contexto.prompt = () => respuestas.shift();
    const antes = new Map(almacenamiento);
    contexto.editarProducto(101);
    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, ['Ingrese una cantidad válida. Debe ser un número entero igual o mayor que cero.']);
});

test('registro rechaza productos duplicados ignorando mayúsculas y espacios', () => {
    const { contexto, almacenamiento, campos, avisos } = prepararEscenario({ rol: 'administrador' });
    campos.productoNombre.value = '  LECHE DE PRUEBA  ';
    const antes = new Map(almacenamiento);
    contexto.agregarProducto();
    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, ['Este producto ya existe en el inventario.\nNo se puede registrar nuevamente.']);
});

test('eliminación confirmada retira el producto del inventario y del carrito', () => {
    const { contexto, almacenamiento, avisos } = prepararEscenario({ rol: 'administrador' });
    contexto.agregarAlCarrito();
    let confirmaciones = 0;
    contexto.confirm = mensaje => {
        assert.match(mensaje, /Leche de prueba/);
        confirmaciones += 1;
        return true;
    };
    contexto.eliminarProducto(101);
    assert.equal(confirmaciones, 1);
    assert.deepEqual(JSON.parse(almacenamiento.get('inventario')), []);
    assert.equal(vm.runInContext('carrito.length', contexto), 0);
    assert.deepEqual(avisos, ['Producto eliminado correctamente.']);
});

test('cancelar eliminación conserva todos los datos', () => {
    const { contexto, almacenamiento, avisos } = prepararEscenario({ rol: 'administrador' });
    contexto.confirm = () => false;
    const antes = new Map(almacenamiento);
    contexto.eliminarProducto(101);
    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, []);
});

test('Vendedor no edita ni elimina inventario ni llega a los diálogos', () => {
    const { contexto, almacenamiento, avisos } = prepararEscenario();
    contexto.prompt = () => assert.fail('Vendedor llegó al diálogo de edición');
    contexto.confirm = () => assert.fail('Vendedor llegó al diálogo de eliminación');
    const antes = new Map(almacenamiento);
    contexto.editarProducto(101);
    contexto.eliminarProducto(101);
    assert.deepEqual(almacenamiento, antes);
    assert.deepEqual(avisos, Array(2).fill('Solo administración puede modificar el inventario.'));
});

test('producto guardado persiste al cargar app.js en otro contexto con el almacenamiento simulado', () => {
    const original = prepararEscenario({ rol: 'administrador' });
    original.contexto.agregarProducto();
    const guardado = original.almacenamiento.get('inventario');
    const recargado = prepararEscenario({ rol: 'administrador' });
    for (const [clave, valor] of original.almacenamiento) recargado.almacenamiento.set(clave, valor);
    assert.notEqual(original.contexto, recargado.contexto);
    assert.equal(vm.runInContext('JSON.stringify(obtenerDatos("inventario"))', recargado.contexto), guardado);
    recargado.contexto.actualizarTodo();
    assert.equal(recargado.almacenamiento.get('inventario'), guardado);
    assert.equal(JSON.parse(guardado)[1].nombre, 'Pan de prueba');
});

for (const cantidad of [0, 1, 2, 3]) {
    test(`stock ${cantidad} actualmente muestra ${cantidad > 0 ? 'Disponible' : 'Agotado'} sin alerta de umbral tres`, () => {
        const { contexto, almacenamiento, campos, avisos } = prepararEscenario({ rol: 'administrador' });
        const inventario = JSON.parse(almacenamiento.get('inventario'));
        inventario[0].cantidad = cantidad;
        almacenamiento.set('inventario', JSON.stringify(inventario));
        const filas = [];
        campos.listaInventario = { innerHTML: '', appendChild(fila) { filas.push(fila); } };
        const antes = new Map(almacenamiento);
        contexto.actualizarTodo();
        assert.equal(filas.length, 1);
        assert.match(filas[0].innerHTML, cantidad > 0 ? /estado-disponible/ : /estado-agotado/);
        assert.match(filas[0].innerHTML, cantidad > 0 ? />\s*Disponible\s*</ : />\s*Agotado\s*</);
        assert.doesNotMatch(filas[0].innerHTML, /stock bajo|bajo stock|alerta/i);
        assert.deepEqual(avisos, []);
        assert.deepEqual(almacenamiento, antes);
    });
}
