const test=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events'),{randomBytes}=require('node:crypto');
const {crearApp}=require('./app');
test('JSON y PDF no exponen reportes sin sesión ni a Vendedor, inactivo o Superusuario de producción',async t=>{
    let actor={id:1,rol:'administrador',activo:true};const token=randomBytes(32).toString('hex');
    const server=crearApp({production:true,allowSuperuser:true,repository:{async findSession(){return actor},async touchSession(){}},reportRepository:{}}).listen(0,'127.0.0.1');
    t.after(()=>new Promise(r=>server.close(r)));await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/reports/ventas`;
    for(const sufijo of ['', '/pdf']){
        assert.equal((await fetch(base+sufijo)).status,401);
        for(const [rol,activo,status]of [['vendedor',true,403],['administrador',false,401],['superusuario',true,401]]){
            actor={id:2,rol,activo};const r=await fetch(base+sufijo,{headers:{Cookie:`mc_session=${token}`}});
            assert.equal(r.status,status);assert.doesNotMatch(r.headers.get('content-type')||'',/application\/pdf/);
            assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/%PDF-/);
        }
    }
});
