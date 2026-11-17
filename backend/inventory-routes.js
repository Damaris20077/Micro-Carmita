const express = require('express');
const { crearInventarioServicio } = require('./inventory-service');
const { fallo } = require('./auth-service');

function rutasInventario(repository) {
    const router = express.Router();
    const servicio = repository && crearInventarioServicio(repository);
    router.use((req, res, next) => {
        if (!servicio) return next(fallo(503, 'Inventario pendiente de configuración.'));
        next();
    });
    for (const tipo of ['clientes', 'proveedores']) {
        router.get(`/${tipo}`, async (req, res) => res.json({ registros: await servicio.contactos(req.usuario, tipo) }));
        router.post(`/${tipo}`, async (req, res) => res.status(201).json({ registro: await servicio.crearContacto(req.usuario, tipo, req.body) }));
    }
    router.get('/inventory', async (req, res) => res.json({ productos: await servicio.inventario(req.usuario) }));
    router.get('/inventory/alerts', async (req, res) => {
        const productos = await servicio.inventario(req.usuario);
        res.json({ stockBajo: productos.filter(p => p.stockBajo),
            caducidad: productos.flatMap(p => p.lotes.filter(l => l.cantidad > 0 && ['Por caducar', 'Caducado'].includes(l.estado))
                .map(l => ({ ...l, producto: p.nombre }))) });
    });
    router.post('/products', async (req, res) => res.status(201).json(await servicio.crearProducto(req.usuario, req.body)));
    router.patch('/products/:id', async (req, res) => res.json(await servicio.editarProducto(req.usuario, Number(req.params.id), req.body)));
    router.post('/products/:id/lots', async (req, res) => res.status(201).json(await servicio.entrada(req.usuario, Number(req.params.id), req.body)));
    router.post('/products/:id/adjustments', async (req, res) => res.json(await servicio.ajustar(req.usuario, Number(req.params.id), req.body)));
    router.get('/products/:id/history', async (req, res) => res.json({ movimientos: await servicio.historial(req.usuario, Number(req.params.id)) }));
    return router;
}
module.exports = { rutasInventario };
