const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPassword, MENSAJE_LONGITUD, MENSAJE_PREDECIBLE } = require('./password-policy');
const { hashPassword, verifyPassword } = require('./passwords');
const { randomBytes } = require('node:crypto');

for (const [rol, minimo] of [['superusuario', 15], ['administrador', 8], ['vendedor', 8]]) {
    for (const longitud of [minimo - 1, minimo, 128, 129]) {
        test(`política ${rol} con ${longitud} caracteres`, () => {
            const clave = randomBytes(65).toString('hex').slice(0, longitud);
            const resultado = validarPassword(clave, 'cuenta.prueba', rol);
            if (longitud < minimo || longitud > 128) assert.ok(resultado);
            else assert.equal(resultado, null);
        });
    }
    test(`política ${rol} rechaza variantes comunes aunque cumplan longitud`, () => {
        assert.equal(validarPassword('Password123456789!', '', rol), MENSAJE_PREDECIBLE);
    });
}

test('política admite letras, números, símbolos y espacios sin exigir composición', () => {
    for (const clave of ['R7!p L2?', 'tulipanbruma', '40792583', '!~@%&+?=', ' Bruma del río 9! ']) {
        assert.equal(validarPassword(clave), null);
    }
});

test('política rechaza claves comunes, secuencias, repeticiones y variantes del usuario', () => {
    for (const clave of ['Password123!', 'CONTRASEÑA123', 'admin2026!', 'Carmita2026', '12345678', 'abcdefgh',
        'qwertyui', 'aaaaaaaa', 'abc123abc123', '        ', 'operador2026!']) {
        assert.equal(validarPassword(clave, 'operador'), MENSAJE_PREDECIBLE);
    }
});

test('política valida tipo y límites de longitud', () => {
    assert.equal(validarPassword('R7!p L2'), MENSAJE_LONGITUD);
    assert.equal(validarPassword('R7!p L2?'), null);
    assert.equal(validarPassword(null), MENSAJE_LONGITUD);
    assert.equal(validarPassword('X'.repeat(129)), MENSAJE_LONGITUD);
});

test('scrypt conserva espacios y símbolos como parte de la contraseña', async () => {
    const clave = ' Bruma del río 9! ';
    assert.equal(validarPassword(clave), null);
    const hash = await hashPassword(clave);
    assert.equal(await verifyPassword(clave, hash), true);
    assert.equal(await verifyPassword(clave.trim(), hash), false);
});
