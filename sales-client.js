/* Ventas y cobros remotos. La caché solo vive en memoria y nunca se guarda localmente. */
(() => {
    'use strict';
    const el = id => document.getElementById(id);
    const api = async (...args) => {
        const identidad = usuarioActual();
        const datos = await MicroCarmitaAuth.api(...args);
        if (usuarioActual() !== identidad) throw new Error('La sesión cambió durante la consulta.');
        return datos;
    };
    const admin = () => usuarioActual()?.rol === 'administrador';
    let ventas = [], clientes = [], edicion = null, ocupado = false, pendiente = null;
    const obtenerAnterior = obtenerDatos, guardarAnterior = guardarDatos;
    obtenerDatos = clave => clave === 'ventas' ? ventas.filter(v => v.estado === 'Activa')
        : clave === 'cuentas' ? ventas.filter(v => v.tipo === 'fiado' && v.estado === 'Activa') : obtenerAnterior(clave);
    guardarDatos = (clave, datos) => {
        if (['ventas','cuentas'].includes(clave)) throw new Error('Ventas y cobros se guardan mediante la API.');
        return guardarAnterior(clave, datos);
    };
    function pintar() {
        el('listaVentas').innerHTML = ventas.map(v => `<tr><td>${textoSeguro(v.cliente || 'Consumidor final')}</td>
            <td>Venta ${v.id} · ${textoSeguro(v.estado)}</td><td>Ver detalle</td><td>${dinero(v.total)}</td>
            <td>${textoSeguro(v.tipo)}</td><td>${textoSeguro(v.creado_en)}
            <button onclick="MicroCarmitaVentas.detalle(${v.id})">Detalle</button>
            ${admin() && v.estado === 'Activa' ? `<button onclick="MicroCarmitaVentas.editar(${v.id})">Modificar</button>
            <button onclick="MicroCarmitaVentas.anular(${v.id})">Anular</button>` : ''}</td></tr>`).join('');
        const fiados = ventas.filter(v => v.tipo === 'fiado');
        el('listaCuentas').innerHTML = fiados.map(v => `<tr><td>${textoSeguro(v.cliente)}</td><td>Venta ${v.id}</td>
            <td>Total ${dinero(v.total)} · Abonos ${dinero(v.abonado)} · Saldo ${dinero(v.saldo)}</td>
            <td>${textoSeguro(v.creado_en)}</td><td>${textoSeguro(v.estado === 'Anulada' ? 'Anulada' : Number(v.saldo) ? 'Pendiente' : 'Pagada')}</td>
            <td>${v.estado === 'Activa' && Number(v.saldo) > 0 ? `<button onclick="abonarCuenta(${v.id})">Registrar abono</button>` : ''}
            <button onclick="MicroCarmitaVentas.cliente(${v.cliente_id})">Historial del cliente</button></td></tr>`).join('');
        const saldo = ventas.filter(v => v.estado === 'Activa').reduce((s,v) => s + Number(v.saldo), 0);
        el('saldoPendiente').textContent = dinero(saldo);
        el('totalCobrar').textContent = dinero(saldo);
        el('totalVentas').textContent = dinero(ventas.filter(v => v.estado === 'Activa').reduce((s,v) => s + Number(v.total), 0));
        el('totalIngresos').textContent = dinero(ventas.reduce((s,v) => s + Number(v.efectivo || 0), 0));
        const seleccionado = el('ventaCliente').value;
        el('ventaCliente').innerHTML = '<option value="">Consumidor final (solo contado)</option>' + clientes.map(c => `<option value="${c.id}">${textoSeguro(c.nombre)}</option>`).join('');
        if (clientes.some(c => String(c.id) === seleccionado)) el('ventaCliente').value = seleccionado;
        const historialSeleccionado = el('cuentasCliente').value;
        el('cuentasCliente').innerHTML = '<option value="">Seleccione cliente</option>' + clientes.map(c => `<option value="${c.id}">${textoSeguro(c.nombre)}</option>`).join('');
        if (clientes.some(c => String(c.id) === historialSeleccionado)) el('cuentasCliente').value = historialSeleccionado;
    }
    async function cargar() {
        const identidad = usuarioActual();
        if (!identidad) return;
        try {
            const [v,c] = await Promise.all([api('/sales'), api('/clientes')]);
            if (usuarioActual() !== identidad) return;
            ventas = v.ventas; clientes = c.registros;
            pintar(); el('estadoVentas').textContent = '';
        } catch (error) {
            if (usuarioActual() !== identidad) return;
            ventas = []; clientes = []; pintar();
            el('estadoVentas').textContent = `${error.message} Compruebe la activación de ventas.`;
        }
    }
    async function operar(fn) {
        if (ocupado || !usuarioActual()) return;
        const identidad = usuarioActual();
        ocupado = true;
        try { await fn(); }
        catch (error) { if (usuarioActual() === identidad) el('estadoVentas').textContent = error.message; }
        finally { ocupado = false; }
    }
    async function enviar(ruta, metodo, datos) {
        const identidad = usuarioActual();
        const firma = JSON.stringify([ruta,metodo,datos]);
        if (pendiente && pendiente.firma !== firma) throw new Error('Hay una operación sin confirmar. Reinténtela con los mismos datos antes de iniciar otra.');
        if (!pendiente) pendiente = { firma, clave: crypto.randomUUID() };
        const actual = pendiente;
        try {
            const r = await api(ruta, metodo, { ...datos, clave: actual.clave });
            if (usuarioActual() !== identidad || pendiente !== actual) throw new Error('La sesión cambió durante la operación.');
            pendiente = null;
            return r;
        } catch (error) {
            // Un rechazo HTTP controlado no escribió datos; una pérdida de red sí
            // puede haber ocurrido después del commit. Conserva la clave en ese caso.
            if (error.status >= 400 && error.status < 500 && pendiente === actual) pendiente = null;
            throw error;
        }
    }
    mostrarVentas = cargar;
    mostrarCuentas = cargar;
    const inicioAnterior = actualizarInicio;
    actualizarInicio = () => { inicioAnterior(); pintar(); };
    agregarAlCarrito = () => {
        if (!exigirPermiso('ventas') || ocupado || pendiente) return;
        const producto = obtenerDatos('inventario').find(p => String(p.id) === el('ventaProducto').value);
        const cantidad = Number(el('ventaCantidad').value);
        const precio = Number(el('ventaPrecio').value);
        if (!producto || !Number.isSafeInteger(cantidad) || cantidad < 1 || precio <= 0) return alert('Seleccione producto, cantidad entera y precio válido.');
        const existente = carrito.find(l => l.id === producto.id);
        const nuevas = cantidad + (existente?.cantidad || 0);
        let confirmarExistencia = existente?.confirmarExistencia || false, caducidadFisica = existente?.caducidadFisica;
        const disponibles = (producto.lotes || []).filter(l => l.estado !== 'Caducado').reduce((s,l) => s + Number(l.cantidad), 0);
        if (nuevas > disponibles) {
            confirmarExistencia = confirm('La cantidad supera el inventario válido registrado. ¿Confirma que la mercadería existe físicamente y no está vencida?');
            if (!confirmarExistencia) return;
            const fecha = prompt('Caducidad de las unidades físicas adicionales (AAAA-MM-DD). Deje vacío únicamente si no tienen caducidad:');
            if (fecha === null) return;
            caducidadFisica = fecha.trim() || null;
        }
        const linea = { id: producto.id, nombre: producto.nombre, precio, cantidad: nuevas, confirmarExistencia,
            ...(caducidadFisica !== undefined ? { caducidadFisica } : {}) };
        if (existente) Object.assign(existente, linea); else carrito.push(linea);
        mostrarCarrito();
    };
    registrarVenta = () => operar(async () => {
        if (!exigirPermiso('ventas') || !carrito.length) throw new Error('Agregue productos al carrito.');
        const datos = { tipo: el('ventaTipo').value, clienteId: el('ventaCliente').value ? Number(el('ventaCliente').value) : null,
            detalles: carrito.map(l => ({ productoId: Number(l.id), cantidad: l.cantidad, precio: l.precio, confirmarExistencia: !!l.confirmarExistencia,
                ...(l.caducidadFisica !== undefined ? { caducidadFisica: l.caducidadFisica } : {}) })) };
        if (edicion) Object.assign(datos, { version: edicion.version, motivo: edicion.motivo, confirmarReembolso: edicion.confirmarReembolso });
        await enviar(edicion ? `/sales/${edicion.id}` : '/sales', edicion ? 'PATCH' : 'POST', datos);
        carrito = []; edicion = null; el('ventaPrecio').readOnly = true; mostrarCarrito();
        await MicroCarmitaInventario.cargar(); await cargar();
    });
    abonarCuenta = id => operar(async () => {
        const v = ventas.find(v => v.id === id);
        if (!v) return;
        const texto = prompt(`Abono de la venta ${id}. Saldo ${dinero(v.saldo)}:`);
        if (texto === null) return;
        if (!texto.trim()) throw new Error('Ingrese el importe.');
        await enviar(`/sales/${id}/payments`, 'POST', { importe: Number(texto) });
        await cargar();
    });
    globalThis.MicroCarmitaVentas = {
        cargar,
        cancelarEdicion() {
            if (ocupado || pendiente) return alert('Confirme primero la operación pendiente reintentándola.');
            edicion = null; carrito = []; el('ventaPrecio').readOnly = true; mostrarCarrito();
        },
        detalle: id => operar(async () => {
            const v = await api(`/sales/${id}`);
            el('historialCobros').textContent = `Venta ${v.id} · ${v.estado}\n` + v.detalles.map(l => `${l.nombre}: ${l.cantidad} × ${dinero(l.precio)} · Lotes ${l.asignaciones.map(a => `${a.loteId}: ${a.cantidad}`).join(', ')} · Faltante ${l.sin_existencia}`).join('\n')
                + '\n' + v.historial.map(h => `${h.creado_en} · ${h.responsable} · ${h.accion} · ${h.motivo}`).join('\n')
                + '\nCaja\n' + v.caja.map(c => `${c.creado_en} · ${c.tipo} · ${dinero(c.importe)}`).join('\n');
        }),
        cliente: id => operar(async () => {
            const r = await api(`/customers/${id}/receivables`);
            el('historialCobros').textContent = `Cliente ${id} · Deuda ${dinero(r.totalAdeudado)} · Abonos ${dinero(r.abonado)} · Saldo ${dinero(r.saldo)}\n`
                + r.ventas.map(v => `Venta ${v.id} · ${v.estado} · Total ${dinero(v.total)} · Saldo ${dinero(v.saldo)}\n`
                    + v.abonos.map(a => `${a.creado_en} · ${a.responsable} · Abono ${dinero(a.importe)}`).join('\n')
                    + '\n' + v.caja.filter(c => Number(c.importe) < 0).map(c => `${c.creado_en} · Devolución ${dinero(-Number(c.importe))}`).join('\n')).join('\n');
        }),
        editar: id => operar(async () => {
            if (!admin() || pendiente) return;
            const v = await api(`/sales/${id}`);
            const razon = prompt('Motivo de la modificación:');
            if (!razon?.trim()) return;
            const confirmarReembolso = confirm('Si disminuye el efectivo cobrado, ¿confirma el reembolso de la diferencia?');
            edicion = { id, version: v.version, motivo: razon, confirmarReembolso };
            carrito = v.detalles.map(l => ({ id: l.producto_id, nombre: l.nombre, cantidad: l.cantidad, precio: Number(l.precio),
                confirmarExistencia: !!l.existencia_confirmada, caducidadFisica: l.caducidad_fisica }));
            el('ventaCliente').value = v.cliente_id === null ? '' : String(v.cliente_id); el('ventaTipo').value = v.tipo;
            el('ventaPrecio').readOnly = false;
            mostrarCarrito(); mostrarSeccion('ventas');
            el('estadoVentas').textContent = `Modificando venta ${id}: quite o agregue líneas y registre para guardar.`;
        }),
        anular: id => operar(async () => {
            if (!admin()) return;
            const v = ventas.find(v => v.id === id);
            if (!v || !confirm(`¿Anular la venta ${id} y devolver las unidades al inventario?`)) return;
            const razon = prompt('Motivo de anulación:'); if (!razon?.trim()) return;
            const confirmarReembolso = confirm('¿Confirma la devolución de todo el efectivo cobrado por esta venta?');
            await enviar(`/sales/${id}/void`, 'POST', { motivo: razon, version: v.version, confirmarReembolso });
            await MicroCarmitaInventario.cargar(); await cargar();
        })
    };
    document.addEventListener('microcarmita:sesion', () => {
        ventas = []; clientes = []; carrito = []; edicion = null; pendiente = null;
        el('historialCobros').textContent = ''; pintar(); mostrarCarrito();
        if (usuarioActual()) cargar();
    });
})();
