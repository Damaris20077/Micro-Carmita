/* Inventario remoto. localStorage se conserva únicamente para las funciones históricas restantes. */
(() => {
    'use strict';
    const api = async (...args) => {
        const identidad = usuarioActual();
        const respuesta = await MicroCarmitaAuth.api(...args);
        if (usuarioActual() !== identidad) throw new Error('La sesión cambió durante la operación.');
        return respuesta;
    };
    let productos = [];
    let proveedores = [];
    let cargando;
    let operacionActiva;
    let lotePendiente;
    const datosLocales = obtenerDatos;
    const guardarLocal = guardarDatos;
    obtenerDatos = clave => clave === 'inventario'
        ? (usuarioActual() ? productos.filter(p => p.activo).map(p => ({ ...p, precio: p.precio_venta, cantidad: p.stock })) : [])
        : datosLocales(clave);
    guardarDatos = (clave, datos) => {
        if (clave === 'inventario') throw new Error('El inventario se guarda mediante la API.');
        return guardarLocal(clave, datos);
    };
    const elemento = id => document.getElementById(id);
    const valor = id => elemento(id).value;
    const numero = id => valor(id).trim() === '' ? NaN : Number(valor(id));
    const administrador = () => usuarioActual()?.rol === 'administrador';
    function informar(tipo, mensaje) {
        const estado = elemento('estadoInventario');
        estado.textContent = mensaje; estado.setAttribute?.('data-estado', tipo);
        if (tipo === 'error') { estado.focus?.({ preventScroll: true }); estado.scrollIntoView?.({ block: 'nearest' }); }
    }
    function controles() {
        const ocupado = !!operacionActiva && operacionActiva.identidad === usuarioActual();
        for (const boton of document.querySelectorAll('[data-inventario-control]')) {
            boton.disabled = ocupado || !usuarioActual();
            if (ocupado) boton.setAttribute?.('aria-busy', 'true'); else boton.removeAttribute?.('aria-busy');
        }
    }
    function etiquetaProveedor(p, lista = proveedores) {
        const repetido = lista.filter(c => c.nombre?.trim().toLocaleLowerCase('es-EC') === p.nombre?.trim().toLocaleLowerCase('es-EC')).length > 1;
        if (!repetido) return p.nombre;
        const contexto = [p.identificacion && `Identificación: ${p.identificacion}`, p.telefono && `Tel.: ${p.telefono}`, p.direccion && p.direccion].filter(Boolean).join(' · ');
        return `${p.nombre} — ${contexto || 'Sin datos de contacto distintivos'}`;
    }
    const opcion = (p, etiqueta) => `<option value="${Number(p.id)}">${textoSeguro(etiqueta)}</option>`;
    function opciones(id, items, etiqueta = p => p.nombre) {
        const select = elemento(id);
        const actual = select.value;
        select.innerHTML = '<option value="">Seleccione</option>' + items.map(p => opcion(p, etiqueta(p))).join('');
        if (items.some(item => String(item.id) === actual)) select.value = actual;
    }
    function pintar() {
        elemento('listaInventario').innerHTML = productos.map(p => `<tr>
            <td>${textoSeguro(p.nombre)}${p.activo ? '' : ' (archivado)'}</td><td>${textoSeguro(p.categoria)}</td>
            <td>Compra ${dinero(p.precio_compra)} / Venta ${dinero(p.precio_venta)}</td><td>${p.stock}</td>
            <td><span class="estado ${!p.activo ? 'estado-agotado' : p.stockBajo ? 'estado-pendiente' : 'estado-disponible'}">${!p.activo ? 'Archivado' : p.stockBajo ? 'Stock bajo' : 'Disponible'}</span></td>
            <td><div class="acciones-fila"><button class="btn secundaria" data-inventario-control onclick="MicroCarmitaInventario.historial(${p.id})">Historial</button>
            ${administrador() ? `<button class="btn secundaria" data-inventario-control onclick="editarProducto(${p.id})">Editar</button>
            ${p.activo ? `<button class="btn peligro" data-inventario-control onclick="eliminarProducto(${p.id})">Archivar</button>`
                : `<button class="btn secundaria" data-inventario-control onclick="MicroCarmitaInventario.reactivar(${p.id})">Reactivar</button>`}` : 'Solo consulta'}</div></td></tr>`).join('') || '<tr><td colspan="6">No hay productos registrados.</td></tr>';
        elemento('listaLotes').innerHTML = productos.flatMap(p => p.lotes.map(l => `<tr>
            <td>${textoSeguro(p.nombre)}</td><td>${textoSeguro(l.codigo)}</td><td>${l.cantidad}</td>
            <td>${textoSeguro(MicroCarmitaFechas.calendario(l.fecha_ingreso))}</td><td>${textoSeguro(l.caducidad ? MicroCarmitaFechas.calendario(l.caducidad) : 'Sin caducidad')}</td><td><span class="estado ${l.estado === 'Caducado' ? 'estado-agotado' : l.estado === 'Por caducar' ? 'estado-pendiente' : 'estado-disponible'}">${textoSeguro(l.estado)}</span></td></tr>`)).join('') || '<tr><td colspan="6">No hay lotes registrados.</td></tr>';
        const alertas = productos.flatMap(p => [
            ...(p.stockBajo ? [`${p.nombre}: stock bajo (${p.stock})`] : []),
            ...p.lotes.filter(l => l.cantidad > 0 && ['Por caducar', 'Caducado'].includes(l.estado))
                .map(l => `${p.nombre}, lote ${l.codigo}: ${l.estado} (${MicroCarmitaFechas.calendario(l.caducidad)})`)
        ]);
        elemento('alertasInventario').textContent = alertas.join('\n') || 'Sin alertas de inventario.';
        elemento('alertasInventario').setAttribute?.('data-estado', alertas.length ? 'aviso' : 'neutro');
        for (const id of ['productoProveedor', 'entradaProveedor']) opciones(id, proveedores, etiquetaProveedor);
        for (const id of ['entradaProducto', 'ajusteProducto']) opciones(id, productos.filter(p => p.activo));
        document.querySelectorAll('[data-inventario-admin]').forEach(nodo => { nodo.hidden = !administrador(); });
        const formulario = elemento('formularioProducto');
        formulario.hidden = !administrador();
        controles();
        cargarProductosVenta();
        actualizarInicio();
    }
    async function cargar() {
        if (!usuarioActual()) return;
        if (cargando) return cargando;
        const identidad = usuarioActual();
        informar('cargando', 'Consultando inventario y contactos…');
        cargando = (async () => {
            try {
                const [inventario, prov] = await Promise.all([api('/inventory'), api('/proveedores')]);
                if (usuarioActual() !== identidad) return;
                productos = inventario.productos;
                proveedores = prov.registros;
                elemento('listaProveedores').textContent = proveedores.map(p => `${etiquetaProveedor(p)}${p.telefono && etiquetaProveedor(p) === p.nombre ? ' — ' + p.telefono : ''}`).join('\n') || 'Sin proveedores.';
                pintar();
                informar('exito', 'Inventario y contactos actualizados.');
                return true;
            } catch (error) {
                if (usuarioActual() !== identidad) return;
                productos = [];
                elemento('listaInventario').textContent = '';
                elemento('listaLotes').textContent = '';
                elemento('alertasInventario').textContent = '';
                cargarProductosVenta();
                actualizarInicio();
                informar('error', `${error.message} Compruebe que la migración 002 esté aplicada.`);
                return false;
            } finally {
                cargando = null;
                if (usuarioActual() && usuarioActual() !== identidad) cargar();
            }
        })();
        return cargando;
    }
    async function operar(fn) {
        const identidad = usuarioActual();
        if (!identidad || operacionActiva?.identidad === identidad) return;
        const token = { identidad }; operacionActiva = token;
        controles(); informar('cargando', 'Procesando…');
        try {
            const mensaje = await fn();
            if (usuarioActual() === identidad) {
                // Una consulta iniciada antes de la escritura no confirma su resultado.
                if (cargando) await cargando;
                if (usuarioActual() !== identidad) return;
                const actualizado = await cargar();
                if (typeof mensaje === 'string' && usuarioActual() === identidad) informar(actualizado === false ? 'error' : 'exito',
                    mensaje + (actualizado === false ? ' No se pudo actualizar la lista. No repita la operación; vuelva a consultar el inventario.' : ''));
            }
        }
        catch (error) { if (usuarioActual() === identidad) informar('error', error.message
            + (!error.status ? ' Si la respuesta se perdió, compruebe el historial antes de repetir una escritura.' : '')); }
        finally { if (operacionActiva === token) operacionActiva = null; controles(); }
    }
    function loteFormulario(prefijo) {
        return { codigo: valor(`${prefijo}Codigo`), cantidad: numero(`${prefijo}Cantidad`),
            proveedorId: numero(`${prefijo}Proveedor`), precioCompra: numero(`${prefijo}Compra`),
            fechaIngreso: valor(`${prefijo}Fecha`), caducidad: valor(`${prefijo}Caducidad`) };
    }
    async function enviarLote(ruta, datos) {
        const firma = JSON.stringify([ruta, datos]);
        if (lotePendiente && lotePendiente.firma !== firma) throw new Error('Hay un lote sin confirmar. Reintente con los mismos datos antes de iniciar otro.');
        if (!lotePendiente) lotePendiente = { firma, clave: crypto.randomUUID() };
        const actual = lotePendiente;
        try {
            const resultado = await api(ruta, 'POST', { ...datos, clave: actual.clave });
            if (lotePendiente === actual) lotePendiente = null;
            return resultado;
        } catch (error) {
            if (error.status >= 400 && error.status < 500 && lotePendiente === actual) lotePendiente = null;
            throw error;
        }
    }
    agregarProducto = () => operar(() => enviarLote('/products', {
        ...loteFormulario('producto'), nombre: valor('productoNombre'), categoria: valor('productoCategoria'), precioVenta: numero('productoPrecio')
    }));
    editarProducto = id => operar(async () => {
        const p = productos.find(item => item.id === id);
        if (!p) return;
        const nombre = prompt('Nombre del producto:', p.nombre);
        if (nombre === null) return;
        const categoria = prompt('Categoría:', p.categoria);
        if (categoria === null) return;
        const compra = prompt('Precio de compra:', p.precio_compra);
        if (compra === null) return;
        const venta = prompt('Precio de venta:', p.precio_venta);
        if (venta === null) return;
        const proveedor = prompt('ID del proveedor para esta edición:\n' + proveedores.map(p => `${p.id}: ${etiquetaProveedor(p)}`).join('\n') + '\nConserve el número actual si no desea cambiarlo.', p.proveedor_id);
        if (proveedor === null) return;
        if ([compra, venta, proveedor].some(v => !v.trim())) throw new Error('Complete precios y proveedor.');
        await api(`/products/${id}`, 'PATCH', { nombre, categoria, precioCompra: Number(compra), precioVenta: Number(venta), proveedorId: Number(proveedor), activo: Boolean(p.activo) });
    });
    function cambiarArchivo(id, activo) { return operar(async () => {
        if (!administrador()) throw new Error('Solo el Administrador puede archivar o reactivar productos.');
        const p = productos.find(item => item.id === id);
        if (!p || Boolean(p.activo) === activo) return;
        if (!activo && Number(p.stock) !== 0) throw new Error(`No se puede archivar ${p.nombre}: las existencias deben ser cero (stock actual: ${p.stock}). Revise sus existencias y movimientos. No se modificó el producto.`);
        if (!confirm(`${activo ? 'Reactivar' : 'Archivar'} ${p.nombre}, conservando sus lotes, historial y registros relacionados?`)) return;
        await api(`/products/${id}`, 'PATCH', { nombre: p.nombre, categoria: p.categoria,
            precioCompra: Number(p.precio_compra), precioVenta: Number(p.precio_venta), proveedorId: Number(p.proveedor_id), activo });
        return `Producto ${activo ? 'reactivado' : 'archivado'} correctamente. Se conservan sus lotes, historial y registros relacionados.`;
    }); }
    eliminarProducto = id => cambiarArchivo(id, false); // Compatibilidad del evento; nunca elimina.
    mostrarInventario = cargar;
    // La venta local escribiría un inventario independiente del servidor.
    registrarVenta = () => alert('El registro de ventas requiere la siguiente fase de integración con el inventario remoto. El carrito y el historial se conservan.');
    function lotesAjuste() {
        const p = productos.find(item => item.id === numero('ajusteProducto'));
        const select = elemento('ajusteLote');
        select.innerHTML = '<option value="">Seleccione para un ajuste positivo</option>'
            + (p?.lotes || []).map(l => `<option value="${l.id}">${textoSeguro(l.codigo)}</option>`).join('');
    }
    globalThis.MicroCarmitaInventario = {
        cargar, lotesAjuste,
        etiquetaProveedor,
        codigoLote: id => productos.flatMap(p => p.lotes).find(l => Number(l.id) === Number(id))?.codigo,
        reactivar: id => cambiarArchivo(id, true),
        exportarAnterior() {
            const contenido = localStorage.getItem('inventario') || '[]';
            const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.download = 'inventario-local-anterior.json';
            enlace.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        entrada: () => operar(() => enviarLote(`/products/${numero('entradaProducto')}/lots`, loteFormulario('entrada'))),
        ajustar: () => operar(() => {
            const datos = { cantidad: numero('ajusteCantidad'), motivo: valor('ajusteMotivo') };
            if (datos.cantidad > 0) datos.loteId = numero('ajusteLote');
            return api(`/products/${numero('ajusteProducto')}/adjustments`, 'POST', datos);
        }),
        contacto: tipo => tipo === 'clientes' ? globalThis.MicroCarmitaVentas.registrarCliente() : operar(() => api(`/${tipo}`, 'POST', {
            nombre: valor(`${tipo}Nombre`), identificacion: valor(`${tipo}Identificacion`),
            telefono: valor(`${tipo}Telefono`), direccion: valor(`${tipo}Direccion`)
        })),
        historial: id => operar(async () => {
            const datos = await api(`/products/${id}/history`);
            elemento('historialInventario').textContent = datos.movimientos.map(m =>
                `${MicroCarmitaFechas.instante(m.ocurrido_en)} | ${m.responsable} | ${m.tipo} ${m.cantidad} | ${m.stock_antes} → ${m.stock_despues} | ${m.motivo}`).join('\n') || 'Sin movimientos.';
        })
    };
    document.addEventListener('microcarmita:sesion', () => {
        productos = [];
        proveedores = [];
        lotePendiente = null;
        elemento('listaInventario').textContent = '';
        elemento('listaLotes').textContent = '';
        elemento('listaProveedores').textContent = '';
        elemento('historialInventario').textContent = 'Seleccione Historial en un producto para consultar sus movimientos.';
        elemento('alertasInventario').textContent = '';
        informar('neutro', ''); controles();
        if (usuarioActual()) cargar();
    });
})();
