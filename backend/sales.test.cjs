const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { crearVentasServicio } = require('./sales-service');
const { crearVentasRepositorio } = require('./sales-repository');
const { crearApp } = require('./app');
const { digest } = require('./auth-service');
const M = require('../modelo');

function preparar() {
    const admin = { id: 1, rol: 'administrador', activo: true };
    const vendedor = { id: 2, rol: 'vendedor', activo: true };
    const db = { ventas: [], detalles: [], pagos: [], caja: [], historial: [], operaciones: [], movimientos: [],
        productos: [1,2].map(id => ({ id, nombre: `Producto ${id}`, activo: true, faltante: 0, proveedor_id: 1, precio_compra: 1, precio_venta: 2 })),
        lotes: [1,2].map(id => ({ id, producto_id: id, codigo: `L${id}`, cantidad: 10, fecha_ingreso: '2026-11-01', caducidad: '2026-12-01' })) };
    const copy = v => structuredClone(v);
    let cola = Promise.resolve(), fallo;
    const fallar = etapa => { if (fallo === etapa) throw new Error('Fallo simulado'); };
    const repo = {
        inventario: {
            async actor(id) { return copy(id === 1 ? admin : vendedor); },
            async contacto(tipo,id) { return id === 1 || id === 2 ? { id } : undefined; },
            async producto(id) { return copy(db.productos.find(p => p.id === id)); },
            async lotesProducto(id) { return copy(db.lotes.filter(l => l.producto_id === id)); },
            async guardarStock(id, faltante, lotes) {
                db.productos.find(p => p.id === id).faltante = faltante;
                for (const l of lotes) db.lotes.find(x => x.id === l.id).cantidad = l.cantidad;
            },
            async crearLote(id,d,cantidad) { const loteId = db.lotes.length + 1; db.lotes.push({ id: loteId, producto_id: id, codigo: d.codigo, cantidad, fecha_ingreso: d.fechaIngreso, caducidad: d.caducidad }); return loteId; },
            async movimiento(d) { fallar('movimiento'); db.movimientos.push(copy(d)); }
        },
        async transaction(fn) {
            const previo = cola; let liberar;
            cola = new Promise(resolve => { liberar = resolve; }); await previo;
            const anterior = copy(db);
            try { const r = await fn(repo); fallar('commit'); return r; }
            catch (e) { Object.assign(db, anterior); throw e; }
            finally { liberar(); }
        },
        async operacion(actor,clave) { return copy(db.operaciones.find(o => o.actor === actor && o.clave === clave)); },
        async guardarOperacion(actor,clave,contenido_hash,respuesta) { fallar('operacion'); db.operaciones.push(copy({ actor,clave,contenido_hash,respuesta })); },
        async lista(clienteId = null) { return copy(db.ventas.filter(v => clienteId === null || v.cliente_id === clienteId || db.historial.some(h => h.ventaId === v.id && (h.anterior.cliente_id === clienteId || h.posterior.cliente_id === clienteId)))); },
        async venta(id) { return copy(db.ventas.find(v => v.id === id)); },
        async detalles(id,revision) { return copy(db.detalles.filter(d => d.venta_id === id && d.revision === revision)); },
        async abonos(id) { return copy(db.pagos.filter(p => p.venta_id === id)); },
        async historial(id) { return copy(db.historial.filter(h => h.ventaId === id)); },
        async caja(id) { return copy(db.caja.filter(c => c.ventaId === id)); },
        async crear(d,a) {
            const id = db.ventas.length + 1;
            db.ventas.push({ id, cliente_id: d.clienteId, tipo: d.tipo, total: d.total, abonado: 0,
                saldo: d.tipo === 'fiado' ? d.total : 0, revision: 1, version: 1, estado: 'Activa', usuario_id: a.id }); return id;
        },
        async actualizar(id,d) { fallar('actualizar'); Object.assign(db.ventas.find(v => v.id === id), copy(d)); },
        async detalle(venta_id,revision,d) {
            fallar('detalle'); db.detalles.push(copy({ venta_id,revision,producto_id: d.productoId, nombre: d.nombre, cantidad: d.cantidad,
                precio: d.precio, sin_existencia: d.sinExistencia, existencia_confirmada: d.confirmarExistencia, caducidad_fisica: d.caducidadFisica, asignaciones: d.asignaciones }));
        },
        async abonar(venta_id,a,importe) { const id = db.pagos.length + 1; db.pagos.push({ id,venta_id,importe,usuario_id: a.id }); return id; },
        async efectivo(ventaId,a,tipo,importe) { fallar('caja'); if (importe) db.caja.push({ ventaId,usuarioId: a.id,tipo,importe }); },
        async auditar(ventaId,a,accion,motivo,anterior,posterior) { fallar('auditoria'); db.historial.push(copy({ ventaId,usuarioId: a.id,accion,motivo,anterior,posterior })); }
    };
    return { admin,vendedor,db,repo,servicio: crearVentasServicio(repo, () => '2026-11-17'), fallar(v) { fallo = v; } };
}
const venta = (extra = {}) => ({ clave: 'venta_primera', tipo: 'contado', clienteId: null, detalles: [{ productoId: 1,cantidad: 2,precio: 2 }], ...extra });
const pago = (importe = 1,clave = 'abono_primero') => ({ importe,clave });
const edicion = extra => venta({ clave: 'venta_edicion', version: 1,motivo: 'Corrección',confirmarReembolso: true,...extra });
const anulacion = extra => ({ clave: 'venta_anular',version: 1,motivo: 'Devolución',confirmarReembolso: true,...extra });

test('contado: registra detalle, descuento, ingreso único e historial sin factura', async () => {
    const f = preparar(); const r = await f.servicio.crear(f.vendedor, venta());
    assert.equal(r.total,4); assert.equal(f.db.ventas.length,1); assert.equal(f.db.detalles[0].asignaciones[0].cantidad,2);
    assert.equal(f.db.lotes[0].cantidad,8); assert.deepEqual(f.db.caja.map(c => c.importe),[4]);
    assert.equal(f.db.ventas[0].saldo,0); assert.equal(f.db.historial[0].usuarioId,2);
});
test('fiado: cliente obligatorio, deuda y abonos por cliente sin efectivo anticipado', async () => {
    const f = preparar();
    await assert.rejects(f.servicio.crear(f.vendedor,venta({ tipo:'fiado' })),{status:400});
    await f.servicio.crear(f.vendedor,venta({ tipo:'fiado',clienteId:1 }));
    assert.equal(f.db.caja.length,0);
    await f.servicio.abonar(f.vendedor,1,pago(1.25));
    const c = await f.servicio.cliente(f.admin,1);
    assert.equal(c.totalAdeudado,4); assert.equal(c.abonado,1.25); assert.equal(c.saldo,2.75);
    assert.equal(c.ventas[0].abonos[0].usuario_id,2);
    await f.servicio.abonar(f.admin,1,pago(2.75,'abono_segundo'));
    assert.equal(f.db.ventas[0].saldo,0); assert.equal(f.db.caja.length,2);
});
test('sobrepago y abono a contado se rechazan sin cambios',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));
    const antes=structuredClone(f.db);await assert.rejects(f.servicio.abonar(f.vendedor,1,pago(4.01)),{status:409});assert.deepEqual(f.db,antes);
    const g=preparar();await g.servicio.crear(g.admin,venta());await assert.rejects(g.servicio.abonar(g.admin,1,pago()),{status:409});
});
test('creación y abono idempotentes no duplican caja, stock ni pagos',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));
    assert.equal((await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}))).repetida,true);
    await f.servicio.abonar(f.admin,1,pago());assert.equal((await f.servicio.abonar(f.admin,1,pago())).repetida,true);
    assert.equal(f.db.pagos.length,1);assert.equal(f.db.caja.length,1);assert.equal(f.db.lotes[0].cantidad,8);
    await assert.rejects(f.servicio.abonar(f.admin,1,pago(2)),{status:409});
});
test('RF-06 exige confirmación y caducidad física, permite cero y stock insuficiente',async()=>{
    for(const stock of [0,1]){
        const f=preparar();f.db.lotes[0].cantidad=stock;
        await assert.rejects(f.servicio.crear(f.vendedor,venta()),{status:400});
        await f.servicio.crear(f.vendedor,venta({detalles:[{productoId:1,cantidad:2,precio:2,confirmarExistencia:true,caducidadFisica:'2026-12-01'}]}));
        assert.equal(f.db.productos[0].faltante,2-stock);assert.equal(f.db.movimientos[0].despues,stock-2);
        assert.equal(f.db.detalles[0].sin_existencia,2-stock);
    }
});
test('RF-07 bloquea solo vencidos y declaración física vencida, conserva los datos',async()=>{
    for(const caso of ['solo_vencidos','fisico_vencido']){
        const f=preparar();f.db.lotes[0].caducidad='2026-11-16';if(caso==='fisico_vencido')f.db.lotes[0].cantidad=0;
        const antes=structuredClone(f.db);
        await assert.rejects(f.servicio.crear(f.admin,venta({detalles:[{productoId:1,cantidad:2,precio:2,confirmarExistencia:true,caducidadFisica:caso==='fisico_vencido'?'2026-11-16':null}]})),{status:400});
        assert.deepEqual(f.db,antes);
    }
});
test('FEFO excluye lotes caducados y permite la fecha de hoy',async()=>{
    const f=preparar();f.db.lotes[0].caducidad='2026-11-16';
    f.db.lotes.push({id:3,producto_id:1,codigo:'HOY',cantidad:1,fecha_ingreso:'2026-11-01',caducidad:'2026-11-17'},
        {id:4,producto_id:1,codigo:'LUEGO',cantidad:5,fecha_ingreso:'2026-11-01',caducidad:'2026-11-18'});
    await f.servicio.crear(f.admin,venta());assert.deepEqual(f.db.detalles[0].asignaciones.map(a=>a.loteId),[3,4]);assert.equal(f.db.lotes[0].cantidad,10);
});
test('venta multiproducto calcula total en centavos y descuenta ambos',async()=>{
    const f=preparar();const r=await f.servicio.crear(f.admin,venta({detalles:[{productoId:2,cantidad:3,precio:0.1},{productoId:1,cantidad:2,precio:0.2}]}));
    assert.equal(r.total,0.7);assert.deepEqual(f.db.lotes.map(l=>l.cantidad),[8,7]);
});
for(const [nombre,datos] of [
    ['sin productos',venta({detalles:[]})],['cliente inexistente',venta({clienteId:99})],
    ['producto inexistente',venta({detalles:[{productoId:99,cantidad:1,precio:1}]})],
    ['cantidad fraccionaria',venta({detalles:[{productoId:1,cantidad:1.5,precio:1}]})],
    ['precio negativo',venta({detalles:[{productoId:1,cantidad:1,precio:-1}]})],
    ['precio cero',venta({detalles:[{productoId:1,cantidad:1,precio:0}]})],
    ['precio con tres decimales',venta({detalles:[{productoId:1,cantidad:1,precio:1.001}]})],
    ['producto duplicado',venta({detalles:[{productoId:1,cantidad:1,precio:1},{productoId:1,cantidad:1,precio:1}]})],
    ['total excesivo',venta({detalles:[{productoId:1,cantidad:2147483647,precio:99999999.99}]})],
    ['campos desconocidos',venta({saldo:0})]
])test(`validación de venta rechaza ${nombre} sin escritura`,async()=>{const f=preparar(),antes=structuredClone(f.db);await assert.rejects(f.servicio.crear(f.admin,datos),e=>[400,404].includes(e.status));assert.deepEqual(f.db,antes)});

test('RF-08: Vendedor no modifica ni anula; inactivos y Superusuario no operan ventas',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta());
    for(const a of [f.vendedor,{...f.admin,activo:false},{id:3,activo:true,rol:'superusuario'}]){
        await assert.rejects(f.servicio.editar(a,1,edicion({})),{status:403});await assert.rejects(f.servicio.anular(a,1,anulacion()),{status:403});
    }
    await assert.rejects(f.servicio.crear({...f.admin,activo:false},venta()),{status:403});
    f.vendedor.activo=false;await assert.rejects(f.servicio.abonar({...f.vendedor,activo:true},1,pago()),{status:403});
});
test('Administrador edita con revisión, conserva detalles anteriores y corrige efectivo',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta());
    await f.servicio.editar(f.admin,1,edicion({detalles:[{productoId:2,cantidad:3,precio:1}]}));
    assert.deepEqual(f.db.lotes.map(l=>l.cantidad),[10,7]);assert.equal(f.db.detalles.length,2);assert.equal(f.db.ventas[0].revision,2);
    assert.equal(f.db.caja.reduce((s,c)=>s+c.importe,0),3);assert.equal(f.db.historial[1].anterior.detalles[0].producto_id,1);
    await assert.rejects(f.servicio.editar(f.admin,1,edicion({clave:'otra_edicion'})),{status:409});
});
test('anulación restituye stock, conserva abonos y registra reembolso sin borrar historial',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));await f.servicio.abonar(f.vendedor,1,pago(2));
    await f.servicio.anular(f.admin,1,anulacion({version:2}));assert.equal(f.db.lotes[0].cantidad,10);assert.equal(f.db.pagos.length,1);
    assert.equal(f.db.ventas[0].estado,'Anulada');assert.equal(f.db.ventas[0].saldo,0);assert.equal(f.db.caja.reduce((s,c)=>s+c.importe,0),0);
    assert.equal((await f.servicio.anular(f.admin,1,anulacion({version:2}))).repetida,true);
    await assert.rejects(f.servicio.abonar(f.admin,1,pago(1,'otro_abono')),{status:409});
    const cliente=await f.servicio.cliente(f.admin,1);assert.equal(cliente.saldo,0);assert.equal(cliente.ventas[0].abonos.length,1);
});
test('editar fiado abonado conserva cliente y pagos, sin reducir total por debajo de cobros',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));await f.servicio.abonar(f.admin,1,pago(3));
    const antes=structuredClone(f.db);
    await assert.rejects(f.servicio.editar(f.admin,1,edicion({version:2,tipo:'fiado',clienteId:1,detalles:[{productoId:1,cantidad:1,precio:2}]})),{status:409});assert.deepEqual(f.db,antes);
    await assert.rejects(f.servicio.editar(f.admin,1,edicion({version:2,tipo:'fiado',clienteId:2})),{status:409});
    await f.servicio.editar(f.admin,1,edicion({version:2,tipo:'fiado',clienteId:1,detalles:[{productoId:1,cantidad:3,precio:2}]}));
    assert.equal(f.db.ventas[0].saldo,3);assert.equal(f.db.pagos.length,1);
});
test('reembolso requiere confirmación explícita antes de modificar inventario',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta());const antes=structuredClone(f.db);
    await assert.rejects(f.servicio.anular(f.admin,1,anulacion({confirmarReembolso:false})),{status:400});
    await assert.rejects(f.servicio.editar(f.admin,1,edicion({confirmarReembolso:false,detalles:[{productoId:1,cantidad:1,precio:1}]})),{status:400});assert.deepEqual(f.db,antes);
});
test('reversión de faltante después de recepción recupera stock sin volver negativa la deuda',async()=>{
    const f=preparar();f.db.lotes[0].cantidad=0;
    await f.servicio.crear(f.admin,venta({detalles:[{productoId:1,cantidad:2,precio:2,confirmarExistencia:true,caducidadFisica:null}]}));
    f.db.productos[0].faltante=0; // Estado equivalente a una entrada de dos unidades conciliadas.
    await f.servicio.anular(f.admin,1,anulacion());assert.equal(f.db.productos[0].faltante,0);assert.equal(f.db.lotes.filter(l=>l.producto_id===1).reduce((s,l)=>s+l.cantidad,0),2);
});
for(const etapa of ['movimiento','detalle','caja','auditoria','operacion','commit'])test(`rollback de venta al fallar ${etapa}`,async()=>{
    const f=preparar(),antes=structuredClone(f.db);f.fallar(etapa);await assert.rejects(f.servicio.crear(f.admin,venta()));assert.deepEqual(f.db,antes);
});
for(const etapa of ['actualizar','caja','auditoria','commit'])test(`rollback de abono al fallar ${etapa}`,async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));const antes=structuredClone(f.db);f.fallar(etapa);
    await assert.rejects(f.servicio.abonar(f.admin,1,pago()));assert.deepEqual(f.db,antes);
});
test('abonos concurrentes de distintos responsables no superan el saldo',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));
    const r=await Promise.allSettled([f.servicio.abonar(f.admin,1,pago(3)),f.servicio.abonar(f.vendedor,1,pago(3,'abono_vendedor'))]);
    assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.db.ventas[0].saldo,1);assert.equal(f.db.pagos.length,1);
});
test('creaciones concurrentes con misma clave producen una sola venta',async()=>{
    const f=preparar();const r=await Promise.all([f.servicio.crear(f.admin,venta()),f.servicio.crear(f.admin,venta())]);
    assert.equal(f.db.ventas.length,1);assert.equal(r.filter(x=>x.repetida).length,1);
});
test('repositorio utiliza FOR UPDATE y rollback en una conexión, con parámetros',async()=>{
    const pasos=[], sql=[];const c={async beginTransaction(){pasos.push('begin')},async execute(q,p){sql.push([q,p]);return [[{id:1}]]},async commit(){pasos.push('commit')},async rollback(){pasos.push('rollback')},release(){pasos.push('release')}};
    const r=crearVentasRepositorio({async getConnection(){return c}});
    await assert.rejects(r.transaction(async tx=>{await tx.inventario.actor(2);await tx.venta(4);throw new Error('Fallo')}));
    assert.deepEqual(pasos,['begin','rollback','release']);assert.ok(sql.every(([q])=>q.endsWith('FOR UPDATE')));assert.deepEqual(sql[1][1],[4]);
});
test('Express real verifica sesión, CSRF, roles y abonos sobre servicio transaccional aislado',async t=>{
    const f=preparar(), token=randomBytes(32).toString('hex');let actor=f.vendedor;
    const auth={async findSession(){return actor},async touchSession(){}};
    const server=crearApp({repository:auth,salesRepository:f.repo}).listen(0,'127.0.0.1');t.after(()=>new Promise(resolve=>server.close(resolve)));await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const request=(route,body,csrf=true,method='POST')=>fetch(base+route,{method,headers:{Origin:'http://127.0.0.1:3000',Cookie:`mc_session=${token}`,'Content-Type':'application/json','X-CSRF-Token':csrf?digest(`csrf:${token}`).toString('hex'):''},body:JSON.stringify(body)});
    assert.equal((await request('/sales',venta(),false)).status,403);
    assert.equal((await request('/sales',venta({tipo:'fiado',clienteId:1}))).status,201);
    assert.equal((await request('/sales/1/void',anulacion())).status,403);
    assert.equal((await request('/sales/1/payments',pago())).status,201);
    actor=f.admin;assert.equal((await request('/sales/1/void',anulacion({version:2}))).status,200);
    assert.equal(f.db.ventas[0].estado,'Anulada');
});

test('cambio de precio histórico no vuelve a vender unidades ahora vencidas',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta());f.db.lotes[0].caducidad='2026-11-16';
    const movimientos=f.db.movimientos.length;
    await f.servicio.editar(f.admin,1,edicion({detalles:[{productoId:1,cantidad:2,precio:3}]}));
    assert.equal(f.db.lotes[0].cantidad,8);assert.equal(f.db.movimientos.length,movimientos);assert.equal(f.db.ventas[0].total,6);
    await assert.rejects(f.servicio.editar(f.admin,1,edicion({version:2,clave:'aumento_vencido',detalles:[{productoId:1,cantidad:3,precio:3}]})),{status:400});
});
test('reducción de venta devuelve solo la diferencia y conserva asignaciones restantes',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({detalles:[{productoId:1,cantidad:4,precio:2}]}));
    await f.servicio.editar(f.admin,1,edicion({detalles:[{productoId:1,cantidad:1,precio:2}]}));
    assert.equal(f.db.lotes[0].cantidad,9);assert.equal(f.db.detalles[1].asignaciones[0].cantidad,1);
    await f.servicio.anular(f.admin,1,anulacion({version:2}));assert.equal(f.db.lotes[0].cantidad,10);
});
test('cambio de cliente sin abonos conserva asociación histórica, sin duplicar deuda',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));
    await f.servicio.editar(f.admin,1,edicion({tipo:'fiado',clienteId:2}));
    const previo=await f.servicio.cliente(f.admin,1),actual=await f.servicio.cliente(f.admin,2);
    assert.equal(previo.ventas.length,1);assert.equal(previo.saldo,0);assert.equal(actual.saldo,4);assert.equal(previo.ventas[0].historial.length,2);
});
test('abono concurrente invalida una edición o anulación calculada sobre una versión anterior',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));await f.servicio.abonar(f.vendedor,1,pago());
    const antes=structuredClone(f.db);
    await assert.rejects(f.servicio.anular(f.admin,1,anulacion()),{status:409});
    await assert.rejects(f.servicio.editar(f.admin,1,edicion({tipo:'fiado',clienteId:1})),{status:409});assert.deepEqual(f.db,antes);
});
for(const operacion of ['editar','anular'])test(`fallo contable revierte también inventario e historial al ${operacion}`,async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta());const antes=structuredClone(f.db);f.fallar('caja');
    await assert.rejects(operacion==='editar'?f.servicio.editar(f.admin,1,edicion({detalles:[{productoId:2,cantidad:1,precio:1}]})):f.servicio.anular(f.admin,1,anulacion()));assert.deepEqual(f.db,antes);
});
test('ediciones concurrentes no sobrescriben una revisión posterior',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta());
    const r=await Promise.allSettled([f.servicio.editar(f.admin,1,edicion({})),f.servicio.editar(f.admin,1,edicion({clave:'otra_correccion'}))]);
    assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.db.ventas[0].version,2);
});
test('regularización posterior mediante entrada del inventario reutiliza el faltante de la venta',async()=>{
    const {crearInventarioServicio}=require('./inventory-service');
    const f=preparar();f.db.lotes[0].cantidad=0;
    await f.servicio.crear(f.admin,venta({detalles:[{productoId:1,cantidad:2,precio:2,confirmarExistencia:true,caducidadFisica:null}]}));
    const inv={...f.repo.inventario,transaction:fn=>f.repo.transaction(tx=>fn(tx.inventario))};
    await crearInventarioServicio(inv,()=> '2026-11-17').entrada(f.admin,1,{codigo:'NUEVO',cantidad:3,precioCompra:1,proveedorId:1,fechaIngreso:'2026-11-17',caducidad:''});
    assert.equal(f.db.productos[0].faltante,0);assert.equal(f.db.lotes.find(l=>l.codigo==='NUEVO').cantidad,1);
});
test('abonos cero, negativos, fraccionarios de centavo o no numéricos se rechazan sin modificar saldos',async()=>{
    const f=preparar();await f.servicio.crear(f.admin,venta({tipo:'fiado',clienteId:1}));const antes=structuredClone(f.db);
    for(const n of [0,-1,0.001,'1',NaN,Infinity])await assert.rejects(f.servicio.abonar(f.vendedor,1,pago(n)),{status:400});
    assert.deepEqual(f.db,antes);
});
