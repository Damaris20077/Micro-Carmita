const { fallo } = require('./auth-service');

// null significa generar en el backend, una vez dentro de la transacción.
function normalizarCodigo(valor) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor !== 'string' || valor.trim().length > 60) throw fallo(400, 'Código de lote inválido (hasta 60 caracteres).');
    return valor.trim() || null;
}
module.exports = { normalizarCodigo };
