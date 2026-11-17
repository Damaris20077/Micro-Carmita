// Reutiliza los datos temporales y el rollback externo del ensayo financiero.
const assert=require('node:assert/strict');
const {verificar}=require('./verify-finance-real');
async function comprobarPendientes({admin,vendedor,clienteId}){
    const r=await admin('/reports/pendientes');assert.equal(r.status,200);
    const fila=r.data.filas.find(c=>c.id===clienteId);assert.ok(fila);
    assert.equal(fila.deuda,2);assert.equal(fila.abonos,1);assert.equal(fila.saldo,1);
    const pdf=await admin('/reports/pendientes/pdf');assert.equal(pdf.status,200);
    assert.ok(pdf.contentType.startsWith('application/pdf'));assert.ok(Buffer.isBuffer(pdf.data));assert.equal(pdf.data.subarray(0,5).toString(),'%PDF-');
    assert.equal((await vendedor('/reports/pendientes/pdf')).status,403);
}
async function comprobarReportes({admin,vendedor,fecha,productoId,clienteId,contadoId,fiadoId,finanzas}){
    const reportes={};
    for(const tipo of ['ventas','cierre','pendientes','pagos','finanzas','inventario','pedidos']){
        const filtro=['ventas','cierre','pagos','finanzas'].includes(tipo)?`?fecha=${fecha}`:'';
        const ruta=`/reports/${tipo}`;
        const json=await admin(ruta+filtro);assert.equal(json.status,200);reportes[tipo]=json.data;
        const pdf=await admin(ruta+'/pdf'+filtro);assert.equal(pdf.status,200);assert.ok(pdf.contentType.startsWith('application/pdf'));
        assert.ok(Buffer.isBuffer(pdf.data));assert.equal(pdf.data.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.data.includes(Buffer.from('%%EOF')));
        assert.equal((await vendedor(ruta+filtro)).status,403);assert.equal((await vendedor(ruta+'/pdf'+filtro)).status,403);
    }
    const v=reportes.ventas.filas.find(v=>v.id===contadoId),anulada=reportes.ventas.filas.find(v=>v.id===fiadoId);
    assert.equal(v.computado,2);assert.equal(v.tipo,'contado');assert.equal(anulada.estado,'Anulada');assert.equal(anulada.computado,0);
    assert.equal(reportes.cierre.totales.totalVentas,reportes.ventas.totales.totalVentas);
    assert.equal(reportes.cierre.totales.ingresos,finanzas.ingresos);assert.equal(reportes.cierre.totales.egresos,finanzas.egresos);assert.equal(reportes.cierre.totales.netoCaja,finanzas.neto);
    assert.equal(reportes.finanzas.totales.ingresos,finanzas.ingresos);assert.equal(reportes.finanzas.totales.egresos,finanzas.egresos);
    assert.equal(reportes.pendientes.filas.some(c=>c.id===clienteId),false);
    const abono=reportes.pagos.filas.filter(p=>p.ventaId===fiadoId);assert.equal(abono.length,1);assert.equal(abono[0].importe,1);assert.equal(abono[0].estadoVenta,'Anulada');
    const producto=reportes.inventario.filas.find(p=>p.id===productoId);assert.equal(producto.stock,1);assert.equal(producto.alerta,'Stock bajo');
    assert.match(producto.lotes,/Por caducar/);assert.ok(reportes.inventario.totales.proximos>=1);
}
if(require.main===module)verificar({comprobarReportes,comprobarPendientes}).catch(()=>{console.error('No se pudo cerrar el ensayo de reportes.');process.exitCode=1});
module.exports={comprobarReportes,comprobarPendientes};
