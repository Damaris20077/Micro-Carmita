function crearFinanzasRepositorio(db) {
    const q = async (sql, params = []) => (await db.execute(sql, params))[0];
    return {
        async transaction(fn) {
            const c = await db.getConnection();
            try { await c.beginTransaction(); const r = await fn(crearFinanzasRepositorio(c)); await c.commit(); return r; }
            catch (e) { await c.rollback(); throw e; }
            finally { c.release(); }
        },
        async actor(id) { return (await q('SELECT id,rol,activo FROM usuarios WHERE id=? FOR UPDATE',[id]))[0]; },
        async porClave(actor, clave) { return (await q('SELECT id,contenido_hash FROM movimientos_financieros WHERE usuario_id=? AND clave=?',[actor,clave]))[0]; },
        async crear(actor,d,hash) {
            return (await q(`INSERT INTO movimientos_financieros
                (usuario_id,tipo,categoria,motivo,importe,fecha,gasto_administrativo,clave,contenido_hash) VALUES (?,?,?,?,?,?,?,?,?)`,
            [actor.id,d.tipo,d.categoria,d.motivo,d.importe,d.fecha,d.gastoAdministrativo,d.clave,hash])).insertId;
        },
        async listar(f) {
            const condiciones=[], params=[];
            if(f.desde){condiciones.push('fecha>=?');params.push(f.desde)}
            if(f.hasta){condiciones.push('fecha<=?');params.push(f.hasta)}
            return q(`SELECT * FROM (
                SELECT CONCAT('manual:',m.id) AS id,'manual' AS origen,m.tipo,m.categoria,m.motivo,m.importe,
                    DATE_FORMAT(m.fecha,'%Y-%m-%d') AS fecha,m.gasto_administrativo AS gastoAdministrativo,
                    m.usuario_id AS usuarioId,u.nombre AS responsable,NULL AS ventaId,
                    DATE_FORMAT(m.creado_en,'%Y-%m-%dT%H:%i:%s.%fZ') AS registradoEn
                FROM movimientos_financieros m JOIN usuarios u ON u.id=m.usuario_id
                UNION ALL
                SELECT CONCAT('venta:',c.id),'venta',IF(c.importe>0,'ingreso','egreso'),
                    CONVERT(c.tipo USING utf8mb4) COLLATE utf8mb4_0900_ai_ci,
                    CONVERT(CONCAT('Venta ',c.venta_id,' · ',c.tipo) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci,ABS(c.importe),
                    DATE_FORMAT(DATE_SUB(c.creado_en,INTERVAL 5 HOUR),'%Y-%m-%d'),0,c.usuario_id,u.nombre,c.venta_id,
                    DATE_FORMAT(c.creado_en,'%Y-%m-%dT%H:%i:%s.%fZ')
                FROM venta_caja c JOIN usuarios u ON u.id=c.usuario_id
            ) movimientos ${condiciones.length?'WHERE '+condiciones.join(' AND '):''} ORDER BY fecha,registradoEn,id`,params);
        }
    };
}
module.exports={crearFinanzasRepositorio};
