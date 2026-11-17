(() => {
    'use strict';
    for (const rol of ['administrador', 'vendedor']) permisosPorRol[rol].push('pedidos');
    const api = (...args) => MicroCarmitaAuth.api(...args);
    const el = id => document.getElementById(id);
    const valor = id => el(id).value;
    const numero = id => valor(id).trim() ? Number(valor(id)) : NaN;
    const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    let detalles = [];
    let pedido;
    let envio;
    let ocupado = false;
    const admin = () => usuarioActual()?.rol === 'administrador';
    async function cargar() {
        if (!usuarioActual()) return;
        const identidad = usuarioActual();
        try {
            const [pedidos, proveedores, inventario] = await Promise.all([api('/orders'), api('/proveedores'), api('/inventory')]);
            if (usuarioActual() !== identidad) return;
            el('estadoPedidos').textContent = '';
            el('crearPedidoFormulario').hidden = !admin();
            const seleccionProveedor = valor('pedidoProveedor');
            el('pedidoProveedor').innerHTML = '<option value="">Seleccione</option>' + proveedores.registros
                .map(p => `<option value="${Number(p.id)}">${textoSeguro(p.nombre)}</option>`).join('');
            el('pedidoProveedor').value = seleccionProveedor;
            el('pedidoProducto').innerHTML = '<option value="">Seleccione</option>' + inventario.productos.filter(p => p.activo)
                .map(p => `<option value="${Number(p.id)}">${textoSeguro(p.nombre)}</option>`).join('');
            el('listaPedidos').innerHTML = pedidos.pedidos.map(p => `<tr>
                <td>${p.id}</td><td>${textoSeguro(p.proveedor)}</td><td>${textoSeguro(p.estado)}</td>
                <td><button onclick="MicroCarmitaPedidos.consultar(${Number(p.id)})">Ver y recibir</button>
                ${admin() && !['Cancelado', 'Recibido completo'].includes(p.estado) ? `<button onclick="MicroCarmitaPedidos.cancelar(${Number(p.id)})">Cancelar</button>` : ''}</td></tr>`).join('');
        } catch (error) { el('estadoPedidos').textContent = `${error.message} Compruebe la migración 003.`; }
    }
    function pintarDetalles() {
        el('pedidoDetalles').innerHTML = detalles.map((d, i) => `<tr><td>${d.productoId}</td><td>${d.cantidad}</td>
            <td>${dinero(d.precioCompra)}</td><td><button onclick="MicroCarmitaPedidos.quitar(${i})">Quitar</button></td></tr>`).join('');
    }
    async function operar(fn) {
        if (ocupado) return;
        ocupado = true;
        el('estadoPedidos').textContent = 'Procesando…';
        try { await fn(); await cargar(); }
        catch (error) { el('estadoPedidos').textContent = error.message; }
        finally { ocupado = false; }
    }
    async function consultar(id) {
        const identidad = usuarioActual();
        try {
            const obtenido = await api(`/orders/${id}`);
            if (usuarioActual() !== identidad) return;
            pedido = obtenido;
            el('detallePedidoTitulo').textContent = `Pedido ${pedido.id} — ${pedido.estado}`;
            el('detallePedidoObservaciones').textContent = pedido.motivo_cancelacion || pedido.observaciones || '';
            el('recepcionDetalles').innerHTML = pedido.detalles.map(d => {
                const pendiente = d.cantidad - d.recibida;
                return `<tr><td>${textoSeguro(d.producto)}</td><td>${d.cantidad}</td><td>${d.recibida}</td><td>${pendiente}</td>
                    <td><input id="recCantidad${d.id}" type="number" min="0" max="${pendiente}" step="1" value="0" aria-label="Cantidad a recibir"></td>
                    <td><input id="recCodigo${d.id}" maxlength="60" aria-label="Código de lote"></td>
                    <td><input id="recFecha${d.id}" type="date" value="${hoy()}" aria-label="Fecha de ingreso"></td>
                    <td><input id="recCaducidad${d.id}" type="date" aria-label="Caducidad opcional"></td>
                    <td><input id="recPrecio${d.id}" type="number" min="0" step="0.01" value="${Number(d.precio_compra)}" aria-label="Precio de compra recibido"></td></tr>`;
            }).join('');
            el('recibirPedidoBoton').disabled = ['Cancelado', 'Recibido completo'].includes(pedido.estado);
            el('historialRecepciones').textContent = pedido.recepciones.map(r =>
                `Recepción ${r.id} · ${r.responsable} · lote ${r.codigo} · ${r.cantidad} unidades · ingreso ${r.fecha_ingreso} · caducidad ${r.caducidad || 'sin caducidad'}`).join('\n') || 'Sin recepciones.';
        } catch (error) { el('estadoPedidos').textContent = error.message; }
    }
    globalThis.MicroCarmitaPedidos = {
        cargar, consultar,
        agregar() {
            const d = { productoId: numero('pedidoProducto'), cantidad: numero('pedidoCantidad'), precioCompra: numero('pedidoPrecio') };
            if (!Number.isInteger(d.productoId) || d.productoId < 1 || !Number.isInteger(d.cantidad) || d.cantidad < 1
                || !Number.isFinite(d.precioCompra) || d.precioCompra < 0) {
                el('estadoPedidos').textContent = 'Seleccione producto, cantidad entera positiva y precio de compra.';
                return;
            }
            if (detalles.some(item => item.productoId === d.productoId)) {
                el('estadoPedidos').textContent = 'El producto ya está en el pedido.'; return;
            }
            detalles.push(d); pintarDetalles();
        },
        quitar(i) { detalles.splice(i, 1); pintarDetalles(); },
        crear: () => operar(async () => {
            const resultado = await api('/orders', 'POST', { proveedorId: numero('pedidoProveedor'), observaciones: valor('pedidoObservaciones'), detalles });
            detalles = []; pintarDetalles();
            await consultar(resultado.id);
        }),
        cancelar: id => operar(async () => {
            const motivo = prompt('Motivo obligatorio de cancelación. Las unidades ya recibidas se conservan.');
            if (motivo === null) return;
            await api(`/orders/${id}/cancel`, 'POST', { motivo });
            if (pedido?.id === id) await consultar(id);
        }),
        recibir: () => operar(async () => {
            if (!pedido) throw new Error('Seleccione un pedido.');
            const lineas = pedido.detalles.filter(d => valor(`recCantidad${d.id}`) !== '' && numero(`recCantidad${d.id}`) !== 0).map(d => ({
                detalleId: d.id, cantidad: numero(`recCantidad${d.id}`), codigo: valor(`recCodigo${d.id}`),
                fechaIngreso: valor(`recFecha${d.id}`), caducidad: valor(`recCaducidad${d.id}`), precioCompra: numero(`recPrecio${d.id}`)
            }));
            const firma = JSON.stringify({ pedido: pedido.id, lineas });
            if (envio?.firma !== firma) envio = { firma, clave: crypto.randomUUID() };
            await api(`/orders/${pedido.id}/receipts`, 'POST', { clave: envio.clave, lineas });
            envio = null;
            await consultar(pedido.id);
            await MicroCarmitaInventario.cargar();
        })
    };
    document.addEventListener('microcarmita:sesion', () => {
        detalles = []; pedido = null; envio = null;
        el('listaPedidos').textContent = ''; el('recepcionDetalles').textContent = '';
        el('historialRecepciones').textContent = ''; el('detallePedidoTitulo').textContent = '';
        el('detallePedidoObservaciones').textContent = ''; pintarDetalles();
        if (usuarioActual()) cargar();
    });
})();
