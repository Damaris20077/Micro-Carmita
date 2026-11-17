const {createHash}=require('node:crypto');
const {fallo}=require('./auth-service');
const M=require('../modelo');
function autorizar(a){if(!a?.activo||a.rol!=='administrador')throw fallo(403,'Solo el Administrador puede gestionar movimientos financieros.');}
function campos(d,lista){if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!lista.includes(k)))throw fallo(400,'Campos inválidos.');}
function fecha(v){if(!M.fechaValida(v)||v<'1000-01-01')throw fallo(400,'Fecha válida requerida (AAAA-MM-DD).');return v;}
function texto(v,max){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fallo(400,'Complete categoría y motivo dentro de sus límites.');return v.trim();}
function filtros(d){
    campos(d,['fecha','desde','hasta']);
    if(d.fecha!==undefined){if(d.desde!==undefined||d.hasta!==undefined)throw fallo(400,'Use fecha o rango, no ambos.');return {desde:fecha(d.fecha),hasta:fecha(d.fecha)};}
    const r={};if(d.desde!==undefined)r.desde=fecha(d.desde);if(d.hasta!==undefined)r.hasta=fecha(d.hasta);
    if(r.desde&&r.hasta&&r.desde>r.hasta)throw fallo(400,'Rango de fechas invertido.');return r;
}
function crearFinanzasServicio(repo){return {
    async registrar(actor,datos){
        autorizar(actor);campos(datos,['clave','tipo','categoria','motivo','importe','fecha','gastoAdministrativo']);
        if(!['ingreso','egreso'].includes(datos.tipo))throw fallo(400,'Tipo inválido.');
        if(typeof datos.importe!=='number'||!Number.isFinite(datos.importe)||datos.importe<=0||datos.importe>99999999.99||M.redondear(datos.importe)!==datos.importe)throw fallo(400,'Importe positivo con hasta dos decimales requerido.');
        if(typeof datos.clave!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(datos.clave))throw fallo(400,'Clave de idempotencia inválida.');
        if(datos.gastoAdministrativo!==undefined&&typeof datos.gastoAdministrativo!=='boolean')throw fallo(400,'Indicador administrativo inválido.');
        const d={tipo:datos.tipo,categoria:texto(datos.categoria,80),motivo:texto(datos.motivo,255),importe:Math.round(datos.importe*100)/100,
            fecha:fecha(datos.fecha),gastoAdministrativo:datos.gastoAdministrativo===true};
        if(d.gastoAdministrativo&&d.tipo!=='egreso')throw fallo(400,'Un gasto administrativo debe ser egreso.');
        const hash=createHash('sha256').update(JSON.stringify(d)).digest('hex');
        return repo.transaction(async tx=>{
            const actual=await tx.actor(actor.id);autorizar(actual);
            const anterior=await tx.porClave(actual.id,datos.clave);
            if(anterior){if(anterior.contenido_hash!==hash)throw fallo(409,'Clave utilizada con otros datos.');return {id:anterior.id,repetida:true};}
            const id=await tx.crear(actual,{...d,clave:datos.clave},hash);return {id,repetida:false};
        });
    },
    async consultar(actor,datos={}){
        autorizar(actor);const f=filtros(datos);
        return repo.transaction(async tx=>{
            const movimientos=(await tx.listar(f)).map(m=>({...m,importe:Number(m.importe),gastoAdministrativo:Number(m.gastoAdministrativo)===1}));
            let ingresos=0,egresos=0;
            for(const m of movimientos){const n=Math.round(m.importe*100);if(m.tipo==='ingreso')ingresos+=n;else egresos+=n;}
            if(!Number.isSafeInteger(ingresos)||!Number.isSafeInteger(egresos))throw fallo(409,'Totales fuera del rango exacto de cálculo. Reduzca el período.');
            return {filtros:f,movimientos,ingresos:ingresos/100,egresos:egresos/100,neto:(ingresos-egresos)/100};
        });
    }
};}
module.exports={crearFinanzasServicio};
