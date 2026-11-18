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
    let consultaDetalle = 0;
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
    function mensajeRecepcion(mensaje) {
        const estado = el('estadoRecepcion');
        estado.textContent = mensaje;
        estado.focus?.({ preventScroll: true });
        estado.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    }
    async function operar(fn, recepcion = false) {
        const identidad = usuarioActual();
        if (ocupado || !identidad) return;
        ocupado = true;
        el('estadoPedidos').textContent = 'Procesando…';
        if (recepcion) { el('recibirPedidoBoton').disabled = true; mensajeRecepcion('Registrando recepción…'); }
        try {
            const resultado = await fn();
            if (usuarioActual() !== identidad) return;
            await cargar();
            if (recepcion && usuarioActual() === identidad) mensajeRecepcion(resultado);
        } catch (error) {
            if (usuarioActual() !== identidad) return;
            el('estadoPedidos').textContent = error.message;
            if (recepcion) mensajeRecepcion(`No se pudo registrar la recepción: ${error.message}`);
        } finally {
            ocupado = false;
            if (recepcion && usuarioActual() === identidad) el('recibirPedidoBoton').disabled = !pedido || ['Cancelado', 'Recibido completo'].includes(pedido.estado);
        }
    }
    async function consultar(id) {
        const identidad = usuarioActual();
        if (!identidad) return;
        const consulta = ++consultaDetalle;
        pedido = null;
        el('estadoRecepcion').textContent = '';
        el('recibirPedidoBoton').disabled = true;
        el('estadoPedidos').textContent = `Cargando pedido ${id}…`;
        try {
            const obtenido = await api(`/orders/${id}`);
            if (usuarioActual() !== identidad || consulta !== consultaDetalle) return;
            pedido = obtenido;
            el('detallePedidoTitulo').textContent = `Pedido ${pedido.id} — ${pedido.estado}`;
            el('detallePedidoObservaciones').textContent = pedido.motivo_cancelacion || pedido.observaciones || '';
            el('recepcionDetalles').innerHTML = pedido.detalles.map(d => {
                const pendiente = d.cantidad - d.recibida;
                return `<tr><td>${textoSeguro(d.producto)}</td><td>${d.cantidad}</td><td>${d.recibida}</td><td>${pendiente}</td>
                    <td><input id="recCantidad${d.id}" type="number" min="0" max="${pendiente}" step="1" value="0" aria-label="Cantidad a recibir"></td>
                    <td><input id="recCodigo${d.id}" maxlength="60" aria-label="Código de lote (opcional)" placeholder="Automático si se omite"></td>
                    <td><input id="recFecha${d.id}" type="date" value="${hoy()}" aria-label="Fecha de ingreso" required></td>
                    <td><input id="recCaducidad${d.id}" type="date" aria-label="Caducidad opcional"></td>
                    <td><input id="recPrecio${d.id}" type="number" min="0" max="99999999.99" step="0.01" value="${Number(d.precio_compra)}" aria-label="Precio de compra recibido" required></td></tr>`;
            }).join('');
            el('recibirPedidoBoton').disabled = ['Cancelado', 'Recibido completo'].includes(pedido.estado);
            el('historialRecepciones').textContent = pedido.recepciones.map(r =>
                `Recepción ${r.id} · ${r.responsable} · ${MicroCarmitaFechas.instante(r.creado_en)} · lote ${r.codigo} · ${r.cantidad} unidades · ingreso ${MicroCarmitaFechas.calendario(r.fecha_ingreso)} · caducidad ${r.caducidad ? MicroCarmitaFechas.calendario(r.caducidad) : 'sin caducidad'}`).join('\n') || 'Sin recepciones.';
            el('estadoPedidos').textContent = `Pedido ${pedido.id} cargado.`;
            el('detallePedido').focus?.({ preventScroll: true });
            el('detallePedido').scrollIntoView?.({ block: 'start', behavior: 'auto' });
        } catch (error) {
            if (usuarioActual() !== identidad || consulta !== consultaDetalle) return;
            pedido = null;
            el('recibirPedidoBoton').disabled = true;
            el('estadoPedidos').textContent = `No se pudo cargar el pedido ${id}: ${error.message}`;
        }
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
            const pedidoId = pedido.id;
            const lineas = pedido.detalles.filter(d => valor(`recCantidad${d.id}`) !== '' && numero(`recCantidad${d.id}`) !== 0).map(d => ({
                detalleId: d.id, cantidad: numero(`recCantidad${d.id}`), codigo: valor(`recCodigo${d.id}`),
                fechaIngreso: valor(`recFecha${d.id}`), caducidad: valor(`recCaducidad${d.id}`), precioCompra: numero(`recPrecio${d.id}`)
            }));
            if (!lineas.length) throw new Error('Ingrese una cantidad mayor a cero en «A recibir» para al menos un producto.');
            for (const linea of lineas) {
                const d = pedido.detalles.find(d => d.id === linea.detalleId);
                const nombre = d.producto;
                if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad < 1 || linea.cantidad > d.cantidad - d.recibida) throw new Error(`${nombre}: ingrese una cantidad entera entre 1 y ${d.cantidad - d.recibida}.`);
                if (linea.codigo.trim().length > 60) throw new Error(`${nombre}: el código de lote es opcional y admite hasta 60 caracteres.`);
                const fechaValida = fecha => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number.isFinite(Date.parse(fecha + 'T00:00:00Z'))
                    && new Date(fecha + 'T00:00:00Z').toISOString().slice(0, 10) === fecha;
                if (!fechaValida(linea.fechaIngreso)) throw new Error(`${nombre}: complete una fecha de ingreso válida.`);
                if (linea.caducidad !== '' && !fechaValida(linea.caducidad)) throw new Error(`${nombre}: corrija la fecha de caducidad o déjela vacía si no corresponde.`);
                if (!Number.isFinite(linea.precioCompra) || linea.precioCompra < 0 || linea.precioCompra > 99999999.99 || Number(linea.precioCompra.toFixed(2)) !== linea.precioCompra) throw new Error(`${nombre}: ingrese un precio de compra válido, desde cero y con hasta dos decimales.`);
            }
            const firma = JSON.stringify({ pedido: pedido.id, lineas });
            if (envio?.firma !== firma) envio = { firma, clave: crypto.randomUUID() };
            await api(`/orders/${pedido.id}/receipts`, 'POST', { clave: envio.clave, lineas });
            envio = null;
            await consultar(pedidoId);
            await MicroCarmitaInventario.cargar();
            return `Recepción registrada para el pedido ${pedidoId}. Consulte las cantidades recibidas y el historial actualizados.`;
        }, true)
    };
    document.addEventListener('microcarmita:sesion', () => {
        consultaDetalle++;
        detalles = []; pedido = null; envio = null;
        el('listaPedidos').textContent = ''; el('recepcionDetalles').textContent = '';
        el('historialRecepciones').textContent = ''; el('detallePedidoTitulo').textContent = '';
        el('detallePedidoObservaciones').textContent = ''; pintarDetalles();
        el('recibirPedidoBoton').disabled = true;
        el('estadoRecepcion').textContent = '';
        if (usuarioActual()) cargar();
    });
})();
