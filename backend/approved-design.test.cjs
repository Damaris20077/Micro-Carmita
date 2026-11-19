const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
test('auditoría funcional conserva íntegro el HTML y CSS del diseño aprobado',()=>{
    const esperados={
        'index.html':'7b552000fda345dd9413c9fcb6a552bee03d8b06e5d15d9808f63710d9aa8cec',
        'estilos.css':'b48eb7539dde0933ca592195763d8c6c88a0304ae3e92f524235127977bc295b'
    };
    for(const [archivo,huella] of Object.entries(esperados)){
        const fuente=fs.readFileSync(path.join(__dirname,'..',archivo),'utf8').replace(/\r\n/g,'\n');
        assert.equal(createHash('sha256').update(fuente).digest('hex'),huella,archivo);
    }
});
