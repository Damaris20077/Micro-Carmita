const express=require('express');
const {crearReportesServicio}=require('./report-service');
const {generarPDF}=require('./report-pdf');
const {fallo}=require('./auth-service');
function rutasReportes(repository){
    const router=express.Router(),s=repository&&crearReportesServicio(repository);
    router.use('/reports',(req,res,next)=>s?next():next(fallo(503,'Reportes pendientes de configuración.')));
    router.get('/reports/:tipo/pdf',async(req,res)=>{
        const r=await s.generar(req.usuario,req.params.tipo,req.query),pdf=await generarPDF(r);
        res.type('application/pdf').set('Content-Disposition',`attachment; filename="micro-carmita-${r.tipo}.pdf"`).send(pdf);
    });
    router.get('/reports/:tipo',async(req,res)=>res.json(await s.generar(req.usuario,req.params.tipo,req.query)));
    return router;
}
module.exports={rutasReportes};
