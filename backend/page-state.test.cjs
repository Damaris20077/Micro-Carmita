const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const raiz=path.join(__dirname,'..'),clave='micro-carmita-vista';
function preparar({store=new Map(),usuario={id:1,rol:'administrador',nombre:'QA'},bloqueado=false}={}){
    const nodos={},eventos={},ventana={},escrituras=[],entradas=[];
    function nodo(id){return nodos[id]??={id,value:'',textContent:'',innerHTML:'',dataset:{},attrs:{},
        classList:{clases:new Set(id==='inicio'?['activa-seccion']:[]),add(c){this.clases.add(c)},remove(c){this.clases.delete(c)},contains(c){return this.clases.has(c)},toggle(c,b){if(b)this.add(c);else this.remove(c)}},
        setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},focus(){}}}
    const secciones=['inicio','ventas','cuentas','inventario','movimientos','reportes','pedidos','usuarios'].map(nodo);
    const menus=secciones.map(s=>Object.assign(nodo('menu-'+s.id),{dataset:{permiso:s.id}}));
    for(const [,id]of fs.readFileSync(path.join(raiz,'index.html'),'utf8').matchAll(/id="([^"]+)"/g))nodo(id);
    const c=vm.createContext({Event,Intl,Date,document:{getElementById:nodo,
        querySelectorAll(s){if(s==='.seccion')return secciones;if(s==='.menu'||s==='.menu[data-permiso]')return menus;return s.includes('#ventas .ventas-seleccion input')?entradas:[]},
        querySelector(s){return s==='.seccion.activa-seccion'?secciones.find(n=>n.classList.contains('activa-seccion')):s==='.menu'?menus[0]:s==='.contenedor'?nodo('panel'):null},
        addEventListener(n,f){eventos[n]=f},dispatchEvent(e){eventos[e.type]?.(e)}},
        addEventListener(n,f){ventana[n]=f},
        sessionStorage:{getItem(k){if(bloqueado)throw new Error('No disponible');return store.get(k)??null},setItem(k,v){if(bloqueado)throw new Error('No disponible');store.set(k,v)},removeItem(k){if(bloqueado)throw new Error('No disponible');store.delete(k)}},
        localStorage:{getItem(){assert.fail('No leer datos locales')},setItem(){assert.fail('No escribir datos locales')}},
        async fetch(r,o={}){if(o.method&&o.method!=='GET')escrituras.push(r);if(r==='/api/auth/logout')return{ok:true,status:204};return{ok:true,status:200,async json(){return r==='/api/users'?{usuarios:[]}:{usuario,csrfToken:'csrf-ficticio'}}}},alert(){}});
    vm.runInContext(fs.readFileSync(path.join(raiz,'date-formatter.js'),'utf8'),c);
    vm.runInContext(fs.readFileSync(path.join(raiz,'app.js'),'utf8'),c);
    vm.runInContext("actualizarTodo=()=>{};permisosPorRol.administrador.push('pedidos');permisosPorRol.vendedor.push('pedidos');",c);
    vm.runInContext(fs.readFileSync(path.join(raiz,'auth-client.js'),'utf8'),c);
    return {c,store,nodo,entradas,ventana,escrituras,abrir:()=>eventos.DOMContentLoaded(),activa:()=>secciones.find(s=>s.classList.contains('activa-seccion'))?.id};
}

test('F5 restaura las ocho secciones permitidas desde el estado de la misma pestaña',async()=>{
    for(const seccion of ['inicio','ventas','cuentas','inventario','movimientos','reportes','pedidos','usuarios']){
        const store=new Map(),primera=preparar({store});await primera.abrir();
        primera.c.mostrarSeccion(seccion,primera.nodo('menu-'+seccion));
        const recarga=preparar({store});await recarga.abrir();assert.equal(recarga.activa(),seccion);
        assert.deepEqual(JSON.parse(store.get(clave)),{usuarioId:1,seccion});assert.equal(recarga.escrituras.length,0);
    }
});

test('sección inexistente, JSON inválido o rol sin permiso restauran Inicio',async()=>{
    for(const valor of ['{mal-json',JSON.stringify({usuarioId:1,seccion:'no-existe'}),JSON.stringify({usuarioId:1,seccion:'usuarios'})]){
        const f=preparar({store:new Map([[clave,valor]]),usuario:{id:1,rol:'vendedor'}});await f.abrir();
        assert.equal(f.activa(),'inicio');assert.equal(JSON.parse(f.store.get(clave)).seccion,'inicio');
    }
    const f=preparar({store:new Map([[clave,JSON.stringify({usuarioId:1,seccion:'reportes'})]])});
    const obtener=f.c.document.getElementById;f.c.document.getElementById=id=>id==='reportes'?null:obtener(id);
    await f.abrir();assert.equal(f.activa(),'inicio');
});

test('cambiar de cuenta o pestaña no recupera la sección del usuario anterior',async()=>{
    const store=new Map([[clave,JSON.stringify({usuarioId:1,seccion:'inventario'})]]);
    const otro=preparar({store,usuario:{id:2,rol:'administrador'}});await otro.abrir();assert.equal(otro.activa(),'inicio');
    const pestañaNueva=preparar();await pestañaNueva.abrir();assert.equal(pestañaNueva.activa(),'inicio');
});

test('logout y 401 eliminan solo el estado de navegación; login explícito inicia en Inicio',async()=>{
    const f=preparar({store:new Map([['otra-preferencia','conservar']])});await f.abrir();f.c.mostrarSeccion('inventario');
    await f.c.cerrarSesion();assert.equal(f.store.has(clave),false);assert.equal(f.store.get('otra-preferencia'),'conservar');
    await f.c.iniciarSesion({preventDefault(){}});assert.equal(f.activa(),'inicio');
    f.c.fetch=async()=>({ok:false,status:401,async json(){return {error:'Sesión vencida'}}});
    await assert.rejects(()=>f.c.MicroCarmitaAuth.api('/users'));assert.equal(f.store.has(clave),false);
    assert.equal(f.store.get('otra-preferencia'),'conservar');
});

test('sessionStorage bloqueado no impide autenticar ni navegar por el menú',async()=>{
    const f=preparar({bloqueado:true});await f.abrir();f.c.mostrarSeccion('ventas');assert.equal(f.activa(),'ventas');
});

test('recarga limpia creación y checkbox con valores predeterminados, sin tocar login y usando fecha de hoy',async()=>{
    const f=preparar();
    f.c.MicroCarmitaFechas.hoy=()=> '2028-02-29';
    const nombre=Object.assign(f.nodo('productoNombre'),{value:'Sin enviar',defaultValue:'',tagName:'INPUT',type:'text'});
    const cantidad=Object.assign(f.nodo('productoCantidad'),{value:'99',defaultValue:'1',tagName:'INPUT',type:'number'});
    const check=Object.assign(f.nodo('finanzaAdministrativo'),{checked:true,defaultChecked:false,type:'checkbox'});
    const tipo=Object.assign(f.nodo('ventaTipo'),{value:'fiado',tagName:'SELECT',options:[{value:'contado'},{value:'fiado'}]});
    const fecha=Object.assign(f.nodo('finanzaFecha'),{value:'2000-01-01'});
    f.entradas.push(nombre,cantidad,check,tipo,fecha);f.nodo('loginUsuario').value='Cuenta del gestor';
    await f.abrir();assert.equal(nombre.value,'');assert.equal(cantidad.value,'1');assert.equal(check.checked,false);assert.equal(tipo.value,'contado');
    assert.equal(fecha.value,'2028-02-29');assert.equal(f.nodo('loginUsuario').value,'Cuenta del gestor');
    nombre.value='Restaurado por navegador';f.ventana.pageshow({persisted:false});assert.equal(nombre.value,'');
});

test('navegar entre módulos y volver desde bfcache no borra una edición en curso',async()=>{
    const f=preparar(),campo=Object.assign(f.nodo('usuarioNombre'),{value:'',defaultValue:'',tagName:'INPUT'});f.entradas.push(campo);await f.abrir();
    campo.value='Edición en curso';f.c.mostrarSeccion('usuarios');f.c.mostrarSeccion('inventario');f.c.mostrarSeccion('usuarios');
    f.ventana.pageshow({persisted:true});assert.equal(campo.value,'Edición en curso');
});

test('estado de navegación no incluye credenciales, nombres ni datos de negocio',async()=>{
    const f=preparar();await f.abrir();f.c.mostrarSeccion('pedidos');
    assert.deepEqual(Object.keys(JSON.parse(f.store.get(clave))).sort(),['seccion','usuarioId']);
});
