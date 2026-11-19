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
    const fechaLegible = MicroCarmitaFechas.instante;
    const tabla = (titulos, filas) => '<div class="tabla-scroll"><table><thead><tr>' + titulos.map(t => '<th scope="col">' + textoSeguro(t) + '</th>').join('')
        + '</tr></thead><tbody>' + (filas.length ? filas.map(f => '<tr>' + f.map(c => '<td>' + textoSeguro(c) + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + titulos.length + '">Sin registros.</td></tr>') + '</tbody></table></div>';
    const admin = () => usuarioActual()?.rol === 'administrador';
    let ventas = [], clientes = [], edicion = null, ocupado = false, pendiente = null;
    let consulta = 0, consultaClientes = 0;
    // Presentación derivada del bloqueo existente; no mantiene otro carrito/operación.
    function controles() {
        for (const boton of document.querySelectorAll?.('#ventas [data-ventas-control]') || []) {
            boton.disabled = ocupado || !usuarioActual();
            if (ocupado) boton.setAttribute('aria-busy', 'true');
            else boton.removeAttribute('aria-busy');
        }
    }
    function informar(tipo, mensaje, destino = 'estadoVentas') {
        el(destino).textContent = mensaje;
        el(destino).setAttribute?.('data-estado', tipo);
        if (tipo === 'error') el(destino).scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    }
    const obtenerAnterior = obtenerDatos, guardarAnterior = guardarDatos;
    obtenerDatos = clave => clave === 'ventas' ? ventas.filter(v => v.estado === 'Activa')
        : clave === 'cuentas' ? ventas.filter(v => v.tipo === 'fiado' && v.estado === 'Activa') : obtenerAnterior(clave);
    guardarDatos = (clave, datos) => {
        if (['ventas','cuentas'].includes(clave)) throw new Error('Ventas y cobros se guardan mediante la API.');
        return guardarAnterior(clave, datos);
    };
    function pintar() {
        el('listaVentas').innerHTML = ventas.map(v => `<tr><td>${textoSeguro(v.cliente || 'Consumidor final')}</td>
            <td>Venta ${v.id}</td><td><span class="estado ${v.estado === 'Anulada' ? 'estado-agotado' : 'estado-disponible'}">${textoSeguro(v.estado)}</span></td><td class="venta-importe">${dinero(v.total)}</td>
            <td><span class="venta-tipo ${v.tipo === 'fiado' ? 'venta-tipo--fiado' : 'venta-tipo--contado'}">${textoSeguro(v.tipo)}</span></td><td><span class="venta-fecha">${textoSeguro(fechaLegible(v.creado_en))}</span>
            <div class="venta-acciones"><button data-ventas-control onclick="MicroCarmitaVentas.detalle(${v.id})">Detalle</button>
            ${admin() && v.estado === 'Activa' ? `<button data-ventas-control onclick="MicroCarmitaVentas.editar(${v.id})">Modificar</button>
            <button class="venta-anular" data-ventas-control onclick="MicroCarmitaVentas.anular(${v.id})">Anular</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6">No hay ventas registradas.</td></tr>';
        controles();
        const fiados = ventas.filter(v => v.tipo === 'fiado' && v.estado === 'Activa' && Number(v.saldo) > 0);
        el('listaCuentas').innerHTML = fiados.map(v => `<tr><td>${textoSeguro(v.cliente)}</td><td>Venta ${v.id}</td>
            <td>Total ${dinero(v.total)} · Abonos ${dinero(v.abonado)} · Saldo ${dinero(v.saldo)}</td>
            <td>${textoSeguro(fechaLegible(v.creado_en))}</td><td>${textoSeguro(v.estado === 'Anulada' ? 'Anulada' : Number(v.saldo) ? 'Pendiente' : 'Pagada')}</td>
            <td>${v.estado === 'Activa' && Number(v.saldo) > 0 ? `<button onclick="abonarCuenta(${v.id})">Registrar abono</button>` : ''}
            <button onclick="MicroCarmitaVentas.cliente(${v.cliente_id})">Historial del cliente</button></td></tr>`).join('') || '<tr><td colspan="6">No hay saldos pendientes. Consulte el historial para ver ventas pagadas o anuladas.</td></tr>';
        const saldo = ventas.filter(v => v.estado === 'Activa').reduce((s,v) => s + Number(v.saldo), 0);
        el('saldoPendiente').textContent = dinero(saldo);
        el('totalCobrar').textContent = dinero(saldo);
        el('totalVentas').textContent = dinero(ventas.filter(v => v.estado === 'Activa').reduce((s,v) => s + Number(v.total), 0));
        el('totalIngresos').textContent = dinero(ventas.reduce((s,v) => s + Number(v.efectivo || 0), 0));
        pintarClientes();
    }
    function pintarClientes() {
        el('listaClientes').textContent = clientes.map(c => `${etiquetaCliente(c)}${!nombreRepetido(c) && c.telefono ? ' — ' + c.telefono : ''}`).join('\n') || 'Sin clientes.';
        const seleccionado = el('ventaCliente').value;
        el('ventaCliente').innerHTML = '<option value="">Consumidor final (solo contado)</option>' + clientes.map(c => `<option value="${c.id}">${textoSeguro(etiquetaCliente(c))}</option>`).join('');
        if (clientes.some(c => String(c.id) === seleccionado)) el('ventaCliente').value = seleccionado;
        const historialSeleccionado = el('cuentasCliente').value;
        el('cuentasCliente').innerHTML = '<option value="">Seleccione cliente</option>' + clientes.map(c => `<option value="${c.id}">${textoSeguro(etiquetaCliente(c))}</option>`).join('');
        if (clientes.some(c => String(c.id) === historialSeleccionado)) el('cuentasCliente').value = historialSeleccionado;
    }
    const nombreRepetido = c => clientes.filter(p => p.nombre?.trim().toLocaleLowerCase('es-EC') === c.nombre?.trim().toLocaleLowerCase('es-EC')).length > 1;
    function etiquetaCliente(c) {
        if (!nombreRepetido(c)) return c.nombre;
        const contexto = [c.identificacion && `Identificación: ${c.identificacion}`, c.telefono && `Tel.: ${c.telefono}`, c.direccion && c.direccion].filter(Boolean).join(' · ');
        return `${c.nombre} — ${contexto || 'Sin datos de contacto distintivos'}`;
    }
    async function cargar() {
        const identidad = usuarioActual();
        if (!identidad) return;
        const numero = ++consulta;
        const numeroClientes = ++consultaClientes;
        if (!ocupado) informar('cargando', 'Consultando ventas y clientes…');
        try {
            const [v,c] = await Promise.all([api('/sales'), api('/clientes')]);
            if (usuarioActual() !== identidad || numero !== consulta) return;
            ventas = v.ventas;
            if (numeroClientes === consultaClientes) clientes = c.registros;
            pintar();
            if (!ocupado) informar('neutro', 'Ventas y clientes actualizados.');
            return true;
        } catch (error) {
            if (usuarioActual() !== identidad || numero !== consulta) return;
            ventas = []; if (numeroClientes === consultaClientes) clientes = []; pintar();
            informar('error', `${error.message} No se pudieron actualizar las ventas. Reintente con Actualizar ventas y cuentas.`);
            return false;
        }
    }
    async function operar(fn, destino = 'estadoVentas') {
        if (ocupado || !usuarioActual()) return;
        const identidad = usuarioActual();
        ocupado = true;
        controles(); informar('cargando', 'Procesando operación…', destino);
        try { await fn(); }
        catch (error) { if (usuarioActual() === identidad) informar('error', error.message, destino); }
        finally {
            ocupado = false;
            if (usuarioActual() === identidad) {
                if (el(destino).textContent === 'Procesando operación…') informar('neutro', '', destino);
            }
            controles();
        }
    }
    async function cargarClientes() {
        const identidad = usuarioActual(), numero = ++consultaClientes;
        try {
            const r = await api('/clientes');
            if (usuarioActual() !== identidad || numero !== consultaClientes) return;
            clientes = r.registros; pintarClientes(); return true;
        } catch (error) {
            if (usuarioActual() !== identidad || numero !== consultaClientes) return;
            informar('error', error.message, 'estadoClientes'); return false;
        }
    }
    function registrarCliente() { return operar(async () => {
        const identidad = usuarioActual(), seleccion = el('ventaCliente').value;
        if (!exigirPermiso('ventas')) return;
        const campos = ['Nombre', 'Identificacion', 'Telefono', 'Direccion'];
        const valores = campos.map(c => el(`clientes${c}`).value);
        let respuesta;
        try { respuesta = await api('/clientes', 'POST', Object.fromEntries(campos.map((c,i) => [c.toLowerCase(), valores[i]]))); }
        catch (error) {
            if (!error.status || error.status >= 500) error.message += ' Si la respuesta se perdió, consulte la lista antes de repetir el registro.';
            throw error;
        }
        consultaClientes++; // Invalida lecturas iniciadas antes del registro.
        const registro = respuesta.registro, identificado = Number.isSafeInteger(registro?.id) && registro.id > 0;
        for (const [i,c] of campos.entries()) if (el(`clientes${c}`).value === valores[i]) el(`clientes${c}`).value = '';
        const actualizado = await cargarClientes();
        if (usuarioActual() !== identidad) return;
        if (identificado && !clientes.some(c => c.id === registro.id)) { clientes.push(registro); pintarClientes(); }
        if (identificado && el('ventaCliente').value === seleccion) el('ventaCliente').value = String(registro.id);
        informar(actualizado === false ? 'error' : 'exito', actualizado === false
            ? 'Cliente registrado. No vuelva a registrarlo; use Actualizar ventas y cuentas para consultar la lista.'
            : identificado ? 'Cliente registrado correctamente.' : 'Cliente registrado. Selecciónelo en la lista de clientes.', 'estadoClientes');
    }, 'estadoClientes'); }
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
        const identidad = usuarioActual(), modificando = Boolean(edicion);
        if (!exigirPermiso('ventas') || !carrito.length) throw new Error('Agregue productos al carrito.');
        const datos = { tipo: el('ventaTipo').value, clienteId: el('ventaCliente').value ? Number(el('ventaCliente').value) : null,
            detalles: carrito.map(l => ({ productoId: Number(l.id), cantidad: l.cantidad, precio: l.precio, confirmarExistencia: !!l.confirmarExistencia,
                ...(l.caducidadFisica !== undefined ? { caducidadFisica: l.caducidadFisica } : {}) })) };
        if (edicion) Object.assign(datos, { version: edicion.version, motivo: edicion.motivo, confirmarReembolso: edicion.confirmarReembolso });
        await enviar(edicion ? `/sales/${edicion.id}` : '/sales', edicion ? 'PATCH' : 'POST', datos);
        carrito = []; edicion = null; el('ventaPrecio').readOnly = true; mostrarCarrito();
        await MicroCarmitaInventario.cargar();
        const actualizado = await cargar();
        if (usuarioActual() === identidad && actualizado === true) informar('exito', modificando ? 'Venta modificada correctamente.' : 'Venta registrada correctamente.');
        else if (usuarioActual() === identidad && actualizado === false) informar('error', 'La venta fue guardada, pero no se pudo actualizar la consulta. No vuelva a registrarla; use Actualizar ventas y cuentas.');
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
        nombreCliente: id => { const c = clientes.find(c => Number(c.id) === Number(id)); return c ? etiquetaCliente(c) : undefined; },
        registrarCliente,
        nuevoCliente() {
            if (!exigirPermiso('ventas')) return;
            el('clientesNombre').scrollIntoView?.({ block:'center', behavior:'auto' });
            el('clientesNombre').focus?.({ preventScroll:true });
        },
        cancelarEdicion() {
            if (ocupado || pendiente) return alert('Confirme primero la operación pendiente reintentándola.');
            edicion = null; carrito = []; el('ventaPrecio').readOnly = true; mostrarCarrito();
        },
        detalle: id => operar(async () => {
            const v = await api(`/sales/${id}`);
            el('historialVentas').innerHTML = '<h3>Venta ' + Number(v.id) + ' · ' + textoSeguro(v.estado) + '</h3>'
                + '<p>Total de la venta: <strong>' + textoSeguro(dinero(v.total)) + '</strong> · Saldo: <strong>' + textoSeguro(dinero(v.saldo)) + '</strong></p>'
                + '<h4>Productos y lotes</h4>' + tabla(['Producto', 'Cantidad', 'Precio', 'Lotes descontados', 'Faltante'], v.detalles.map(l => [l.nombre, l.cantidad, dinero(l.precio),
                    (l.asignaciones || []).map(a => 'Lote ' + (a.codigo || MicroCarmitaInventario.codigoLote?.(a.loteId) || a.loteId) + ': ' + a.cantidad).join(', ') || 'Sin asignaciones', l.sin_existencia || 0]))
                + '<h4>Historial de cambios</h4>' + tabla(['Fecha', 'Responsable', 'Acción', 'Motivo'], v.historial.map(h => [fechaLegible(h.creado_en), h.responsable, h.accion, h.motivo]))
                + '<h4>Movimientos de caja</h4>' + tabla(['Fecha', 'Concepto', 'Importe'], v.caja.map(c => [fechaLegible(c.creado_en), c.tipo, dinero(c.importe)]));
            el('historialVentas').hidden = false;
            el('historialVentas').scrollIntoView?.({ block: 'start', behavior: 'auto' });
        }),
        cliente: id => operar(async () => {
            const r = await api(`/customers/${id}/receivables`);
            const cliente = clientes.find(c => Number(c.id) === Number(id));
            el('historialCobros').innerHTML = '<h3>Historial del cliente' + (cliente ? ': ' + textoSeguro(etiquetaCliente(cliente)) : '') + '</h3>'
                + '<p>Deuda vigente: <strong>' + textoSeguro(dinero(r.totalAdeudado)) + '</strong> · Abonos: <strong>' + textoSeguro(dinero(r.abonado))
                + '</strong> · Saldo: <strong>' + textoSeguro(dinero(r.saldo)) + '</strong></p>'
                + r.ventas.map(v => '<section class="historial-venta"><h4>Venta ' + Number(v.id) + ' · ' + textoSeguro(v.estado) + '</h4>'
                    + '<p>Total: ' + textoSeguro(dinero(v.total)) + ' · Saldo: ' + textoSeguro(dinero(v.saldo)) + '</p>'
                    + tabla(['Fecha', 'Responsable', 'Abono'], v.abonos.map(a => [fechaLegible(a.creado_en), a.responsable, dinero(a.importe)]))
                    + tabla(['Fecha', 'Devolución'], v.caja.filter(c => Number(c.importe) < 0).map(c => [fechaLegible(c.creado_en), dinero(-Number(c.importe))])) + '</section>').join('');
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
            informar('neutro', `Modificando venta ${id}: quite o agregue líneas y registre para guardar.`);
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
        consulta++;
        consultaClientes++;
        informar('neutro', '', 'estadoClientes');
        ventas = []; clientes = []; carrito = []; edicion = null; pendiente = null;
        informar('neutro', '');
        el('historialCobros').innerHTML = ''; el('historialVentas').innerHTML = ''; el('historialVentas').hidden = true; pintar(); mostrarCarrito();
        if (usuarioActual()) cargar();
    });
})();
