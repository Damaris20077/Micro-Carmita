const express = require('express');
const path = require('node:path');
const { crearAuth, digest, fallo } = require('./auth-service');
const { rutasInventario } = require('./inventory-routes');
const { rutasPedidos } = require('./order-routes');
const { rutasVentas } = require('./sales-routes');
const { rutasFinanzas } = require('./finance-routes');
const { rutasReportes } = require('./report-routes');

function crearApp({ repository, inventoryRepository, orderRepository, salesRepository, financeRepository, reportRepository, production = false, origin = 'http://127.0.0.1:3000', allowSuperuser = false } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        next();
    });
    app.use(express.json({ limit: '8kb' }));
    app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
    const auth = repository && crearAuth(repository, { allowSuperuser: !production && allowSuperuser });
    const cookies = { httpOnly: true, secure: production, sameSite: 'strict', path: '/api' };
    const intentos = new Map();

    function token(req) {
        const valor = (req.headers.cookie || '').split(';').map(parte => parte.trim())
            .find(parte => parte.startsWith('mc_session='));
        return valor?.slice('mc_session='.length);
    }
    function csrf(valor) { return digest(`csrf:${valor}`).toString('hex'); }

    app.use('/api', (req, res, next) => {
        if (!auth) return next(fallo(503, 'Autenticación pendiente de configuración.'));
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            if (req.headers.origin !== origin) return next(fallo(403, 'Origen no autorizado.'));
            if (!req.is('application/json')) return next(fallo(415, 'Se requiere JSON.'));
        }
        next();
    });

    app.post('/api/auth/login', async (req, res) => {
        const ahora = Date.now();
        for (const [ip, registro] of intentos) {
            if (registro.hasta <= ahora) intentos.delete(ip);
        }
        const ip = req.ip;
        let registro = intentos.get(ip);
        if (!registro) {
            if (intentos.size >= 1000) throw fallo(429, 'Intente nuevamente más tarde.');
            registro = { total: 0, hasta: ahora + 15 * 60 * 1000 };
            intentos.set(ip, registro);
        }
        registro.total += 1;
        if (registro.total > 20) {
            res.set('Retry-After', String(Math.ceil((registro.hasta - ahora) / 1000)));
            throw fallo(429, 'Demasiados intentos. Intente más tarde.');
        }
        const sesion = await auth.login(req.body);
        const anterior = token(req);
        if (anterior && /^[a-f0-9]{64}$/.test(anterior)) await auth.logout(anterior);
        res.cookie('mc_session', sesion.token, { ...cookies, maxAge: 8 * 60 * 60 * 1000 });
        res.json({ usuario: sesion.usuario, csrfToken: csrf(sesion.token) });
    });

    app.use('/api', async (req, res, next) => {
        req.sessionToken = token(req);
        req.usuario = await auth.authenticate(req.sessionToken);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
            && req.headers['x-csrf-token'] !== csrf(req.sessionToken)) throw fallo(403, 'Verificación CSRF inválida.');
        next();
    });
    app.get('/api/auth/me', (req, res) => res.json({ usuario: req.usuario, csrfToken: csrf(req.sessionToken) }));
    app.post('/api/auth/logout', async (req, res) => {
        await auth.logout(req.sessionToken);
        res.clearCookie('mc_session', cookies);
        res.status(204).end();
    });
    app.get('/api/users', async (req, res) => res.json({ usuarios: await auth.list(req.usuario) }));
    app.post('/api/users', async (req, res) => res.status(201).json({ usuario: await auth.create(req.usuario, req.body) }));
    app.patch('/api/users/:id', async (req, res) => {
        const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : NaN;
        res.json({ usuario: await auth.update(req.usuario, id, req.body) });
    });
    app.use('/api', rutasPedidos(orderRepository));
    app.use('/api', rutasVentas(salesRepository));
    app.use('/api', rutasFinanzas(financeRepository));
    app.use('/api', rutasReportes(reportRepository));
    app.use('/api', rutasInventario(inventoryRepository));
    app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente.' }));

    const raiz = path.join(__dirname, '..');
    for (const archivo of ['index.html', 'app.js', 'auth-client.js', 'inventory-client.js', 'orders-client.js', 'sales-client.js', 'finance-client.js', 'reports-client.js', 'estilos.css']) {
        app.get(archivo === 'index.html' ? ['/', '/index.html'] : `/${archivo}`, (req, res) => {
            res.sendFile(path.join(raiz, archivo));
        });
    }
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El usuario ya existe.' });
        const status = error.status >= 400 && error.status < 500 ? error.status : 503;
        const mensaje = error.type === 'entity.parse.failed' ? 'JSON inválido.'
            : status === 503 ? 'Servicio temporalmente no disponible.' : error.message;
        res.status(status).json({ error: mensaje });
    });
    return app;
}

module.exports = crearApp();
module.exports.crearApp = crearApp;
