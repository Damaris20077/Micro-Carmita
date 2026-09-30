const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./modelo.js');
const admin = 'admin-demo', operador = 'operador-demo', fecha = '2026-09-29';
function preparar() { const s = M.vacio(); const p = M.producto(s, { nombre: 'Leche', categoria: 'Lácteos', precio: 1.25 }, admin); return { s, p }; }
const vender = (s, p, extra = {}) => M.venta(s, { productoId: p.id, cliente: 'Cliente prueba', cantidad: 1, precio: 1.25, tipo: 'contado', ...extra }, operador, fecha);
test('FEFO usa antes el lote que caduca primero y excluye los caducados', () => {
    const { s, p } = preparar();
    M.entrada(s, { productoId: p.id, codigo: 'TARDIO', cantidad: 5, caducidad: '2026-10-15' }, admin, fecha);
    M.entrada(s, { productoId: p.id, codigo: 'PRONTO', cantidad: 2, caducidad: '2026-10-02' }, admin, fecha);
    M.entrada(s, { productoId: p.id, codigo: 'VENCIDO', cantidad: 8, caducidad: '2026-09-28' }, admin, fecha);
    const v = vender(s, p, { cantidad: 4 });
    assert.deepEqual(v.asignaciones.map(a => [a.codigo, a.cantidad]), [['PRONTO', 2], ['TARDIO', 2]]);
    assert.equal(s.lotes.find(l => l.codigo === 'VENCIDO').cantidad, 8);
    assert.equal(M.stock(s, p.id), 11);
});
test('stock negativo y conciliación con una entrada posterior', () => {
    const { s, p } = preparar(); vender(s, p, { cantidad: 3 });
    assert.equal(M.stock(s, p.id), -3);
    M.entrada(s, { productoId: p.id, codigo: 'NUEVO', cantidad: 5, caducidad: '' }, admin, fecha);
    assert.equal(M.stock(s, p.id), 2); assert.equal(p.faltante, 0); assert.equal(s.lotes[0].cantidad, 2);
});
test('bloquea la venta cuando solo hay existencias caducadas', () => {
    const { s, p } = preparar(); M.entrada(s, { productoId: p.id, codigo: 'CAD', cantidad: 2, caducidad: '2026-09-01' }, admin, fecha);
    const antes = JSON.stringify(s); assert.throws(() => vender(s, p), /caducadas/); assert.equal(JSON.stringify(s), antes);
});
test('alerta inclusiva de siete días y caducidad al finalizar la fecha indicada', () => {
    assert.equal(M.estadoLote({ caducidad: '2026-10-06' }, fecha), 'Por caducar');
    assert.equal(M.estadoLote({ caducidad: '2026-10-07' }, fecha), 'Vigente');
    assert.equal(M.estadoLote({ caducidad: fecha }, fecha), 'Por caducar');
    assert.equal(M.estadoLote({ caducidad: '2026-09-28' }, fecha), 'Caducado');
});
test('crédito y abonos parciales sin duplicar ingresos ni aceptar sobrepagos', () => {
    const { s, p } = preparar(); const v = vender(s, p, { cantidad: 4, tipo: 'fiado' });
    assert.equal(s.movimientos.length, 0); M.abono(s, v.id, 2, operador, fecha);
    assert.equal(s.cuentas[0].saldo, 3); assert.equal(s.movimientos[0].valor, 2);
    const antes = JSON.stringify(s); assert.throws(() => M.abono(s, v.id, 4, operador, fecha), /saldo/); assert.equal(JSON.stringify(s), antes);
    M.abono(s, v.id, 3, operador, fecha); assert.equal(s.cuentas[0].saldo, 0); assert.equal(s.pagos.length, 2);
    assert.equal(s.movimientos.reduce((n, m) => n + m.valor, 0), 5);
});
test('contado registra un ingreso automático y redondea el total', () => {
    const { s, p } = preparar(); const v = vender(s, p, { cantidad: 3, precio: 0.1 });
    assert.equal(v.total, 0.3); assert.equal(s.movimientos[0].valor, 0.3); assert.equal(s.cuentas.length, 0);
});
test('rechaza cantidades fraccionarias, precios inválidos y crédito sin cliente', () => {
    const { s, p } = preparar();
    for (const extra of [{ cantidad: 1.5 }, { cantidad: NaN }, { precio: Infinity }, { precio: 0 }, { precio: 1.234 }, { tipo: 'fiado', cliente: '' }]) assert.throws(() => vender(s, p, extra));
    assert.equal(s.ventas.length, 0);
});
test('operador no registra productos, entradas ni movimientos administrativos', () => {
    const { s, p } = preparar();
    assert.throws(() => M.producto(s, { nombre: 'Pan', categoria: 'Panadería', precio: 1 }, operador), /administración/);
    assert.throws(() => M.entrada(s, { productoId: p.id, codigo: 'A', cantidad: 1, caducidad: '' }, operador), /administración/);
    assert.throws(() => M.movimiento(s, { tipo: 'egreso', descripcion: 'Agua', valor: 10 }, operador), /permiso/);
    s.usuarios[1].activo = false; assert.throws(() => vender(s, p), /permiso/);
});
test('salida por caducidad deja un movimiento y no permite exceder existencias', () => {
    const { s, p } = preparar(); const l = M.entrada(s, { productoId: p.id, codigo: 'CAD', cantidad: 4, caducidad: '2026-09-01' }, admin, fecha);
    M.salida(s, l.id, 3, 'Caducidad', admin, fecha); assert.equal(l.cantidad, 1); assert.equal(M.stock(s, p.id), 1);
    assert.throws(() => M.salida(s, l.id, 2, 'Caducidad', admin, fecha));
});
test('entrada caducada no concilia ventas pendientes y rechaza fecha inexistente', () => {
    const { s, p } = preparar(); vender(s, p, { cantidad: 2 });
    M.entrada(s, { productoId: p.id, codigo: 'CAD', cantidad: 3, caducidad: '2026-09-01' }, admin, fecha);
    assert.equal(p.faltante, 2);
    assert.throws(() => M.entrada(s, { productoId: p.id, codigo: 'MAL', cantidad: 1, caducidad: '2026-02-30' }, admin, fecha), /Fecha/);
});
