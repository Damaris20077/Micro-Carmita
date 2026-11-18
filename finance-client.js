/* Consulta unificada: nunca copia movimientos de venta ni guarda datos económicos locales. */
(()=>{
    'use strict';
    const el=id=>document.getElementById(id),admin=()=>usuarioActual()?.rol==='administrador';
    let movimientos=[],pendiente=null,ocupado=false,consulta=0;
    const obtenerAnterior=obtenerDatos,guardarAnterior=guardarDatos;
    obtenerDatos=clave=>clave==='movimientos'?movimientos.map(m=>({...m,valor:m.importe,descripcion:m.motivo})):obtenerAnterior(clave);
    guardarDatos=(clave,datos)=>{if(clave==='movimientos')throw new Error('Los movimientos se guardan mediante la API.');return guardarAnterior(clave,datos)};
    function limpiar(){movimientos=[];el('listaMovimientos').innerHTML='';el('resumenFinanzas').textContent='';}
    function hoy(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`;}
    async function cargar(){
        if(!admin()){limpiar();return}
        const identidad=usuarioActual(),numero=++consulta;
        const desde=el('finanzaDesde').value,hasta=el('finanzaHasta').value;
        const filtros=[];if(desde)filtros.push('desde='+encodeURIComponent(desde));if(hasta)filtros.push('hasta='+encodeURIComponent(hasta));
        try{
            const r=await MicroCarmitaAuth.api('/finance'+(filtros.length?'?'+filtros.join('&'):''));
            if(usuarioActual()!==identidad||numero!==consulta)return;
            movimientos=r.movimientos;
            el('listaMovimientos').innerHTML=movimientos.map(m=>`<tr><td>${textoSeguro(m.tipo)} · ${textoSeguro(m.origen)}</td>
                <td>${textoSeguro(m.categoria)}${m.gastoAdministrativo?' · Gasto administrativo':''}<br>${textoSeguro(m.motivo)}<br>${textoSeguro(m.responsable)} · ${textoSeguro(m.id)}</td>
                <td>${dinero(m.importe)}</td><td>${textoSeguro(MicroCarmitaFechas.calendario(m.fecha))}<br>${textoSeguro(MicroCarmitaFechas.instante(m.registradoEn))}</td></tr>`).join('');
            el('resumenFinanzas').textContent=`Ingresos ${dinero(r.ingresos)} · Egresos ${dinero(r.egresos)} · Neto ${dinero(r.neto)}`;
            el('estadoFinanzas').textContent='';
        }catch(e){if(usuarioActual()!==identidad||numero!==consulta)return;limpiar();el('estadoFinanzas').textContent=e.message;}
    }
    mostrarMovimientos=cargar;
    registrarMovimiento=async()=>{
        if(!admin()||ocupado)return;
        const identidad=usuarioActual();ocupado=true;
        try{
            const datos={tipo:el('movimientoTipo').value,categoria:el('finanzaCategoria').value,motivo:el('movimientoDescripcion').value,
                importe:el('movimientoValor').value.trim()===''?null:Number(el('movimientoValor').value),fecha:el('finanzaFecha').value,
                gastoAdministrativo:el('finanzaAdministrativo').checked};
            const firma=JSON.stringify(datos);
            if(pendiente&&pendiente.firma!==firma)throw new Error('Reintente la operación pendiente con los mismos datos antes de registrar otra.');
            if(!pendiente)pendiente={firma,clave:crypto.randomUUID()};
            const actual=pendiente;
            try{await MicroCarmitaAuth.api('/finance','POST',{...datos,clave:actual.clave})}
            catch(e){if(e.status>=400&&e.status<500&&pendiente===actual)pendiente=null;throw e}
            if(usuarioActual()!==identidad||pendiente!==actual)return;
            pendiente=null;el('movimientoDescripcion').value='';el('movimientoValor').value='';
            await cargar();
        }catch(e){if(usuarioActual()===identidad)el('estadoFinanzas').textContent=e.message}
        finally{ocupado=false}
    };
    globalThis.MicroCarmitaFinanzas={cargar,todos(){el('finanzaDesde').value='';el('finanzaHasta').value='';return cargar()}};
    el('finanzaFecha').value=hoy();
    document.addEventListener('microcarmita:sesion',()=>{consulta++;pendiente=null;limpiar();el('estadoFinanzas').textContent='';if(admin())cargar()});
})();
