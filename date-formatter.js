/* Solo presentación: nunca usar estas cadenas en filtros, inputs o cálculos. */
((root) => {
    'use strict';
    const zona = 'America/Guayaquil';
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
    const api = { calendario, instante };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MicroCarmitaFechas = api;
})(globalThis);
