const { createHash } = require('node:crypto');
const M = require('../modelo');
const { fallo } = require('./auth-service');

function campos(d, permitidos) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some(k => !permitidos.includes(k))) throw fallo(400, 'Campos inválidos.');
}
function id(v) {
    if (!Number.isSafeInteger(v) || v < 1 || v > 4294967295) throw fallo(400, 'Identificador inválido.');
    return v;
}
function importe(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 99999999.99 || M.redondear(v) !== v) throw fallo(400, 'Importe positivo con hasta dos decimales requerido.');
    return Math.round(v * 100);
}
function motivo(v) {
    if (typeof v !== 'string' || !v.trim() || v.trim().length > 255) throw fallo(400, 'Motivo obligatorio de hasta 255 caracteres.');
    return v.trim();
}
function autorizar(a, admin = false) {
    if (!a?.activo || !['administrador','vendedor'].includes(a.rol) || (admin && a.rol !== 'administrador')) throw fallo(403, 'Operación de ventas no autorizada.');
}
function normalizar(d, editar = false) {
    campos(d, ['clave','tipo','clienteId','detalles', ...(editar ? ['motivo','version','confirmarReembolso'] : [])]);
    if (!['contado','fiado'].includes(d.tipo)) throw fallo(400, 'Tipo de venta inválido.');
    const clienteId = d.clienteId === null || d.clienteId === undefined ? null : id(d.clienteId);
    if (d.tipo === 'fiado' && clienteId === null) throw fallo(400, 'El fiado requiere un cliente registrado.');
    if (!Array.isArray(d.detalles) || !d.detalles.length || d.detalles.length > 100) throw fallo(400, 'Se requieren de 1 a 100 productos.');
    let centavos = 0;
    const detalles = d.detalles.map(l => {
        campos(l, ['productoId','cantidad','precio','confirmarExistencia','caducidadFisica']);
        const productoId = id(l.productoId);
        if (!Number.isSafeInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > 2147483647) throw fallo(400, 'Cantidad entera positiva requerida.');
        const precio = importe(l.precio);
        if (l.confirmarExistencia !== undefined && typeof l.confirmarExistencia !== 'boolean') throw fallo(400, 'Confirmación física inválida.');
        if (l.caducidadFisica !== undefined && l.caducidadFisica !== null && !M.fechaValida(l.caducidadFisica)) throw fallo(400, 'Caducidad física inválida.');
        centavos += precio * l.cantidad;
        return { productoId, cantidad: l.cantidad, precio: precio / 100, confirmarExistencia: l.confirmarExistencia === true,
            caducidadFisica: l.caducidadFisica, fechaDeclarada: Object.hasOwn(l, 'caducidadFisica') };
    }).sort((a,b) => a.productoId - b.productoId);
    if (!Number.isSafeInteger(centavos) || centavos > 99999999900) throw fallo(400, 'Total fuera del límite permitido.');
    if (new Set(detalles.map(l => l.productoId)).size !== detalles.length) throw fallo(400, 'Productos duplicados en la venta.');
    if (editar && d.confirmarReembolso !== undefined && typeof d.confirmarReembolso !== 'boolean') throw fallo(400, 'Confirmación de reembolso inválida.');
    return { tipo: d.tipo, clienteId, detalles, total: centavos / 100,
        ...(editar ? { motivo: motivo(d.motivo), version: id(d.version), confirmarReembolso: d.confirmarReembolso === true } : {}) };
}

function crearVentasServicio(repo, fechaActual = M.hoy) {
    async function escritura(actor, admin, clave, contenido, fn) {
        autorizar(actor, admin);
        if (typeof clave !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(clave)) throw fallo(400, 'Clave de idempotencia inválida.');
        const hash = createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
        try {
            return await repo.transaction(async tx => {
                const actual = await tx.inventario.actor(actor.id);
                autorizar(actual, admin);
                const previa = await tx.operacion(actual.id, clave);
                if (previa) {
                    if (previa.contenido_hash !== hash) throw fallo(409, 'La clave ya corresponde a otra operación.');
                    return { ...(typeof previa.respuesta === 'string' ? JSON.parse(previa.respuesta) : previa.respuesta), repetida: true };
                }
                const respuesta = await fn(tx, actual);
                await tx.guardarOperacion(actual.id, clave, hash, respuesta);
                return { ...respuesta, repetida: false };
            });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') throw fallo(409, 'Registro duplicado; no se confirmó la operación.');
            throw error;
        }
    }
    async function buscar(tx, ventaId) {
        const v = await tx.venta(id(ventaId));
        if (!v) throw fallo(404, 'Venta inexistente.');
        return { ...v, total: Number(v.total), abonado: Number(v.abonado), saldo: Number(v.saldo) };
    }
    async function snapshot(tx, v) { return { ...v, detalles: await tx.detalles(v.id, v.revision), abonos: await tx.abonos(v.id) }; }
    async function cargar(tx, productoId) {
        const p = await tx.inventario.producto(productoId);
        if (!p) throw fallo(404, 'Producto inexistente.');
        return { productos: [{ ...p, faltante: Number(p.faltante) }], lotes: (await tx.inventario.lotesProducto(productoId))
            .map(l => ({ ...l, productoId: l.producto_id, cantidad: Number(l.cantidad), caducidad: l.caducidad || '', fecha: l.fecha_ingreso })),
        ventas: [], cuentas: [], movimientos: [], inventarioMovimientos: [] };
    }
    async function guardar(tx, a, s, antes, delta, tipo, ventaId, revision) {
        const p = s.productos[0];
        const despues = M.stock(s, p.id);
        if (!Number.isSafeInteger(despues) || p.faltante < 0 || p.faltante > 2147483647 || s.lotes.some(l => l.cantidad < 0 || l.cantidad > 2147483647)) throw fallo(400, 'Existencias fuera del rango permitido.');
        await tx.inventario.guardarStock(p.id, p.faltante, s.lotes);
        await tx.inventario.movimiento({ productoId: p.id, usuarioId: a.id, tipo, cantidad: delta, antes, despues,
            motivo: tipo === 'venta' ? 'Venta interna' : 'Reversión de venta', detalle: { ventaId, revision } });
    }
    async function vender(tx, a, ventaId, revision, d, persistir = true) {
        const resultados = [];
        for (const l of d.detalles) {
            const s = await cargar(tx, l.productoId);
            const p = s.productos[0];
            if (!p.activo) throw fallo(409, 'Producto archivado.');
            const fecha = fechaActual();
            const disponibles = s.lotes.filter(lote => lote.cantidad > 0 && M.estadoLote(lote, fecha) !== 'Caducado');
            const faltan = l.cantidad > disponibles.reduce((n,lote) => n + lote.cantidad, 0);
            if (faltan && (!l.confirmarExistencia || !l.fechaDeclarada)) throw fallo(400, 'Confirme existencia física y caducidad (null si no tiene) para vender con faltantes.');
            if (faltan && l.caducidadFisica && l.caducidadFisica < fecha) throw fallo(400, 'La mercadería física está caducada.');
            // El modelo bloquea también cuando solo quedan lotes físicos caducados.
            s.usuarios = [a];
            const antes = M.stock(s, p.id);
            let r;
            try { r = M.venta(s, { ...l, tipo: d.tipo, cliente: d.clienteId ? String(d.clienteId) : '' }, a.id, fecha); }
            catch { throw fallo(400, 'Venta inválida: compruebe cantidades, precio y lotes no caducados.'); }
            await guardar(tx, a, s, antes, -l.cantidad, 'venta', ventaId, revision);
            const detalle = { ...l, nombre: p.nombre, sinExistencia: r.sinExistencia,
                caducidadFisica: l.caducidadFisica || null, asignaciones: r.asignaciones };
            resultados.push(detalle);
            if (persistir) await tx.detalle(ventaId, revision, detalle);
        }
        return resultados;
    }
    async function revertir(tx, a, v, detalles) {
        for (const d of detalles) {
            const s = await cargar(tx, d.producto_id);
            const p = s.productos[0];
            const antes = M.stock(s, p.id);
            // Cancela primero el faltante aún pendiente de regularización.
            const deuda = Math.min(p.faltante, d.sin_existencia);
            p.faltante -= deuda;
            const restituciones = d.asignaciones.map(l => ({ loteId: l.loteId, cantidad: l.cantidad }));
            const regularizado = d.sin_existencia - deuda;
            if (regularizado) {
                const datos = { codigo: `REV-${v.id}-${v.revision}-${p.id}`, proveedorId: p.proveedor_id,
                    precioCompra: Number(p.precio_compra), fechaIngreso: fechaActual(), caducidad: d.caducidad_fisica || '' };
                const loteId = await tx.inventario.crearLote(p.id, datos, 0);
                s.lotes.push({ id: loteId, productoId: p.id, cantidad: 0, fecha: datos.fechaIngreso, caducidad: datos.caducidad });
                restituciones.push({ loteId, cantidad: regularizado });
            }
            for (const r of restituciones) {
                const lote = s.lotes.find(l => l.id === r.loteId);
                if (!lote) throw fallo(409, 'No se pudo reconstruir la trazabilidad del lote.');
                const conciliar = M.estadoLote(lote, fechaActual()) === 'Caducado' ? 0 : Math.min(p.faltante, r.cantidad);
                p.faltante -= conciliar;
                lote.cantidad += r.cantidad - conciliar;
            }
            await guardar(tx, a, s, antes, d.cantidad, 'reversion', v.id, v.revision);
        }
    }
    async function modificarDetalles(tx, a, v, anteriores, datos) {
        const ids = [...new Set([...anteriores.map(d => d.producto_id), ...datos.detalles.map(d => d.productoId)])].sort((a,b) => a-b);
        for (const productoId of ids) {
            const anterior = anteriores.find(d => d.producto_id === productoId);
            const nuevo = datos.detalles.find(d => d.productoId === productoId);
            let sinExistencia = anterior?.sin_existencia || 0;
            let asignaciones = (anterior?.asignaciones || []).map(a => ({ ...a }));
            let caducidadFisica = anterior?.caducidad_fisica || null;
            const delta = (nuevo?.cantidad || 0) - (anterior?.cantidad || 0);
            if (delta < 0) {
                let devolver = -delta;
                const sin = Math.min(sinExistencia, devolver);
                sinExistencia -= sin; devolver -= sin;
                const retornos = [];
                for (const lote of [...asignaciones].reverse()) {
                    const unidades = Math.min(lote.cantidad, devolver);
                    if (unidades) retornos.push({ loteId: lote.loteId, cantidad: unidades });
                    lote.cantidad -= unidades; devolver -= unidades;
                }
                await revertir(tx, a, v, [{ ...anterior, cantidad: -delta, sin_existencia: sin, asignaciones: retornos }]);
                asignaciones = asignaciones.filter(a => a.cantidad > 0);
            } else if (delta > 0) {
                const [extra] = await vender(tx, a, v.id, v.revision + 1, { ...datos, detalles: [{ ...nuevo, cantidad: delta }] }, false);
                if (extra.sinExistencia) {
                    const fechas = [sinExistencia ? caducidadFisica : null, extra.caducidadFisica].filter(Boolean).sort();
                    caducidadFisica = fechas[0] || null;
                }
                sinExistencia += extra.sinExistencia;
                for (const l of extra.asignaciones) {
                    const previa = asignaciones.find(a => a.loteId === l.loteId);
                    if (previa) previa.cantidad += l.cantidad; else asignaciones.push(l);
                }
            }
            // Los productos históricos archivados pueden conservarse o reducirse;
            // una cantidad adicional pasa siempre por la validación de venta actual.
            if (nuevo) await tx.detalle(v.id, v.revision + 1, { ...nuevo,
                nombre: anterior?.nombre || (await tx.inventario.producto(productoId)).nombre,
                sinExistencia, confirmarExistencia: sinExistencia > 0, caducidadFisica, asignaciones });
        }
    }
    return {
        async listar(actor) { autorizar(actor); return repo.lista(); },
        async consultar(actor, ventaId) {
            autorizar(actor);
            return repo.transaction(async tx => {
                const v = await buscar(tx, ventaId);
                return { ...await snapshot(tx, v), historial: await tx.historial(v.id), caja: await tx.caja(v.id) };
            });
        },
        async cliente(actor, clienteId) {
            autorizar(actor); id(clienteId);
            return repo.transaction(async tx => {
                if (!await tx.inventario.contacto('clientes', clienteId)) throw fallo(404, 'Cliente inexistente.');
                const ventas = await tx.lista(clienteId);
                const fiados = ventas.filter(v => v.cliente_id === clienteId && v.tipo === 'fiado' && v.estado === 'Activa');
                const sumar = campo => fiados.reduce((s,v) => s + Math.round(Number(v[campo]) * 100), 0) / 100;
                const historial = [];
                for (const v of ventas) historial.push({ ...v, abonos: await tx.abonos(v.id), caja: await tx.caja(v.id), historial: await tx.historial(v.id) });
                return { clienteId, totalAdeudado: sumar('total'), abonado: sumar('abonado'), saldo: sumar('saldo'), ventas: historial };
            });
        },
        async crear(actor, datos) {
            autorizar(actor); const d = normalizar(datos);
            return escritura(actor, false, datos.clave, { accion: 'crear', d }, async (tx, a) => {
                if (d.clienteId && !await tx.inventario.contacto('clientes', d.clienteId)) throw fallo(400, 'Cliente inexistente.');
                const ventaId = await tx.crear(d, a);
                await vender(tx, a, ventaId, 1, d);
                if (d.tipo === 'contado') await tx.efectivo(ventaId, a, 'contado', d.total);
                await tx.auditar(ventaId, a, 'crear', 'Registro de venta interna', {}, await snapshot(tx, await buscar(tx, ventaId)));
                return { id: ventaId, total: d.total };
            });
        },
        async abonar(actor, ventaId, datos) {
            autorizar(actor); id(ventaId); campos(datos, ['clave','importe']); const centavos = importe(datos.importe);
            return escritura(actor, false, datos.clave, { accion: 'abonar', ventaId, centavos }, async (tx, a) => {
                const v = await buscar(tx, ventaId);
                if (v.estado !== 'Activa' || v.tipo !== 'fiado' || centavos > Math.round(v.saldo * 100)) throw fallo(409, 'Abono no permitido o superior al saldo.');
                const anterior = { ...v };
                v.version += 1;
                v.abonado = (Math.round(v.abonado * 100) + centavos) / 100;
                v.saldo = (Math.round(v.total * 100) - Math.round(v.abonado * 100)) / 100;
                const abonoId = await tx.abonar(v.id, a, centavos / 100);
                await tx.actualizar(v.id, v);
                await tx.efectivo(v.id, a, 'abono', centavos / 100);
                await tx.auditar(v.id, a, 'abonar', 'Abono de cliente', anterior, v);
                return { id: v.id, abonoId, saldo: v.saldo };
            });
        },
        async editar(actor, ventaId, datos) {
            autorizar(actor, true); id(ventaId); const d = normalizar(datos, true);
            return escritura(actor, true, datos.clave, { accion: 'editar', ventaId, d }, async (tx, a) => {
                const v = await buscar(tx, ventaId);
                if (v.estado !== 'Activa' || v.version !== d.version) throw fallo(409, 'Venta cerrada o versión desactualizada; consulte nuevamente.');
                if (v.abonado > 0 && (d.tipo !== v.tipo || d.clienteId !== v.cliente_id || Math.round(d.total * 100) < Math.round(v.abonado * 100))) throw fallo(409, 'Con abonos, conserve cliente y tipo, y un total igual o superior a lo abonado.');
                if (d.clienteId && !await tx.inventario.contacto('clientes', d.clienteId)) throw fallo(400, 'Cliente inexistente.');
                const anterior = await snapshot(tx, v);
                // Bloquea la unión ordenada antes de revertir o volver a descontar.
                const productos = [...new Set([...anterior.detalles.map(l => l.producto_id), ...d.detalles.map(l => l.productoId)])].sort((a,b) => a-b);
                for (const productoId of productos) { await tx.inventario.producto(productoId); await tx.inventario.lotesProducto(productoId); }
                const deltaCaja = (d.tipo === 'contado' ? Math.round(d.total * 100) : 0) - (v.tipo === 'contado' ? Math.round(v.total * 100) : 0);
                if (deltaCaja < 0 && !d.confirmarReembolso) throw fallo(400, 'Confirme el reembolso de la diferencia de efectivo.');
                await modificarDetalles(tx, a, v, anterior.detalles, d);
                v.revision += 1;
                v.version += 1;
                Object.assign(v, { cliente_id: d.clienteId, tipo: d.tipo, total: d.total,
                    saldo: d.tipo === 'fiado' ? (Math.round(d.total * 100) - Math.round(v.abonado * 100)) / 100 : 0 });
                await tx.actualizar(v.id, v);
                await tx.efectivo(v.id, a, 'correccion', deltaCaja / 100);
                await tx.auditar(v.id, a, 'editar', d.motivo, anterior, await snapshot(tx, v));
                return { id: v.id, revision: v.revision, version: v.version, total: v.total, saldo: v.saldo };
            });
        },
        async anular(actor, ventaId, datos) {
            autorizar(actor, true); id(ventaId); campos(datos, ['clave','motivo','version','confirmarReembolso']);
            if (datos.confirmarReembolso !== undefined && typeof datos.confirmarReembolso !== 'boolean') throw fallo(400, 'Confirmación de reembolso inválida.');
            const d = { motivo: motivo(datos.motivo), version: id(datos.version), confirmarReembolso: datos.confirmarReembolso === true };
            return escritura(actor, true, datos.clave, { accion: 'anular', ventaId, d }, async (tx, a) => {
                const v = await buscar(tx, ventaId);
                if (v.estado !== 'Activa' || v.version !== d.version) throw fallo(409, 'Venta cerrada o versión desactualizada; consulte nuevamente.');
                const anterior = await snapshot(tx, v);
                const devolucion = v.tipo === 'contado' ? v.total : v.abonado;
                if (devolucion > 0 && !d.confirmarReembolso) throw fallo(400, 'Confirme el reembolso del efectivo cobrado.');
                await revertir(tx, a, v, anterior.detalles);
                // Conserva la última revisión de detalle para consultar lo anulado.
                Object.assign(v, { estado: 'Anulada', saldo: 0, version: v.version + 1 });
                await tx.actualizar(v.id, v);
                await tx.efectivo(v.id, a, 'reembolso', -devolucion);
                await tx.auditar(v.id, a, 'anular', d.motivo, anterior, v);
                return { id: v.id, estado: v.estado, saldo: 0 };
            });
        }
    };
}
module.exports = { crearVentasServicio };
