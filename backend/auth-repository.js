function crearRepositorio(db) {
    async function rows(sql, parametros = []) {
        const [resultado] = await db.execute(sql, parametros);
        return resultado;
    }
    return {
        async transaction(operacion) {
            const conexion = await db.getConnection();
            try {
                await conexion.beginTransaction();
                const resultado = await operacion(crearRepositorio(conexion));
                await conexion.commit();
                return resultado;
            } catch (error) {
                await conexion.rollback();
                throw error;
            } finally {
                conexion.release();
            }
        },
        async lockUsers() {
            await rows("SELECT codigo FROM roles WHERE codigo = 'administrador' FOR UPDATE");
        },
        async findByUsername(usuario) {
            return (await rows('SELECT * FROM usuarios WHERE usuario = ?', [usuario]))[0];
        },
        async getUser(id) {
            return (await rows('SELECT * FROM usuarios WHERE id = ? FOR UPDATE', [id]))[0];
        },
        async listUsers() {
            return rows('SELECT id, nombre, usuario, rol, activo FROM usuarios ORDER BY id');
        },
        async createUser(datos) {
            const resultado = await rows(
                'INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?)',
                [datos.nombre, datos.usuario, datos.password_hash, datos.rol, datos.activo]);
            return { ...datos, id: resultado.insertId };
        },
        async updateUser(id, datos) {
            await rows('UPDATE usuarios SET nombre = ?, usuario = ?, password_hash = ?, rol = ?, activo = ?, actualizado_en = UTC_TIMESTAMP(6) WHERE id = ?',
                [datos.nombre, datos.usuario, datos.password_hash, datos.rol, datos.activo, id]);
        },
        async countAdmins() {
            return (await rows("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'administrador' AND activo = 1"))[0].total;
        },
        async createSession(hash, usuarioId) {
            await rows('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 8 HOUR))',
                [hash, usuarioId]);
        },
        async findSession(hash) {
            return (await rows(`SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
                WHERE s.token_hash = ? AND s.revocada_en IS NULL AND s.expira_en > UTC_TIMESTAMP(6)
                AND s.ultima_actividad_en > DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE)`, [hash]))[0];
        },
        async touchSession(hash) {
            await rows('UPDATE sesiones SET ultima_actividad_en = UTC_TIMESTAMP(6) WHERE token_hash = ? AND revocada_en IS NULL', [hash]);
        },
        async revokeSession(hash) {
            await rows('UPDATE sesiones SET revocada_en = UTC_TIMESTAMP(6) WHERE token_hash = ? AND revocada_en IS NULL', [hash]);
        },
        async revokeUserSessions(id) {
            await rows('UPDATE sesiones SET revocada_en = UTC_TIMESTAMP(6) WHERE usuario_id = ? AND revocada_en IS NULL', [id]);
        },
        async audit(actor, afectado, accion, anterior, posterior) {
            await rows(`INSERT INTO auditoria_usuarios
                (actor_id, usuario_afectado_id, accion, anterior, posterior) VALUES (?, ?, ?, ?, ?)`,
            [actor, afectado, accion, JSON.stringify(anterior), JSON.stringify(posterior)]);
        }
    };
}

module.exports = { crearRepositorio };
