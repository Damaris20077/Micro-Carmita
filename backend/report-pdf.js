const PDFDocument = require('pdfkit');
// Fuentes estándar: español/Latin-1; no se interpreta contenido del usuario.
function texto(v) { return String(v ?? '').normalize('NFC').replace(/[–—]/g, '-').replace(/[\t\r]/g, ' ').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?'); }
function fecha(v, larga = false) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T12:00:00Z' : v);
    if (!Number.isFinite(d.getTime())) return texto(v);
    return new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: larga ? 'long' : '2-digit', year: 'numeric' }).format(d);
}
function valor(v, formato) {
    if (formato === 'dinero') return '$' + Number(v).toFixed(2);
    return texto(v).replace(/\b\d{4}-\d{2}-\d{2}\b/g, d => fecha(d));
}
async function generarPDF(reporte) {
    return new Promise((resolve, reject) => {
        const horizontal = reporte.columnas.length >= 7;
        const doc = new PDFDocument({ size: 'A4', layout: horizontal ? 'landscape' : 'portrait', margins: { top: 32, left: 32, right: 32, bottom: 20 },
            autoFirstPage: false, bufferPages: true, compress: true,
            info: { Title: texto(reporte.titulo), Author: 'Micro Carmita', CreationDate: new Date(reporte.generadoEn) } });
        const chunks = [];
        doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
        try {
            const ancho = (horizontal ? 841.89 : 595.28) - 64;
            const limite = (horizontal ? 595.28 : 841.89) - 48;
            const azul = '#1769aa', tinta = '#243746', gris = '#475569';
            let y, tablaActiva = false;
            // Se mide y dibuja con la misma fuente: cada línea queda dentro de su celda.
            function lineas(v, width, bold = false, size = 9) {
                doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
                const salida = [];
                for (const parrafo of texto(v).split('\n')) {
                    let actual = '';
                    for (const palabra of parrafo.split(/( +)/)) {
                        if (doc.widthOfString(actual + palabra) <= width) { actual += palabra; continue; }
                        if (actual.trim()) { salida.push(actual.trimEnd()); actual = ''; }
                        for (const caracter of palabra.trimStart()) {
                            if (actual && doc.widthOfString(actual + caracter) > width) { salida.push(actual); actual = ''; }
                            actual += caracter;
                        }
                    }
                    salida.push(actual.trimEnd());
                }
                return salida;
            }
            function dibujarLinea(v, x, top, width, { bold = false, size = 9, color = tinta, align = 'left' } = {}) {
                doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
                    .text(v, x, top, { width, align, lineBreak: false });
            }
            const pesos = { id: .65, ventaId: .65, fecha: 1.1, cliente: 1.5, nombre: 1.6, tipo: .9, estado: 1.3,
                estadoVenta: 1.3, productos: 2.6, detalle: 2.8, lotes: 3.2, motivo: 2.5, responsable: 1.5,
                categoria: 1.3, total: 1.2, computado: 1.1, importe: 1.1, deuda: 1.1, abonos: 1.1, saldo: 1.1, stock: .75, alerta: 1.3 };
            const peso = c => c.clave === 'id' && ['Movimiento', 'Producto'].includes(c.titulo) ? 1.2 : (pesos[c.clave] || 1);
            const total = reporte.columnas.reduce((s, c) => s + peso(c), 0);
            let x = 32;
            const columnas = reporte.columnas.map(c => {
                const width = ancho * peso(c) / total;
                const r = { ...c, x, width, derecha: c.formato === 'dinero' || c.formato === 'numero' || ['id', 'ventaId'].includes(c.clave) };
                x += width; return r;
            });
            function cabeceraTabla() {
                const labels = columnas.map(c => lineas(c.titulo, c.width - 12, true, 8));
                const alto = Math.max(1, ...labels.map(l => l.length)) * 10 + 14;
                doc.rect(32, y, ancho, alto).fill(azul);
                columnas.forEach((c, i) => labels[i].forEach((l, n) => dibujarLinea(l, c.x + 6, y + 7 + n * 10, c.width - 12,
                    { bold: true, size: 8, color: '#ffffff', align: c.derecha ? 'right' : 'left' })));
                y += alto;
            }
            function pagina() {
                doc.addPage();
                doc.rect(32, 27, 5, 18).fill(azul);
                dibujarLinea('Micro Carmita', 46, 25, ancho - 14, { bold: true, size: 18, color: azul });
                y = 51;
                for (const l of lineas(reporte.titulo, ancho, true, 13)) { dibujarLinea(l, 32, y, ancho, { bold: true, size: 13 }); y += 16; }
                const f = reporte.filtros;
                const periodo = f.desde || f.hasta
                    ? (f.desde === f.hasta ? 'Fecha: ' + fecha(f.desde, true) : 'Período: ' + (f.desde ? fecha(f.desde, true) : 'Inicio') + ' al ' + (f.hasta ? fecha(f.hasta, true) : 'Actualidad'))
                    : ['ventas', 'finanzas'].includes(reporte.tipo)
                        ? 'Período: todas las fechas (consulta al ' + fecha(reporte.fechaConsulta, true) + ')'
                        : 'Estado al ' + fecha(reporte.fechaConsulta, true);
                dibujarLinea(periodo, 32, y + 3, ancho, { size: 9, color: gris });
                const hora = new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(reporte.generadoEn));
                dibujarLinea('Generado: ' + fecha(reporte.generadoEn, true) + ', ' + hora + ' (America/Guayaquil)', 32, y + 17, ancho, { size: 8, color: gris });
                y += 42;
                if (tablaActiva) cabeceraTabla();
            }
            function parrafo(v, bold = false) {
                for (const l of lineas(v, ancho, bold, 8.5)) {
                    if (y + 12 > limite) pagina();
                    dibujarLinea(l, 32, y, ancho, { bold, size: 8.5, color: gris }); y += 12;
                }
            }
            pagina();
            // Resumen en dos columnas; se conserva el valor calculado por el servicio.
            for (let i = 0; i < reporte.resumen.length; i += 2) {
                const grupo = reporte.resumen.slice(i, i + 2).map(s => lineas(s.etiqueta + ': ' + valor(s.valor, s.formato), ancho / 2 - 18, true, 9));
                const alto = Math.max(...grupo.map(l => l.length)) * 12 + 12;
                if (y + alto > limite) pagina();
                doc.rect(32, y, ancho, alto).fill('#edf4fa');
                grupo.forEach((ls, j) => ls.forEach((l, n) => dibujarLinea(l, 40 + j * ancho / 2, y + 6 + n * 12, ancho / 2 - 18, { bold: true })));
                y += alto;
            }
            y += 10;
            for (const nota of reporte.notas) { parrafo(nota); y += 5; }
            y += 5;
            if (!reporte.filas.length) parrafo('Sin registros para los criterios seleccionados.');
            else {
                // Reservar cabecera y al menos una línea para evitar una página de solo encabezado.
                if (y + 80 > limite) pagina();
                tablaActiva = true; cabeceraTabla();
                reporte.filas.forEach((fila, indice) => {
                    const celdas = columnas.map(c => lineas(valor(fila[c.clave], c.formato), c.width - 12));
                    const cantidad = Math.max(1, ...celdas.map(l => l.length));
                    const altoCompleto = cantidad * 12 + 12;
                    if (y + altoCompleto > limite && altoCompleto <= limite - 165) pagina();
                    let offset = 0;
                    while (offset < cantidad) {
                        let caben = Math.floor((limite - y - 12) / 12);
                        if (caben < 1) { pagina(); caben = Math.floor((limite - y - 12) / 12); }
                        const n = Math.min(caben, cantidad - offset), alto = n * 12 + 12;
                        doc.rect(32, y, ancho, alto).fill(indice % 2 ? '#f0f5fa' : '#ffffff');
                        columnas.forEach((c, i) => {
                            const ls = celdas[i].slice(offset, offset + n);
                            // Identificador repetido al continuar una fila en otra página.
                            if (offset && i === 0 && !ls.length) ls.push(celdas[i][0] || '');
                            ls.forEach((l, j) => dibujarLinea(l, c.x + 6, y + 6 + j * 12, c.width - 12,
                                { align: c.derecha ? 'right' : 'left' }));
                        });
                        doc.moveTo(32, y + alto).lineTo(32 + ancho, y + alto).lineWidth(.4).strokeColor('#cfdae5').stroke();
                        y += alto; offset += n;
                        if (offset < cantidad) pagina();
                    }
                });
            }
            const paginas = doc.bufferedPageRange();
            for (let i = 0; i < paginas.count; i++) {
                doc.switchToPage(i);
                dibujarLinea('Micro Carmita', 32, doc.page.height - 32, ancho / 2, { size: 8, color: gris });
                dibujarLinea('Página ' + (i + 1) + ' / ' + paginas.count, 32 + ancho / 2, doc.page.height - 32, ancho / 2, { size: 8, color: gris, align: 'right' });
            }
            doc.end();
        } catch (e) { doc.destroy(e); reject(e); }
    });
}
module.exports = { generarPDF };
