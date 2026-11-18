const test = require('node:test');
const assert = require('node:assert/strict');
const { calendario, instante } = require('../date-formatter');

test('fecha de calendario conserva día de ingreso/caducidad sin desplazar a la víspera', () => {
    assert.match(calendario('2026-11-17'), /^17.*nov.*2026/);
    assert.match(calendario('2026-01-01'), /^1.*ene.*2026/);
    assert.match(calendario('2028-02-29'), /^29.*feb.*2028/);
    assert.equal(calendario('2026-02-30'), '2026-02-30');
    assert.equal(calendario(null), 'Sin fecha');
});

test('instantes UTC cruzan medianoche de Ecuador; DATETIME sin sufijo se interpreta UTC', () => {
    assert.match(instante('2026-11-18T04:59:00Z'), /^17.*nov.*2026.*23:59/);
    assert.match(instante('2026-11-18T05:00:00Z'), /^18.*nov.*2026.*0:00/);
    assert.equal(instante('2026-11-18 04:59:00.000000'), instante('2026-11-18T04:59:00Z'));
    assert.equal(instante('2026-11-17T23:59:00-05:00'), instante('2026-11-18T04:59:00Z'));
    assert.equal(instante('2026-11-17'), calendario('2026-11-17'));
    assert.equal(instante('fecha inválida'), 'fecha inválida');
});
