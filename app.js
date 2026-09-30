'use strict';

// Interfaz del prototipo. Las reglas de negocio están en modelo.js.
const M = MicroCarmita;
const PRUEBAS = new URLSearchParams(location.search).get('pruebas') === '1';
const CLAVE = PRUEBAS ? 'micro-carmita-pruebas-v2' : 'micro-carmita-v2';
const formatoMoneda = new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD'
});

let datos;
let perfil;
let cuentaAbono;

/* Utilidades de presentación */

function elemento(id) {
    const campo = document.getElementById(id);
    if (!campo) throw new Error(`No se encontró el elemento ${id}.`);
    return campo;
}

function valor(id) {
    return elemento(id).value.trim();
}

function escapar(texto) {
    const caracteres = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    };
    return String(texto ?? '').replace(/[&<>"']/g, caracter => caracteres[caracter]);
}

function moneda(importe) {
    return formatoMoneda.format(importe);
}

function fechaTexto(fecha) {
    const texto = /^\d{4}-\d{2}-\d{2}$/.test(fecha)
        ? fecha.split('-').reverse().join('/')
        : fecha;
    return escapar(texto);
}

function mensaje(texto, error = false) {
    const aviso = elemento('aviso');
    aviso.hidden = false;
    aviso.classList.toggle('error', error);
    aviso.textContent = texto;
}

function etiqueta(texto, estado = 'disponible') {
    return `<span class="estado estado-${estado}">${escapar(texto)}</span>`;
}

function fila(celdas) {
    return '<tr>' + celdas.map(celda => `<td>${celda}</td>`).join('') + '</tr>';
}

function mostrarTabla(id, filas, columnas, textoVacio) {
    elemento(id).innerHTML = filas.length
        ? filas.join('')
        : `<tr><td colspan="${columnas}" class="vacio">${escapar(textoVacio)}</td></tr>`;
}

function nombreProducto(id) {
    return datos.productos.find(producto => producto.id === id)?.nombre || 'Producto no identificado';
}

function sumar(registros, propiedad) {
    return M.redondear(registros.reduce((total, registro) => total + registro[propiedad], 0));
}

/* Almacenamiento: una operación se guarda completa o no se aplica. */

function operacion(modificar, textoExito) {
    let resultado;
    try {
        const copia = structuredClone(datos);
        resultado = modificar(copia);
        M.validarEstado(copia);
        localStorage.setItem(CLAVE, JSON.stringify(copia));
        datos = copia;
    } catch (error) {
        mensaje(error.message || 'No fue posible guardar la operación.', true);
        return false;
    }

    actualizarTodo();
    const texto = typeof textoExito === 'function' ? textoExito(resultado) : textoExito;
    mensaje(texto);
    return true;
}

function migrarOriginal() {
    const leer = clave => {
        const registros = JSON.parse(localStorage.getItem(clave) || '[]');
        if (!Array.isArray(registros)) throw new Error(`Datos originales inválidos: ${clave}.`);
        return registros;
    };
    const convertirFecha = fecha => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
        const partes = String(fecha).split('/');
        if (partes.length !== 3) return M.hoy();
        return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
    };
    const estado = M.vacio();
    const inventario = leer('inventario');

    estado.productos = inventario.map(producto => ({
        id: String(producto.id || M.id()),
        nombre: producto.nombre,
        categoria: producto.categoria,
        precio: Number(producto.precio),
        faltante: Math.max(0, -Number(producto.cantidad))
    }));
    estado.lotes = estado.productos.map((producto, indice) => ({
        id: M.id(),
        productoId: producto.id,
        codigo: `INICIAL-${indice + 1}`,
        cantidad: Math.max(0, Number(inventario[indice].cantidad)),
        caducidad: '',
        fecha: M.hoy()
    }));
    estado.ventas = leer('ventas').map(venta => ({
        ...venta,
        id: String(venta.id),
        fecha: convertirFecha(venta.fecha),
        asignaciones: [],
        sinExistencia: 0
    }));
    estado.cuentas = leer('cuentas').map(cuenta => ({
        ...cuenta,
        id: String(cuenta.id),
        saldo: cuenta.estado === 'Pagado' ? 0 : Number(cuenta.total),
        fecha: convertirFecha(cuenta.fecha)
    }));
    estado.movimientos = leer('movimientos').map(movimiento => ({
        ...movimiento,
        id: String(movimiento.id),
        origen: 'original',
        fecha: convertirFecha(movimiento.fecha)
    }));

    // Las claves originales se conservan. No se reconstruyen cobros ni salidas
    // históricas porque el prototipo original no los registraba automáticamente.
    return estado;
}

/* Navegación y perfiles de demostración */

function mostrarSeccion(nombre) {
    try {
        M.autorizar(datos, perfil, nombre);
    } catch (error) {
        mensaje(error.message, true);
        return;
    }

    document.querySelectorAll('.seccion').forEach(seccion => {
        seccion.classList.toggle('activa-seccion', seccion.id === nombre);
    });
    document.querySelectorAll('[data-seccion]').forEach(boton => {
        const activo = boton.dataset.seccion === nombre;
        boton.classList.toggle('activo', activo);
        if (activo) boton.setAttribute('aria-current', 'page');
        else boton.removeAttribute('aria-current');
    });
}

function cambiarPerfil(id) {
    const usuario = datos.usuarios.find(usuario => usuario.id === id && usuario.activo);
    if (!usuario) return;
    perfil = id;
    actualizarTodo();
    mostrarSeccion('inicio');
    mensaje(`Perfil de demostración: ${usuario.nombre}`);
}

function actualizarPermisos() {
    const usuario = datos.usuarios.find(usuario => usuario.id === perfil && usuario.activo);
    const administrador = usuario.rol === 'administrador';
    const opciones = datos.usuarios.filter(usuario => usuario.activo).map(usuario => ({
        id: usuario.id,
        texto: `${usuario.nombre} · ${usuario.rol}`
    }));
    actualizarSelector('perfilActual', opciones);
    elemento('perfilActual').value = perfil;

    document.querySelectorAll('[data-seccion]').forEach(boton => {
        boton.hidden = !M.permisos[usuario.rol].includes(boton.dataset.seccion);
    });
    document.querySelectorAll('[data-admin]').forEach(contenido => {
        contenido.hidden = !administrador;
    });
}

function actualizarSelector(id, opciones, marcador = '') {
    const selector = elemento(id);
    const seleccionado = selector.value;
    const inicio = marcador ? `<option value="">${escapar(marcador)}</option>` : '';
    selector.innerHTML = inicio + opciones.map(opcion =>
        `<option value="${escapar(opcion.id)}">${escapar(opcion.texto)}</option>`
    ).join('');
    selector.value = seleccionado;
}

/* Registro de operaciones */

function registrarVenta() {
    const venta = {
        cliente: valor('ventaCliente'),
        productoId: valor('ventaProducto'),
        cantidad: Number(valor('ventaCantidad')),
        precio: Number(valor('ventaPrecio')),
        tipo: valor('ventaTipo')
    };
    const guardada = operacion(estado => M.venta(estado, venta, perfil), venta => {
        const faltante = venta.sinExistencia
            ? ` ${venta.sinExistencia} unidades pendientes de conciliar; revise el inventario.`
            : '';
        return `Venta registrada por ${moneda(venta.total)}.${faltante}`;
    });
    if (guardada) {
        elemento('ventaCliente').value = '';
        elemento('ventaCantidad').value = '1';
        elemento('ventaTipo').value = 'contado';
        actualizarTipoVenta();
        resumenVenta();
    }
}

function agregarProducto() {
    const producto = {
        nombre: valor('productoNombre'),
        categoria: valor('productoCategoria'),
        precio: Number(valor('productoPrecio'))
    };
    if (operacion(estado => M.producto(estado, producto, perfil), 'Producto registrado. Agregue sus existencias mediante un lote.')) {
        elemento('formProducto').reset();
    }
}

function registrarLote() {
    const lote = {
        productoId: valor('loteProducto'),
        codigo: valor('loteCodigo'),
        cantidad: Number(valor('loteCantidad')),
        caducidad: valor('loteCaducidad')
    };
    if (operacion(estado => M.entrada(estado, lote, perfil), 'Entrada de lote registrada.')) {
        elemento('loteCodigo').value = '';
        elemento('loteCantidad').value = '1';
        elemento('loteCaducidad').value = '';
    }
}

function registrarSalida() {
    const loteId = valor('salidaLote');
    const cantidad = Number(valor('salidaCantidad'));
    const motivo = valor('salidaMotivo');
    if (operacion(estado => M.salida(estado, loteId, cantidad, motivo, perfil), 'Salida de inventario registrada.')) {
        elemento('formSalida').reset();
    }
}

function abrirAbono(id) {
    const cuenta = datos.cuentas.find(cuenta => cuenta.id === id);
    if (!cuenta || cuenta.saldo <= 0) return;
    M.autorizar(datos, perfil, 'cuentas');
    cuentaAbono = id;
    elemento('detalleAbono').textContent = `${cuenta.cliente} · Saldo pendiente: ${moneda(cuenta.saldo)}`;
    elemento('abonoValor').value = '';
    elemento('abonoValor').max = cuenta.saldo;
    elemento('dialogoAbono').showModal();
    elemento('abonoValor').focus();
}

function registrarAbono() {
    const importe = Number(valor('abonoValor'));
    if (operacion(estado => M.abono(estado, cuentaAbono, importe, perfil), 'Abono registrado y saldo actualizado.')) {
        elemento('dialogoAbono').close();
        cuentaAbono = undefined;
    }
}

function registrarMovimiento() {
    const movimiento = {
        tipo: valor('movimientoTipo'),
        descripcion: valor('movimientoDescripcion'),
        valor: Number(valor('movimientoValor'))
    };
    if (operacion(estado => M.movimiento(estado, movimiento, perfil), 'Movimiento registrado.')) {
        elemento('formMovimiento').reset();
    }
}

function registrarUsuario() {
    const nombre = valor('usuarioNombre');
    const rol = valor('usuarioRol');
    const guardado = operacion(estado => {
        M.autorizar(estado, perfil, 'usuarios');
        if (!nombre || !M.permisos[rol]) throw new Error('Ingrese un nombre y un rol válido.');
        const repetido = estado.usuarios.some(usuario => usuario.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase());
        if (repetido) throw new Error('Ya existe un perfil con ese nombre.');
        estado.usuarios.push({ id: M.id(), nombre, rol, activo: true });
    }, 'Perfil de demostración registrado.');
    if (guardado) elemento('formUsuario').reset();
}

function alternarUsuario(id) {
    operacion(estado => {
        M.autorizar(estado, perfil, 'usuarios');
        const usuario = estado.usuarios.find(usuario => usuario.id === id);
        if (!usuario || id === perfil) throw new Error('No puede desactivar el perfil actual.');
        const administradores = estado.usuarios.filter(usuario => usuario.activo && usuario.rol === 'administrador');
        if (usuario.activo && usuario.rol === 'administrador' && administradores.length === 1) {
            throw new Error('Debe quedar al menos un administrador activo.');
        }
        usuario.activo = !usuario.activo;
    }, 'Estado del perfil actualizado.');
}

/* Actualización de formularios, tablas y panel principal */

function seleccionarProductoVenta() {
    const producto = datos.productos.find(producto => producto.id === valor('ventaProducto'));
    elemento('ventaPrecio').value = producto ? producto.precio.toFixed(2) : '';
    resumenVenta();
}

function actualizarTipoVenta() {
    elemento('ventaCliente').required = valor('ventaTipo') === 'fiado';
}

function resumenVenta() {
    const producto = datos.productos.find(producto => producto.id === valor('ventaProducto'));
    if (!producto) {
        elemento('ventaResumen').textContent = 'Seleccione un producto. La asignación de lotes seguirá FEFO.';
        return;
    }
    const vigentes = datos.lotes.filter(lote => lote.productoId === producto.id && M.estadoLote(lote) !== 'Caducado');
    const unidades = sumar(vigentes, 'cantidad');
    const total = Number(valor('ventaCantidad')) * Number(valor('ventaPrecio'));
    elemento('ventaResumen').textContent =
        `Stock general: ${M.stock(datos, producto.id)} · Unidades de lotes vigentes: ${unidades} · Total: ${moneda(total || 0)}. Las existencias caducadas no se venden.`;
}

function mostrarVentas() {
    const filas = [...datos.ventas].reverse().map(venta => {
        const lotes = venta.asignaciones.map(lote => `${lote.codigo}: ${lote.cantidad}`).join(' · ') || 'Sin lote asignado';
        const faltante = venta.sinExistencia ? ` · ${venta.sinExistencia} sin existencia` : '';
        return fila([
            escapar(venta.cliente),
            `${escapar(venta.producto)}<small class="detalle">${escapar(lotes + faltante)}</small>`,
            venta.cantidad,
            moneda(venta.total),
            etiqueta(venta.tipo === 'fiado' ? 'Crédito' : 'Contado', venta.tipo === 'fiado' ? 'pendiente' : 'pagado'),
            fechaTexto(venta.fecha)
        ]);
    });
    mostrarTabla('listaVentas', filas, 6, 'No existen ventas registradas.');
}

function mostrarCuentas() {
    const filas = datos.cuentas.map(cuenta => fila([
        escapar(cuenta.cliente),
        escapar(cuenta.producto),
        moneda(cuenta.total),
        moneda(cuenta.saldo),
        `${fechaTexto(cuenta.fecha)} ${etiqueta(cuenta.saldo > 0 ? 'Pendiente' : 'Pagado', cuenta.saldo > 0 ? 'pendiente' : 'pagado')}`,
        cuenta.saldo > 0
            ? `<button class="btn-pagar" data-abonar="${escapar(cuenta.id)}">Abonar</button>`
            : 'Saldado'
    ]));
    mostrarTabla('listaCuentas', filas, 6, 'No existen cuentas por cobrar.');
    const pagos = [...datos.pagos].reverse().map(pago => fila([
        escapar(pago.cliente), moneda(pago.valor), fechaTexto(pago.fecha)
    ]));
    mostrarTabla('listaPagos', pagos, 3, 'No existen abonos registrados.');
}

function mostrarInventario() {
    const productos = datos.productos.map(producto => {
        const stock = M.stock(datos, producto.id);
        const estado = stock < 0 ? 'Stock negativo' : stock === 0 ? 'Agotado' : 'Registrado';
        return fila([
            escapar(producto.nombre), escapar(producto.categoria), moneda(producto.precio),
            stock, etiqueta(estado, stock <= 0 ? 'agotado' : 'disponible')
        ]);
    });
    mostrarTabla('listaInventario', productos, 5, 'No existen productos registrados.');

    const lotes = datos.lotes.map(lote => {
        const estado = M.estadoLote(lote);
        const color = estado === 'Caducado' ? 'agotado' : estado === 'Por caducar' ? 'pendiente' : 'disponible';
        return fila([
            escapar(nombreProducto(lote.productoId)), escapar(lote.codigo), lote.cantidad,
            lote.caducidad ? fechaTexto(lote.caducidad) : 'No aplica', etiqueta(estado, color)
        ]);
    });
    mostrarTabla('listaLotes', lotes, 5, 'No existen lotes registrados.');

    const movimientos = [...datos.inventarioMovimientos].reverse().map(movimiento => fila([
        fechaTexto(movimiento.fecha),
        escapar(nombreProducto(movimiento.productoId)),
        escapar(movimiento.lote),
        escapar(movimiento.tipo + (movimiento.conciliado ? ` (${movimiento.conciliado} conciliadas)` : '')),
        movimiento.cantidad
    ]));
    mostrarTabla('listaInventarioMovimientos', movimientos, 5, 'No existen movimientos de inventario.');
}

function mostrarMovimientos() {
    const filas = [...datos.movimientos].reverse().map(movimiento => {
        const automatico = ['venta', 'abono'].includes(movimiento.origen);
        return fila([
            etiqueta(movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Egreso', movimiento.tipo === 'ingreso' ? 'disponible' : 'agotado'),
            `${escapar(movimiento.descripcion)}<small class="detalle">${automatico ? 'Registro automático' : 'Registro manual / original'}</small>`,
            moneda(movimiento.valor), fechaTexto(movimiento.fecha)
        ]);
    });
    mostrarTabla('listaMovimientos', filas, 4, 'No existen movimientos registrados.');
}

function mostrarUsuarios() {
    const filas = datos.usuarios.map(usuario => fila([
        escapar(usuario.nombre),
        escapar(usuario.rol),
        etiqueta(usuario.activo ? 'Activo' : 'Inactivo', usuario.activo ? 'disponible' : 'agotado'),
        usuario.id === perfil
            ? 'Perfil actual'
            : `<button class="btn-pagar" data-usuario="${escapar(usuario.id)}">${usuario.activo ? 'Desactivar' : 'Activar'}</button>`
    ]));
    mostrarTabla('listaUsuarios', filas, 4, 'No existen perfiles registrados.');
}

function mostrarAlertas() {
    const alertas = datos.lotes.filter(lote =>
        lote.cantidad > 0 && ['Caducado', 'Por caducar'].includes(M.estadoLote(lote))
    ).map(lote => {
        const estado = M.estadoLote(lote);
        return `<p class="alerta-fila">${etiqueta(estado, estado === 'Caducado' ? 'agotado' : 'pendiente')}
            ${escapar(nombreProducto(lote.productoId))} · lote ${escapar(lote.codigo)} ·
            ${lote.cantidad} unidades · ${fechaTexto(lote.caducidad)}</p>`;
    });
    datos.productos.filter(producto => M.stock(datos, producto.id) <= 0 || producto.faltante > 0).forEach(producto => {
        alertas.push(`<p class="alerta-fila">${etiqueta('Revisar stock', 'pendiente')}
            ${escapar(producto.nombre)} · stock general ${M.stock(datos, producto.id)} ·
            ${producto.faltante} unidades pendientes de conciliar</p>`);
    });
    elemento('alertasInventario').innerHTML = alertas.join('') || '<p class="ayuda-texto">No hay alertas de caducidad ni stock por revisar.</p>';
}

function actualizarInicio() {
    const ventasHoy = datos.ventas.filter(venta => venta.fecha === M.hoy());
    const ingresos = datos.movimientos.filter(movimiento => movimiento.tipo === 'ingreso');
    const saldo = moneda(sumar(datos.cuentas, 'saldo'));
    elemento('totalVentas').textContent = moneda(sumar(ventasHoy, 'total'));
    elemento('totalCobrar').textContent = saldo;
    elemento('saldoPendiente').textContent = saldo;
    elemento('totalProductos').textContent = datos.productos.length;
    elemento('totalIngresos').textContent = moneda(sumar(ingresos, 'valor'));
}

function filtrarPeriodo(registros) {
    const desde = valor('reporteDesde');
    const hasta = valor('reporteHasta');
    if (desde && hasta && desde > hasta) throw new Error('La fecha inicial no puede ser posterior a la final.');
    return registros.filter(registro => (!desde || registro.fecha >= desde) && (!hasta || registro.fecha <= hasta));
}

function actualizarReportes() {
    try {
        const movimientos = filtrarPeriodo(datos.movimientos);
        const ingresos = sumar(movimientos.filter(movimiento => movimiento.tipo === 'ingreso'), 'valor');
        const egresos = sumar(movimientos.filter(movimiento => movimiento.tipo === 'egreso'), 'valor');
        elemento('reporteVentas').textContent = moneda(sumar(filtrarPeriodo(datos.ventas), 'total'));
        elemento('reporteIngresos').textContent = moneda(ingresos);
        elemento('reporteEgresos').textContent = moneda(egresos);
        elemento('reporteBalance').textContent = moneda(M.redondear(ingresos - egresos));
    } catch (error) {
        ['reporteVentas', 'reporteIngresos', 'reporteEgresos', 'reporteBalance'].forEach(id => {
            elemento(id).textContent = '—';
        });
        mensaje(error.message, true);
    }
}

function actualizarTodo() {
    actualizarPermisos();
    const productos = datos.productos.map(producto => ({ id: producto.id, texto: producto.nombre }));
    actualizarSelector('ventaProducto', productos, 'Seleccione un producto');
    actualizarSelector('loteProducto', productos, 'Seleccione un producto');
    const lotes = datos.lotes.filter(lote => lote.cantidad > 0).map(lote => ({
        id: lote.id,
        texto: `${nombreProducto(lote.productoId)} · ${lote.codigo} (${lote.cantidad})`
    }));
    actualizarSelector('salidaLote', lotes, 'Seleccione un lote');
    mostrarVentas();
    mostrarCuentas();
    mostrarInventario();
    mostrarMovimientos();
    mostrarUsuarios();
    mostrarAlertas();
    actualizarInicio();
    actualizarReportes();
    resumenVenta();
}

/* Descargas locales */

function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarRespaldo() {
    try {
        M.autorizar(datos, perfil, 'respaldo');
        descargar(`micro-carmita-${M.hoy()}.json`, JSON.stringify(datos, null, 2), 'application/json');
        const fecha = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
        elemento('ultimoRespaldo').textContent = `Última descarga solicitada: ${fecha}`;
        mensaje('Copia local preparada para descargar.');
    } catch (error) {
        mensaje(error.message, true);
    }
}

function exportarReporte() {
    try {
        M.autorizar(datos, perfil, 'reportes');
        const registros = filtrarPeriodo(datos.movimientos);
        const filas = [
            ['Fecha', 'Tipo', 'Descripción', 'Valor', 'Origen'],
            ...registros.map(registro => [registro.fecha, registro.tipo, registro.descripcion, registro.valor.toFixed(2), registro.origen])
        ];
        const celdaCSV = contenido => {
            let texto = String(contenido ?? '');
            if (/^[\s]*[=+@-]/.test(texto)) texto = "'" + texto;
            return '"' + texto.replace(/"/g, '""') + '"';
        };
        const csv = '\uFEFF' + filas.map(fila => fila.map(celdaCSV).join(';')).join('\r\n');
        descargar(`movimientos-${M.hoy()}.csv`, csv, 'text/csv;charset=utf-8');
    } catch (error) {
        mensaje(error.message, true);
    }
}

/* Conexión de eventos. Todas las pantallas están declaradas en index.html. */

function conectarEventos() {
    const formularios = {
        formVenta: registrarVenta,
        formProducto: agregarProducto,
        formLote: registrarLote,
        formSalida: registrarSalida,
        formMovimiento: registrarMovimiento,
        formUsuario: registrarUsuario,
        formAbono: registrarAbono
    };
    Object.entries(formularios).forEach(([id, accion]) => {
        elemento(id).addEventListener('submit', evento => {
            evento.preventDefault();
            accion();
        });
    });
    document.querySelectorAll('[data-seccion]').forEach(boton => {
        boton.addEventListener('click', () => mostrarSeccion(boton.dataset.seccion));
    });
    elemento('perfilActual').addEventListener('change', evento => cambiarPerfil(evento.target.value));
    elemento('ventaProducto').addEventListener('change', seleccionarProductoVenta);
    elemento('ventaTipo').addEventListener('change', actualizarTipoVenta);
    ['ventaCantidad', 'ventaPrecio'].forEach(id => elemento(id).addEventListener('input', resumenVenta));
    ['reporteDesde', 'reporteHasta'].forEach(id => elemento(id).addEventListener('change', actualizarReportes));
    elemento('btnReporte').addEventListener('click', exportarReporte);
    elemento('btnRespaldo').addEventListener('click', exportarRespaldo);
    elemento('cancelarAbono').addEventListener('click', () => elemento('dialogoAbono').close());
    elemento('listaCuentas').addEventListener('click', evento => {
        const boton = evento.target.closest('[data-abonar]');
        if (boton) abrirAbono(boton.dataset.abonar);
    });
    elemento('listaUsuarios').addEventListener('click', evento => {
        const boton = evento.target.closest('[data-usuario]');
        if (boton) alternarUsuario(boton.dataset.usuario);
    });
}

function iniciarSistema() {
    try {
        const guardado = localStorage.getItem(CLAVE);
        datos = guardado ? JSON.parse(guardado) : PRUEBAS ? M.vacio() : migrarOriginal();
        M.validarEstado(datos);
        perfil = datos.usuarios.find(usuario => usuario.activo && usuario.rol === 'administrador').id;
        conectarEventos();
        actualizarTipoVenta();
        actualizarTodo();
        // Validar y dibujar antes de crear el almacenamiento de la nueva versión.
        if (!guardado) localStorage.setItem(CLAVE, JSON.stringify(datos));
        if (PRUEBAS) mensaje('Modo de pruebas: estos registros están separados de los datos del negocio.');
    } catch (error) {
        mensaje(`No se pudo iniciar el prototipo: ${error.message} Los datos guardados no se han sobrescrito.`, true);
        document.querySelectorAll('button, input, select').forEach(control => {
            control.disabled = true;
        });
    }
}

document.addEventListener('DOMContentLoaded', iniciarSistema);
