import formidable from 'formidable';
import Drawing from 'dxf-writer';
import fs from 'fs';
import { parseSkp } from 'openskp';

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

            // 1. LEER EL ARCHIVO REAL Y EXTRAER LA MATRIZ
            // Leemos el archivo físico temporal que guardó formidable
            const fileBuffer = fs.readFileSync(uploadedFile.filepath);
            
            // Pasamos el binario a openskp para extraer la geometría
            const skpData = await parseSkp(fileBuffer);

            // Validamos que el archivo realmente tenga líneas que dibujar
            if (!skpData || !skpData.edges || skpData.edges.length === 0) {
                return res.status(400).json({ error: 'No se encontraron aristas (líneas) legibles en el modelo SKP.' });
            }

            // Convertimos las aristas de SketchUp a nuestra matriz matemática de 3 coordenadas
            const lineas3D = skpData.edges.map(arista => {
                return {
                    start: [arista.start.x, arista.start.y, arista.start.z],
                    end: [arista.end.x, arista.end.y, arista.end.z]
                };
            });

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
            
            // Usamos addLayer y la activamos
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
            console.error("Error crítico en el procesamiento del archivo:", error);
            res.status(500).json({ error: 'El motor falló al procesar el archivo SKP real.' });
        }
    });
}
