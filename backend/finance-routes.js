const express=require('express');
const {crearFinanzasServicio}=require('./finance-service');
const {fallo}=require('./auth-service');
function rutasFinanzas(repository){
    const router=express.Router(),s=repository&&crearFinanzasServicio(repository);
    router.use('/finance',(req,res,next)=>s?next():next(fallo(503,'Finanzas pendientes de configuración.')));
    router.get('/finance',async(req,res)=>res.json(await s.consultar(req.usuario,req.query)));
    router.post('/finance',async(req,res)=>{const r=await s.registrar(req.usuario,req.body);res.status(r.repetida?200:201).json(r)});
    return router;
}
module.exports={rutasFinanzas};
