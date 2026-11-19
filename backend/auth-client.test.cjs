const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function prepararCliente({ real = false } = {}) {
    const campos = {};
    for (const id of ['loginUsuario', 'loginClave', 'errorLogin', 'usuarioNombre', 'usuarioCuenta', 'usuarioClave', 'usuarioRol', 'listaUsuarios']) {
        campos[id] = { value: '', textContent: '', innerHTML: '' };
    }
    const peticiones = [];
    const respuestas = [];
    const eventos = new Map();
    const avisos = [];
    const clasesLogin = new Set();
    campos.pantallaLogin = { classList: { toggle(clase, activa) {
        if (activa) clasesLogin.add(clase);
        else clasesLogin.delete(clase);
    } } };
    campos.nombreSesion = { textContent: '' };
    campos.rolSesion = { textContent: '' };
    campos.formularioProducto = { hidden: false };
    const contexto = vm.createContext({
        document: {
            getElementById(id) { return campos[id]; },
            addEventListener(nombre, fn) { eventos.set(nombre, fn); },
            querySelectorAll() { return []; },
            querySelector() { return null; }
        },
        async fetch(ruta, opciones) {
            peticiones.push({ ruta, opciones });
            const respuesta = respuestas.shift();
            assert.ok(respuesta, `Falta respuesta simulada para ${ruta}`);
            if (respuesta instanceof Error) throw respuesta;
            return { ok: respuesta.status < 400, status: respuesta.status,
                async json() { return respuesta.body; } };
        },
        alert(mensaje) { avisos.push(mensaje); },
        localStorage: {
            getItem(clave) {
                if (real && ['ventas', 'inventario', 'cuentas', 'movimientos'].includes(clave)) return '[]';
                assert.fail('El adaptador intentó leer credenciales locales');
            },
            setItem() { assert.fail('El adaptador intentó guardar una sesión o contraseña local'); }
        }
    });
    if (real) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), contexto);
    } else vm.runInContext(`
        const permisosPorRol = { administrador: ['inicio', 'inventario'], vendedor: ['inicio'] };
        let carrito = [{ id: 101 }];
        let renderizados = 0;
        function usuarioActual() { throw new Error('Sesión local no permitida'); }
        function obtenerUsuarios() { throw new Error('Usuarios locales no permitidos'); }
        function iniciarSesion() {}
        function cerrarSesion() {}
        function mostrarUsuarios() {}
        function crearUsuario() {}
        function cambiarEstadoUsuario() {}
        function aplicarSesion() { renderizados += 1; }
        function tienePermiso(permiso) { return permisosPorRol[usuarioActual()?.rol]?.includes(permiso) || false; }
        function exigirPermiso(permiso) { return tienePermiso(permiso); }
        function textoSeguro(valor) { return String(valor).replace(/</g, '&lt;'); }
    `, contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'auth-client.js'), 'utf8'), contexto);
    return { contexto, campos, peticiones, respuestas, eventos, avisos, clasesLogin };
}

test('401 sin JSON invalida la sesión aunque el proxy devuelva una página HTML', async () => {
    const f=prepararCliente();
    f.respuestas.push({status:200,body:{usuario:{id:1,rol:'administrador'},csrfToken:'simulado'}});
    await f.contexto.iniciarSesion({preventDefault(){}});
    f.contexto.fetch=async()=>({ok:false,status:401,async json(){throw new SyntaxError('HTML')}});
    await assert.rejects(()=>f.contexto.MicroCarmitaAuth.api('/users'));
    assert.equal(f.contexto.usuarioActual(),null);
});

test('401 de restauración antigua no invalida un login nuevo todavía pendiente',async()=>{
    const f=prepararCliente();const resolver={};
    f.contexto.fetch=ruta=>new Promise(r=>{resolver[ruta]=r});
    const vieja=f.eventos.get('DOMContentLoaded')(),login=f.contexto.iniciarSesion({preventDefault(){}});
    resolver['/api/auth/me']({ok:false,status:401,async json(){return {error:'Sesión anterior'}}});await vieja;
    resolver['/api/auth/login']({ok:true,status:200,async json(){return {usuario:{id:2,rol:'administrador'},csrfToken:'simulado'}}});await login;
    assert.equal(f.contexto.usuarioActual()?.id,2);
});

test('restauración anterior al logout no vuelve a abrir la sesión cerrada',async()=>{
    const f=prepararCliente();let resolver;const fetch=f.contexto.fetch;
    f.contexto.fetch=(r,o)=>r==='/api/auth/me'?new Promise(res=>{resolver=res}):fetch(r,o);
    const restaurar=f.eventos.get('DOMContentLoaded')();
    f.respuestas.push({status:204});await f.contexto.cerrarSesion();
    resolver({ok:true,status:200,async json(){return {usuario:{id:1,rol:'administrador'},csrfToken:'simulado'}}});await restaurar;
    assert.equal(f.contexto.usuarioActual(),null);
});

test('alta de usuario tardía tras logout no borra un borrador ni muestra errores de otra sesión',async()=>{
    const f=prepararCliente();f.respuestas.push({status:200,body:{usuario:{id:1,rol:'administrador'},csrfToken:'simulado'}});
    await f.contexto.iniciarSesion({preventDefault(){}});
    let resolver;const fetch=f.contexto.fetch;
    f.contexto.fetch=(r,o)=>r==='/api/users'?new Promise(res=>{resolver=res}):fetch(r,o);
    const alta=f.contexto.crearUsuario();f.respuestas.push({status:204});await f.contexto.cerrarSesion();
    f.campos.usuarioNombre.value='Borrador nuevo';
    resolver({ok:true,status:201,async json(){return {id:2}}});await alta;
    assert.equal(f.campos.usuarioNombre.value,'Borrador nuevo');assert.equal(f.avisos.length,0);
});

test('bloqueo de usuarios se muestra en el botón y se libera después de un rechazo',async()=>{
    const f=prepararCliente();f.respuestas.push({status:200,body:{usuario:{id:1,rol:'administrador'},csrfToken:'simulado'}});
    await f.contexto.iniciarSesion({preventDefault(){}});
    const boton={attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}};
    f.contexto.document.querySelectorAll=s=>s==='#usuarios button'?[boton]:[];
    let resolver;f.contexto.fetch=()=>new Promise(r=>{resolver=r});
    f.campos.usuarioNombre.value='QA';const alta=f.contexto.crearUsuario();
    assert.ok(boton.disabled);assert.equal(boton.attrs['aria-busy'],'true');
    resolver({ok:false,status:400,async json(){return {error:'Usuario inválido'}}});await alta;
    assert.equal(boton.disabled,false);assert.equal(boton.attrs['aria-busy'],undefined);
    assert.equal(f.campos.usuarioNombre.value,'QA');assert.match(f.avisos[0],/Usuario inválido/);
});

test('restauración tardía no sustituye un login nuevo ni lo elimina si falla',async()=>{
    for(const fallo of [false,true]){
        const f=prepararCliente();let resolver;
        const fetch=f.contexto.fetch;
        f.contexto.fetch=(ruta,opciones)=>ruta==='/api/auth/me'?new Promise(r=>{resolver=r}):fetch(ruta,opciones);
        const antigua=f.eventos.get('DOMContentLoaded')();
        f.respuestas.push({status:200,body:{usuario:{id:2,rol:'administrador'},csrfToken:'simulado'}});
        await f.contexto.iniciarSesion({preventDefault(){}});
        resolver({ok:!fallo,status:fallo?500:200,async json(){return fallo?{error:'Error previo'}:{usuario:{id:1,rol:'vendedor'},csrfToken:'antiguo-simulado'}}});
        await antigua;
        assert.equal(f.contexto.usuarioActual()?.id,2);
    }
});

test('lista de usuarios conserva la consulta más reciente de la misma sesión',async()=>{
    const f=prepararCliente();
    f.respuestas.push({status:200,body:{usuario:{id:1,rol:'administrador'},csrfToken:'simulado'}});
    await f.contexto.iniciarSesion({preventDefault(){}});
    const resolver=[];
    f.contexto.fetch=()=>new Promise(r=>resolver.push(r));
    const vieja=f.contexto.mostrarUsuarios(),nueva=f.contexto.mostrarUsuarios();
    const respuesta=nombre=>({ok:true,status:200,async json(){return {usuarios:[{id:2,nombre,usuario:'qa',rol:'vendedor',activo:true}]}}});
    resolver[1](respuesta('Actual'));await nueva;resolver[0](respuesta('Antiguo'));await vieja;
    assert.match(f.campos.listaUsuarios.innerHTML,/Actual/);assert.doesNotMatch(f.campos.listaUsuarios.innerHTML,/Antiguo/);
});

test('dos clics en Crear usuario producen un solo POST mientras la petición está pendiente',async()=>{
    const f=prepararCliente();
    f.respuestas.push({status:200,body:{usuario:{id:1,rol:'administrador'},csrfToken:'simulado'}});
    await f.contexto.iniciarSesion({preventDefault(){}});
    const resolver=[];let posts=0;
    f.contexto.fetch=async(ruta,opciones)=>{
        if(opciones.method==='POST'){posts++;await new Promise(r=>{resolver.push(r)});return {ok:true,status:201,async json(){return {id:2}}}}
        return {ok:true,status:200,async json(){return {usuarios:[]}}};
    };
    const primera=f.contexto.crearUsuario(),segunda=f.contexto.crearUsuario();
    for(const r of resolver)r();await Promise.all([primera,segunda]);assert.equal(posts,1);
});

test('login concurrente envía una sola petición y libera el botón al terminar', async () => {
    const f = prepararCliente();
    f.campos.loginBoton = { disabled: false };
    let resolver;
    f.contexto.fetch = () => new Promise(r => { resolver = r; });
    const primero = f.contexto.iniciarSesion({ preventDefault() {} });
    assert.equal(f.campos.loginBoton.disabled, true);
    await f.contexto.iniciarSesion({ preventDefault() {} });
    resolver({ ok: false, status: 400, async json() { return { error: 'Rechazado' }; } });
    await primero;
    assert.equal(f.campos.loginBoton.disabled, false);
    assert.equal(f.campos.errorLogin.textContent, 'Rechazado');
});

test('panel queda inerte sin sesión y se habilita solo tras autenticación', async () => {
    const f = prepararCliente();
    const panel = { inert: true };
    f.contexto.document.querySelector = () => panel;
    f.respuestas.push({ status: 200, body: { usuario: { id: 1, rol: 'administrador' }, csrfToken: 'simulado' } });
    await f.contexto.iniciarSesion({ preventDefault() {} });
    assert.equal(panel.inert, false);
    f.respuestas.push({ status: 204 });
    await f.contexto.cerrarSesion();
    assert.equal(panel.inert, true);
});

test('frontend inicia y cierra sesión por API sin leer ni escribir credenciales locales', async () => {
    const f = prepararCliente();
    f.campos.loginUsuario.value = 'admin.prueba';
    f.campos.loginClave.value = 'valor-simulado-solo-para-transporte';
    f.respuestas.push({ status: 200, body: {
        usuario: { id: 1, nombre: 'Administración', rol: 'administrador', activo: true }, csrfToken: 'csrf-simulado'
    } });
    await f.contexto.MicroCarmitaAuth.iniciarSesion({ preventDefault() {} });
    assert.equal(f.peticiones[0].ruta, '/api/auth/login');
    assert.equal(f.peticiones[0].opciones.credentials, 'same-origin');
    assert.equal(f.contexto.usuarioActual().id, 1);
    assert.equal(f.contexto.tienePermiso('usuarios'), true);
    assert.equal(f.campos.loginClave.value, '');
    f.respuestas.push({ status: 204 });
    await f.contexto.MicroCarmitaAuth.cerrarSesion();
    assert.equal(f.peticiones[1].ruta, '/api/auth/logout');
    assert.equal(f.peticiones[1].opciones.headers['X-CSRF-Token'], 'csrf-simulado');
    assert.equal(f.contexto.usuarioActual(), null);
    assert.equal(vm.runInContext('carrito.length', f.contexto), 0);
});

test('frontend restaura sesión y bloquea acceso ante sesión vencida o servidor inaccesible', async () => {
    const f = prepararCliente();
    const restaurar = f.eventos.get('DOMContentLoaded');
    f.respuestas.push({ status: 200, body: { usuario: { id: 2, rol: 'vendedor' }, csrfToken: 'csrf' } });
    await restaurar();
    assert.equal(f.contexto.usuarioActual().rol, 'vendedor');
    assert.equal(f.contexto.tienePermiso('usuarios'), false);
    f.respuestas.push({ status: 401, body: { error: 'Sesión vencida' } });
    await restaurar();
    assert.equal(f.contexto.usuarioActual(), null);
    f.respuestas.push(new Error('Sin conexión'));
    await restaurar();
    assert.equal(f.contexto.usuarioActual(), null);
});

test('frontend presenta el rechazo de credenciales y permite reintentar', async () => {
    const f = prepararCliente();
    f.respuestas.push({ status: 401, body: { error: 'Credenciales inválidas' } });
    await f.contexto.MicroCarmitaAuth.iniciarSesion({ preventDefault() {} });
    assert.equal(f.contexto.usuarioActual(), null);
    assert.equal(f.campos.errorLogin.textContent, 'Credenciales inválidas');
});

test('frontend Administrador crea, edita y cambia estado mediante API con CSRF', async () => {
    const f = prepararCliente();
    f.respuestas.push({ status: 200, body: { usuario: { id: 1, rol: 'administrador' }, csrfToken: 'csrf' } });
    await f.eventos.get('DOMContentLoaded')();
    const user = { id: 2, nombre: 'Ventas', usuario: 'ventas', rol: 'vendedor', activo: true };
    f.respuestas.push({ status: 200, body: { usuarios: [user] } });
    await f.contexto.mostrarUsuarios();
    f.respuestas.push({ status: 201, body: { usuario: user } }, { status: 200, body: { usuarios: [user] } });
    f.campos.usuarioNombre.value = 'Ventas';
    f.campos.usuarioCuenta.value = 'ventas';
    f.campos.usuarioClave.value = 'valor-simulado-solo-para-transporte';
    f.campos.usuarioRol.value = 'vendedor';
    await f.contexto.MicroCarmitaAuth.crearUsuario();
    assert.equal(f.peticiones.at(-2).ruta, '/api/users');
    assert.equal(f.peticiones.at(-2).opciones.method, 'POST');
    assert.equal(f.campos.usuarioClave.value, '');
    const respuestasPrompt = ['Editado', 'editado', 'vendedor'];
    f.contexto.prompt = () => respuestasPrompt.shift();
    f.respuestas.push({ status: 200, body: { usuario: { ...user, nombre: 'Editado' } } },
        { status: 200, body: { usuarios: [user] } });
    await f.contexto.MicroCarmitaAuth.editarUsuario(2);
    assert.equal(f.peticiones.at(-2).ruta, '/api/users/2');
    assert.deepEqual(JSON.parse(f.peticiones.at(-2).opciones.body), { nombre: 'Editado', usuario: 'editado', rol: 'vendedor' });
    f.respuestas.push({ status: 200, body: { usuario: { ...user, activo: false } } },
        { status: 200, body: { usuarios: [{ ...user, activo: false }] } });
    await f.contexto.cambiarEstadoUsuario(2);
    assert.deepEqual(JSON.parse(f.peticiones.at(-2).opciones.body), { activo: false });
    assert.equal(f.peticiones.at(-2).opciones.headers['X-CSRF-Token'], 'csrf');
});

test('frontend Vendedor no envía operaciones de gestión de usuarios', async () => {
    const f = prepararCliente();
    f.respuestas.push({ status: 200, body: { usuario: { id: 2, rol: 'vendedor' }, csrfToken: 'csrf' } });
    await f.eventos.get('DOMContentLoaded')();
    await f.contexto.MicroCarmitaAuth.crearUsuario();
    await f.contexto.MicroCarmitaAuth.editarUsuario(1);
    await f.contexto.cambiarEstadoUsuario(1);
    assert.equal(f.peticiones.length, 1);
});

test('app.js y adaptador reales actualizan la pantalla con sesión del backend y conservan permisos de inventario', async () => {
    const f = prepararCliente({ real: true });
    f.respuestas.push({ status: 200, body: {
        usuario: { id: 2, nombre: 'Ventas remotas', rol: 'vendedor', activo: true }, csrfToken: 'csrf'
    } });
    await f.eventos.get('DOMContentLoaded')();
    assert.equal(f.clasesLogin.has('oculta'), true);
    assert.equal(f.campos.nombreSesion.textContent, 'Ventas remotas');
    assert.equal(f.campos.formularioProducto.hidden, true);
    f.contexto.editarProducto(101);
    f.contexto.eliminarProducto(101);
    assert.deepEqual(f.avisos, Array(2).fill('Solo administración puede modificar el inventario.'));
    f.respuestas.push({ status: 204 });
    await f.contexto.MicroCarmitaAuth.cerrarSesion();
    assert.equal(f.clasesLogin.has('oculta'), false);
    assert.equal(f.contexto.usuarioActual(), null);
});
