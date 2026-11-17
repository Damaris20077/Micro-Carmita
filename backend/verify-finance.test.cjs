const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const archivo=path.join(__dirname,'verify-finance-real.js'),cargar=createRequire(archivo);
for(const caso of ['migracion_ausente','fallo_despues_begin','rollback_fallido'])test(`ensayo financiero aislado limpia ante ${caso} sin exponer credenciales`,async()=>{
    const pasos=[],salida=[],connection={async execute(sql){assert.ok(sql.startsWith('SELECT'));if(sql.includes('schema_migrations WHERE'))return [caso==='migracion_ausente'?[]:Array(5).fill({})];if(sql.includes('information_schema'))return [Array(22).fill({ENGINE:'InnoDB'})];throw new Error('información privada')},async beginTransaction(){pasos.push('begin')},async rollback(){pasos.push('rollback');if(caso==='rollback_fallido')throw new Error('información privada')},release(){pasos.push('release')},destroy(){pasos.push('destroy')}};
    const proceso={env:{AUTH_CHECK_USER:'qa_aislado',AUTH_CHECK_PASSWORD:'SECRETO_NO_PUBLICAR'},exitCode:0};
    const c=vm.createContext({module:{exports:{}},process:proceso,console:{log:v=>salida.push(v),error:v=>salida.push(v)},require:n=>n==='dotenv'?{config(){}}:n==='./database'?{crearPool:()=>({async getConnection(){return connection},async end(){pasos.push('pool')}})}:cargar(n)});
    vm.runInContext(fs.readFileSync(archivo,'utf8'),c);await c.module.exports.verificar();
    assert.equal(proceso.exitCode,1);assert.equal(proceso.env.AUTH_CHECK_PASSWORD,undefined);assert.ok(pasos.includes('rollback'));assert.equal(pasos.at(-1),'pool');assert.equal(pasos.includes('destroy'),caso==='rollback_fallido');
    const r=JSON.parse(salida[0]);assert.equal(r.ok,false);assert.equal(r.rollback,caso!=='rollback_fallido');assert.doesNotMatch(salida.join(''),/SECRETO_NO_PUBLICAR|información privada|qa_aislado/);
});
test('captura financiera solo lee las 22 tablas, incluyendo claves compuestas de lotes y operaciones',async()=>{
    const {capturarTodo}=require('./verify-finance-real');const sql=[];const r=await capturarTodo({async execute(q){sql.push(q);return [[]]}});
    assert.equal(Object.keys(r).length,22);assert.ok(sql.every(q=>q.startsWith('SELECT')));assert.ok(sql.some(q=>q.includes('ORDER BY detalle_id,lote_id')));assert.ok(r.ventas&&r.movimientos_financieros&&r.pedidos&&r.usuarios&&r.sesiones);
});

test('fallo después de una escritura temporal cierra servidor y revierte antes de liberar conexión',async()=>{
    const {EventEmitter}=require('node:events');const pasos=[],salida=[],temporales=[];
    const connection={async execute(sql){
        assert.ok(sql.startsWith('SELECT'));
        if(sql.includes('schema_migrations WHERE'))return [Array(5).fill({})];
        if(sql.includes('information_schema'))return [Array(22).fill({ENGINE:'InnoDB'})];
        return [[]];
    },async beginTransaction(){pasos.push('begin')},async rollback(){pasos.push('rollback');temporales.length=0},release(){pasos.push('release')}};
    const server=new EventEmitter();server.address=()=>({port:32100});server.close=cb=>{pasos.push('server');cb()};
    const proceso={env:{AUTH_CHECK_USER:'qa_aislado',AUTH_CHECK_PASSWORD:'SECRETO_NO_PUBLICAR'},exitCode:0};
    const c=vm.createContext({module:{exports:{}},process:proceso,AbortSignal,console:{log:v=>salida.push(v),error:v=>salida.push(v)},
        fetch:async(url,op)=>{
            const ruta=new URL(url).pathname;
            if(ruta==='/api/finance'&&op.method==='POST'){temporales.push('ingreso');pasos.push('escritura');throw new Error('información privada')}
            const data=ruta.endsWith('/login')?{csrfToken:'token_aislado'}:{movimientos:[],ingresos:0,egresos:0,neto:0};
            return {status:200,headers:{has:()=>false},async json(){return data}};
        },
        require:n=>n==='dotenv'?{config(){}}:n==='./database'?{crearPool:()=>({async getConnection(){return connection},async end(){pasos.push('pool')}})}
            :n==='./verify-sales-real'?{async capturarEstado(){return {usuarios:[{id:1,usuario:'qa_aislado',rol:'administrador',activo:1}]}}}
            :n==='./app'?{crearApp:()=>({listen(){queueMicrotask(()=>server.emit('listening'));return server}})}:cargar(n)});
    vm.runInContext(fs.readFileSync(archivo,'utf8'),c);await c.module.exports.verificar();
    assert.ok(pasos.includes('begin'));assert.ok(pasos.includes('escritura'));assert.equal(temporales.length,0);
    assert.ok(pasos.indexOf('server')<pasos.indexOf('rollback'));assert.ok(pasos.indexOf('rollback')<pasos.indexOf('release'));
    const r=JSON.parse(salida[0]);assert.equal(r.ok,false);assert.equal(r.rollback,true);assert.equal(r.etapaFallida,'manuales');
    assert.equal(proceso.env.AUTH_CHECK_PASSWORD,undefined);assert.doesNotMatch(salida.join(''),/SECRETO_NO_PUBLICAR|información privada|token_aislado/);
});
