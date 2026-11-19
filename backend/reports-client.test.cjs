const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function preparar(rol='administrador'){
    const campos={},peticiones=[],eventos={};let actor={id:1,rol},espera,descargas=0;
    const nodo=()=>({disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}});
    const botones={cargar:nodo(),descargar:nodo()};
    const c=vm.createContext({document:{getElementById(id){return campos[id]??={value:id==='reporteTipo'?'ventas':'',style:{},innerHTML:'',textContent:''}},querySelectorAll:s=>[s.includes('.descargar()')?botones.descargar:botones.cargar],addEventListener(n,f){eventos[n]=f},createElement(){return {click(){descargas++}}}},usuarioActual:()=>actor,
        textoSeguro:v=>String(v??'').replace(/</g,'&lt;'),dinero:v=>String(v),URL:{createObjectURL:()=> 'blob:ensayo',revokeObjectURL(){}},setTimeout:f=>f(),
        MicroCarmitaAuth:{async api(ruta){peticiones.push(ruta);if(espera)await espera;return {titulo:'Ventas',generadoEn:'2026-11-17',resumen:[{etiqueta:'Ventas',valor:2}],notas:['<nota>'],columnas:[{clave:'nombre',titulo:'Cliente'}],filas:[{nombre:'<Cliente>'}]}},async archivo(ruta){peticiones.push(ruta);return {}}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','reports-client.js'),'utf8'),c);
    return {c,campos,botones,peticiones,get descargas(){return descargas},pausar(p){espera=p},salir(){actor=null;eventos['microcarmita:sesion']()}};
}

test('consulta de reportes muestra carga y libera botón ante un error de red',async()=>{
    const f=preparar();let rechazar;
    f.c.MicroCarmitaAuth.api=()=>new Promise((r,j)=>{rechazar=j});
    const carga=f.c.MicroCarmitaReportes.cargar();
    assert.ok(f.botones.cargar.disabled);assert.match(f.campos.estadoReportes.textContent,/Consultando/);
    rechazar(new Error('Sin conexión'));await carga;
    assert.equal(f.botones.cargar.disabled,false);assert.match(f.campos.estadoReportes.textContent,/Sin conexión/);
});

test('PDF bloquea doble clic, libera tras error y permite reintentar',async()=>{
    const f=preparar();let rechazar,llamadas=0;
    f.c.MicroCarmitaAuth.archivo=()=>{llamadas++;return new Promise((r,j)=>{rechazar=j})};
    const descarga=f.c.MicroCarmitaReportes.descargar();await f.c.MicroCarmitaReportes.descargar();
    assert.equal(llamadas,1);assert.ok(f.botones.descargar.disabled);assert.equal(f.botones.descargar.attrs['aria-busy'],'true');
    rechazar(new Error('Sin conexión'));await descarga;assert.equal(f.botones.descargar.disabled,false);
    f.c.MicroCarmitaAuth.archivo=async()=>({});await f.c.MicroCarmitaReportes.descargar();assert.equal(f.descargas,1);
});

test('reporte tardío no se presenta bajo filtros de fecha distintos a los consultados',async()=>{
    const f=preparar();let liberar;f.pausar(new Promise(r=>{liberar=r}));
    f.c.document.getElementById('reporteDesde').value='2026-11-01';
    const carga=f.c.MicroCarmitaReportes.cargar();
    f.campos.reporteDesde.value='2026-11-18';liberar();await carga;
    assert.equal(f.campos.contenidoReportes.innerHTML,'');
    assert.match(f.campos.estadoReportes.textContent,/filtros.*cambiaron/i);
});

test('descarga tardía con filtros cambiados no entrega un PDF de criterios anteriores',async()=>{
    const f=preparar();let resolver;
    f.c.MicroCarmitaAuth.archivo=()=>new Promise(r=>{resolver=r});
    const descarga=f.c.MicroCarmitaReportes.descargar();
    f.c.document.getElementById('reporteHasta').value='2026-11-18';resolver({});await descarga;
    assert.equal(f.descargas,0);assert.match(f.campos.estadoReportes.textContent,/filtros.*cambiaron/i);
});
test('pantalla de reportes usa API, escapa texto y envía filtros sin leer localStorage',async()=>{const f=preparar();f.c.document.getElementById('reporteDesde').value='2026-11-17';await f.c.MicroCarmitaReportes.cargar();assert.equal(f.peticiones[0],'/reports/ventas?desde=2026-11-17');assert.match(f.campos.contenidoReportes.innerHTML,/&lt;Cliente>/);assert.match(f.campos.contenidoReportes.innerHTML,/Ventas/)});
test('PDF se descarga mediante sesión usando el mismo tipo y filtros',async()=>{const f=preparar();f.c.document.getElementById('reporteHasta').value='2026-11-18';await f.c.MicroCarmitaReportes.descargar();assert.equal(f.peticiones[0],'/reports/ventas/pdf?hasta=2026-11-18');assert.equal(f.descargas,1)});
test('Vendedor no consulta ni descarga reportes',async()=>{const f=preparar('vendedor');await f.c.MicroCarmitaReportes.cargar();await f.c.MicroCarmitaReportes.descargar();assert.equal(f.peticiones.length,0)});
test('inventario no envía filtros históricos y semana solo envía día seleccionado',async()=>{const f=preparar();f.c.document.getElementById('reporteTipo').value='inventario';f.c.document.getElementById('reporteDesde').value='2026-11-01';f.c.MicroCarmitaReportes.seleccionar();await f.c.MicroCarmitaReportes.cargar();assert.equal(f.peticiones[0],'/reports/inventario');f.campos.reporteTipo.value='pagos';f.c.document.getElementById('reporteFecha').value='2026-11-17';await f.c.MicroCarmitaReportes.cargar();assert.equal(f.peticiones[1],'/reports/pagos?fecha=2026-11-17')});
test('cerrar sesión descarta respuesta de reporte tardía',async()=>{const f=preparar();let liberar;f.pausar(new Promise(r=>liberar=r));const p=f.c.MicroCarmitaReportes.cargar();f.salir();liberar();await p;assert.equal(f.campos.contenidoReportes.innerHTML,'')});
