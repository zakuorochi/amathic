import formidable from 'formidable';
import Drawing from 'dxf-writer';

// Configuramos Vercel para que nos deje recibir el archivo
export const config = {
    api: { bodyParser: false }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Solo método POST' });

    // Inicializamos formidable con la sintaxis a prueba de fallos para su versión más reciente
    const form = formidable({});
    
    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error("Error al leer el formulario:", err);
            return res.status(500).json({ error: 'Error del servidor al subir el archivo' });
        }
        
        try {
            // Verificamos si la librería guardó el archivo en un arreglo o directo
            const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file; 
            
            if (!uploadedFile) {
                return res.status(400).json({ error: 'No se detectó ningún archivo.' });
            }

            // 1. MATRIZ DE PRUEBA (El Cubo 3D real)
            const lineas3D = [
                { start: [0, 0, 0], end: [100, 0, 0] },
                { start: [100, 0, 0], end: [100, 100, 0] },
                { start: [100, 100, 0], end: [0, 100, 0] },
                { start: [0, 100, 0], end: [0, 0, 0] },
                { start: [0, 0, 0], end: [0, 0, 100] },
                { start: [100, 0, 0], end: [100, 0, 100] },
                { start: [100, 100, 0], end: [100, 100, 100] },
                { start: [0, 100, 0], end: [0, 100, 100] },
                { start: [0, 0, 100], end: [100, 0, 100] },
                { start: [100, 0, 100], end: [100, 100, 100] },
                { start: [100, 100, 100], end: [0, 100, 100] },
                { start: [0, 100, 100], end: [0, 0, 100] }
            ];

            // 2. TRANSFORMACIÓN MATEMÁTICA A VISTA ISOMÉTRICA
            const angulo = 30 * (Math.PI / 180);
            const lineas2D = lineas3D.map(linea => {
                const proyectarPunto = (x, y, z) => {
                    const x2d = (x - y) * Math.cos(angulo);
                    const y2d = (x + y) * Math.sin(angulo) - z;
                    return [x2d, y2d];
                };
                return {
                    start: proyectarPunto(linea.start[0], linea.start[1], linea.start[2]),
                    end: proyectarPunto(linea.end[0], linea.end[1], linea.end[2])
                };
            });

            // 3. MOTOR CAD
       let d = new Drawing();
            d.setUnits('Decimeters');
            
            // CORRECCIÓN AQUÍ: Usamos addLayer y la activamos
            d.addLayer('GEOMETRIA_PROYECTADA', Drawing.ACI.WHITE, 'CONTINUOUS');
            d.setActiveLayer('GEOMETRIA_PROYECTADA');
            
            lineas2D.forEach(linea => {
                d.drawLine(linea.start[0], linea.start[1], linea.end[0], linea.end[1]);
            });

            // 4. DEVOLVER EL ARCHIVO AL USUARIO
            const dxfString = d.toDxfString();
            const nombreOriginal = uploadedFile.originalFilename || 'modelo';
            
            res.setHeader('Content-Type', 'application/dxf');
            res.setHeader('Content-Disposition', `attachment; filename="${nombreOriginal}_2D.dxf"`);
            res.status(200).send(dxfString);

        } catch (error) {
            console.error("Error crítico en el cálculo geométrico:", error);
            res.status(500).json({ error: 'El motor CAD falló al procesar la geometría.' });
        }
    });
}
