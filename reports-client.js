/* Reportes remotos y PDF; no reconstruye reportes a partir de datos locales. */
(()=>{
    'use strict';
    const el=id=>document.getElementById(id),admin=()=>usuarioActual()?.rol==='administrador';
    let consulta=0,descargando=false;
    const valor=(v,f)=>f==='dinero'?dinero(v):String(v??'');
    function boton(accion,ocupado){
        for(const b of document.querySelectorAll?.(`#reportes button[onclick="MicroCarmitaReportes.${accion}()"]`)||[]){
            b.disabled=ocupado||!admin();
            if(ocupado)b.setAttribute?.('aria-busy','true');else b.removeAttribute?.('aria-busy');
        }
    }
    el('resumenReportesAnterior').hidden=true;el('resumenReportesAnterior').style.display='none';
    function seleccionar(){
        consulta++;el('contenidoReportes').innerHTML='';
        boton('cargar',false);
        const tipo=el('reporteTipo').value,dia=['cierre','pagos'].includes(tipo),actual=['pendientes','inventario','pedidos'].includes(tipo);
        el('reporteFecha').disabled=!dia;el('reporteDesde').disabled=dia||actual;el('reporteHasta').disabled=dia||actual;
        el('estadoReportes').textContent=tipo==='pagos'?'Seleccione un día: se consultará su semana de lunes a domingo.':actual?'Estado actual; no admite filtro histórico.':'';
    }
    function ruta(pdf=false){
        const tipo=el('reporteTipo').value,q=[];
        if(['cierre','pagos'].includes(tipo)){if(el('reporteFecha').value)q.push('fecha='+encodeURIComponent(el('reporteFecha').value))}
        else if(['ventas','finanzas'].includes(tipo)){
            for(const [k,id]of [['desde','reporteDesde'],['hasta','reporteHasta']])if(el(id).value)q.push(k+'='+encodeURIComponent(el(id).value));
        }
        return `/reports/${encodeURIComponent(tipo)}${pdf?'/pdf':''}${q.length?'?'+q.join('&'):''}`;
    }
    async function cargar(){
        if(!admin())return;
        const identidad=usuarioActual(),numero=++consulta;
        const criterios=ruta();
        boton('cargar',true);el('estadoReportes').textContent='Consultando reporte…';
        try{
            const r=await MicroCarmitaAuth.api(criterios);if(usuarioActual()!==identidad||numero!==consulta)return;
            if(ruta()!==criterios){el('contenidoReportes').innerHTML='';el('estadoReportes').textContent='Los filtros cambiaron. Consulte de nuevo.';return;}
            const columnas = r.columnas.filter(c => c.clave !== 'id' || !['pendientes','inventario','finanzas','cierre'].includes(el('reporteTipo').value));
            const dato = (fila, columna) => columna.clave === 'nombre' && el('reporteTipo').value === 'pendientes'
                ? globalThis.MicroCarmitaVentas?.nombreCliente?.(fila.id) || fila[columna.clave] : fila[columna.clave];
            el('contenidoReportes').innerHTML=`<h2>${textoSeguro(r.titulo)}</h2><p>Generado UTC: ${textoSeguro(r.generadoEn)}</p>`
                +r.resumen.map(s=>`<p><strong>${textoSeguro(s.etiqueta)}: ${textoSeguro(valor(s.valor,s.formato))}</strong></p>`).join('')
                +r.notas.map(n=>`<p>${textoSeguro(n)}</p>`).join('')
                +`<div class="tabla-scroll"><table><thead><tr>${columnas.map(c=>`<th>${textoSeguro(c.titulo)}</th>`).join('')}</tr></thead><tbody>`
                +r.filas.map(f=>`<tr>${columnas.map(c=>`<td style="white-space:pre-wrap">${textoSeguro(valor(dato(f,c),c.formato))}</td>`).join('')}</tr>`).join('')+'</tbody></table></div>'
                +(r.filas.length?'':'<p>Sin registros para los criterios seleccionados.</p>');
            el('estadoReportes').textContent='';
        }catch(e){if(usuarioActual()!==identidad||numero!==consulta)return;el('contenidoReportes').innerHTML='';el('estadoReportes').textContent=ruta()!==criterios?'Los filtros cambiaron. Consulte de nuevo.':e.message;}
        finally{if(usuarioActual()===identidad&&numero===consulta)boton('cargar',false);}
    }
    async function descargar(){
        if(!admin()||descargando)return;descargando=true;const identidad=usuarioActual();const url=ruta(true),tipo=el('reporteTipo').value;
        boton('descargar',true);el('estadoReportes').textContent='Preparando PDF…';
        try{
            const blob=await MicroCarmitaAuth.archivo(url);if(usuarioActual()!==identidad)return;
            if(ruta(true)!==url){el('estadoReportes').textContent='Los filtros cambiaron. Vuelva a descargar el PDF.';return;}
            const enlace=document.createElement('a'),objeto=URL.createObjectURL(blob);enlace.href=objeto;enlace.download=`micro-carmita-${tipo}.pdf`;
            enlace.click();setTimeout(()=>URL.revokeObjectURL(objeto),1000);el('estadoReportes').textContent='PDF descargado. Puede abrirlo e imprimirlo desde su visor.';
        }catch(e){if(usuarioActual()===identidad)el('estadoReportes').textContent=e.message}finally{descargando=false;boton('descargar',false)}
    }
    globalThis.MicroCarmitaReportes={cargar,descargar,seleccionar};
    document.addEventListener('microcarmita:sesion',()=>{consulta++;el('contenidoReportes').innerHTML='';el('estadoReportes').textContent='';boton('cargar',false);boton('descargar',descargando);});
    seleccionar();
})();
