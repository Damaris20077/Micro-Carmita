require('dotenv').config({path:process.env.BACKUP_ENV_FILE||require('node:path').join(__dirname,'..','.env.backup'),quiet:true});
const fs=require('node:fs/promises'),path=require('node:path'),{setTimeout:esperar}=require('node:timers/promises');
const {configurarRespaldo}=require('./backup-config'),{crearEstadoRespaldos}=require('./backup-store');
const {crearDumpMySQL,crearAlmacenR2}=require('./backup-runtime'),{crearRespaldo}=require('./backup-service'),{descifrarArchivo}=require('./backup-crypto');
async function main(args=process.argv.slice(2)){
    const [comando,...opciones]=args;
    if(!['status','run','worker','unlock','decrypt'].includes(comando))throw new Error('comando');
    if(comando==='status'){
        if(!process.env.BACKUP_DIR){console.log(JSON.stringify({enabled:false,configured:false}));return}
        const estado=await crearEstadoRespaldos(process.env.BACKUP_DIR).leer();console.log(JSON.stringify({enabled:process.env.BACKUP_ENABLED==='true',...estado},null,2));return;
    }
    if(comando==='unlock'){
        if(opciones.length!==1||opciones[0]!=='--confirm-stopped'||!process.env.BACKUP_DIR)throw new Error('confirmacion');
        await crearEstadoRespaldos(process.env.BACKUP_DIR).desbloquear(true);console.log(JSON.stringify({status:'unlocked'}));return;
    }
    if(comando==='decrypt'){
        if(opciones.length!==3||opciones[0]!=='--confirm-private-output')throw new Error('confirmacion');
        const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY||'','base64');if(key.length!==32||key.toString('base64')!==process.env.BACKUP_ENCRYPTION_KEY)throw new Error('clave');
        const file=path.resolve(opciones[1]),salida=path.resolve(opciones[2]),proyecto=path.resolve(__dirname,'..');
        const rel=path.relative(proyecto,salida);if(!path.isAbsolute(opciones[2])||!rel||(!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel)))throw new Error('salida_publicable');
        const st=await fs.lstat(path.dirname(salida));if(!st.isDirectory()||st.isSymbolicLink())throw new Error('directorio');
        try{await descifrarArchivo(file,salida,key);console.log(JSON.stringify({status:'decrypted',restoreExecuted:false}))}finally{key.fill(0)}return;
    }
    if(opciones.some(v=>!['--now','--test'].includes(v))||(comando==='worker'&&opciones.includes('--now')))throw new Error('opciones');
    const config=configurarRespaldo(process.env,{test:opciones.includes('--test')});
    if(!config.enabled){console.log(JSON.stringify({status:'disabled'}));return}
    const storage=crearAlmacenR2(config),store=crearEstadoRespaldos(config.root);
    const service=crearRespaldo({config,store,dump:crearDumpMySQL(config),storage}),controller=new AbortController();
    const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
    try{do{
        const r=await service.ejecutar({force:opciones.includes('--now'),signal:controller.signal});console.log(JSON.stringify(r));
        if(r.status==='failed'||r.status==='blocked')process.exitCode=1;
        if(comando!=='worker'||controller.signal.aborted)break;
        try{await esperar(60000,undefined,{signal:controller.signal})}catch{break}
    }while(!controller.signal.aborted)}finally{storage.cerrar();config.key.fill(0);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop)}
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({status:'failed',stage:'configuracion_o_comando',detail:'Revise BACKUP.md. No comparta secretos.'}));process.exitCode=1});
module.exports={main};
