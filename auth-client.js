/* Adaptador del frontend para sesiones HTTP y permisos de la API. */
(() => {
    'use strict';
    let sesion = null;
    let csrfToken = '';
    let usuarios = [];
    let entrando = false;
    let revisionSesion = 0, consultaUsuarios = 0, operacionUsuarios = null;
    const renderizarSesion = aplicarSesion;
    aplicarSesion = () => {
        const panel = document.querySelector?.('.contenedor');
        if (panel) panel.inert = !sesion;
        renderizarSesion();
        if (!sesion) document.getElementById('loginUsuario')?.focus?.();
    };
    permisosPorRol.administrador = [...permisosPorRol.administrador, 'usuarios'];

    function limpiarSesion() {
        revisionSesion++; consultaUsuarios++;
        sesion = null;
        csrfToken = '';
        usuarios = [];
        carrito = [];
        aplicarSesion();
        controlesUsuarios();
        document.dispatchEvent?.(new Event('microcarmita:sesion'));
    }

    async function api(ruta, metodo = 'GET', datos) {
        const identidad = sesion;
        const revision = revisionSesion;
        const headers = {};
        if (metodo !== 'GET') {
            headers['Content-Type'] = 'application/json';
            headers['X-CSRF-Token'] = csrfToken;
        }
        const respuesta = await fetch(`/api${ruta}`, {
            method: metodo, credentials: 'same-origin', headers,
            body: datos === undefined ? undefined : JSON.stringify(datos)
        });
        if (respuesta.status === 401 && sesion === identidad && revisionSesion === revision) limpiarSesion();
        let contenido = {};
        if (respuesta.status !== 204) {
            try { contenido = await respuesta.json(); }
            catch { throw Object.assign(new Error('El servidor devolvió una respuesta no válida. Reintente la consulta; si estaba guardando, compruebe el resultado antes de repetir.'), { status: respuesta.status }); }
        }
        if (!respuesta.ok) {
            throw Object.assign(new Error(contenido.error || 'No se pudo completar la operación.'), { status: respuesta.status });
        }
        return contenido;
    }

    usuarioActual = () => sesion;
    obtenerUsuarios = () => usuarios;

    async function restaurarSesion() {
        const revision = ++revisionSesion;
        try {
            const datos = await api('/auth/me');
            if (revision !== revisionSesion) return false;
            sesion = datos.usuario;
            csrfToken = datos.csrfToken;
            aplicarSesion();
            document.dispatchEvent?.(new Event('microcarmita:sesion'));
            return true;
        } catch {
            if (revision === revisionSesion) limpiarSesion();
            return false;
        }
    }

    iniciarSesion = async evento => {
        evento.preventDefault();
        if (entrando) return;
        entrando = true;
        const revision = ++revisionSesion;
        const boton = document.getElementById('loginBoton');
        if (boton) { boton.disabled = true; boton.setAttribute?.('aria-busy', 'true'); }
        const error = document.getElementById('errorLogin');
        try {
            const datos = await api('/auth/login', 'POST', {
                usuario: document.getElementById('loginUsuario').value,
                clave: document.getElementById('loginClave').value
            });
            if (revision !== revisionSesion) return;
            sesion = datos.usuario;
            csrfToken = datos.csrfToken;
            document.getElementById('loginClave').value = '';
            error.textContent = '';
            aplicarSesion();
            document.dispatchEvent?.(new Event('microcarmita:sesion'));
        } catch (problema) {
            error.textContent = problema.message;
        } finally {
            entrando = false;
            if (boton) { boton.disabled = false; boton.removeAttribute?.('aria-busy'); }
        }
    };

    cerrarSesion = async () => {
        const revision = ++revisionSesion;
        try {
            await api('/auth/logout', 'POST', {});
            if (revision === revisionSesion) limpiarSesion();
        } catch (error) {
            alert(error.message);
        }
    };

    mostrarUsuarios = async () => {
        const identidad = sesion, numero = ++consultaUsuarios;
        const lista = document.getElementById('listaUsuarios');
        if (!lista) return;
        if (!tienePermiso('usuarios')) {
            lista.innerHTML = '';
            return;
        }
        try {
            const datos = await api('/users');
            if (sesion !== identidad || numero !== consultaUsuarios) return;
            usuarios = datos.usuarios;
            lista.innerHTML = usuarios.map(user => `
                <tr><td>${textoSeguro(user.nombre)}</td><td>${textoSeguro(user.usuario)}</td>
                <td>${textoSeguro(user.rol)}</td><td>${user.activo ? 'Activo' : 'Inactivo'}</td>
                <td><button class="btn-editar" onclick="MicroCarmitaAuth.editarUsuario(${Number(user.id)})">Editar</button>
                <button class="btn-pagar" onclick="cambiarEstadoUsuario(${Number(user.id)})">${user.activo ? 'Desactivar' : 'Activar'}</button></td></tr>
            `).join('');
            controlesUsuarios();
        } catch (error) {
            if (sesion !== identidad || numero !== consultaUsuarios) return;
            lista.textContent = error.message;
        }
    };

    function controlesUsuarios() {
        const ocupado = !!sesion && operacionUsuarios?.identidad === sesion;
        for (const boton of document.querySelectorAll?.('#usuarios button') || []) {
            boton.disabled = ocupado || !tienePermiso('usuarios');
            if (ocupado) boton.setAttribute?.('aria-busy', 'true'); else boton.removeAttribute?.('aria-busy');
        }
    }
    async function operarUsuarios(fn) {
        if (!sesion || operacionUsuarios?.identidad === sesion) return;
        const token = { identidad: sesion }; operacionUsuarios = token; controlesUsuarios();
        try { await fn(token.identidad); }
        catch (error) { if (sesion === token.identidad) alert(error.message); }
        finally { if (operacionUsuarios === token) operacionUsuarios = null; controlesUsuarios(); }
    }
    crearUsuario = () => operarUsuarios(async identidad => {
        if (!exigirPermiso('usuarios')) return;
        await api('/users', 'POST', {
            nombre: document.getElementById('usuarioNombre').value,
            usuario: document.getElementById('usuarioCuenta').value,
            clave: document.getElementById('usuarioClave').value,
            rol: document.getElementById('usuarioRol').value
        });
        if (sesion !== identidad) return;
        for (const campo of ['usuarioNombre', 'usuarioCuenta', 'usuarioClave']) document.getElementById(campo).value = '';
        await mostrarUsuarios();
    });

    async function guardarUsuario(id, datos) {
        const identidad = sesion;
        await api(`/users/${id}`, 'PATCH', datos);
        if (sesion !== identidad) return false;
        if (sesion?.id === id) return restaurarSesion();
        else await mostrarUsuarios();
        return sesion === identidad;
    }

    cambiarEstadoUsuario = id => operarUsuarios(async () => {
        if (!exigirPermiso('usuarios')) return;
        const user = usuarios.find(item => item.id === id);
        if (!user) return;
        await guardarUsuario(id, { activo: !user.activo });
    });

    async function editarUsuario(id) {
        return operarUsuarios(async () => {
            if (!exigirPermiso('usuarios')) return;
            const user = usuarios.find(item => item.id === id);
            if (!user) return;
            const nombre = prompt('Nombre completo:', user.nombre);
            if (nombre === null) return;
            const usuario = prompt('Nombre de usuario:', user.usuario);
            if (usuario === null) return;
            const rol = prompt('Rol (administrador o vendedor):', user.rol);
            if (rol === null) return;
            // La contraseña se introduce en un campo password del formulario existente.
            const clave = document.getElementById('usuarioClave').value;
            const datos = { nombre, usuario, rol };
            if (clave) datos.clave = clave;
            if (await guardarUsuario(id, datos)) document.getElementById('usuarioClave').value = '';
        });
    }

    async function archivo(ruta) {
        const identidad=sesion;
        const respuesta=await fetch(`/api${ruta}`,{credentials:'same-origin'});
        if(!respuesta.ok){
            if(respuesta.status===401&&sesion===identidad)limpiarSesion();
            throw Object.assign(new Error('No se pudo descargar el reporte.'),{status:respuesta.status});
        }
        if(!respuesta.headers.get('content-type')?.startsWith('application/pdf'))throw new Error('Respuesta PDF inválida.');
        const blob=await respuesta.blob();
        if(sesion!==identidad)throw new Error('La sesión cambió durante la descarga.');
        return blob;
    }
    globalThis.MicroCarmitaAuth = { iniciarSesion, cerrarSesion, crearUsuario, editarUsuario, api, archivo };
    document.addEventListener('DOMContentLoaded', restaurarSesion);
})();
