const { crearPool } = require('./database');
const { crearRepositorio } = require('./auth-repository');
const { hashPassword } = require('./passwords');
const { validar, publico } = require('./auth-service');
const { MENSAJE_LONGITUD, MENSAJE_LONGITUD_SUPERUSUARIO, MENSAJE_PREDECIBLE } = require('./password-policy');

const erroresConocidos = {
    ECONNREFUSED: 'Conexión MySQL rechazada.',
    ETIMEDOUT: 'Tiempo de conexión MySQL agotado.',
    ENOTFOUND: 'Servidor MySQL no localizado.',
    ER_ACCESS_DENIED_ERROR: 'MySQL rechazó las credenciales de conexión.',
    ER_DBACCESS_DENIED_ERROR: 'Acceso a la base de datos denegado.',
    ER_TABLEACCESS_DENIED_ERROR: 'Permisos insuficientes sobre una tabla.',
    ER_NO_SUCH_TABLE: 'Falta una tabla requerida. Revise la migración aplicada.',
    ER_BAD_FIELD_ERROR: 'La estructura de una tabla no coincide con la aplicación.',
    ER_DUP_ENTRY: 'El nombre de usuario ya existe.',
    ER_NO_REFERENCED_ROW_2: 'Falta una referencia requerida. Revise los roles de la migración.',
    ER_CHECK_CONSTRAINT_VIOLATED: 'Los datos incumplen una restricción de la base.',
    ER_LOCK_DEADLOCK: 'Transacción interrumpida por un bloqueo concurrente.',
    ER_LOCK_WAIT_TIMEOUT: 'Se agotó la espera de un bloqueo.',
    BOOTSTRAP_DISABLED: 'Aprovisionamiento de desarrollo deshabilitado.',
    BOOTSTRAP_EXISTS: 'Ya existen usuarios. El aprovisionamiento inicial está bloqueado.'
};
const validacionesConocidas = new Set([
    'Datos incompletos.', 'Nombre inválido.', 'Usuario inválido.',
    MENSAJE_LONGITUD, MENSAJE_LONGITUD_SUPERUSUARIO, MENSAJE_PREDECIBLE
]);

function errorSeguro(etapa, original) {
    let tipo = 'FALLO_INTERNO';
    let mensaje = 'No se pudo completar esta etapa. Revise la configuración y el estado del sistema.';
    if (Object.hasOwn(erroresConocidos, original?.code)) {
        tipo = original.code;
        mensaje = erroresConocidos[tipo];
    } else if (etapa === 'validacion' && validacionesConocidas.has(original?.message)) {
        tipo = 'ENTRADA_INVALIDA';
        mensaje = original.message;
    } else if (etapa === 'configuracion') {
        tipo = 'CONFIGURACION_INVALIDA';
        mensaje = 'Revise DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME.';
    }
    return Object.assign(new Error(`Aprovisionamiento fallido [${etapa}/${tipo}]. ${mensaje}`), { etapa, tipo });
}

async function aprovisionar({ env = process.env, args = process.argv.slice(2),
    crearPool: abrirPool = crearPool, crearRepositorio: repositorio = crearRepositorio,
    hashPassword: proteger = hashPassword } = {}) {
    let etapa = 'validacion';
    let pool;
    let fallo;
    try {
        const desarrollo = args.includes('--superuser');
        if (desarrollo && (!['development', 'test'].includes(env.NODE_ENV)
            || env.ALLOW_DEV_SUPERUSER !== 'true')) {
            throw Object.assign(new Error(), { code: 'BOOTSTRAP_DISABLED' });
        }
        const datos = validar({ nombre: env.BOOTSTRAP_NAME, usuario: env.BOOTSTRAP_USER,
            clave: env.BOOTSTRAP_PASSWORD, rol: desarrollo ? 'superusuario' : 'administrador' }, false,
        { allowSuperuser: desarrollo });
        etapa = 'configuracion';
        pool = abrirPool(env);
        etapa = 'hash_password';
        const hash = await proteger(datos.clave);
        // El pool abre la conexión al obtenerla para iniciar la transacción.
        etapa = 'conexion';
        await repositorio(pool).transaction(async tx => {
            etapa = 'comprobacion_usuarios';
            await tx.lockUsers();
            if (!desarrollo && (await tx.listUsers()).length) {
                throw Object.assign(new Error(), { code: 'BOOTSTRAP_EXISTS' });
            }
            etapa = 'creacion_usuario';
            const user = await tx.createUser({ nombre: datos.nombre, usuario: datos.usuario,
                password_hash: hash, rol: desarrollo ? 'superusuario' : 'administrador', activo: true });
            etapa = 'auditoria';
            await tx.audit(null, user.id, 'crear', null, publico(user));
            etapa = 'confirmacion_transaccion';
        });
    } catch (error) {
        fallo = errorSeguro(etapa, error);
    } finally {
        if (pool) {
            try { await pool.end(); }
            catch (error) {
                if (!fallo) fallo = errorSeguro('cierre_pool', error);
            }
        }
    }
    if (fallo) throw fallo;
}

if (require.main === module) {
    require('dotenv').config({ quiet: true });
    aprovisionar().then(() => {
        console.log('Cuenta aprovisionada. Retire las variables BOOTSTRAP del entorno.');
    }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { aprovisionar };
