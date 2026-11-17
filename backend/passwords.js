const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const derivar = promisify(scrypt);
const opciones = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let operaciones = 0;

async function calcular(clave, sal) {
    if (operaciones >= 2) {
        const error = new Error('Intente nuevamente en unos segundos.');
        error.status = 429;
        throw error;
    }
    operaciones += 1;
    try {
        return await derivar(clave, sal, 64, opciones);
    } finally {
        operaciones -= 1;
    }
}

async function hashPassword(clave) {
    const sal = randomBytes(16).toString('hex');
    const hash = await calcular(clave, sal);
    return `scrypt$131072$8$1$${sal}$${hash.toString('hex')}`;
}

async function verifyPassword(clave, almacenado) {
    const partes = String(almacenado).split('$');
    if (partes.length !== 6 || partes.slice(0, 4).join('$') !== 'scrypt$131072$8$1'
        || !/^[a-f0-9]{32}$/.test(partes[4]) || !/^[a-f0-9]{128}$/.test(partes[5])) return false;
    const hash = await calcular(clave, partes[4]);
    return timingSafeEqual(hash, Buffer.from(partes[5], 'hex'));
}

module.exports = { hashPassword, verifyPassword };
