/* Consulta unificada: nunca copia movimientos de venta ni guarda datos económicos locales. */
(()=>{
    'use strict';
    const el=id=>document.getElementById(id),admin=()=>usuarioActual()?.rol==='administrador';
    let movimientos=[],pendiente=null,ocupado=false,consulta=0;
    function informar(id,tipo,mensaje){
        el(id).textContent=mensaje;el(id).setAttribute?.('data-estado',tipo);
    }
    function controles(){
        for(const b of document.querySelectorAll?.('#movimientos [data-finanza-registro]')||[]){
            b.disabled=ocupado||!admin();
            if(ocupado)b.setAttribute('aria-busy','true');else b.removeAttribute('aria-busy');
        }
    }
    function controlesConsulta(cargando){
        for(const b of document.querySelectorAll?.('#movimientos [data-finanza-consulta]')||[]){
            b.disabled=cargando||!admin();
            if(cargando)b.setAttribute('aria-busy','true');else b.removeAttribute('aria-busy');
        }
        el('listaMovimientos').setAttribute?.('aria-busy',String(cargando));
    }
    const obtenerAnterior=obtenerDatos,guardarAnterior=guardarDatos;
    obtenerDatos=clave=>clave==='movimientos'?movimientos.map(m=>({...m,valor:m.importe,descripcion:m.motivo})):obtenerAnterior(clave);
    guardarDatos=(clave,datos)=>{if(clave==='movimientos')throw new Error('Los movimientos se guardan mediante la API.');return guardarAnterior(clave,datos)};
    function limpiar(){movimientos=[];el('listaMovimientos').innerHTML='';el('resumenFinanzas').innerHTML='';}
    async function cargar(){
        if(!admin()){limpiar();controles();controlesConsulta(false);return}
        const identidad=usuarioActual(),numero=++consulta;
        const desde=el('finanzaDesde').value,hasta=el('finanzaHasta').value;
        const filtros=[];if(desde)filtros.push('desde='+encodeURIComponent(desde));if(hasta)filtros.push('hasta='+encodeURIComponent(hasta));
        informar('estadoFinanzas','cargando','Consultando movimientos…');controlesConsulta(true);
        try{
            const r=await MicroCarmitaAuth.api('/finance'+(filtros.length?'?'+filtros.join('&'):''));
            if(usuarioActual()!==identidad||numero!==consulta)return;
            movimientos=r.movimientos;
            el('listaMovimientos').innerHTML=movimientos.map(m=>`<tr><td><span class="finanza-tipo finanza-tipo--${m.tipo==='ingreso'?'ingreso':'egreso'}">${textoSeguro(m.tipo)}</span><span class="finanza-meta">${textoSeguro(m.origen)}</span></td>
                <td><strong>${textoSeguro(m.categoria)}</strong>${m.gastoAdministrativo?' · Gasto administrativo':''}<span class="finanza-descripcion">${textoSeguro(m.motivo)}</span><span class="finanza-meta">${textoSeguro(m.responsable)}</span></td>
                <td class="finanza-importe">${textoSeguro(dinero(m.importe))}</td><td>${textoSeguro(MicroCarmitaFechas.calendario(m.fecha))}<span class="finanza-meta">${textoSeguro(MicroCarmitaFechas.instante(m.registradoEn))}</span></td></tr>`).join('')||'<tr><td colspan="4">No hay movimientos en las fechas consultadas.</td></tr>';
            el('resumenFinanzas').innerHTML=`<span class="finanza-resumen finanza-resumen--ingreso">Ingresos<strong>${textoSeguro(dinero(r.ingresos))}</strong></span><span class="finanza-resumen finanza-resumen--egreso">Egresos<strong>${textoSeguro(dinero(r.egresos))}</strong></span><span class="finanza-resumen finanza-resumen--neto${Number(r.neto)<0?' finanza-resumen--negativo':''}">Saldo neto<strong>${textoSeguro(dinero(r.neto))}</strong></span>`;
            informar('estadoFinanzas','exito','Consulta actualizada.');return true;
        }catch(e){if(usuarioActual()!==identidad||numero!==consulta)return;limpiar();informar('estadoFinanzas','error',`${e.message} Use Consultar para reintentar.`);return false;}
        finally{if(usuarioActual()===identidad&&numero===consulta)controlesConsulta(false);}
    }
    mostrarMovimientos=cargar;
    registrarMovimiento=async()=>{
        if(!admin()||ocupado)return;
        const identidad=usuarioActual();ocupado=true;
        controles();informar('finanzaRegistroEstado','cargando','Registrando movimiento…');
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
            const actualizado=await cargar();
            if(usuarioActual()===identidad)informar('finanzaRegistroEstado','exito',actualizado===false
                ?'Movimiento registrado. No vuelva a registrarlo; use Consultar para actualizar el historial.'
                :'Movimiento registrado correctamente.');
        }catch(e){if(usuarioActual()===identidad)informar('finanzaRegistroEstado','error',e.message)}
        finally{ocupado=false;controles()}
    };
    globalThis.MicroCarmitaFinanzas={cargar,todos(){el('finanzaDesde').value='';el('finanzaHasta').value='';return cargar()}};
    el('finanzaFecha').value=MicroCarmitaFechas.hoy();
    document.addEventListener('microcarmita:sesion',()=>{consulta++;pendiente=null;limpiar();informar('estadoFinanzas','neutro','');informar('finanzaRegistroEstado','neutro','');controles();controlesConsulta(false);if(admin())cargar()});
})();
