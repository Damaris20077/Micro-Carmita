/* Panel de consulta: consume reglas y datos existentes; no escribe ni calcula stock. */
(() => {
    'use strict';
    const el = nombre => document.getElementById(`inicioPanel${nombre}`);
    let secuencia = 0, pendiente = null;
    const vigente = (actor, numero) => usuarioActual() === actor && secuencia === numero;
    const grupos = ['Stock', 'Caducidad', 'Pedidos', 'Ventas'];
    function limpiar() {
        secuencia++;
        pendiente = null;
        for (const grupo of grupos) {
            el(`${grupo}Lista`).innerHTML = '';
            el(`${grupo}Lista`).hidden = true;
            el(`${grupo}Estado`).textContent = '';
            el(grupo).hidden = true;
        }
        el('Estado').textContent = '';
        el('Actualizar').disabled = true;
        el('Actualizar').removeAttribute('aria-busy');
    }
    function lista(grupo, filas, pintar, vacio) {
        el(`${grupo}Lista`).innerHTML = filas.map(pintar).join('');
        el(`${grupo}Lista`).hidden = !filas.length;
        el(`${grupo}Estado`).textContent = filas.length ? '' : vacio;
    }
    async function cargar() {
        const actor = usuarioActual();
        if (!actor || !tienePermiso('inicio')) { limpiar(); return; }
        if (pendiente?.actor === actor) return pendiente.promesa;
        const numero = ++secuencia, token = { actor };
        pendiente = token;
        el('Actualizar').disabled = true;
        el('Actualizar').setAttribute('aria-busy', 'true');
        el('Estado').textContent = 'Consultando información del negocio…';
        const inventario = tienePermiso('inventario'), pedidos = tienePermiso('pedidos'), ventas = tienePermiso('ventas');
        for (const [grupo, permitido] of [['Stock', inventario], ['Caducidad', inventario], ['Pedidos', pedidos], ['Ventas', ventas]]) {
            el(grupo).hidden = !permitido;
            el(`${grupo}Lista`).innerHTML = '';
            el(`${grupo}Lista`).hidden = true;
            el(`${grupo}Estado`).textContent = permitido ? 'Cargando…' : '';
        }
        const tareas = [];
        let fallos = 0;
        const consultar = (ruta, gruposConsulta, pintar) => {
            tareas.push((async () => {
                try {
                    const datos = await MicroCarmitaAuth.api(ruta);
                    if (vigente(actor, numero)) pintar(datos);
                } catch {
                    if (!vigente(actor, numero)) return;
                    fallos++;
                    for (const grupo of gruposConsulta) {
                        el(`${grupo}Lista`).innerHTML = '';
                        el(`${grupo}Lista`).hidden = true;
                        el(`${grupo}Estado`).textContent = 'No se pudo cargar esta información. Actualiza el panel para reintentar.';
                    }
                }
            })());
        };
        if (inventario) consultar('/inventory/alerts', ['Stock', 'Caducidad'], datos => {
            lista('Stock', datos.stockBajo, p => `<li><div><strong>${textoSeguro(p.nombre)}</strong><span>Stock registrado</span></div><strong class="panel-cantidad">${textoSeguro(p.stock)} unidades</strong></li>`, 'No hay productos con stock bajo.');
            lista('Caducidad', datos.caducidad, l => `<li><div><strong>${textoSeguro(l.producto)}</strong><span>Lote ${textoSeguro(l.codigo)} · ${textoSeguro(MicroCarmitaFechas.calendario(l.caducidad))}</span></div><span class="estado ${l.estado === 'Caducado' ? 'estado-agotado' : 'estado-pendiente'}">${textoSeguro(l.estado)}</span></li>`, 'No hay lotes próximos a caducar ni vencidos con existencias.');
        });
        if (pedidos) consultar('/orders', ['Pedidos'], datos => {
            // Solo agrupa estados de la API; no calcula cantidades pendientes.
            const porRecibir = datos.pedidos.filter(p => ['Pendiente', 'Recibido parcialmente'].includes(p.estado));
            lista('Pedidos', porRecibir, p => `<li><div><strong>Pedido ${textoSeguro(p.id)}</strong><span>${textoSeguro(p.proveedor)}</span></div><span class="estado estado-pendiente">${textoSeguro(p.estado)}</span></li>`, 'No hay pedidos pendientes de recibir.');
        });
        if (ventas) consultar('/sales', ['Ventas'], datos => {
            const recientes = [...datos.ventas].sort((a, b) => (Date.parse(b.creado_en) || 0) - (Date.parse(a.creado_en) || 0) || Number(b.id) - Number(a.id)).slice(0, 5);
            lista('Ventas', recientes, v => `<li><div><strong>Venta ${textoSeguro(v.id)} · ${textoSeguro(v.cliente || 'Consumidor final')}</strong><span>${textoSeguro(MicroCarmitaFechas.instante(v.creado_en))} · ${textoSeguro(v.tipo)} · ${textoSeguro(v.estado)}</span></div><div class="panel-importe"><span>Total de la venta</span><strong>${textoSeguro(dinero(v.total))}</strong></div></li>`, 'No hay ventas registradas.');
        });
        token.promesa = Promise.all(tareas).then(() => {
            if (!vigente(actor, numero)) return;
            el('Estado').textContent = !tareas.length ? 'No hay consultas disponibles para tu rol.' : fallos ? 'Algunos datos no pudieron cargarse. Puedes actualizar el panel para reintentar.' : 'Información operativa consultada. Usa Actualizar panel para volver a consultarla.';
            el('Actualizar').disabled = false;
            el('Actualizar').removeAttribute('aria-busy');
        }).finally(() => { if (pendiente === token) pendiente = null; });
        return token.promesa;
    }
    // Los eventos originales continúan llamando a la misma función pública.
    const mostrarAnterior = mostrarSeccion;
    mostrarSeccion = (...args) => {
        const resultado = mostrarAnterior(...args);
        if (args[0] === 'inicio' && tienePermiso('inicio')) cargar();
        return resultado;
    };
    document.addEventListener('microcarmita:sesion', () => {
        limpiar();
        if (usuarioActual() && document.getElementById('inicio').classList.contains('activa-seccion')) cargar();
    });
    globalThis.MicroCarmitaInicio = { cargar };
    limpiar();
})();
