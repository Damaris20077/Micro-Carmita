const mysql = require('mysql2/promise');

function crearPool(env = process.env, cliente = mysql) {
    for (const nombre of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
        if (typeof env[nombre] !== 'string' || !env[nombre].trim()) {
            throw new Error(`Falta configurar ${nombre}.`);
        }
    }
    // Una contraseña vacía debe configurarse explícitamente para entornos que la permitan.
    if (typeof env.DB_PASSWORD !== 'string') {
        throw new Error('Falta configurar DB_PASSWORD.');
    }
    const port = Number(env.DB_PORT ?? 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('DB_PORT debe ser un número entero entre 1 y 65535.');
    }
    return cliente.createPool({
        host: env.DB_HOST,
        port,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        // Los DATETIME del negocio se escriben con UTC_TIMESTAMP; no reinterpretarlos
        // como hora local del host al serializar las respuestas JSON.
        timezone: 'Z',
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 5000
    });
}

async function comprobarConexion(pool) {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch {
        return false;
    }
}

module.exports = { crearPool, comprobarConexion };
