const path=require('node:path');
const proyecto=path.resolve(__dirname,'..');
function configurarRespaldo(env=process.env,{test=false}={}){
    if(env.BACKUP_ENABLED!=='true')return {enabled:false};
    if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('tls_inseguro');
    const requerido=n=>{if(typeof env[n]!=='string'||!env[n])throw new Error('configuracion');return env[n]};
    const entero=(n,def,min,max)=>{const v=Number(env[n]??def);if(!Number.isInteger(v)||v<min||v>max)throw new Error('configuracion');return v};
    const directorio=requerido('BACKUP_DIR'),root=path.resolve(directorio),rel=path.relative(proyecto,root);
    if(env.BACKUP_PRIVATE_DIR_CONFIRMED!=='true')throw new Error('directorio_no_confirmado');
    if(!path.isAbsolute(directorio)||!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('directorio_no_privado');
    const account=requerido('R2_ACCOUNT_ID'),bucket=requerido('R2_BUCKET'),prefix=requerido('R2_BACKUP_PREFIX');
    if(!/^[a-f0-9]{32}$/.test(account)||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)||!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix))throw new Error('configuracion');
    if(env.R2_PRIVATE_BUCKET_CONFIRMED!=='true')throw new Error('privacidad_no_confirmada');
    const encoded=requerido('BACKUP_ENCRYPTION_KEY');const key=Buffer.from(encoded,'base64');
    if(key.length!==32||key.toString('base64')!==encoded)throw new Error('clave_cifrado_invalida');
    const keyId=requerido('BACKUP_KEY_ID');if(!/^[A-Za-z0-9_-]{1,60}$/.test(keyId))throw new Error('configuracion');
    const database=requerido('BACKUP_DB_NAME'),user=requerido('BACKUP_DB_USER'),password=requerido('BACKUP_DB_PASSWORD');
    if(!/^[A-Za-z0-9_]+$/.test(database)||['root','micro_app',env.DB_USER].includes(user))throw new Error('cuenta_respaldo_no_separada');
    const port=entero('BACKUP_DB_PORT',3306,1,65535),host=requerido('BACKUP_DB_HOST'),dump=requerido('MYSQLDUMP_PATH');
    if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('mysql_remoto_no_configurado');
    if(!path.isAbsolute(dump)||/[\r\n\0]/.test(host+user+password))throw new Error('configuracion');
    if(test&&(!/^micro_carmita_backup_test_[a-z0-9_]+$/.test(database)||!['127.0.0.1','localhost'].includes(host)
        ||port===Number(env.DB_PORT??3306)||!prefix.startsWith('tests/')||!path.basename(root).startsWith('micro-carmita-backup-test-')))throw new Error('ensayo_no_aislado');
    return {enabled:true,root,key,keyId,bucket,prefix,endpoint:`https://${account}.r2.cloudflarestorage.com`,
        accessKeyId:requerido('R2_ACCESS_KEY_ID'),secretAccessKey:requerido('R2_SECRET_ACCESS_KEY'),
        db:{host,port,user,password,database},dump,timeoutMs:entero('BACKUP_TIMEOUT_SECONDS',600,10,7200)*1000};
}
module.exports={configurarRespaldo};
