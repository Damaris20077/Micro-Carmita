const { randomBytes, createHash } = require('node:crypto');
const passwords = require('./passwords');
const { validarPassword } = require('./password-policy');

function fallo(status, mensaje) {
    return Object.assign(new Error(mensaje), { status });
}

function publico(usuario) {
    return { id: usuario.id, nombre: usuario.nombre, usuario: usuario.usuario, rol: usuario.rol, activo: Boolean(usuario.activo) };
}

function digest(token) {
    return createHash('sha256').update(token).digest();
}

function validar(body, parcial = false, { allowSuperuser = false } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fallo(400, 'Datos inválidos.');
    const permitidos = ['nombre', 'usuario', 'clave', 'rol', 'activo'];
    if (Object.keys(body).some(campo => !permitidos.includes(campo)) || !Object.keys(body).length) {
        throw fallo(400, 'Campos no permitidos o vacíos.');
    }
    const datos = { ...body };
    for (const campo of ['nombre', 'usuario', 'clave', 'rol']) {
        if ((!parcial || campo in datos) && typeof datos[campo] !== 'string') throw fallo(400, 'Datos incompletos.');
    }
    if ('nombre' in datos) {
        datos.nombre = datos.nombre.trim();
        if (!datos.nombre || datos.nombre.length > 100) throw fallo(400, 'Nombre inválido.');
    }
    if ('usuario' in datos) {
        datos.usuario = datos.usuario.trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(datos.usuario)) throw fallo(400, 'Usuario inválido.');
    }
    if ('clave' in datos) {
        const errorPassword = validarPassword(datos.clave, datos.usuario, datos.rol);
        if (errorPassword) throw fallo(400, errorPassword);
    }
    if ('rol' in datos && !['administrador', 'vendedor'].includes(datos.rol)
        && !(allowSuperuser && datos.rol === 'superusuario')) throw fallo(400, 'Rol no asignable.');
    if ('activo' in datos && typeof datos.activo !== 'boolean') throw fallo(400, 'Estado inválido.');
    return datos;
}

function crearAuth(repo, { allowSuperuser = false, crypto = passwords } = {}) {
    const permitido = user => user && Boolean(user.activo)
        && (['administrador', 'vendedor'].includes(user.rol) || (allowSuperuser && user.rol === 'superusuario'));
    // Igual coste de derivación para un nombre de usuario inexistente.
    let dummy;
    function dummyHash() {
        if (!dummy) dummy = crypto.hashPassword(randomBytes(32).toString('hex')).catch(error => { dummy = null; throw error; });
        return dummy;
    }
    function exigirAdmin(user) {
        if (!permitido(user) || !['administrador', 'superusuario'].includes(user.rol)) throw fallo(403, 'Operación no autorizada.');
    }
    return {
        async login(body) {
            if (!body || typeof body.usuario !== 'string' || typeof body.clave !== 'string'
                || body.usuario.length > 100 || body.clave.length > 128 || !body.clave.length) {
                throw fallo(400, 'Credenciales inválidas.');
            }
            const candidato = await repo.findByUsername(body.usuario.trim().toLowerCase());
            const hash = candidato?.password_hash || await dummyHash();
            const coincide = await crypto.verifyPassword(body.clave, hash);
            if (!coincide || !permitido(candidato)) throw fallo(401, 'Usuario, contraseña o estado de cuenta inválido.');
            const token = randomBytes(32).toString('hex');
            const usuario = await repo.transaction(async tx => {
                const actual = await tx.getUser(candidato.id);
                if (!permitido(actual) || actual.password_hash !== hash) throw fallo(401, 'Credenciales inválidas.');
                await tx.createSession(digest(token), actual.id);
                return publico(actual);
            });
            return { token, usuario };
        },
        async authenticate(token) {
            if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw fallo(401, 'Sesión requerida.');
            const user = await repo.findSession(digest(token));
            if (!permitido(user)) throw fallo(401, 'Sesión inválida o vencida.');
            await repo.touchSession(digest(token));
            return publico(user);
        },
        async logout(token) {
            await repo.revokeSession(digest(token));
        },
        async list(actor) {
            exigirAdmin(actor);
            return (await repo.listUsers()).filter(user => user.rol !== 'superusuario').map(publico);
        },
        async create(actor, body) {
            exigirAdmin(actor);
            const datos = validar(body);
            const hash = await crypto.hashPassword(datos.clave);
            return repo.transaction(async tx => {
                await tx.lockUsers();
                exigirAdmin(await tx.getUser(actor.id));
                const nuevo = await tx.createUser({ nombre: datos.nombre, usuario: datos.usuario, rol: datos.rol,
                    activo: datos.activo ?? true, password_hash: hash });
                await tx.audit(actor.id, nuevo.id, 'crear', null, publico(nuevo));
                return publico(nuevo);
            });
        },
        async update(actor, id, body) {
            exigirAdmin(actor);
            if (!Number.isSafeInteger(id) || id < 1) throw fallo(400, 'Identificador inválido.');
            const datos = validar(body, true);
            const hash = 'clave' in datos ? await crypto.hashPassword(datos.clave) : null;
            return repo.transaction(async tx => {
                await tx.lockUsers();
                exigirAdmin(await tx.getUser(actor.id));
                const anterior = await tx.getUser(id);
                if (!anterior) throw fallo(404, 'Usuario inexistente.');
                if ('clave' in datos) {
                    const errorPassword = validarPassword(datos.clave, datos.usuario ?? anterior.usuario, datos.rol ?? anterior.rol);
                    if (errorPassword) throw fallo(400, errorPassword);
                }
                if (anterior.rol === 'superusuario') throw fallo(403, 'Cuenta reservada al entorno de desarrollo.');
                const nuevo = { ...anterior, ...datos, password_hash: hash ?? anterior.password_hash };
                delete nuevo.clave;
                if (anterior.rol === 'administrador' && anterior.activo
                    && (!nuevo.activo || nuevo.rol !== 'administrador') && await tx.countAdmins() <= 1) {
                    throw fallo(409, 'Debe conservar al menos un Administrador activo.');
                }
                await tx.updateUser(id, nuevo);
                await tx.revokeUserSessions(id);
                let accion = 'modificar';
                if (Boolean(anterior.activo) !== Boolean(nuevo.activo)) accion = nuevo.activo ? 'activar' : 'desactivar';
                await tx.audit(actor.id, id, accion, publico(anterior), publico(nuevo));
                if (hash) await tx.audit(actor.id, id, 'cambiar_password', null, null);
                return publico(nuevo);
            });
        }
    };
}

module.exports = { crearAuth, validar, publico, digest, fallo };
