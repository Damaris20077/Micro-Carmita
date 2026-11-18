const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
function crearEstadoRespaldos(directorio){
    const root=path.resolve(directorio),lock=path.join(root,'backup.lock'),estado=path.join(root,'state.json');
    let tokenActivo;
    async function preparar(){
        await fs.mkdir(root,{recursive:true,mode:0o700});const s=await fs.lstat(root);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('directorio_invalido');
        const real=await fs.realpath(root),proyecto=await fs.realpath(path.resolve(__dirname,'..')),rel=path.relative(proyecto,real);
        if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('directorio_publicable');
    }
    const store={
        async adquirir(){
            await preparar();let file;const token=randomUUID();
            try{file=await fs.open(lock,'wx',0o600)}catch(e){if(e.code==='EEXIST')return null;throw e}
            try{await file.writeFile(JSON.stringify({token,pid:process.pid,host:os.hostname(),creadoEn:new Date().toISOString()}));await file.sync();await file.close()}
            catch(e){await file.close().catch(()=>{});await fs.unlink(lock).catch(()=>{});throw e}
            tokenActivo=token;
            return async()=>{const actual=JSON.parse(await fs.readFile(lock,'utf8'));if(actual.token!==token)throw new Error('lock_cambiado');await fs.unlink(lock);tokenActivo=null};
        },
        async registrarHijo(pid){const actual=JSON.parse(await fs.readFile(lock,'utf8'));if(!tokenActivo||actual.token!==tokenActivo||!Number.isInteger(pid)||pid<1)throw new Error('lock_invalido');actual.dumpPid=pid;await fs.writeFile(lock,JSON.stringify(actual),{mode:0o600})},
        async leer(){
            let s;try{s=JSON.parse(await fs.readFile(estado,'utf8'))}catch(e){if(e.code==='ENOENT')return {version:1,lastSuccess:null,retryAfter:null,runs:[]};throw new Error('estado_invalido')}
            if(s.version!==1||!Array.isArray(s.runs)||(s.lastSuccess!==null&&!Number.isFinite(Date.parse(s.lastSuccess)))||(s.retryAfter!==null&&!Number.isFinite(Date.parse(s.retryAfter))))throw new Error('estado_invalido');return s;
        },
        async guardar(s){await preparar();const temporal=path.join(root,`state-${randomUUID()}.tmp`);const f=await fs.open(temporal,'wx',0o600);try{await f.writeFile(JSON.stringify(s,null,2));await f.sync()}finally{await f.close()};try{await fs.rename(temporal,estado)}catch(e){await fs.unlink(temporal).catch(()=>{});throw e}},
        async temporal(){await preparar();return fs.mkdtemp(path.join(root,'work-'))},
        async limpiar(dir){const p=path.resolve(dir);if(path.dirname(p)!==root||!path.basename(p).startsWith('work-'))throw new Error('ruta_invalida');await fs.rm(p,{recursive:true,force:true})},
        async desbloquear(confirmado){
            if(!confirmado)throw new Error('confirmacion_requerida');const data=JSON.parse(await fs.readFile(lock,'utf8'));
            if(data.host!==os.hostname()||!Number.isInteger(data.pid)||data.pid<1)throw new Error('revision_manual_requerida');
            for(const pid of [data.pid,data.dumpPid].filter(v=>v!==undefined)){
                if(!Number.isInteger(pid)||pid<1)throw new Error('revision_manual_requerida');
                try{process.kill(pid,0);throw new Error('proceso_activo')}catch(e){if(e.code!=='ESRCH')throw new Error('no_se_puede_desbloquear')}
            }
            await preparar();
            for(const nombre of await fs.readdir(root))if(nombre.startsWith('work-'))await store.limpiar(path.join(root,nombre));
            const s=await store.leer();s.lastResult={status:'interrupted',stage:'recuperacion_manual',at:new Date().toISOString()};
            s.retryAfter=s.lastResult.at;s.runs=[...s.runs,s.lastResult].slice(-100);await store.guardar(s);
            await fs.unlink(lock);
        }
    };
    return store;
}
module.exports={crearEstadoRespaldos};
