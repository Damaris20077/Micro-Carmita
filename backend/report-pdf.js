const PDFDocument=require('pdfkit');
// Helvetica estándar conserva español/Latin-1. Otros alfabetos se señalan con ?,
// sin permitir controles ni interpretar texto del usuario como instrucciones PDF.
function texto(v){return String(v??'').normalize('NFC').replace(/[–—]/g,'-').replace(/[\t\r]/g,' ').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');}
function valor(v,formato){return formato==='dinero'?'$'+Number(v).toFixed(2):texto(v);}
async function generarPDF(reporte){return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:40,autoFirstPage:false,bufferPages:true,compress:true,
        info:{Title:texto(reporte.titulo),Author:'Micro Carmita',CreationDate:new Date(reporte.generadoEn)}});
    const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    try{
        const ancho=515,limite=785;let y;
        function pagina(){
            doc.addPage();doc.fillColor('#15324d').font('Helvetica-Bold').fontSize(17).text('Micro Carmita',40,32);
            doc.fontSize(13).text(texto(reporte.titulo),40,56,{width:ancho});
            const periodo=Object.keys(reporte.filtros).length?`${reporte.filtros.desde||'Inicio'} a ${reporte.filtros.hasta||'Actualidad'}`:`Estado actual al ${reporte.fechaConsulta}`;
            doc.fillColor('#333333').font('Helvetica').fontSize(8).text(texto(periodo),40,79,{width:ancho});
            doc.text(texto(`Generado UTC: ${reporte.generadoEn}`),40,92,{width:ancho});y=117;
        }
        function lineas(t){
            doc.font('Helvetica').fontSize(9);
            const salida=[];
            for(const parrafo of texto(t).split('\n')){
                let actual='';
                for(const caracter of parrafo){if(doc.widthOfString(actual+caracter)>ancho){salida.push(actual);actual=''}actual+=caracter;}
                salida.push(actual);
            }
            return salida;
        }
        function escribir(t,negrita=false){
            for(const linea of lineas(t)){
                if(y+13>limite)pagina();
                doc.font(negrita?'Helvetica-Bold':'Helvetica').fontSize(9).fillColor('#202020').text(linea,40,y,{width:ancho+5,lineBreak:false});y+=13;
            }
        }
        pagina();
        for(const s of reporte.resumen)escribir(`${s.etiqueta}: ${valor(s.valor,s.formato)}`,true);
        y+=8;for(const n of reporte.notas)escribir(n);y+=10;
        if(!reporte.filas.length)escribir('Sin registros para los criterios seleccionados.');
        reporte.filas.forEach((fila,i)=>{
            if(y+52>limite)pagina();
            escribir(`Registro ${i+1}`,true);
            for(const c of reporte.columnas)escribir(`${c.titulo}: ${valor(fila[c.clave],c.formato)}`);
            y+=9;
        });
        const paginas=doc.bufferedPageRange();
        for(let i=0;i<paginas.count;i++){
            doc.switchToPage(i);doc.font('Helvetica').fontSize(8).fillColor('#555555').text(`Micro Carmita | ${i+1} / ${paginas.count}`,40,807,{width:ancho,align:'right',lineBreak:false});
        }
        doc.end();
    }catch(e){doc.destroy(e);reject(e)}
});}
module.exports={generarPDF};
