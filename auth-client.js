/* Adaptador del frontend para sesiones HTTP. Los datos del negocio siguen en el navegador. */
(() => {
    'use strict';
    let sesion = null;
    let csrfToken = '';
    let usuarios = [];
    permisosPorRol.administrador = [...permisosPorRol.administrador, 'usuarios'];

    function limpiarSesion() {
        sesion = null;
        csrfToken = '';
        usuarios = [];
        carrito = [];
        aplicarSesion();
        document.dispatchEvent?.(new Event('microcarmita:sesion'));
    }

    async function api(ruta, metodo = 'GET', datos) {
        const identidad = sesion;
        const headers = {};
        if (metodo !== 'GET') {
            headers['Content-Type'] = 'application/json';
            headers['X-CSRF-Token'] = csrfToken;
        }
        const respuesta = await fetch(`/api${ruta}`, {
            method: metodo, credentials: 'same-origin', headers,
            body: datos === undefined ? undefined : JSON.stringify(datos)
        });
        const contenido = respuesta.status === 204 ? {} : await respuesta.json();
        if (!respuesta.ok) {
            if (respuesta.status === 401 && sesion === identidad) limpiarSesion();
            throw new Error(contenido.error || 'No se pudo completar la operación.');
        }
        return contenido;
    }

    usuarioActual = () => sesion;
    obtenerUsuarios = () => usuarios;

    async function restaurarSesion() {
        try {
            const datos = await api('/auth/me');
            sesion = datos.usuario;
            csrfToken = datos.csrfToken;
            aplicarSesion();
            document.dispatchEvent?.(new Event('microcarmita:sesion'));
        } catch {
            limpiarSesion();
        }
    }

    iniciarSesion = async evento => {
        evento.preventDefault();
        const error = document.getElementById('errorLogin');
        try {
            const datos = await api('/auth/login', 'POST', {
                usuario: document.getElementById('loginUsuario').value,
                clave: document.getElementById('loginClave').value
            });
            sesion = datos.usuario;
            csrfToken = datos.csrfToken;
            document.getElementById('loginClave').value = '';
            error.textContent = '';
            aplicarSesion();
            document.dispatchEvent?.(new Event('microcarmita:sesion'));
        } catch (problema) {
            error.textContent = problema.message;
        }
    };

    cerrarSesion = async () => {
        try {
            await api('/auth/logout', 'POST', {});
            limpiarSesion();
        } catch (error) {
            alert(error.message);
        }
    };

    mostrarUsuarios = async () => {
        const lista = document.getElementById('listaUsuarios');
        if (!lista) return;
        if (!tienePermiso('usuarios')) {
            lista.innerHTML = '';
            return;
        }
        try {
            const identidad = sesion;
            const datos = await api('/users');
            if (sesion !== identidad) return;
            usuarios = datos.usuarios;
            lista.innerHTML = usuarios.map(user => `
                <tr><td>${textoSeguro(user.nombre)}</td><td>${textoSeguro(user.usuario)}</td>
                <td>${textoSeguro(user.rol)}</td><td>${user.activo ? 'Activo' : 'Inactivo'}</td>
                <td><button class="btn-editar" onclick="MicroCarmitaAuth.editarUsuario(${Number(user.id)})">Editar</button>
                <button class="btn-pagar" onclick="cambiarEstadoUsuario(${Number(user.id)})">${user.activo ? 'Desactivar' : 'Activar'}</button></td></tr>
            `).join('');
        } catch (error) {
            lista.textContent = error.message;
        }
    };

    crearUsuario = async () => {
        if (!exigirPermiso('usuarios')) return;
        try {
            await api('/users', 'POST', {
                nombre: document.getElementById('usuarioNombre').value,
                usuario: document.getElementById('usuarioCuenta').value,
                clave: document.getElementById('usuarioClave').value,
                rol: document.getElementById('usuarioRol').value
            });
            for (const campo of ['usuarioNombre', 'usuarioCuenta', 'usuarioClave']) document.getElementById(campo).value = '';
            await mostrarUsuarios();
        } catch (error) {
            alert(error.message);
        }
    };

    async function guardarUsuario(id, datos) {
        await api(`/users/${id}`, 'PATCH', datos);
        if (sesion?.id === id) await restaurarSesion();
        else await mostrarUsuarios();
    }

    cambiarEstadoUsuario = async id => {
        if (!exigirPermiso('usuarios')) return;
        const user = usuarios.find(item => item.id === id);
        if (!user) return;
        try {
            await guardarUsuario(id, { activo: !user.activo });
        } catch (error) { alert(error.message); }
    };

    async function editarUsuario(id) {
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
        try {
            await guardarUsuario(id, datos);
            document.getElementById('usuarioClave').value = '';
        } catch (error) { alert(error.message); }
    }

    globalThis.MicroCarmitaAuth = { iniciarSesion, cerrarSesion, crearUsuario, editarUsuario, api };
    document.addEventListener('DOMContentLoaded', restaurarSesion);
})();
