const M=require('../modelo');
const {fallo}=require('./auth-service');
const {snapshot}=require('./inventory-service');
const {resumirFinanzas}=require('./finance-service');
const TITULOS={ventas:'Ventas por período',cierre:'Cierre diario',pendientes:'Clientes con saldo pendiente',pagos:'Abonos semanales',finanzas:'Ingresos y egresos',inventario:'Inventario y alertas',pedidos:'Pedidos y estados'};
function fecha(v){if(!M.fechaValida(v)||v<'1000-01-01')throw fallo(400,'Fecha inválida.');return v;}
function rango(tipo,d,hoy){
    if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['fecha','desde','hasta'].includes(k)))throw fallo(400,'Parámetros inválidos.');
    if(['inventario','pendientes','pedidos'].includes(tipo)){if(Object.keys(d).length)throw fallo(400,'Este reporte muestra el estado actual y no admite fechas históricas.');return {}}
    if(['cierre','pagos'].includes(tipo)){
        if(d.desde!==undefined||d.hasta!==undefined)throw fallo(400,'Seleccione una fecha para el cierre o la semana.');
        const f=fecha(d.fecha??hoy);
        if(tipo==='cierre')return {desde:f,hasta:f};
        const inicio=new Date(f+'T00:00:00Z');inicio.setUTCDate(inicio.getUTCDate()-(inicio.getUTCDay()+6)%7);
        const fin=new Date(inicio);fin.setUTCDate(fin.getUTCDate()+6);
        return {desde:fecha(inicio.toISOString().slice(0,10)),hasta:fecha(fin.toISOString().slice(0,10))};
    }
    if(d.fecha!==undefined){if(d.desde!==undefined||d.hasta!==undefined)throw fallo(400,'Use fecha o rango.');return {desde:fecha(d.fecha),hasta:fecha(d.fecha)}}
    const r={};if(d.desde!==undefined)r.desde=fecha(d.desde);if(d.hasta!==undefined)r.hasta=fecha(d.hasta);
    if(r.desde&&r.hasta&&r.desde>r.hasta)throw fallo(400,'Rango invertido.');return r;
}
function suma(filas,campo){let n=0;for(const f of filas){const v=Number(f[campo]);if(!Number.isFinite(v))throw fallo(409,'Datos monetarios inválidos.');n+=Math.round(v*100)}if(!Number.isSafeInteger(n))throw fallo(409,'Total fuera del rango exacto. Reduzca el período.');return n/100;}
function crearReportesServicio(repo,{hoy=M.hoy,ahora=()=>new Date().toISOString()}={}){return {
    async generar(actor,tipo,datos={}){
        if(!actor?.activo||actor.rol!=='administrador')throw fallo(403,'Solo el Administrador puede consultar reportes.');
        if(!Object.hasOwn(TITULOS,tipo))throw fallo(404,'Reporte inexistente.');
        const fechaActual=hoy(),filtros=rango(tipo,datos,fechaActual);
        return repo.transaction(async tx=>{
            const r={tipo,titulo:TITULOS[tipo],generadoEn:ahora(),fechaConsulta:fechaActual,filtros,columnas:[],filas:[],totales:{},resumen:[],notas:[]};
            const columnas=(...c)=>{r.columnas=c.map(([clave,titulo,formato='texto'])=>({clave,titulo,formato}))};
            const resumir=(clave,etiqueta,valor,formato='dinero')=>{r.totales[clave]=valor;r.resumen.push({etiqueta,valor,formato})};
            if(tipo==='ventas'||tipo==='cierre'){
                const ventas=await tx.ventas(filtros),activas=ventas.filter(v=>v.estado==='Activa');
                r.filas=ventas.map(v=>({id:v.id,fecha:v.fecha,cliente:v.cliente||'Consumidor final',tipo:v.tipo,estado:v.estado,
                    productos:v.detalles.map(d=>`${d.nombre}: ${d.cantidad} x ${Number(d.precio).toFixed(2)}`).join('\n'),total:Number(v.total),computado:v.estado==='Activa'?Number(v.total):0}));
                columnas(['id','Venta'],['fecha','Fecha'],['cliente','Cliente'],['tipo','Tipo'],['estado','Estado'],['productos','Detalle'],['total','Total de la revisión','dinero'],['computado','Total vigente','dinero']);
                resumir('totalVentas','Ventas vigentes',suma(activas,'total'));
                resumir('contado','Ventas de contado',suma(activas.filter(v=>v.tipo==='contado'),'total'));
                resumir('fiado','Ventas fiadas',suma(activas.filter(v=>v.tipo==='fiado'),'total'));
                r.notas.push('Ventas según su fecha original y estado/revisión actuales. Anuladas excluidas de totales. El total vendido incluye fiados y no equivale a efectivo cobrado.');
                if(tipo==='cierre'){
                    const caja=resumirFinanzas(await tx.finanzas.listar(filtros));
                    resumir('ingresos','Ingresos efectivos del día',caja.ingresos);resumir('egresos','Egresos del día',caja.egresos);resumir('netoCaja','Neto de caja del día',caja.neto);
                    r.notas.push('Caja incluye movimientos manuales, cobros, abonos, correcciones y reembolsos por su propia fecha; no suma fiados sin cobro. Cierre consultado, sin bloqueo ni registro de cierre definitivo.');
                }
            }else if(tipo==='finanzas'){
                const caja=resumirFinanzas(await tx.finanzas.listar(filtros));r.filas=caja.movimientos;
                columnas(['id','Movimiento'],['fecha','Fecha'],['tipo','Tipo'],['categoria','Categoría'],['motivo','Motivo'],['responsable','Responsable'],['importe','Importe','dinero']);
                for(const k of ['ingresos','egresos','neto'])resumir(k,k==='neto'?'Neto':k==='ingresos'?'Ingresos':'Egresos',caja[k]);
                r.notas.push('Consulta directa de caja y manuales, sin copias. Los reembolsos son egresos; no se excluyen por anular la venta.');
            }else if(tipo==='pendientes'){
                r.filas=(await tx.pendientes()).map(v=>({...v,deuda:Number(v.deuda),abonos:Number(v.abonos),saldo:Number(v.saldo)}));
                columnas(['id','Cliente ID'],['nombre','Cliente'],['deuda','Deuda','dinero'],['abonos','Abonos','dinero'],['saldo','Saldo','dinero']);
                for(const k of ['deuda','abonos','saldo'])resumir(k,k==='deuda'?'Deuda vigente':k==='abonos'?'Abonos aplicados':'Saldo pendiente',suma(r.filas,k));
                r.notas.push('Estado actual: clientes con saldo positivo; suma todos sus fiados activos. Ventas anuladas no generan deuda.');
            }else if(tipo==='pagos'){
                r.filas=(await tx.pagos(filtros)).map(p=>({...p,importe:Number(p.importe)}));
                columnas(['id','Abono'],['fecha','Fecha'],['cliente','Cliente'],['ventaId','Venta'],['estadoVenta','Estado actual'],['responsable','Responsable'],['importe','Abono','dinero']);
                resumir('abonos','Abonos brutos de la semana',suma(r.filas,'importe'));
                r.notas.push('Semana de lunes a domingo, America/Guayaquil. Incluye pagos históricos de ventas luego anuladas; sus devoluciones figuran como egresos en Finanzas.');
            }else if(tipo==='inventario'){
                const productos=snapshot(await tx.inventario.productos(),await tx.inventario.lotes(),fechaActual);
                r.filas=productos.map(p=>({id:p.id,nombre:p.nombre,estado:p.activo?'Activo':'Archivado',stock:p.stock,alerta:p.stockBajo?'Stock bajo':'',
                    lotes:p.lotes.map(l=>`${l.codigo}: ${l.cantidad}; ${l.caducidad||'Sin caducidad'}; ${l.estado}`).join('\n')||'Sin lotes'}));
                columnas(['id','Producto'],['nombre','Nombre'],['estado','Estado'],['stock','Stock','numero'],['alerta','Alerta'],['lotes','Lotes y caducidad']);
                resumir('productos','Productos',productos.length,'numero');resumir('stockBajo','Productos con stock menor a 3',productos.filter(p=>p.stockBajo).length,'numero');
                resumir('proximos','Lotes con unidades por caducar (0 a 5 días)',productos.flatMap(p=>p.lotes).filter(l=>l.cantidad>0&&l.estado==='Por caducar').length,'numero');
                resumir('vencidos','Lotes vencidos con unidades',productos.flatMap(p=>p.lotes).filter(l=>l.cantidad>0&&l.estado==='Caducado').length,'numero');
                r.notas.push('Existencias registradas = suma física de lotes, incluidos vencidos, menos faltantes. El stock bajo incluye cero y negativos. Los lotes vencidos no se pueden vender. Estado actual, sin reconstrucción histórica.');
            }else{
                r.filas=[];for(const p of await tx.pedidos.lista()){
                    const d=await tx.pedidos.detalles(p.id);r.filas.push({id:p.id,proveedor:p.proveedor,estado:p.estado,detalle:d.map(l=>`${l.producto}: ${l.recibida}/${l.cantidad} recibidas`).join('\n')});
                }
                columnas(['id','Pedido'],['proveedor','Proveedor'],['estado','Estado'],['detalle','Solicitado y recibido']);resumir('pedidos','Pedidos',r.filas.length,'numero');
            }
            return r;
        });
    }
};}
module.exports={crearReportesServicio};
