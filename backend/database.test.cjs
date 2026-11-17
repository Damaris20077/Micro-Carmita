const test = require('node:test');
const assert = require('node:assert/strict');
const { crearPool, comprobarConexion } = require('./database');

function entornoDePrueba() {
    return {
        DB_HOST: 'localhost', DB_PORT: '3307', DB_USER: 'usuario_simulado',
        DB_PASSWORD: '', DB_NAME: 'base_simulada'
    };
}

test('crearPool entrega configuración de entorno a mysql2 sin abrir conexiones', () => {
    const env = entornoDePrueba();
    const poolSimulado = {};
    const pool = crearPool(env, {
        createPool(config) {
            assert.deepEqual(config, {
                host: env.DB_HOST, port: 3307, user: env.DB_USER,
                password: env.DB_PASSWORD, database: env.DB_NAME,
                waitForConnections: true, connectionLimit: 5, connectTimeout: 5000
            });
            return poolSimulado;
        }
    });
    assert.equal(pool, poolSimulado);
});

test('crearPool utiliza puerto MySQL 3306 cuando DB_PORT está ausente', () => {
    const env = entornoDePrueba();
    delete env.DB_PORT;
    crearPool(env, { createPool(config) { assert.equal(config.port, 3306); } });
});

for (const nombre of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    test(`crearPool rechaza configuración sin ${nombre}`, () => {
        const env = entornoDePrueba();
        delete env[nombre];
        assert.throws(() => crearPool(env, {
            createPool() { assert.fail('La configuración incompleta llegó al cliente MySQL'); }
        }), { message: `Falta configurar ${nombre}.` });
    });
}

test('crearPool rechaza puertos vacíos, no numéricos, fraccionarios o fuera de rango', () => {
    for (const port of ['', 'abc', '3306.5', '0', '-1', '65536']) {
        assert.throws(() => crearPool({ ...entornoDePrueba(), DB_PORT: port }, {
            createPool() { assert.fail('El puerto inválido llegó al cliente MySQL'); }
        }), /DB_PORT debe ser/);
    }
});

test('comprobarConexion ejecuta únicamente SELECT 1 y devuelve éxito', async () => {
    const consultas = [];
    const resultado = await comprobarConexion({
        async query(sql) { consultas.push(sql); return [[{ '1': 1 }], []]; }
    });
    assert.equal(resultado, true);
    assert.deepEqual(consultas, ['SELECT 1']);
});

test('comprobarConexion devuelve fallo sin propagar detalles del servidor', async () => {
    let consultas = 0;
    const resultado = await comprobarConexion({
        async query(sql) {
            assert.equal(sql, 'SELECT 1');
            consultas += 1;
            throw new Error('Detalle interno del servidor simulado');
        }
    });
    assert.equal(resultado, false);
    assert.equal(consultas, 1);
});
