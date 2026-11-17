const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { cerrarVerificacion } = require('./verification-cleanup');
const archivo = path.join(__dirname,'verify-sales-real.js');
const cargar = createRequire(archivo);

for (const caso of ['migracion_ausente','error_despues_begin','rollback_fallido']) test(`ensayo real aislado: ${caso} no deja recursos abiertos ni expone secretos`,async()=>{
    const pasos=[],salida=[];
    const connection={
        async execute(sql){
            assert.ok(sql.startsWith('SELECT'));
            if(sql.includes('schema_migrations'))return [caso==='migracion_ausente'?[]:Array(4).fill({})];
            if(sql.includes('information_schema'))return [Array(21).fill({ENGINE:'InnoDB'})];
            throw new Error('detalle privado de conexión');
        },
        async beginTransaction(){pasos.push('begin')},async rollback(){pasos.push('rollback');if(caso==='rollback_fallido')throw new Error('secreto')},
        release(){pasos.push('release')},destroy(){pasos.push('destroy')}
    };
    const proceso={env:{AUTH_CHECK_USER:'usuario_aislado',AUTH_CHECK_PASSWORD:'SECRETO_NO_PUBLICAR'},exitCode:0};
    const contexto=vm.createContext({module:{exports:{}},process:proceso,console:{log:v=>salida.push(v),error:v=>salida.push(v)},
        require:n=>n==='dotenv'?{config(){}}:n==='./database'?{crearPool:()=>({async getConnection(){return connection},async end(){pasos.push('pool')}})}:n==='./verification-cleanup'?{cerrarVerificacion}:cargar(n)});
    vm.runInContext(fs.readFileSync(archivo,'utf8'),contexto);
    await contexto.module.exports.verificar();
    assert.equal(proceso.exitCode,1);assert.equal(proceso.env.AUTH_CHECK_PASSWORD,undefined);
    const informe=JSON.parse(salida[0]);assert.equal(informe.ok,false);assert.equal(informe.rollback,caso!=='rollback_fallido');
    assert.ok(pasos.includes('rollback'));assert.equal(pasos.at(-1),'pool');
    assert.equal(pasos.includes('destroy'),caso==='rollback_fallido');assert.doesNotMatch(salida.join(''),/SECRETO_NO_PUBLICAR|detalle privado|usuario_aislado/);
});

test('captura de conservación lee las catorce tablas previas con orden estable y sin escrituras',async()=>{
    const {capturarEstado}=require('./verify-sales-real');
    const consultas=[];
    const estado=await capturarEstado({async execute(sql){consultas.push(sql);return [[{registro:'existente'}]]}});
    assert.equal(consultas.length,14);
    assert.ok(consultas.every(sql=>/^SELECT \* FROM `\w+` ORDER BY `\w+`$/.test(sql)));
    assert.ok(estado.pedidos&&estado.recepcion_detalles&&estado.productos&&estado.lotes&&estado.sesiones&&estado.usuarios);
});

for(const fallo of ['datos_temporales','contado'])test(`ensayo aislado revierte escrituras temporales ante fallo en ${fallo}`,async()=>{
    const {EventEmitter}=require('node:events');
    const pasos=[],salida=[],temporales=[];
    const admin={id:1,rol:'administrador',activo:1};
    const connection={
        async execute(sql){
            assert.ok(sql.startsWith('SELECT'));
            if(sql.includes('schema_migrations WHERE'))return [Array(4).fill({})];
            if(sql.includes('information_schema'))return [Array(21).fill({ENGINE:'InnoDB'})];
            if(sql.includes('usuarios WHERE'))return [[{...admin}]];
            return [[]];
        },
        async beginTransaction(){pasos.push('begin')},async rollback(){pasos.push('rollback');temporales.length=0},release(){pasos.push('release')}
    };
    const servidor=new EventEmitter();servidor.address=()=>({port:32100});servidor.close=cb=>{pasos.push('server');cb()};
    const proceso={env:{AUTH_CHECK_USER:'usuario_aislado',AUTH_CHECK_PASSWORD:'SECRETO_NO_PUBLICAR'},exitCode:0};
    const contexto=vm.createContext({module:{exports:{}},process:proceso,AbortSignal,console:{log:v=>salida.push(v),error:v=>salida.push(v)},
        fetch:async(url,op)=>{
            const ruta=new URL(url).pathname;
            if(ruta==='/api/sales'&&JSON.parse(op.body).clave.startsWith('CADUCADO-'))return {status:400,headers:{has:()=>false},async json(){return {}}};
            if(op.method!=='GET'&&!ruta.endsWith('/login'))temporales.push(ruta);
            if((fallo==='datos_temporales'&&ruta==='/api/proveedores')||(fallo==='contado'&&ruta==='/api/sales')){
                pasos.push('fallo_con_escrituras');throw new Error('detalle privado con contraseña');
            }
            let status=201,data={};
            if(ruta.endsWith('/login')){status=200;data={csrfToken:'csrf_aislado'}}
            else if(ruta==='/api/proveedores'||ruta==='/api/clientes')data={registro:{id:10}};
            else if(ruta==='/api/products')data={productoId:10,loteId:20};
            else if(ruta.includes('/lots'))data={loteId:21};
            else if(ruta==='/api/users')data={usuario:{id:2}};
            return {status,headers:{has:()=>false},async json(){return data}};
        },
        require:n=>n==='dotenv'?{config(){}}:n==='./database'?{crearPool:()=>({async getConnection(){return connection},async end(){pasos.push('pool')}})}
            :n==='./app'?{crearApp:()=>({listen(){queueMicrotask(()=>servidor.emit('listening'));return servidor}})}:cargar(n)});
    vm.runInContext(fs.readFileSync(archivo,'utf8'),contexto);
    await contexto.module.exports.verificar();
    assert.ok(pasos.includes('fallo_con_escrituras'));assert.equal(temporales.length,0);
    assert.ok(pasos.indexOf('server')<pasos.indexOf('rollback'));assert.ok(pasos.indexOf('rollback')<pasos.indexOf('release'));
    const informe=JSON.parse(salida[0]);assert.equal(informe.ok,false);assert.equal(informe.rollback,true);assert.equal(informe.etapaFallida,fallo);
    assert.doesNotMatch(salida.join(''),/SECRETO_NO_PUBLICAR|detalle privado|csrf_aislado/);
});
