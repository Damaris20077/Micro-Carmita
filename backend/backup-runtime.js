const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const mysql=require('mysql2/promise'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const {S3Client,PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
function opcionesMySQL(db){
    const escapar=v=>{if(/[\r\n\0]/.test(String(v)))throw new Error('configuracion');return '"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"'};
    return '[client]\n'+['host','port','user','password'].map(k=>`${k}=${escapar(db[k])}`).join('\n')+'\n';
}
function crearDumpMySQL(config,cliente=mysql,lanzar=spawn){return async(dir,{signal}={})=>{
    const c=await cliente.createConnection({...config.db,connectTimeout:5000});
    const abortar=()=>c.destroy();signal?.addEventListener('abort',abortar,{once:true});
    try{
        signal?.throwIfAborted();
        const [tablas]=await c.execute({sql:'SELECT TABLE_TYPE,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',timeout:5000},[config.db.database]);
        if(!tablas.length||tablas.some(t=>t.TABLE_TYPE!=='BASE TABLE'||t.ENGINE!=='InnoDB'))throw new Error('esquema_no_soportado');
        // El esquema del proyecto no utiliza triggers; no omitirlos silenciosamente.
        const [triggers]=await c.execute({sql:'SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',timeout:5000},[config.db.database]);
        if(Number(triggers[0].total)!==0)throw new Error('triggers_no_soportados');
    }catch(e){c.destroy?.();throw e}finally{signal?.removeEventListener('abort',abortar);await c.end().catch(()=>{})}
    const options=path.join(dir,'mysql.cnf');await fsp.writeFile(options,opcionesMySQL(config.db),{flag:'wx',mode:0o600});
    const args=[`--defaults-extra-file=${options}`,'--protocol=TCP','--single-transaction','--quick','--skip-lock-tables','--no-tablespaces',
        '--set-gtid-purged=OFF','--hex-blob','--default-character-set=utf8mb4','--skip-add-drop-table','--skip-add-locks','--skip-triggers','--routines=false','--events=false','--column-statistics=0',config.db.database];
    const env={...process.env};for(const k of Object.keys(env))if(/PASSWORD|SECRET|TOKEN|KEY|MYSQL_PWD/i.test(k))delete env[k];
    const child=lanzar(config.dump,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env,signal});
    child.stderr.resume();
    const terminado=new Promise((resolve,reject)=>{let fallo=false;child.once('error',()=>{fallo=true});child.once('close',code=>!fallo&&code===0?resolve():reject(new Error('mysqldump_fallido')))});
    terminado.catch(()=>{});
    return {stream:child.stdout,pid:child.pid,terminado,cancelar(){child.kill()}};
};}
function crearAlmacenR2(config,Client=S3Client){
    const client=new Client({region:'auto',endpoint:config.endpoint,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},
        requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:3});
    return {
        async subir(file,key,metadata,{signal}={}){
            const body=fs.createReadStream(file);try{
                await client.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:body,ContentLength:metadata.bytes,
                    ContentType:'application/octet-stream',Metadata:{sha256:metadata.sha256,'key-id':config.keyId,format:'MCB1'}}),{abortSignal:signal});
            }finally{body.destroy()}
        },
        async verificar(key,metadata,{signal}={}){
            const r=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:signal});
            const hash=createHash('sha256');let bytes=0;
            const abortar=()=>r.Body.destroy?.(new Error('cancelado'));signal?.addEventListener('abort',abortar,{once:true});
            try{for await(const b of r.Body){if(signal?.aborted)throw new Error('cancelado');bytes+=b.length;if(bytes>metadata.bytes)throw new Error('integridad');hash.update(b)}}
            finally{signal?.removeEventListener('abort',abortar);r.Body.destroy?.()}
            if(bytes!==metadata.bytes||hash.digest('hex')!==metadata.sha256)throw new Error('integridad');
        },
        cerrar(){client.destroy()}
    };
}
module.exports={crearDumpMySQL,crearAlmacenR2,opcionesMySQL};
