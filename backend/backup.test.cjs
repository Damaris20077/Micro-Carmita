const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Readable}=require('node:stream'),{randomBytes,createHash}=require('node:crypto'),{EventEmitter}=require('node:events');
const {configurarRespaldo}=require('./backup-config'),{crearEstadoRespaldos}=require('./backup-store'),{crearRespaldo,pendiente,QUINCENA}=require('./backup-service');
const {cifrarDump,descifrarArchivo}=require('./backup-crypto'),{crearAlmacenR2,crearDumpMySQL,opcionesMySQL}=require('./backup-runtime');
const SQL='CREATE TABLE prueba (id INT); INSERT INTO prueba VALUES (1); -- dato_sensible_aislado\n';
async function temporal(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'micro-carmita-backup-test-'));t.after(async()=>{const p=path.resolve(root);assert.equal(path.dirname(p),path.resolve(os.tmpdir()));assert.ok(path.basename(p).startsWith('micro-carmita-backup-test-'));await fs.rm(p,{recursive:true,force:true,maxRetries:3,retryDelay:100})});return root}
function entorno(root){return {BACKUP_ENABLED:'true',BACKUP_DIR:root,BACKUP_PRIVATE_DIR_CONFIRMED:'true',BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('base64'),BACKUP_KEY_ID:'key-test',
    BACKUP_DB_HOST:'127.0.0.1',BACKUP_DB_PORT:'3307',BACKUP_DB_NAME:'micro_carmita_backup_test_qa',BACKUP_DB_USER:'lector_pruebas',BACKUP_DB_PASSWORD:'valor_aislado',DB_USER:'micro_app',DB_PORT:'3306',MYSQLDUMP_PATH:path.resolve('mysqldump.exe'),
    R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'bucket-tests',R2_BACKUP_PREFIX:'tests/micro-carmita',R2_ACCESS_KEY_ID:'identificador_aislado',R2_SECRET_ACCESS_KEY:'secreto_aislado',R2_PRIVATE_BUCKET_CONFIRMED:'true'};}
async function preparar(t){
    const root=await temporal(t),config=configurarRespaldo(entorno(root),{test:true}),store=crearEstadoRespaldos(root),objetos=new Map();let fallo,now=Date.parse('2026-11-17T15:00:00Z'),dumps=0;
    const storage={async subir(file,key,m){if(fallo==='subida')throw new Error('secreto_aislado');objetos.set(key,await fs.readFile(file))},async verificar(key,m){if(fallo==='verificacion')throw new Error('secreto_aislado');assert.equal(createHash('sha256').update(objetos.get(key)).digest('hex'),m.sha256)}};
    const dump=async()=>{dumps++;return {stream:Readable.from([SQL]),terminado:fallo==='dump'?Promise.reject(new Error('secreto_aislado')):Promise.resolve(),cancelar(){}}};
    const nueva=()=>crearRespaldo({config,store,dump,storage,clock:()=>now});
    return {root,config,store,objetos,nueva,get dumps(){return dumps},avanzar(ms){now+=ms},fallar(v){fallo=v}};
}
test('desactivado no lee credenciales, no ejecuta dump y no sube datos',async()=>{assert.deepEqual(configurarRespaldo({}),{enabled:false});const s=crearRespaldo({config:{enabled:false}});assert.deepEqual(await s.ejecutar(),{status:'disabled'})});
test('configuración solo admite directorio externo, bucket privado, clave válida y cuenta separada',async t=>{
    const root=await temporal(t),env=entorno(root);assert.equal(configurarRespaldo(env).enabled,true);
    for(const cambio of [{BACKUP_DIR:path.resolve('respaldos')},{BACKUP_PRIVATE_DIR_CONFIRMED:'false'},{R2_PRIVATE_BUCKET_CONFIRMED:'false'},{BACKUP_ENCRYPTION_KEY:'incorrecta'},{R2_ACCOUNT_ID:'https://publico.r2.dev'},{R2_BACKUP_PREFIX:'../otro'},{BACKUP_DB_USER:'root'},{BACKUP_DB_USER:'micro_app'},{BACKUP_DB_PASSWORD:'x\npassword=otro'}])assert.throws(()=>configurarRespaldo({...env,...cambio}));
});
test('modo ensayo rechaza base real, puerto habitual y prefijo compartido',async t=>{const e=entorno(await temporal(t));for(const cambio of [{BACKUP_DB_NAME:'micro_carmita'},{BACKUP_DB_PORT:'3306'},{R2_BACKUP_PREFIX:'micro-carmita'}])assert.throws(()=>configurarRespaldo({...e,...cambio},{test:true}))});
test('quince días exactos, reinicios y ejecución perdida se calculan desde último éxito',()=>{
    const n=Date.parse('2026-11-17T15:00:00Z');assert.equal(pendiente({lastSuccess:null,retryAfter:null},n),true);
    assert.equal(pendiente({lastSuccess:new Date(n).toISOString()},n+QUINCENA-1),false);assert.equal(pendiente({lastSuccess:new Date(n).toISOString()},n+QUINCENA),true);
    assert.equal(pendiente({lastSuccess:new Date(n).toISOString()},n+3*QUINCENA),true);
});
test('respaldo cifrado verificado guarda estado y limpia opciones y archivos temporales',async t=>{
    const f=await preparar(t),r=await f.nueva().ejecutar();assert.equal(r.status,'success');assert.equal(f.objetos.size,1);
    assert.equal([...f.objetos.values()][0].includes(Buffer.from('dato_sensible_aislado')),false);
    assert.deepEqual((await fs.readdir(f.root)).sort(),['state.json']);const estado=await f.store.leer();assert.equal(estado.runs.length,1);assert.equal(estado.lastSuccess,r.at);
    assert.doesNotMatch(JSON.stringify(estado),/secreto_aislado|valor_aislado|BACKUP_ENCRYPTION_KEY/);
});
test('nuevo proceso reutiliza estado; no duplica y recupera una única ejecución vencida',async t=>{const f=await preparar(t);await f.nueva().ejecutar();assert.equal((await f.nueva().ejecutar()).status,'not_due');f.avanzar(QUINCENA*3);assert.equal((await f.nueva().ejecutar()).status,'success');assert.equal((await f.nueva().ejecutar()).status,'not_due');assert.equal(f.dumps,2)});
test('dos instancias simultáneas no producen respaldos concurrentes',async t=>{const f=await preparar(t),r=await Promise.all([f.nueva().ejecutar(),f.nueva().ejecutar()]);assert.equal(r.filter(r=>r.status==='success').length,1);assert.equal(r.filter(r=>r.status==='blocked').length,1);assert.equal(f.dumps,1)});
for(const etapa of ['dump','subida','verificacion'])test(`fallo de ${etapa} no marca éxito, limpia y permite reintento diferido`,async t=>{
    const f=await preparar(t);f.fallar(etapa);const r=await f.nueva().ejecutar();assert.equal(r.status,'failed');assert.doesNotMatch(JSON.stringify(r),/secreto_aislado/);
    assert.equal((await f.store.leer()).lastSuccess,null);assert.deepEqual((await fs.readdir(f.root)).sort(),['state.json']);assert.equal((await f.nueva().ejecutar()).status,'not_due');
    f.fallar(null);f.avanzar(60*60*1000);assert.equal((await f.nueva().ejecutar()).status,'success');
});
test('fallo manual antes de quincena también se reintenta después de una hora',async t=>{const f=await preparar(t);await f.nueva().ejecutar();f.fallar('subida');await f.nueva().ejecutar({force:true});f.fallar(null);f.avanzar(3600000);assert.equal((await f.nueva().ejecutar()).status,'success')});
test('fallo de limpieza conserva bloqueo y requiere intervención',async t=>{const f=await preparar(t),limpiar=f.store.limpiar;f.store.limpiar=async()=>{throw new Error('privado')};const r=await f.nueva().ejecutar();assert.equal(r.status,'failed');assert.equal(r.needsAttention,true);assert.equal((await f.nueva().ejecutar()).status,'blocked');f.store.limpiar=limpiar});
test('estado corrupto no se sobrescribe ni inicia un respaldo',async t=>{const f=await preparar(t);await fs.writeFile(path.join(f.root,'state.json'),'incompleto');const r=await f.nueva().ejecutar();assert.equal(r.status,'failed');assert.equal(r.needsAttention,true);assert.equal(f.dumps,0);assert.equal(await fs.readFile(path.join(f.root,'state.json'),'utf8'),'incompleto')});
test('bloqueo no expira automáticamente ni se desbloquea un proceso activo',async t=>{const f=await preparar(t),liberar=await f.store.adquirir();assert.equal((await f.nueva().ejecutar()).status,'blocked');await assert.rejects(f.store.desbloquear(false));await assert.rejects(f.store.desbloquear(true));await liberar()});
test('cancelación antes del dump no toca MySQL y libera el bloqueo',async t=>{const f=await preparar(t),c=new AbortController();c.abort();const r=await f.nueva().ejecutar({signal:c.signal});assert.equal(r.status,'failed');assert.equal(f.dumps,0);assert.deepEqual(await fs.readdir(f.root),['state.json'])});
test('roundtrip cifrado/compresión conserva SQL y tag autentica contenido antes de publicar salida',async t=>{
    const root=await temporal(t),key=randomBytes(32),file=path.join(root,'a.mcbackup'),out=path.join(root,'recuperado.sql');
    await cifrarDump(Readable.from([SQL]),file,key,'key-test');await descifrarArchivo(file,out,key);assert.equal(await fs.readFile(out,'utf8'),SQL);
    const b=await fs.readFile(file);b[b.length-1]^=1;await fs.writeFile(file,b);const invalido=path.join(root,'invalido.sql');
    await assert.rejects(descifrarArchivo(file,invalido,key));await assert.rejects(fs.stat(invalido));assert.equal((await fs.readdir(root)).some(n=>n.endsWith('.gz')),false);
});
test('clave incorrecta, dump vacío y salida ya existente se rechazan sin sobrescribir',async t=>{
    const root=await temporal(t),key=randomBytes(32),file=path.join(root,'a.mcbackup'),out=path.join(root,'ya.sql');await fs.writeFile(out,'conservar');
    await cifrarDump(Readable.from([SQL]),file,key,'key-test');await assert.rejects(descifrarArchivo(file,out,randomBytes(32)));assert.equal(await fs.readFile(out,'utf8'),'conservar');
    await assert.rejects(descifrarArchivo(file,out,key));assert.equal(await fs.readFile(out,'utf8'),'conservar');await assert.rejects(cifrarDump(Readable.from([]),path.join(root,'vacio.mcbackup'),key,'key-test'));
});
test('almacenamiento S3 simulado usa solo objeto privado y verifica bytes descargados',async t=>{
    const root=await temporal(t),file=path.join(root,'cifrado'),data=Buffer.from('cifrado_aislado');await fs.writeFile(file,data);const comandos=[];
    class Client{constructor(op){assert.equal(op.region,'auto');assert.match(op.endpoint,/^https:/)}async send(c){comandos.push(c.input);if(c.input.Body){for await(const b of c.input.Body)assert.equal(Buffer.from(b).toString(),data.toString());return {}}return {Body:Readable.from([data])}}destroy(){}}
    const config={endpoint:'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com',bucket:'privado',keyId:'test',accessKeyId:'simulado',secretAccessKey:'simulado'},r2=crearAlmacenR2(config,Client);
    const m={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};await r2.subir(file,'test.mcbackup',m);await r2.verificar('test.mcbackup',m);assert.equal(comandos.length,2);assert.equal(comandos[0].ACL,undefined);assert.equal(comandos[0].ContentLength,data.length);
    await assert.rejects(r2.verificar('test.mcbackup',{...m,sha256:'0'.repeat(64)}));
});
test('mysqldump simulado usa single-transaction sin secretos en argumentos, shell o entorno',async t=>{
    const root=await temporal(t),config=configurarRespaldo(entorno(root));let llamadas;
    const cliente={async createConnection(){return {async execute(query){const q=typeof query==='string'?query:query.sql;assert.ok(q.startsWith('SELECT'));return [q.includes('TRIGGERS')?[{total:0}]:[{TABLE_TYPE:'BASE TABLE',ENGINE:'InnoDB'}]]},async end(){}}}};
    const lanzar=(cmd,args,op)=>{llamadas={cmd,args,op};const c=new EventEmitter();c.stdout=Readable.from([SQL]);c.stderr={resume(){}};c.kill=()=>{};setImmediate(()=>c.emit('close',0));return c};
    const job=await crearDumpMySQL(config,cliente,lanzar)(root);job.stream.resume();await job.terminado;
    assert.ok(llamadas.args.includes('--single-transaction'));assert.ok(llamadas.args.includes('--protocol=TCP'));assert.ok(llamadas.args.includes('--set-gtid-purged=OFF'));assert.ok(llamadas.args.includes('--skip-add-drop-table'));
    assert.equal(llamadas.op.shell,false);assert.equal(llamadas.op.windowsHide,true);assert.doesNotMatch(llamadas.args.join(' '),/valor_aislado/);assert.ok(Object.keys(llamadas.op.env).every(k=>!/PASSWORD|SECRET|TOKEN|KEY|MYSQL_PWD/i.test(k)));
    assert.match(await fs.readFile(path.join(root,'mysql.cnf'),'utf8'),/password="valor_aislado"/);
});
test('preflight rechaza motores no transaccionales y triggers sin lanzar procesos',async t=>{
    const root=await temporal(t),config=configurarRespaldo(entorno(root));
    for(const caso of ['motor','trigger']){const cliente={async createConnection(){return {async execute(query){const q=typeof query==='string'?query:query.sql;return [q.includes('TRIGGERS')?[{total:1}]:[{TABLE_TYPE:'BASE TABLE',ENGINE:caso==='motor'?'MyISAM':'InnoDB'}]]},async end(){}}}};
        await assert.rejects(crearDumpMySQL(config,cliente,()=>assert.fail('No debe lanzar mysqldump'))(root));}
    assert.throws(()=>opcionesMySQL({...config.db,password:'x\nmalicioso'}));
});

test('cada copia usa IV aleatorio y el identificador de clave está autenticado',async t=>{
    const root=await temporal(t),key=randomBytes(32),a=path.join(root,'a.mcbackup'),b=path.join(root,'b.mcbackup');
    await cifrarDump(Readable.from([SQL]),a,key,'key-test');await cifrarDump(Readable.from([SQL]),b,key,'key-test');
    const aa=await fs.readFile(a),bb=await fs.readFile(b);assert.notDeepEqual(aa,bb);
    const contenido=Buffer.from(aa),pos=contenido.indexOf(Buffer.from('key-test'));contenido[pos]='x'.charCodeAt(0);await fs.writeFile(a,contenido);
    await assert.rejects(descifrarArchivo(a,path.join(root,'no.sql'),key));await assert.rejects(fs.stat(path.join(root,'no.sql')));
});
test('error al persistir estado no confirma éxito y deja bloqueo conservador',async t=>{
    const f=await preparar(t),guardar=f.store.guardar;let n=0;
    f.store.guardar=async s=>{n++;if(n>=2)throw new Error('privado');return guardar(s)};
    const r=await f.nueva().ejecutar();assert.equal(r.status,'failed');assert.equal(r.needsAttention,true);assert.equal(r.stage,'registro');
    assert.equal((await f.nueva().ejecutar()).status,'blocked');assert.equal(f.objetos.size,1);
});
test('limpieza rechaza una ruta que no sea temporal propia del directorio',async t=>{
    const f=await preparar(t);await assert.rejects(f.store.limpiar(path.dirname(f.root)));await assert.rejects(f.store.limpiar(path.join(f.root,'state.json')));
});

test('recuperación explícita de proceso terminado limpia huérfanos y deja reintento pendiente',async t=>{
    const {spawn}=require('node:child_process'),{once}=require('node:events');const f=await preparar(t);
    const child=spawn(process.execPath,['-e',''],{stdio:'ignore',windowsHide:true});await once(child,'close');
    await fs.writeFile(path.join(f.root,'backup.lock'),JSON.stringify({pid:child.pid,dumpPid:child.pid,host:os.hostname(),token:'aislado'}));
    const work=await f.store.temporal();await fs.writeFile(path.join(work,'mysql.cnf'),'secreto_ficticio');
    await f.store.desbloquear(true);assert.deepEqual(await fs.readdir(f.root),['state.json']);
    assert.equal((await f.store.leer()).lastResult.status,'interrupted');assert.equal(pendiente(await f.store.leer(),Date.now()+1000),true);
});

test('cancelación durante subida elimina temporales y no avanza último éxito',async t=>{
    const f=await preparar(t),controller=new AbortController();let iniciar;
    const subida=new Promise(r=>{iniciar=r});
    const storage={async subir(file,key,m,{signal}){iniciar();await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelado')),{once:true})})},async verificar(){assert.fail('No verificar después de cancelar')}};
    const service=crearRespaldo({config:f.config,store:f.store,storage,dump:async()=>({stream:Readable.from([SQL]),terminado:Promise.resolve(),cancelar(){}})});
    const resultado=service.ejecutar({signal:controller.signal});await subida;controller.abort();const r=await resultado;
    assert.equal(r.status,'failed');assert.equal(r.stage,'subida');assert.equal((await f.store.leer()).lastSuccess,null);assert.deepEqual(await fs.readdir(f.root),['state.json']);
});
