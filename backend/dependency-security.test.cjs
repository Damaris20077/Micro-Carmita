const test=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{gzipSync}=require('node:zlib');
const {crearApp}=require('./app');
test('parser rechaza cuerpo gzip malformado y el servidor sigue respondiendo',async t=>{
    const server=crearApp().listen(0,'127.0.0.1');t.after(()=>new Promise(r=>server.close(r)));await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`;
    const cuerpo=Buffer.concat([gzipSync(Buffer.from('{}')),Buffer.from('bytes_invalidos')]);
    const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:cuerpo});
    assert.ok(r.status>=400&&r.status<600);assert.equal((await fetch(base+'/api/health')).status,200);
});
test('qs serializa defensivamente arrays con propiedad toString no invocable',()=>{
    const qs=require('qs');let resultado;assert.doesNotThrow(()=>{resultado=qs.stringify({a:[{toString:'valor'}]},{arrayFormat:'comma'})});assert.equal(typeof resultado,'string');
});
