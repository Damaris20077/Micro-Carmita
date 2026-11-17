const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { aprovisionar } = require('./bootstrap');

function preparar({ punto, codigo, existentes = false, cierreFalla = false } = {}) {
    const secreto = randomBytes(24).toString('hex');
    const env = { BOOTSTRAP_NAME: 'Prueba aislada', BOOTSTRAP_USER: 'prueba.aislada', BOOTSTRAP_PASSWORD: secreto };
    const llamadas = [];
    function paso(nombre) {
        llamadas.push(nombre);
        if (nombre === punto) throw Object.assign(new Error(secreto), {
            code: codigo, sql: secreto, sqlMessage: secreto, stack: secreto
        });
    }
    const conexion = {
        async beginTransaction() { paso('begin'); },
        async commit() { paso('commit'); },
        async rollback() { paso('rollback'); },
        release() { paso('release'); },
        async execute(sql, params) {
            if (sql.startsWith('SELECT codigo')) { paso('lock'); return [[], []]; }
            if (sql.startsWith('SELECT id')) { paso('list'); return [existentes ? [{ id: 1 }] : [], []]; }
            if (sql.startsWith('INSERT INTO usuarios')) {
                paso('insert');
                assert.equal(params[3], opciones.args.includes('--superuser') ? 'superusuario' : 'administrador');
                assert.equal(params[4], true);
                assert.notEqual(params[2], env.BOOTSTRAP_PASSWORD);
                return [{ insertId: 1 }, []];
            }
            if (sql.includes('INSERT INTO auditoria_usuarios')) {
                paso('audit');
                assert.equal(params[0], null);
                assert.equal(JSON.stringify(params).includes(secreto), false);
                assert.equal(JSON.stringify(params).includes('password_hash'), false);
                return [{ insertId: 1 }, []];
            }
            assert.fail('Consulta inesperada en el repositorio simulado');
        }
    };
    const pool = {
        async getConnection() { paso('connect'); return conexion; },
        async end() {
            paso('end');
            if (cierreFalla) throw new Error(secreto);
        }
    };
    const opciones = {
        env, args: [],
        crearPool() { paso('config'); return pool; },
        async hashPassword() { paso('hash'); return randomBytes(32).toString('hex'); }
    };
    return { opciones, llamadas, secreto };
}

test('bootstrap aislado conserva transacción, auditoría y cierre del pool', async () => {
    const f = preparar();
    await aprovisionar(f.opciones);
    assert.deepEqual(f.llamadas, ['config', 'hash', 'connect', 'begin', 'lock', 'list', 'insert', 'audit', 'commit', 'release', 'end']);
});

for (const caso of [
    { punto: 'config', etapa: 'configuracion', tipo: 'CONFIGURACION_INVALIDA' },
    { punto: 'hash', etapa: 'hash_password', tipo: 'FALLO_INTERNO' },
    { punto: 'connect', codigo: 'ECONNREFUSED', etapa: 'conexion', tipo: 'ECONNREFUSED' },
    { punto: 'connect', codigo: 'ER_ACCESS_DENIED_ERROR', etapa: 'conexion', tipo: 'ER_ACCESS_DENIED_ERROR' },
    { punto: 'lock', codigo: 'ER_TABLEACCESS_DENIED_ERROR', etapa: 'comprobacion_usuarios', tipo: 'ER_TABLEACCESS_DENIED_ERROR' },
    { punto: 'list', codigo: 'ER_NO_SUCH_TABLE', etapa: 'comprobacion_usuarios', tipo: 'ER_NO_SUCH_TABLE' },
    { punto: 'insert', codigo: 'ER_DUP_ENTRY', etapa: 'creacion_usuario', tipo: 'ER_DUP_ENTRY' },
    { punto: 'insert', codigo: 'ER_NO_REFERENCED_ROW_2', etapa: 'creacion_usuario', tipo: 'ER_NO_REFERENCED_ROW_2' },
    { punto: 'insert', codigo: 'ER_CHECK_CONSTRAINT_VIOLATED', etapa: 'creacion_usuario', tipo: 'ER_CHECK_CONSTRAINT_VIOLATED' },
    { punto: 'audit', codigo: 'ER_TABLEACCESS_DENIED_ERROR', etapa: 'auditoria', tipo: 'ER_TABLEACCESS_DENIED_ERROR' },
    { punto: 'audit', codigo: 'codigo_no_permitido', etapa: 'auditoria', tipo: 'FALLO_INTERNO' },
    { punto: 'commit', codigo: 'ER_LOCK_DEADLOCK', etapa: 'confirmacion_transaccion', tipo: 'ER_LOCK_DEADLOCK' },
    { punto: 'end', etapa: 'cierre_pool', tipo: 'FALLO_INTERNO' }
]) {
    test(`bootstrap identifica ${caso.punto}/${caso.tipo} sin filtrar detalles`, async () => {
        const f = preparar(caso);
        await assert.rejects(aprovisionar(f.opciones), error => {
            assert.equal(error.etapa, caso.etapa);
            assert.equal(error.tipo, caso.tipo);
            assert.equal(error.message.includes(f.secreto), false);
            assert.equal(error.message.includes('codigo_no_permitido'), false);
            assert.equal(error.sql, undefined);
            assert.equal(error.cause, undefined);
            return true;
        });
        if (['lock', 'list', 'insert', 'audit', 'commit'].includes(caso.punto)) {
            assert.ok(f.llamadas.includes('rollback'));
            assert.ok(f.llamadas.includes('release'));
        }
        if (caso.punto === 'audit') assert.equal(f.llamadas.includes('commit'), false);
        if (caso.punto !== 'config') assert.ok(f.llamadas.includes('end'));
    });
}

test('validación incompleta o contraseña corta falla antes de abrir pool', async () => {
    for (const env of [{}, { BOOTSTRAP_NAME: 'Prueba', BOOTSTRAP_USER: 'prueba', BOOTSTRAP_PASSWORD: '' }]) {
        const f = preparar();
        await assert.rejects(aprovisionar({ ...f.opciones, env }), { etapa: 'validacion', tipo: 'ENTRADA_INVALIDA' });
        assert.deepEqual(f.llamadas, []);
    }
});

test('Superusuario sigue bloqueado en producción antes de abrir pool', async () => {
    const f = preparar();
    f.opciones.env.NODE_ENV = 'production';
    f.opciones.env.ALLOW_DEV_SUPERUSER = 'true';
    await assert.rejects(aprovisionar({ ...f.opciones, args: ['--superuser'] }), { etapa: 'validacion', tipo: 'BOOTSTRAP_DISABLED' });
    assert.deepEqual(f.llamadas, []);
});

test('usuarios existentes bloquean el aprovisionamiento sin insertar', async () => {
    const f = preparar({ existentes: true });
    await assert.rejects(aprovisionar(f.opciones), { etapa: 'comprobacion_usuarios', tipo: 'BOOTSTRAP_EXISTS' });
    assert.equal(f.llamadas.includes('insert'), false);
    assert.ok(f.llamadas.includes('rollback'));
});

test('fallo al cerrar pool conserva el diagnóstico original de auditoría', async () => {
    const f = preparar({ punto: 'audit', codigo: 'ER_NO_SUCH_TABLE', cierreFalla: true });
    await assert.rejects(aprovisionar(f.opciones), { etapa: 'auditoria', tipo: 'ER_NO_SUCH_TABLE' });
    assert.ok(f.llamadas.includes('rollback'));
    assert.ok(f.llamadas.includes('end'));
});

for (const longitud of [7, 8, 128, 129]) {
    test(`bootstrap aplica política de ${longitud} caracteres`, async () => {
        const f = preparar();
        f.opciones.env.BOOTSTRAP_PASSWORD = randomBytes(65).toString('hex').slice(0, longitud);
        if (longitud < 8 || longitud > 128) {
            await assert.rejects(aprovisionar(f.opciones), { etapa: 'validacion', tipo: 'ENTRADA_INVALIDA' });
            assert.deepEqual(f.llamadas, []);
        } else {
            await aprovisionar(f.opciones);
            assert.ok(f.llamadas.includes('commit'));
        }
    });
}

test('bootstrap rechaza claves predecibles con diagnóstico seguro', async () => {
    const f = preparar();
    f.opciones.env.BOOTSTRAP_PASSWORD = 'Password123!';
    await assert.rejects(aprovisionar(f.opciones), { etapa: 'validacion', tipo: 'ENTRADA_INVALIDA' });
    assert.deepEqual(f.llamadas, []);
});

for (const longitud of [8, 14, 15, 128, 129]) {
    test(`bootstrap Superusuario valida ${longitud} caracteres en desarrollo`, async () => {
        const f = preparar();
        Object.assign(f.opciones.env, { NODE_ENV: 'development', ALLOW_DEV_SUPERUSER: 'true',
            BOOTSTRAP_PASSWORD: randomBytes(65).toString('hex').slice(0, longitud) });
        f.opciones.args = ['--superuser'];
        if (longitud < 15 || longitud > 128) {
            await assert.rejects(aprovisionar(f.opciones), error => {
                assert.equal(error.tipo, 'ENTRADA_INVALIDA');
                assert.match(error.message, /15 y 128/);
                return true;
            });
            assert.deepEqual(f.llamadas, []);
        } else {
            await aprovisionar(f.opciones);
            assert.ok(f.llamadas.includes('commit'));
        }
    });
}
