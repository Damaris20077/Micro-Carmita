require('dotenv').config({ quiet: true });
const { crearPool, comprobarConexion } = require('./database');

async function main() {
    const pool = crearPool();
    try {
        if (!await comprobarConexion(pool)) {
            throw new Error('Conexión no disponible.');
        }
    } finally {
        await pool.end();
    }
    console.log('Conexión MySQL verificada mediante SELECT 1.');
}

main().catch(() => {
    console.error('No se pudo comprobar MySQL. Revise la configuración local y la disponibilidad del servidor.');
    process.exitCode = 1;
});
