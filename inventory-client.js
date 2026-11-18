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
    const opcion = p => `<option value="${Number(p.id)}">${textoSeguro(p.nombre)}</option>`;
    function opciones(id, items) {
        const select = elemento(id);
        const actual = select.value;
        select.innerHTML = '<option value="">Seleccione</option>' + items.map(opcion).join('');
        if (items.some(item => String(item.id) === actual)) select.value = actual;
    }
    function pintar() {
        elemento('listaInventario').innerHTML = productos.map(p => `<tr>
            <td>${textoSeguro(p.nombre)}${p.activo ? '' : ' (archivado)'}</td><td>${textoSeguro(p.categoria)}</td>
            <td>Compra ${dinero(p.precio_compra)} / Venta ${dinero(p.precio_venta)}</td><td>${p.stock}</td>
            <td>${p.stockBajo ? 'Stock bajo' : 'Disponible'}</td>
            <td><button onclick="MicroCarmitaInventario.historial(${p.id})">Historial</button>
            ${administrador() ? `<button onclick="editarProducto(${p.id})">Editar</button>
            <button onclick="eliminarProducto(${p.id})">Archivar</button>` : 'Solo consulta'}</td></tr>`).join('');
        elemento('listaLotes').innerHTML = productos.flatMap(p => p.lotes.map(l => `<tr>
            <td>${textoSeguro(p.nombre)}</td><td>${textoSeguro(l.codigo)}</td><td>${l.cantidad}</td>
            <td>${textoSeguro(MicroCarmitaFechas.calendario(l.fecha_ingreso))}</td><td>${textoSeguro(l.caducidad ? MicroCarmitaFechas.calendario(l.caducidad) : 'Sin caducidad')}</td><td>${textoSeguro(l.estado)}</td></tr>`)).join('');
        const alertas = productos.flatMap(p => [
            ...(p.stockBajo ? [`${p.nombre}: stock bajo (${p.stock})`] : []),
            ...p.lotes.filter(l => l.cantidad > 0 && ['Por caducar', 'Caducado'].includes(l.estado))
                .map(l => `${p.nombre}, lote ${l.codigo}: ${l.estado} (${MicroCarmitaFechas.calendario(l.caducidad)})`)
        ]);
        elemento('alertasInventario').textContent = alertas.join(' · ') || 'Sin alertas de inventario.';
        for (const id of ['productoProveedor', 'entradaProveedor']) opciones(id, proveedores);
        for (const id of ['entradaProducto', 'ajusteProducto']) opciones(id, productos.filter(p => p.activo));
        document.querySelectorAll('[data-inventario-admin]').forEach(nodo => { nodo.hidden = !administrador(); });
        const formulario = elemento('formularioProducto');
        formulario.hidden = !administrador();
        cargarProductosVenta();
        actualizarInicio();
    }
    async function cargar() {
        if (!usuarioActual()) return;
        if (cargando) return cargando;
        const identidad = usuarioActual();
        cargando = (async () => {
            try {
                const [inventario, prov, cli] = await Promise.all([api('/inventory'), api('/proveedores'), api('/clientes')]);
                if (usuarioActual() !== identidad) return;
                productos = inventario.productos;
                proveedores = prov.registros;
                elemento('listaClientes').textContent = cli.registros.map(c => `${c.id} — ${c.nombre}${c.telefono ? ' — ' + c.telefono : ''}`).join('\n') || 'Sin clientes.';
                elemento('listaProveedores').textContent = proveedores.map(p => `${p.id} — ${p.nombre}${p.telefono ? ' — ' + p.telefono : ''}`).join('\n') || 'Sin proveedores.';
                pintar();
                elemento('estadoInventario').textContent = '';
            } catch (error) {
                if (usuarioActual() !== identidad) return;
                productos = [];
                elemento('listaInventario').textContent = '';
                elemento('listaLotes').textContent = '';
                elemento('alertasInventario').textContent = '';
                cargarProductosVenta();
                actualizarInicio();
                elemento('estadoInventario').textContent = `${error.message} Compruebe que la migración 002 esté aplicada.`;
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
        elemento('estadoInventario').textContent = 'Procesando…';
        try { await fn(); if (usuarioActual() === identidad) await cargar(); }
        catch (error) { if (usuarioActual() === identidad) elemento('estadoInventario').textContent = error.message
            + (!error.status ? ' Si la respuesta se perdió, compruebe el historial antes de repetir una escritura.' : ''); }
        finally { if (operacionActiva === token) operacionActiva = null; }
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
        const proveedor = prompt('ID del proveedor (consulte el catálogo):', p.proveedor_id);
        if (proveedor === null) return;
        if ([compra, venta, proveedor].some(v => !v.trim())) throw new Error('Complete precios y proveedor.');
        await api(`/products/${id}`, 'PATCH', { nombre, categoria, precioCompra: Number(compra), precioVenta: Number(venta), proveedorId: Number(proveedor), activo: true });
    });
    eliminarProducto = id => operar(async () => {
        const p = productos.find(item => item.id === id);
        if (!p || !confirm(`Archivar ${p.nombre}, conservando sus lotes e historial?`)) return;
        await api(`/products/${id}`, 'PATCH', { nombre: p.nombre, categoria: p.categoria,
            precioCompra: p.precio_compra, precioVenta: p.precio_venta, proveedorId: p.proveedor_id, activo: false });
    });
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
        contacto: tipo => operar(() => api(`/${tipo}`, 'POST', {
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
        elemento('listaClientes').textContent = '';
        elemento('listaProveedores').textContent = '';
        elemento('historialInventario').textContent = '';
        elemento('alertasInventario').textContent = '';
        if (usuarioActual()) cargar();
    });
})();
