const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {createCipheriv,createDecipheriv,randomBytes,createHash}=require('node:crypto');
const {createGzip,createGunzip}=require('node:zlib'),{Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const MAX_BYTES=512*1024*1024;
function limitar(max=MAX_BYTES){let bytes=0;const t=new Transform({transform(c,enc,cb){bytes+=c.length;cb(bytes>max?new Error('limite_excedido'):null,c)}});t.bytes=()=>bytes;return t}
async function hashArchivo(file){const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex')}
async function cifrarDump(source,file,key,keyId,{signal}={}){
    const iv=randomBytes(12),header=Buffer.from(JSON.stringify({format:'MCB1',keyId,iv:iv.toString('base64')})+'\n');
    const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
    await fsp.writeFile(file,header,{flag:'wx',mode:0o600});
    const limite=limitar();await pipeline(source,limite,createGzip(),cipher,fs.createWriteStream(file,{flags:'a',mode:0o600}),{signal});
    if(limite.bytes()===0)throw new Error('dump_vacio');
    await fsp.appendFile(file,cipher.getAuthTag());const stat=await fsp.stat(file);
    return {bytes:stat.size,sha256:await hashArchivo(file)};
}
async function descifrarArchivo(file,salida,key,{signal}={}){
    // El gzip descifrado no se utiliza hasta verificar completamente el tag GCM.
    const stat=await fsp.stat(file);if(stat.size<40||stat.size>MAX_BYTES+1024*1024)throw new Error('archivo_invalido');
    const entrada=await fsp.open(file,'r'),buffer=Buffer.alloc(4096);let header,tag;
    try{const {bytesRead}=await entrada.read(buffer,0,buffer.length,0);const fin=buffer.subarray(0,bytesRead).indexOf(10);if(fin<0)throw new Error('cabecera_invalida');header=Buffer.from(buffer.subarray(0,fin+1));tag=Buffer.alloc(16);await entrada.read(tag,0,16,stat.size-16)}finally{await entrada.close()}
    const datos=JSON.parse(header.toString('utf8'));if(datos.format!=='MCB1'||!/^[A-Za-z0-9_-]{1,60}$/.test(datos.keyId)||Buffer.from(datos.iv,'base64').length!==12)throw new Error('cabecera_invalida');
    const temporal=path.join(path.dirname(salida),`.restore-${randomBytes(12).toString('hex')}.gz`);
    let creado=false;
    try{
        const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(datos.iv,'base64'));decipher.setAAD(header);decipher.setAuthTag(tag);
        await pipeline(fs.createReadStream(file,{start:header.length,end:stat.size-17}),decipher,fs.createWriteStream(temporal,{flags:'wx',mode:0o600}),{signal});
        const output=await fsp.open(salida,'wx',0o600);creado=true;const write=output.createWriteStream();
        await pipeline(fs.createReadStream(temporal),createGunzip(),limitar(),write,{signal});
        return {keyId:datos.keyId,sha256:await hashArchivo(salida)};
    }catch(e){if(creado)await fsp.unlink(salida).catch(()=>{});throw e}
    finally{try{await fsp.unlink(temporal)}catch(e){if(e.code!=='ENOENT')throw new Error('limpieza_descifrado_fallida')}}
}
module.exports={cifrarDump,descifrarArchivo,hashArchivo,MAX_BYTES};
