const test=require('node:test'),assert=require('node:assert/strict');
const {comprobarReportes,comprobarPendientes}=require('./verify-reports-real');
function preparar(error=false){
    const llamadas=[];
    const reportes={ventas:{filas:[{id:1,tipo:'contado',computado:2},{id:2,estado:'Anulada',computado:0}],totales:{totalVentas:2}},
        cierre:{totales:{totalVentas:2,ingresos:8,egresos:4,netoCaja:4}},finanzas:{totales:{ingresos:8,egresos:4}},
        pendientes:{filas:[]},pagos:{filas:[{ventaId:2,importe:1,estadoVenta:'Anulada'}]},inventario:{filas:[{id:3,stock:1,alerta:'Stock bajo',lotes:'QA: 1; Por caducar'}],totales:{proximos:1}},pedidos:{filas:[]}};
    return {llamadas,datos:{fecha:'2026-11-17',productoId:3,clienteId:4,contadoId:1,fiadoId:2,finanzas:{ingresos:8,egresos:4,neto:4},
        admin:async ruta=>{llamadas.push(ruta);const tipo=ruta.split('/')[2].split('?')[0];return ruta.includes('/pdf')?{status:200,contentType:'application/pdf',data:Buffer.from(error?'INVALIDO':'%PDF-1.3\n%%EOF')}:{status:200,data:reportes[tipo]}},
        vendedor:async()=>({status:403})}};
}
test('ensayo de reportes contrasta siete JSON/PDF y coherencia de ventas, caja, abonos e inventario',async()=>{const f=preparar();await comprobarReportes(f.datos);assert.equal(f.llamadas.length,14);assert.ok(f.llamadas.includes('/reports/pendientes/pdf'));assert.ok(f.llamadas.includes('/reports/pagos?fecha=2026-11-17'))});
test('ensayo rechaza PDF incorrecto para que el cierre externo revierta la operación',async()=>{const f=preparar(true);await assert.rejects(comprobarReportes(f.datos))});

test('ensayo de pendientes comprueba deuda, abonos y saldo positivos antes de anular',async()=>{
    const rutas=[];await comprobarPendientes({clienteId:4,admin:async ruta=>{rutas.push(ruta);return ruta.endsWith('/pdf')?{status:200,contentType:'application/pdf',data:Buffer.from('%PDF-1.3')}:{status:200,data:{filas:[{id:4,deuda:2,abonos:1,saldo:1}]}}},vendedor:async()=>({status:403})});assert.equal(rutas.length,2);
});
test('ensayo rechaza saldo incorrecto antes de declarar RF-31 verificado',async()=>{
    await assert.rejects(comprobarPendientes({clienteId:4,admin:async()=>({status:200,data:{filas:[{id:4,deuda:2,abonos:1,saldo:0}]}})}));
});
