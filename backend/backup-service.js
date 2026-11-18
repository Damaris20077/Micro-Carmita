const path=require('node:path'),{randomUUID}=require('node:crypto');
const {cifrarDump}=require('./backup-crypto');
const QUINCENA=15*24*60*60*1000,REINTENTO=60*60*1000;
function pendiente(estado,ahora){
    if(estado.retryAfter)return Date.parse(estado.retryAfter)<=ahora;
    return !estado.lastSuccess||ahora-Date.parse(estado.lastSuccess)>=QUINCENA;
}
function crearRespaldo({config,store,dump,storage,clock=()=>Date.now(),cifrar=cifrarDump}){
    return {async ejecutar({force=false,signal}={}){
        if(!config.enabled)return {status:'disabled'};
        let liberar,dir,job,estado,etapa='lock',resultado,conservarLock=false;
        const controller=new AbortController();const abortar=()=>controller.abort();
        signal?.addEventListener('abort',abortar,{once:true});if(signal?.aborted)controller.abort();
        const timer=setTimeout(abortar,config.timeoutMs);timer.unref?.();
        try{
            liberar=await store.adquirir();if(!liberar)return {status:'blocked',stage:'lock'};
            etapa='estado';estado=await store.leer();
            if(!force&&!pendiente(estado,clock())){
                await liberar();liberar=null;
                return {status:'not_due',nextDue:estado.retryAfter||new Date(Date.parse(estado.lastSuccess)+QUINCENA).toISOString()};
            }
            const runId=randomUUID(),inicio=new Date(clock()).toISOString();
            estado.lastResult={status:'running',runId,at:inicio,stage:'dump'};await store.guardar(estado);
            etapa='temporal';dir=await store.temporal();const file=path.join(dir,'backup.mcbackup');
            etapa='dump';controller.signal.throwIfAborted();job=await dump(dir,{signal:controller.signal});
            if(job.pid)await store.registrarHijo(job.pid);
            const cifrado=cifrar(job.stream,file,config.key,config.keyId,{signal:controller.signal});
            cifrado.catch(()=>{job.cancelar();controller.abort()});job.terminado.catch(()=>controller.abort());
            const datos=await Promise.allSettled([cifrado,job.terminado]);
            if(datos.some(r=>r.status==='rejected'))throw new Error('dump_fallido');
            const metadata=datos[0].value,key=`${config.prefix}/${inicio.replace(/[:.]/g,'-')}-${runId}.mcbackup`;
            etapa='subida';await storage.subir(file,key,metadata,{signal:controller.signal});
            etapa='verificacion';await storage.verificar(key,metadata,{signal:controller.signal});
            etapa='limpieza';await store.limpiar(dir);dir=null;
            const completado=new Date(clock()).toISOString();
            estado.lastSuccess=completado;estado.retryAfter=null;
            estado.lastResult={status:'success',runId,at:completado,bytes:metadata.bytes,key,keyId:config.keyId};
            estado.runs=[...estado.runs,estado.lastResult].slice(-100);
            etapa='registro';await store.guardar(estado);resultado={...estado.lastResult,nextDue:new Date(clock()+QUINCENA).toISOString()};
        }catch{
            if(job){job.cancelar();await job.terminado.catch(()=>{})}
            if(etapa==='registro'||etapa==='estado')conservarLock=true;
            if(dir){try{await store.limpiar(dir);dir=null}catch{conservarLock=true;etapa='limpieza'}}
            resultado={status:'failed',stage:etapa,at:new Date(clock()).toISOString(),needsAttention:conservarLock};
            if(estado){estado.retryAfter=new Date(clock()+REINTENTO).toISOString();estado.lastResult=resultado;estado.runs=[...estado.runs,resultado].slice(-100);
                try{await store.guardar(estado)}catch{conservarLock=true;resultado.needsAttention=true;resultado.stage='registro'}}
        }finally{
            clearTimeout(timer);signal?.removeEventListener('abort',abortar);
            if(liberar&&!conservarLock){try{await liberar()}catch{resultado={status:'failed',stage:'liberacion_lock',needsAttention:true}}}
        }
        return resultado;
    }};
}
module.exports={crearRespaldo,pendiente,QUINCENA};
