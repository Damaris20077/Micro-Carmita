const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function preparar(){const eventos={},peticiones=[];let respuesta={ok:true,status:200,headers:{get:()=> 'application/pdf'},async blob(){return 'pdf_aislado'}};
    const c=vm.createContext({permisosPorRol:{administrador:[],vendedor:[]},carrito:[],usuarioActual(){},obtenerUsuarios(){},iniciarSesion(){},cerrarSesion(){},mostrarUsuarios(){},crearUsuario(){},cambiarEstadoUsuario(){},aplicarSesion(){},exigirPermiso:()=>true,
        document:{getElementById(){return null},addEventListener(n,fn){eventos[n]=fn}},fetch:async(ruta,op)=>{peticiones.push({ruta,op});if(ruta==='/api/auth/me')return {ok:true,status:200,async json(){return {usuario:{id:1,rol:'administrador'},csrfToken:'csrf_aislado'}}};return respuesta}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','auth-client.js'),'utf8'),c);
    return {c,eventos,peticiones,responder(r){respuesta=r}};
}
test('descarga usa sesión HTTP y conserva el PDF como blob sin almacenamiento local',async()=>{const f=preparar();await f.eventos.DOMContentLoaded();const blob=await f.c.MicroCarmitaAuth.archivo('/reports/ventas/pdf');assert.equal(blob,'pdf_aislado');assert.equal(f.peticiones[1].ruta,'/api/reports/ventas/pdf');assert.equal(f.peticiones[1].op.credentials,'same-origin')});
test('descarga 401 elimina la sesión activa sin entregar un archivo de error',async()=>{const f=preparar();await f.eventos.DOMContentLoaded();f.responder({ok:false,status:401});await assert.rejects(f.c.MicroCarmitaAuth.archivo('/reports/ventas/pdf'),{status:401});assert.equal(f.c.usuarioActual(),null)});
test('descarga rechaza contenido que no sea PDF',async()=>{const f=preparar();await f.eventos.DOMContentLoaded();f.responder({ok:true,status:200,headers:{get:()=> 'text/html'}});await assert.rejects(f.c.MicroCarmitaAuth.archivo('/reports/ventas/pdf'),/PDF inválida/)});
