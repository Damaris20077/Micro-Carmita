require('dotenv').config({ quiet: true });
const { crearApp } = require('./app');
const { crearPool } = require('./database');
const { crearRepositorio } = require('./auth-repository');
const { crearInventarioRepositorio } = require('./inventory-repository');
const { crearPedidosRepositorio } = require('./order-repository');
const { crearVentasRepositorio } = require('./sales-repository');

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT debe ser un número entero entre 0 y 65535.');
}

const entorno = process.env.NODE_ENV ?? 'development';
if (!['development', 'test', 'production'].includes(entorno)) throw new Error('NODE_ENV inválido.');
const production = entorno === 'production';
const origin = process.env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
const url = new URL(origin);
if (url.origin !== origin || (production && url.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN debe ser un origen válido y usar HTTPS en producción.');
}
const pool = crearPool();
const app = crearApp({ repository: crearRepositorio(pool), inventoryRepository: crearInventarioRepositorio(pool), orderRepository: crearPedidosRepositorio(pool), salesRepository: crearVentasRepositorio(pool), production, origin,
    allowSuperuser: !production && process.env.ALLOW_DEV_SUPERUSER === 'true' });
const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Micro Carmita API disponible en http://127.0.0.1:${server.address().port}`);
});

server.on('error', error => {
    console.error(`No se pudo iniciar Micro Carmita API: ${error.message}`);
    process.exitCode = 1;
    pool.end();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.close(async () => {
            await pool.end();
        });
    });
}
