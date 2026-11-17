const test = require('node:test');
const assert = require('node:assert/strict');
const { cerrarVerificacion } = require('./verification-cleanup');

function preparar(fallo) {
    const pasos = [];
    const recursos = {
        server: { close(callback) { pasos.push('server'); callback(fallo === 'server' ? new Error('Detalle privado') : undefined); } },
        connection: {
            async rollback() { pasos.push('rollback'); if (fallo === 'rollback') throw new Error('Detalle privado'); },
            release() { pasos.push('release'); },
            destroy() { pasos.push('destroy'); }
        },
        pool: { async end() { pasos.push('pool'); if (fallo === 'pool') throw new Error('Detalle privado'); } }
    };
    return { recursos, pasos };
}

test('limpieza confirma rollback antes de devolver la conexión', async () => {
    const f = preparar();
    assert.deepEqual(await cerrarVerificacion(f.recursos), { rollback: true, errores: [] });
    assert.deepEqual(f.pasos, ['server', 'rollback', 'release', 'pool']);
});

test('fallo de cierre del servidor no impide rollback ni cierre del pool', async () => {
    const f = preparar('server');
    assert.deepEqual(await cerrarVerificacion(f.recursos), { rollback: true, errores: ['cierre_servidor'] });
    assert.deepEqual(f.pasos, ['server', 'rollback', 'release', 'pool']);
});

test('rollback fallido destruye la conexión y nunca la devuelve al pool', async () => {
    const f = preparar('rollback');
    assert.deepEqual(await cerrarVerificacion(f.recursos), { rollback: false, errores: ['rollback'] });
    assert.deepEqual(f.pasos, ['server', 'rollback', 'destroy', 'pool']);
});

test('fallo de cierre del pool produce solo un diagnóstico controlado', async () => {
    const f = preparar('pool');
    const resultado = await cerrarVerificacion(f.recursos);
    assert.deepEqual(resultado, { rollback: true, errores: ['cierre_pool'] });
    assert.equal(JSON.stringify(resultado).includes('Detalle privado'), false);
});

test('limpieza antes de abrir recursos no requiere conexión ni escrituras', async () => {
    assert.deepEqual(await cerrarVerificacion({}), { rollback: false, errores: [] });
});
