const express = require('express');
const { crearVentasServicio } = require('./sales-service');
const { fallo } = require('./auth-service');
function rutasVentas(repository) {
    const router = express.Router();
    const servicio = repository && crearVentasServicio(repository);
    router.use(['/sales','/customers/:id/receivables'], (req,res,next) => servicio ? next() : next(fallo(503, 'Ventas pendientes de configuración.')));
    router.get('/sales', async (req,res) => res.json({ ventas: await servicio.listar(req.usuario) }));
    router.get('/sales/:id', async (req,res) => res.json(await servicio.consultar(req.usuario, Number(req.params.id))));
    router.get('/customers/:id/receivables', async (req,res) => res.json(await servicio.cliente(req.usuario, Number(req.params.id))));
    router.post('/sales', async (req,res) => { const r = await servicio.crear(req.usuario, req.body); res.status(r.repetida ? 200 : 201).json(r); });
    router.post('/sales/:id/payments', async (req,res) => { const r = await servicio.abonar(req.usuario, Number(req.params.id), req.body); res.status(r.repetida ? 200 : 201).json(r); });
    router.patch('/sales/:id', async (req,res) => res.json(await servicio.editar(req.usuario, Number(req.params.id), req.body)));
    router.post('/sales/:id/void', async (req,res) => res.json(await servicio.anular(req.usuario, Number(req.params.id), req.body)));
    return router;
}
module.exports = { rutasVentas };
