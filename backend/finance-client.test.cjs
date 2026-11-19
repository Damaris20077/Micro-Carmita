const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const {randomUUID}=require('node:crypto');
function preparar(rol='administrador'){
    const campos={},solicitudes=[],eventos={};let actor={id:1,rol},fallo=false,intentos=0,espera;
    const nodo=()=>({value:'',checked:false,innerHTML:'',textContent:'',disabled:false,attrs:{},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]}});
    const registro=[nodo()],filtros=[nodo(),nodo()];
    const c=vm.createContext({Intl,Date,crypto:{randomUUID},document:{getElementById(id){return campos[id]??=nodo()},querySelectorAll:s=>s.includes('data-finanza-registro')?registro:filtros,addEventListener(n,fn){eventos[n]=fn}},usuarioActual:()=>actor,
        textoSeguro:v=>String(v).replace(/</g,'&lt;'),dinero:v=>String(v),obtenerDatos(){throw new Error('Lectura local prohibida')},guardarDatos(){throw new Error('Escritura local prohibida')},mostrarMovimientos(){},registrarMovimiento(){},
        MicroCarmitaAuth:{async api(ruta,metodo,datos){solicitudes.push({ruta,metodo,datos});if(espera)await espera;if(metodo==='POST'){intentos++;if(fallo&&intentos===1)throw new Error('Respuesta perdida');return {id:1}}return {movimientos:[{id:'manual:1',origen:'manual',tipo:'ingreso',categoria:'Operación',motivo:'<prueba>',importe:5,fecha:'2026-11-17',responsable:'QA',registradoEn:'2026-11-17'}],ingresos:5,egresos:0,neto:5}}}});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'date-formatter.js'), 'utf8'), c);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','finance-client.js'),'utf8'),c);
    for(const [id,value]of Object.entries({movimientoTipo:'ingreso',movimientoDescripcion:'Operación',movimientoValor:'5',finanzaCategoria:'Aporte'}))c.document.getElementById(id).value=value;
    return {c,campos,registro,filtros,solicitudes,perder(){fallo=true},salir(){actor=null;eventos['microcarmita:sesion']()},pausar(p){espera=p}};
}

test('consulta muestra carga, libera filtros y presenta vacío con totales reales del servidor',async()=>{
    const f=preparar();let resolver;
    f.c.MicroCarmitaAuth.api=()=>new Promise(r=>{resolver=r});
    const carga=f.c.MicroCarmitaFinanzas.cargar();
    assert.equal(f.campos.estadoFinanzas.attrs['data-estado'],'cargando');
    assert.ok(f.filtros.every(b=>b.disabled&&b.attrs['aria-busy']==='true'));
    resolver({movimientos:[],ingresos:0,egresos:0,neto:0});await carga;
    assert.match(f.campos.listaMovimientos.innerHTML,/No hay movimientos en las fechas consultadas/);
    assert.match(f.campos.resumenFinanzas.innerHTML,/Ingresos<strong>0/);
    assert.equal(f.campos.estadoFinanzas.attrs['data-estado'],'exito');
    assert.ok(f.filtros.every(b=>!b.disabled&&!b.attrs['aria-busy']));
    assert.equal(f.campos.listaMovimientos.attrs['aria-busy'],'false');
});

test('resumen financiero conserva cifras de API sin sumar ventas ni movimientos de nuevo',async()=>{
    const f=preparar();
    f.c.MicroCarmitaAuth.api=async()=>({movimientos:[
        {id:'caja:1',tipo:'egreso',origen:'reembolso',categoria:'<Categoría>',motivo:'<Motivo>',responsable:'<QA>',importe:-11,fecha:'2026-11-18',registradoEn:'2026-11-18T04:59:00Z',gastoAdministrativo:true}
    ],ingresos:5,egresos:11,neto:-6});
    await f.c.MicroCarmitaFinanzas.cargar();
    const resumen=f.campos.resumenFinanzas.innerHTML,tabla=f.campos.listaMovimientos.innerHTML;
    assert.match(resumen,/Ingresos<strong>5/);assert.match(resumen,/Egresos<strong>11/);
    assert.match(resumen,/Saldo neto<strong>-6/);assert.match(resumen,/finanza-resumen--negativo/);
    assert.match(tabla,/finanza-tipo--egreso">egreso/);assert.match(tabla,/reembolso/);
    assert.match(tabla,/Gasto administrativo/);assert.match(tabla,/&lt;Motivo>/);assert.doesNotMatch(tabla,/<QA>|<Motivo>|<Categoría>/);
    assert.match(tabla,/18.*nov.*2026/);assert.match(tabla,/17.*nov.*2026.*23:59/);
    assert.equal(f.c.obtenerDatos('movimientos').length,1);
});

test('registro deshabilita su botón, envía una vez y confirma éxito junto a la acción',async()=>{
    const f=preparar();let resolver;const api=f.c.MicroCarmitaAuth.api;
    f.c.MicroCarmitaAuth.api=async(...args)=>{if(args[1]==='POST')await new Promise(r=>{resolver=r});return api(...args)};
    const registro=f.c.registrarMovimiento();
    assert.ok(f.registro[0].disabled);assert.equal(f.registro[0].attrs['aria-busy'],'true');
    assert.equal(f.campos.finanzaRegistroEstado.attrs['data-estado'],'cargando');
    await f.c.registrarMovimiento();resolver();await registro;
    assert.equal(f.solicitudes.filter(s=>s.metodo==='POST').length,1);
    assert.equal(f.campos.finanzaRegistroEstado.textContent,'Movimiento registrado correctamente.');
    assert.equal(f.campos.finanzaRegistroEstado.attrs['data-estado'],'exito');
    assert.equal(f.campos.movimientoValor.value,'');assert.equal(f.campos.movimientoDescripcion.value,'');
    assert.equal(f.registro[0].disabled,false);assert.equal(f.registro[0].attrs['aria-busy'],undefined);
});

test('rechazo de validación conserva campos y permite corregir sin reutilizar una clave rechazada',async()=>{
    const f=preparar();const claves=[];let rechazar=true;
    const api=f.c.MicroCarmitaAuth.api;
    f.c.MicroCarmitaAuth.api=async(r,m,d)=>{
        if(m==='POST'){claves.push(d.clave);if(rechazar)throw Object.assign(new Error('Ingrese un importe válido.'),{status:400})}
        return api(r,m,d);
    };
    await f.c.registrarMovimiento();
    assert.equal(f.campos.finanzaRegistroEstado.attrs['data-estado'],'error');
    assert.match(f.campos.finanzaRegistroEstado.textContent,/importe válido/);
    assert.equal(f.campos.movimientoValor.value,'5');assert.equal(f.campos.movimientoDescripcion.value,'Operación');
    assert.equal(f.registro[0].disabled,false);
    rechazar=false;f.campos.movimientoValor.value='6';await f.c.registrarMovimiento();
    assert.notEqual(claves[0],claves[1]);
});

test('registro confirmado seguido de error al consultar no invita a repetir la escritura',async()=>{
    const f=preparar();const api=f.c.MicroCarmitaAuth.api;
    f.c.MicroCarmitaAuth.api=async(r,m,d)=>{if(m!=='POST')throw new Error('Red interrumpida');return api(r,m,d)};
    await f.c.registrarMovimiento();
    assert.equal(f.solicitudes.filter(s=>s.metodo==='POST').length,1);
    assert.match(f.campos.finanzaRegistroEstado.textContent,/Movimiento registrado.*No vuelva a registrarlo/);
    assert.equal(f.campos.estadoFinanzas.attrs['data-estado'],'error');
    assert.match(f.campos.estadoFinanzas.textContent,/Consultar/);
    assert.equal(f.campos.movimientoValor.value,'');
});

test('error de consulta retira importes anteriores y se distingue de una lista vacía',async()=>{
    const f=preparar();await f.c.MicroCarmitaFinanzas.cargar();
    assert.match(f.campos.resumenFinanzas.innerHTML,/Ingresos/);
    f.c.MicroCarmitaAuth.api=async()=>{throw new Error('Sin conexión')};
    await f.c.MicroCarmitaFinanzas.cargar();
    assert.equal(f.campos.listaMovimientos.innerHTML,'');assert.equal(f.campos.resumenFinanzas.innerHTML,'');
    assert.equal(f.campos.estadoFinanzas.attrs['data-estado'],'error');
    assert.match(f.campos.estadoFinanzas.textContent,/Sin conexión.*Consultar/);
    assert.ok(f.filtros.every(b=>!b.disabled));
});

test('consulta anterior no modifica totales, mensajes ni bloqueo de la consulta vigente',async()=>{
    const f=preparar(),resolver=[];
    f.c.MicroCarmitaAuth.api=()=>new Promise(r=>resolver.push(r));
    const vieja=f.c.MicroCarmitaFinanzas.cargar(),actual=f.c.MicroCarmitaFinanzas.cargar();
    resolver[0]({movimientos:[],ingresos:1,egresos:0,neto:1});await vieja;
    assert.ok(f.filtros.every(b=>b.disabled));
    assert.equal(f.campos.estadoFinanzas.attrs['data-estado'],'cargando');
    resolver[1]({movimientos:[],ingresos:2,egresos:0,neto:2});await actual;
    assert.match(f.campos.resumenFinanzas.innerHTML,/Ingresos<strong>2/);
    assert.ok(f.filtros.every(b=>!b.disabled));
});

test('logout limpia mensajes y resumen; Vendedor mantiene botones financieros bloqueados',async()=>{
    const f=preparar();await f.c.registrarMovimiento();f.salir();
    assert.equal(f.campos.finanzaRegistroEstado.textContent,'');assert.equal(f.campos.estadoFinanzas.textContent,'');
    assert.equal(f.campos.resumenFinanzas.innerHTML,'');assert.ok(f.registro.every(b=>b.disabled));
    assert.ok(f.filtros.every(b=>b.disabled));
    const vendedor=preparar('vendedor');await vendedor.c.MicroCarmitaFinanzas.cargar();await vendedor.c.registrarMovimiento();
    assert.ok(vendedor.registro.every(b=>b.disabled));assert.ok(vendedor.filtros.every(b=>b.disabled));
    assert.equal(vendedor.solicitudes.length,0);
});
test('cliente financiero consulta y registra mediante API sin almacenamiento local',async()=>{const f=preparar();await f.c.MicroCarmitaFinanzas.cargar();assert.match(f.campos.listaMovimientos.innerHTML,/&lt;prueba>/);assert.equal(f.c.obtenerDatos('movimientos')[0].valor,5);assert.throws(()=>f.c.guardarDatos('movimientos',[]),/API/);await f.c.registrarMovimiento();assert.equal(f.solicitudes.filter(s=>s.metodo==='POST').length,1)});
test('Vendedor no consulta ni registra movimientos financieros',async()=>{const f=preparar('vendedor');await f.c.MicroCarmitaFinanzas.cargar();await f.c.registrarMovimiento();assert.equal(f.solicitudes.length,0)});
test('cliente conserva clave ante respuesta perdida y bloquea envíos simultáneos',async()=>{const f=preparar();f.perder();await f.c.registrarMovimiento();await Promise.all([f.c.registrarMovimiento(),f.c.registrarMovimiento()]);const p=f.solicitudes.filter(s=>s.metodo==='POST');assert.equal(p.length,2);assert.equal(p[0].datos.clave,p[1].datos.clave)});
test('cliente envía rango y limpia filtros al consultar todas las fechas',async()=>{const f=preparar();f.c.document.getElementById('finanzaDesde').value='2026-11-17';f.c.document.getElementById('finanzaHasta').value='2026-11-18';await f.c.MicroCarmitaFinanzas.cargar();assert.match(f.solicitudes[0].ruta,/desde=2026-11-17&hasta=2026-11-18/);await f.c.MicroCarmitaFinanzas.todos();assert.equal(f.solicitudes[1].ruta,'/finance')});
test('consulta tardía tras cerrar sesión no recupera datos del Administrador',async()=>{const f=preparar();let resolver;f.pausar(new Promise(r=>resolver=r));const p=f.c.MicroCarmitaFinanzas.cargar();f.salir();resolver();await p;assert.equal(f.c.obtenerDatos('movimientos').length,0);assert.equal(f.campos.listaMovimientos.innerHTML,'')});

test('finanzas formatea calendario e instante sin cambiar filtros ISO', async () => {
    const f = preparar();
    f.c.MicroCarmitaAuth.api = async ruta => {
        f.solicitudes.push({ ruta });
        return { movimientos: [{ id: 'manual:1', tipo: 'ingreso', importe: 1, fecha: '2026-11-18', registradoEn: '2026-11-18T04:59:00Z' }], ingresos: 1, egresos: 0, neto: 1 };
    };
    f.c.document.getElementById('finanzaDesde').value = '2026-11-18';
    await f.c.MicroCarmitaFinanzas.cargar();
    assert.match(f.campos.listaMovimientos.innerHTML, /18.*nov.*2026/);
    assert.match(f.campos.listaMovimientos.innerHTML, /17.*nov.*2026.*23:59/);
    assert.equal(f.solicitudes[0].ruta, '/finance?desde=2026-11-18');
});
