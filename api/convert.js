import formidable from 'formidable';
import Drawing from 'dxf-writer';
import fs from 'fs';
import { parseSkp } from 'openskp';

export const config = {
    api: { bodyParser: false }
};

// Función auxiliar para extraer aristas (líneas) incluso si están dentro de grupos o componentes
function extraerAristas(skpData) {
    let aristas = [];
    if (!skpData) return aristas;

    // 1. Si las aristas están sueltas en la raíz
    if (Array.isArray(skpData.edges)) {
        aristas.push(...skpData.edges);
    }

    // 2. Si están dentro de entidades, grupos o bloques
    const entidades = skpData.entities || skpData.children || [];
    if (Array.isArray(entidades)) {
        entidades.forEach(ent => {
            if (ent.start && ent.end) {
                aristas.push(ent);
            } else if (Array.isArray(ent.edges)) {
                aristas.push(...ent.edges);
            }
        });
    }

    return aristas;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Solo método POST' });

    const form = formidable({});
    
    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error("Error al leer formulario:", err);
            return res.status(500).json({ error: 'Error al procesar el envío del archivo' });
        }
        
        try {
            const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file; 
            
            if (!uploadedFile) {
                return res.status(400).json({ error: 'El servidor no recibió ningún archivo subido.' });
            }

            // 1. LEER EL ARCHIVO REAL
            const fileBuffer = fs.readFileSync(uploadedFile.filepath);
            const skpData = await parseSkp(fileBuffer);
            
            // Extraemos todas las aristas
            const aristasEncontradas = extraerAristas(skpData);

            if (aristasEncontradas.length === 0) {
                return res.status(400).json({ 
                    error: 'El modelo SKP fue leído, pero no se detectaron aristas 3D legibles. Asegúrate de explotar los componentes principales antes de exportar.' 
                });
            }

            // Mapeamos a nuestra matriz 3D
            const lineas3D = aristasEncontradas.map(arista => ({
                start: [arista.start.x || 0, arista.start.y || 0, arista.start.z || 0],
                end: [arista.end.x || 0, arista.end.y || 0, arista.end.z || 0]
            }));

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
            d.addLayer('GEOMETRIA_PROYECTADA', Drawing.ACI.WHITE, 'CONTINUOUS');
            d.setActiveLayer('GEOMETRIA_PROYECTADA');
            
            lineas2D.forEach(linea => {
                d.drawLine(linea.start[0], linea.start[1], linea.end[0], linea.end[1]);
            });

            // 4. RESPUESTA AL CLIENTE
            const dxfString = d.toDxfString();
            const nombreOriginal = uploadedFile.originalFilename || 'modelo';
            
            res.setHeader('Content-Type', 'application/dxf');
            res.setHeader('Content-Disposition', `attachment; filename="${nombreOriginal}_2D.dxf"`);
            res.status(200).send(dxfString);

        } catch (error) {
            console.error("Error al procesar SKP:", error);
            res.status(500).json({ error: `Error leyendo estructura SKP: ${error.message}` });
        }
    });
}
