const express = require('express');
const { crearPedidosServicio } = require('./order-service');
const { fallo } = require('./auth-service');
function rutasPedidos(repository) {
    const router = express.Router();
    const servicio = repository && crearPedidosServicio(repository);
    router.use('/orders', (req, res, next) => {
        if (!servicio) return next(fallo(503, 'Pedidos pendientes de configuración.'));
        next();
    });
    router.get('/orders', async (req, res) => res.json({ pedidos: await servicio.listar(req.usuario) }));
    router.get('/orders/:id', async (req, res) => res.json(await servicio.consultar(req.usuario, Number(req.params.id))));
    router.post('/orders', async (req, res) => res.status(201).json(await servicio.crear(req.usuario, req.body)));
    router.post('/orders/:id/cancel', async (req, res) => res.json(await servicio.cancelar(req.usuario, Number(req.params.id), req.body)));
    router.post('/orders/:id/receipts', async (req, res) => {
        const r = await servicio.recibir(req.usuario, Number(req.params.id), req.body);
        res.status(r.repetida ? 200 : 201).json(r);
    });
    return router;
}
module.exports = { rutasPedidos };
