const M = require('../modelo');
const { fallo } = require('./auth-service');

function texto(valor, campo, maximo) {
    if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > maximo) throw fallo(400, `${campo} inválido.`);
    return valor.trim();
}
function idValido(id) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) throw fallo(400, 'Identificador inválido.');
    return id;
}
function dinero(valor, positivo = false) {
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || (positivo && valor === 0)
        || valor > 99999999.99 || M.redondear(valor) !== valor) throw fallo(400, 'Precio inválido, use hasta dos decimales.');
    return valor;
}
function cantidad(valor, permitirCero = true) {
    if (!Number.isSafeInteger(valor) || valor < (permitirCero ? 0 : 1) || valor > 2147483647) throw fallo(400, 'Cantidad inválida.');
    return valor;
}
function campos(datos, permitidos) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos) || Object.keys(datos).some(k => !permitidos.includes(k))) {
        throw fallo(400, 'Campos inválidos.');
    }
}
function ficha(d) {
    return { nombre: texto(d.nombre, 'Nombre', 100), categoria: texto(d.categoria, 'Categoría', 80),
        precioCompra: dinero(d.precioCompra), precioVenta: dinero(d.precioVenta, true), proveedorId: idValido(d.proveedorId) };
}
function datosLote(d) {
    if (!M.fechaValida(d.fechaIngreso) || (d.caducidad !== '' && d.caducidad !== null && !M.fechaValida(d.caducidad))) {
        throw fallo(400, 'Fecha inválida.');
    }
    return { codigo: texto(d.codigo, 'Código de lote', 60), cantidad: cantidad(d.cantidad),
        precioCompra: dinero(d.precioCompra), proveedorId: idValido(d.proveedorId),
        fechaIngreso: d.fechaIngreso, caducidad: d.caducidad || '' };
}
function estado(producto, lotes) {
    return { productos: [{ ...producto, faltante: Number(producto.faltante) }],
        lotes: lotes.map(l => ({ ...l, productoId: l.producto_id, cantidad: Number(l.cantidad),
            caducidad: l.caducidad || '', fecha: l.fecha_ingreso })), inventarioMovimientos: [] };
}
function snapshot(productos, lotes, fecha) {
    return productos.map(p => {
        const s = estado(p, lotes.filter(l => l.producto_id === p.id));
        const stock = M.stock(s, p.id);
        return { ...p, precio_compra: Number(p.precio_compra), precio_venta: Number(p.precio_venta),
            stock, stockBajo: stock < 3, lotes: s.lotes.map(l => ({ ...l, estado: M.estadoLote(l, fecha, 5) })) };
    });
}

function crearInventarioServicio(repo, fechaActual = M.hoy) {
    function leer(actor) {
        if (!actor?.activo || !['administrador', 'vendedor', 'superusuario'].includes(actor.rol)) throw fallo(403, 'Operación no autorizada.');
    }
    function administrar(actor) {
        leer(actor);
        if (actor.rol !== 'administrador') throw fallo(403, 'Solo el Administrador puede modificar inventario o proveedores.');
    }
    async function escritura(actor, fn, cliente = false) {
        if (cliente) leer(actor); else administrar(actor);
        try {
            return await repo.transaction(async tx => {
                const actual = await tx.actor(actor.id);
                if (cliente) leer(actual); else administrar(actual);
                return fn(tx);
            });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') throw fallo(409, 'El registro ya existe.');
            throw error;
        }
    }
    async function proveedor(tx, id) {
        if (!await tx.contacto('proveedores', id)) throw fallo(400, 'Proveedor inexistente.');
    }
    async function cargar(tx, id) {
        idValido(id);
        const p = await tx.producto(id);
        if (!p) throw fallo(404, 'Producto inexistente.');
        return estado(p, await tx.lotesProducto(id));
    }
    async function registrar(tx, actor, s, antes, delta, tipo, motivo, detalle) {
        const p = s.productos[0];
        const despues = M.stock(s, p.id);
        if (!Number.isSafeInteger(despues) || p.faltante > 2147483647 || s.lotes.some(l => l.cantidad > 2147483647)) {
            throw fallo(400, 'Existencias fuera del rango permitido.');
        }
        await tx.guardarStock(p.id, p.faltante, s.lotes);
        await tx.movimiento({ productoId: p.id, usuarioId: actor.id, tipo, cantidad: delta, antes, despues, motivo, detalle });
        return { productoId: p.id, stock: despues };
    }
    async function entrada(tx, actor, s, datos, tipo) {
        const p = s.productos[0];
        const antes = M.stock(s, p.id);
        await proveedor(tx, datos.proveedorId);
        if (s.lotes.some(l => l.codigo.toLowerCase() === datos.codigo.toLowerCase())) throw fallo(409, 'Código de lote duplicado.');
        // Reutiliza la conciliación de faltantes y exclusión de caducados del modelo.
        s.usuarios = [{ ...actor, rol: 'administrador' }];
        let lote;
        if (datos.cantidad > 0) {
            lote = M.entrada(s, { ...datos, productoId: p.id }, actor.id, fechaActual());
            lote.fecha = datos.fechaIngreso;
        } else {
            lote = { codigo: datos.codigo, cantidad: 0, productoId: p.id, fecha: datos.fechaIngreso, caducidad: datos.caducidad };
            s.lotes.push(lote);
        }
        lote.id = await tx.crearLote(p.id, datos, lote.cantidad);
        const resultado = await registrar(tx, actor, s, antes, datos.cantidad, tipo, tipo === 'alta' ? 'Alta de producto' : 'Entrada de lote',
            { loteId: lote.id, recibido: datos.cantidad, disponible: lote.cantidad, conciliado: datos.cantidad - lote.cantidad });
        return { ...resultado, loteId: lote.id };
    }
    return {
        // Entrada interna dentro de la transacción de un pedido ya autorizado.
        async recibirPedido(tx, actor, id, d) {
            leer(actor);
            if (!['administrador', 'vendedor'].includes(actor.rol)) throw fallo(403, 'Recepción no autorizada.');
            const datos = datosLote(d);
            cantidad(datos.cantidad, false);
            const s = await cargar(tx, id);
            if (!s.productos[0].activo) throw fallo(409, 'Producto archivado.');
            return entrada(tx, actor, s, datos, 'entrada');
        },
        async contactos(actor, tipo) { leer(actor); return repo.contactos(tipo); },
        async crearContacto(actor, tipo, d) {
            campos(d, ['nombre', 'identificacion', 'telefono', 'direccion']);
            const datos = { nombre: texto(d.nombre, 'Nombre', 100) };
            for (const [campo, max] of [['identificacion', 30], ['telefono', 30], ['direccion', 255]]) {
                datos[campo] = d[campo] === undefined || d[campo] === null || d[campo] === '' ? null : texto(d[campo], campo, max);
            }
            return escritura(actor, tx => tx.crearContacto(tipo, datos), tipo === 'clientes');
        },
        async inventario(actor) {
            leer(actor);
            return repo.transaction(async tx => snapshot(await tx.productos(), await tx.lotes(), fechaActual()));
        },
        async crearProducto(actor, d) {
            campos(d, ['nombre', 'categoria', 'precioCompra', 'precioVenta', 'proveedorId', 'codigo', 'cantidad', 'fechaIngreso', 'caducidad']);
            const producto = ficha(d);
            const lote = datosLote(d);
            return escritura(actor, async tx => {
                await proveedor(tx, producto.proveedorId);
                const nuevo = await tx.crearProducto(producto);
                return entrada(tx, actor, estado(nuevo, []), lote, 'alta');
            });
        },
        async editarProducto(actor, id, d) {
            campos(d, ['nombre', 'categoria', 'precioCompra', 'precioVenta', 'proveedorId', 'activo']);
            const datos = ficha(d);
            if (typeof d.activo !== 'boolean') throw fallo(400, 'Estado inválido.');
            return escritura(actor, async tx => {
                const s = await cargar(tx, id);
                if (!d.activo && M.stock(s, id) !== 0) throw fallo(409, 'Solo se archivan productos con stock cero.');
                await proveedor(tx, datos.proveedorId);
                await tx.editarProducto(id, { ...datos, activo: d.activo });
                return { id };
            });
        },
        async entrada(actor, id, d) {
            campos(d, ['codigo', 'cantidad', 'precioCompra', 'proveedorId', 'fechaIngreso', 'caducidad']);
            const datos = datosLote(d);
            return escritura(actor, async tx => {
                const s = await cargar(tx, id);
                if (!s.productos[0].activo) throw fallo(409, 'Producto archivado.');
                return entrada(tx, actor, s, datos, 'entrada');
            });
        },
        async ajustar(actor, id, d) {
            campos(d, ['cantidad', 'motivo', 'loteId']);
            if (!Number.isSafeInteger(d.cantidad) || d.cantidad === 0 || Math.abs(d.cantidad) > 2147483647) throw fallo(400, 'Ajuste inválido.');
            const motivo = texto(d.motivo, 'Motivo', 255);
            return escritura(actor, async tx => {
                const s = await cargar(tx, id);
                const p = s.productos[0];
                if (!p.activo) throw fallo(409, 'Producto archivado.');
                const antes = M.stock(s, id);
                const detalle = [];
                if (d.cantidad > 0) {
                    idValido(d.loteId);
                    const lote = s.lotes.find(l => l.id === d.loteId);
                    if (!lote) throw fallo(400, 'Seleccione un lote del producto.');
                    const conciliado = M.estadoLote(lote, fechaActual(), 5) === 'Caducado' ? 0 : Math.min(p.faltante, d.cantidad);
                    p.faltante -= conciliado;
                    lote.cantidad += d.cantidad - conciliado;
                    detalle.push({ loteId: lote.id, conciliado });
                } else {
                    let pendiente = -d.cantidad;
                    // Ajuste físico: incluye lotes vencidos. Fecha e id resuelven empates.
                    const lotes = [...s.lotes].sort((a,b) => (a.caducidad || '9999-12-31').localeCompare(b.caducidad || '9999-12-31') || a.id - b.id);
                    for (const lote of lotes) {
                        const unidades = Math.min(lote.cantidad, pendiente);
                        lote.cantidad -= unidades;
                        pendiente -= unidades;
                        if (unidades) detalle.push({ loteId: lote.id, cantidad: -unidades });
                    }
                    p.faltante += pendiente;
                    if (pendiente) detalle.push({ sinExistencia: pendiente });
                }
                return registrar(tx, actor, s, antes, d.cantidad, 'ajuste', motivo, detalle);
            });
        },
        async historial(actor, id) { leer(actor); idValido(id); return repo.historial(id); }
    };
}
module.exports = { crearInventarioServicio, snapshot };
