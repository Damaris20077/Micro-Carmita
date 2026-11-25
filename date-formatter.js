/* hoy devuelve YYYY-MM-DD técnico; calendario e instante son solo presentación. */
((root) => {
    'use strict';
    const zona = 'America/Guayaquil';
    const hoy = (ahora = new Date()) => {
        const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(ahora).map(p => [p.type, p.value]));
        return `${partes.year}-${partes.month}-${partes.day}`;
    };
    const calendario = valor => {
        if (!valor) return 'Sin fecha';
        const s = String(valor);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s + 'T12:00:00Z');
        if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) return s;
        return new Intl.DateTimeFormat('es-EC', { timeZone: zona, dateStyle: 'medium' }).format(d);
    };
    const instante = valor => {
        if (!valor) return 'Sin fecha';
        const s = String(valor);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return calendario(s);
        // DATETIME del proyecto se almacena en UTC; sin sufijo no es hora local.
        const iso = /(?:Z|[+-]\d\d:\d\d)$/i.test(s) ? s : s.replace(' ', 'T') + 'Z';
        const d = new Date(iso);
        return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('es-EC', { timeZone: zona, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(d) : s;
    };
    const api = { hoy, calendario, instante };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MicroCarmitaFechas = api;
})(globalThis);
