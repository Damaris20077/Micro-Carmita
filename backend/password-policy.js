const MENSAJE_LONGITUD = 'La contraseña debe tener entre 8 y 128 caracteres.';
const MENSAJE_LONGITUD_SUPERUSUARIO = 'La contraseña del Superusuario debe tener entre 15 y 128 caracteres.';
const MENSAJE_PREDECIBLE = 'Elija una contraseña menos común o predecible.';
const comunes = /^(password|contrase[nñ]a|qwerty|admin|administrador|vendedor|microcarmita|carmita|bienvenido|welcome|letmein|iloveyou|changeme|secret)([\d\s!@#$%^&*._-])*$/u;
const secuencias = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiop', 'poiuytrewq', 'asdfghjkl', 'lkjhgfdsa'];

function validarPassword(clave, usuario = '', rol = 'vendedor') {
    const minimo = rol === 'superusuario' ? 15 : 8;
    if (typeof clave !== 'string' || clave.length < minimo || clave.length > 128) {
        return rol === 'superusuario' ? MENSAJE_LONGITUD_SUPERUSUARIO : MENSAJE_LONGITUD;
    }
    // La normalización se usa únicamente para detectar patrones. La contraseña
    // original, incluidos espacios y símbolos, se conserva para scrypt.
    const comparable = clave.normalize('NFKC').trim().toLowerCase();
    const cuenta = usuario.normalize('NFKC').trim().toLowerCase();
    if (!comparable || comunes.test(comparable) || /^(.{1,8})\1+$/us.test(comparable)
        || secuencias.some(secuencia => secuencia.includes(comparable))
        || (cuenta && (comparable === cuenta || comparable.replace(/[\d\s!@#$%^&*._-]+$/u, '') === cuenta))) {
        return MENSAJE_PREDECIBLE;
    }
    return null;
}

module.exports = { validarPassword, MENSAJE_LONGITUD, MENSAJE_LONGITUD_SUPERUSUARIO, MENSAJE_PREDECIBLE };
