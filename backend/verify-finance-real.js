// Ensayo manual, únicamente después de 005 y autorización de escrituras temporales.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict'),{once}=require('node:events'),{randomBytes}=require('node:crypto');
const {crearPool}=require('./database'),{crearApp}=require('./app');
const {crearRepositorio}=require('./auth-repository');
const {crearInventarioRepositorio}=require('./inventory-repository');
const {crearVentasRepositorio}=require('./sales-repository');
const {crearFinanzasRepositorio}=require('./finance-repository');
const {capturarEstado}=require('./verify-sales-real');
const {cerrarVerificacion}=require('./verification-cleanup');
const M=require('../modelo');
async function capturarTodo(c){
    const s=await capturarEstado(c);
    const tablas={ventas:'id',venta_detalles:'id',venta_lotes:'detalle_id,lote_id',venta_abonos:'id',venta_caja:'id',venta_historial:'id',venta_operaciones:'usuario_id,clave',movimientos_financieros:'id'};
    for(const [tabla,orden]of Object.entries(tablas)){const [r]=await c.execute(`SELECT * FROM ${tabla} ORDER BY ${orden}`);s[tabla]=r}
    return s;
}
async function verificar(){
    let pool,connection,server,etapa='credenciales';const informe={ok:false,rollback:false,comprobaciones:[]};
    try{
        if(!process.env.AUTH_CHECK_USER||!process.env.AUTH_CHECK_PASSWORD)throw new Error();
        pool=crearPool();connection=await pool.getConnection();etapa='migracion_005';
        const [versiones]=await connection.execute('SELECT version FROM schema_migrations WHERE version IN (?,?,?,?,?)',['001_auth','002_catalogo_inventario','003_pedidos_recepciones','004_ventas_cobros','005_finanzas']);assert.equal(versiones.length,5);
        const [tablas]=await connection.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');assert.equal(tablas.length,22);assert.ok(tablas.every(t=>t.ENGINE==='InnoDB'));
        await connection.beginTransaction();etapa='estado_previo';const anterior=await capturarTodo(connection);
        const a=anterior.usuarios.filter(u=>u.usuario===process.env.AUTH_CHECK_USER);assert.equal(a.length,1);assert.equal(a[0].rol,'administrador');assert.equal(a[0].activo,1);
        const puente={execute:(...args)=>connection.execute(...args),async getConnection(){return {execute:(...args)=>connection.execute(...args),async beginTransaction(){await connection.query('SAVEPOINT finanzas_ensayo')},async commit(){await connection.query('RELEASE SAVEPOINT finanzas_ensayo')},async rollback(){await connection.query('ROLLBACK TO SAVEPOINT finanzas_ensayo')},release(){}}}};
        const origin='http://127.0.0.1:3000';server=crearApp({repository:crearRepositorio(puente),inventoryRepository:crearInventarioRepositorio(puente),salesRepository:crearVentasRepositorio(puente),financeRepository:crearFinanzasRepositorio(puente),origin}).listen(0,'127.0.0.1');await once(server,'listening');
        const base=`http://127.0.0.1:${server.address().port}/api`;
        function cliente(){let cookie='',csrf='';return async(ruta,method='GET',datos)=>{
            const r=await fetch(base+ruta,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:datos===undefined?undefined:JSON.stringify(datos),signal:AbortSignal.timeout(10000)});
            if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=r.status===204?{}:await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,data};
        }}
        etapa='login';const admin=cliente();assert.equal((await admin('/auth/login','POST',{usuario:process.env.AUTH_CHECK_USER,clave:process.env.AUTH_CHECK_PASSWORD})).status,200);delete process.env.AUTH_CHECK_PASSWORD;
        const tag=randomBytes(8).toString('hex'),fecha=M.hoy(),ruta=`/finance?fecha=${fecha}`,centavos=n=>Math.round(n*100);
        const inicial=await admin(ruta);assert.equal(inicial.status,200);
        etapa='manuales';const ingreso={clave:`ING-${tag}`,tipo:'ingreso',categoria:'Ensayo',motivo:'Aporte temporal',importe:5,fecha};
        const egreso={clave:`EGR-${tag}`,tipo:'egreso',categoria:'Luz',motivo:'Gasto temporal',importe:3,fecha,gastoAdministrativo:true};
        const i=await admin('/finance','POST',ingreso);assert.equal(i.status,201);assert.equal((await admin('/finance','POST',ingreso)).status,200);
        assert.equal((await admin('/finance','POST',{...ingreso,importe:6})).status,409);
        const e=await admin('/finance','POST',egreso);assert.equal(e.status,201);
        assert.equal((await admin('/finance','POST',{...egreso,clave:`INVALIDO-${tag}`,importe:-1})).status,400);
        etapa='datos_temporales';
        const prov=await admin('/proveedores','POST',{nombre:`QA finanzas ${tag}`});assert.equal(prov.status,201);
        const cli=await admin('/clientes','POST',{nombre:`QA finanzas ${tag}`});assert.equal(cli.status,201);
        const p=await admin('/products','POST',{nombre:`QA finanzas ${tag}`,categoria:'Ensayo',precioCompra:1,precioVenta:2,proveedorId:prov.data.registro.id,codigo:`QA-${tag}`,cantidad:2,fechaIngreso:fecha,caducidad:''});assert.equal(p.status,201);
        const usuario=`qa_f_${tag}`,clave=randomBytes(32).toString('hex');
        const v=await admin('/users','POST',{nombre:'QA finanzas temporal',usuario,clave,rol:'vendedor'});assert.equal(v.status,201);
        const vendedor=cliente();assert.equal((await vendedor('/auth/login','POST',{usuario,clave})).status,200);
        etapa='permisos';assert.equal((await vendedor(ruta)).status,403);assert.equal((await vendedor('/finance','POST',{...ingreso,clave:`PROHIBIDO-${tag}`})).status,403);
        etapa='integracion_ventas';
        const venta={tipo:'contado',clienteId:cli.data.registro.id,detalles:[{productoId:p.data.productoId,cantidad:1,precio:2}],clave:`CONTADO-${tag}`};
        const contado=await vendedor('/sales','POST',venta);assert.equal(contado.status,201);
        const fiado=await vendedor('/sales','POST',{...venta,tipo:'fiado',clave:`FIADO-${tag}`});assert.equal(fiado.status,201);
        const antesAbono=await admin(ruta);assert.equal(centavos(antesAbono.data.ingresos)-centavos(inicial.data.ingresos),700); // 5 manual + 2 contado.
        const abono={clave:`ABONO-${tag}`,importe:1};assert.equal((await vendedor(`/sales/${fiado.data.id}/payments`,'POST',abono)).status,201);assert.equal((await vendedor(`/sales/${fiado.data.id}/payments`,'POST',abono)).status,200);
        const detalle=await admin(`/sales/${fiado.data.id}`);assert.equal(detalle.status,200);
        assert.equal((await admin(`/sales/${fiado.data.id}/void`,'POST',{clave:`ANULAR-${tag}`,version:detalle.data.version,motivo:'Ensayo financiero',confirmarReembolso:true})).status,200);
        etapa='conciliacion';const final=await admin(ruta);assert.equal(final.status,200);
        assert.equal(centavos(final.data.ingresos)-centavos(inicial.data.ingresos),800);
        assert.equal(centavos(final.data.egresos)-centavos(inicial.data.egresos),400);
        assert.equal(centavos(final.data.neto)-centavos(inicial.data.neto),400);
        assert.equal(final.data.movimientos.length-inicial.data.movimientos.length,5);
        const cajaContado=await admin(`/sales/${contado.data.id}`),cajaFiado=await admin(`/sales/${fiado.data.id}`);
        assert.equal(cajaContado.status,200);assert.equal(cajaFiado.status,200);
        const idsPrevios=new Set(inicial.data.movimientos.map(m=>m.id));
        const nuevos=final.data.movimientos.filter(m=>!idsPrevios.has(m.id));
        const esperados=[`manual:${i.data.id}`,`manual:${e.data.id}`,
            ...cajaContado.data.caja.map(m=>`venta:${m.id}`),...cajaFiado.data.caja.map(m=>`venta:${m.id}`)];
        assert.equal(esperados.length,5);assert.equal(new Set(nuevos.map(m=>m.id)).size,5);
        assert.deepEqual(nuevos.map(m=>m.id).sort(),esperados.sort());
        assert.ok(final.data.movimientos.some(m=>m.id===`manual:${e.data.id}`&&m.gastoAdministrativo&&m.categoria==='Luz'));
        const filtro=await admin(`/finance?desde=${fecha}&hasta=${fecha}`);assert.equal(filtro.status,200);assert.equal(filtro.data.movimientos.length,final.data.movimientos.length);
        informe.comprobaciones.push('RF-25 ingresos, RF-26 egresos clasificados, RF-27 gastos administrativos y RF-28 filtros inclusivos',
            'Vendedor HTTP 403; idempotencia; contado/abono/reembolso únicos, sin ingreso anticipado del fiado');
        assert.equal((await vendedor('/auth/logout','POST',{})).status,204);assert.equal((await admin('/auth/logout','POST',{})).status,204);
        etapa='rollback';await connection.rollback();assert.deepEqual(await capturarTodo(connection),anterior);
        informe.comprobaciones.push('Las 22 tablas conservan todas las filas previas, incluidos Administrador, sesiones, ventas e inventario');informe.ok=true;
    }catch{informe.etapaFallida=etapa;process.exitCode=1}
    finally{delete process.env.AUTH_CHECK_PASSWORD;const r=await cerrarVerificacion({server,connection,pool});informe.rollback=r.rollback;if(r.errores.length){informe.ok=false;informe.erroresLimpieza=r.errores;process.exitCode=1}console.log(JSON.stringify(informe,null,2))}
}
if(require.main===module)verificar().catch(()=>{console.error('No se pudo cerrar el ensayo.');process.exitCode=1});
module.exports={verificar,capturarTodo};
