const {crearInventarioRepositorio}=require('./inventory-repository');
const {crearVentasRepositorio}=require('./sales-repository');
const {crearPedidosRepositorio}=require('./order-repository');
const {crearFinanzasRepositorio}=require('./finance-repository');
function crearReportesRepositorio(db){
    const q=async(sql,p=[])=>(await db.execute(sql,p))[0];
    const ventas=crearVentasRepositorio(db);
    const periodo=(expresion,f)=>{
        const condiciones=[],parametros=[];
        if(f.desde){condiciones.push(`${expresion}>=?`);parametros.push(f.desde)}
        if(f.hasta){condiciones.push(`${expresion}<=?`);parametros.push(f.hasta)}
        return {where:condiciones.length?' WHERE '+condiciones.join(' AND '):'',parametros};
    };
    return {
        inventario:crearInventarioRepositorio(db),pedidos:crearPedidosRepositorio(db),finanzas:crearFinanzasRepositorio(db),
        async transaction(fn){const c=await db.getConnection();try{await c.beginTransaction();const r=await fn(crearReportesRepositorio(c));await c.commit();return r}catch(e){await c.rollback();throw e}finally{c.release()}},
        async ventas(f){
            const fecha="DATE(DATE_SUB(v.creado_en,INTERVAL 5 HOUR))",p=periodo(fecha,f);
            const filas=await q(`SELECT v.*,c.nombre AS cliente,DATE_FORMAT(${fecha},'%Y-%m-%d') AS fecha
                FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id${p.where} ORDER BY v.creado_en,v.id`,p.parametros);
            for(const v of filas)v.detalles=await ventas.detalles(v.id,v.revision);
            return filas;
        },
        async pendientes(){return q(`SELECT c.id,c.nombre,SUM(v.total) AS deuda,SUM(v.abonado) AS abonos,SUM(v.saldo) AS saldo
            FROM clientes c JOIN ventas v ON v.cliente_id=c.id AND v.tipo='fiado' AND v.estado='Activa'
            GROUP BY c.id,c.nombre HAVING SUM(v.saldo)>0 ORDER BY c.id`)},
        async pagos(f){
            const fecha="DATE(DATE_SUB(a.creado_en,INTERVAL 5 HOUR))",p=periodo(fecha,f);
            return q(`SELECT a.id,a.venta_id AS ventaId,a.importe,u.nombre AS responsable,c.nombre AS cliente,v.estado AS estadoVenta,
                DATE_FORMAT(${fecha},'%Y-%m-%d') AS fecha,DATE_FORMAT(a.creado_en,'%Y-%m-%dT%H:%i:%s.%fZ') AS registradoEn
                FROM venta_abonos a JOIN ventas v ON v.id=a.venta_id JOIN clientes c ON c.id=v.cliente_id
                JOIN usuarios u ON u.id=a.usuario_id${p.where} ORDER BY a.creado_en,a.id`,p.parametros);
        }
    };
}
module.exports={crearReportesRepositorio};
