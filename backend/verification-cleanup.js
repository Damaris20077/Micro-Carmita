// El cierre continúa aunque falle un recurso. Una conexión sin rollback confirmado
// se destruye para impedir que vuelva al pool con escrituras pendientes.
async function cerrarVerificacion({ server, connection, pool }) {
    const resultado = { rollback: false, errores: [] };
    if (server) {
        try {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        } catch { resultado.errores.push('cierre_servidor'); }
    }
    if (connection) {
        try {
            await connection.rollback();
            resultado.rollback = true;
        } catch { resultado.errores.push('rollback'); }
        try {
            if (resultado.rollback) connection.release();
            else connection.destroy();
        } catch { resultado.errores.push('cierre_conexion'); }
    }
    if (pool) {
        try { await pool.end(); }
        catch { resultado.errores.push('cierre_pool'); }
    }
    return resultado;
}
module.exports = { cerrarVerificacion };
