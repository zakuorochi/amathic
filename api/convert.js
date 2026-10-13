import { IncomingForm } from 'formidable';
import fs from 'fs';
import Drawing from 'dxf-writer';

// Configuramos Vercel para que nos deje recibir archivos pesados
export const config = {
    api: { bodyParser: false }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Solo método POST' });

    // 1. RECIBIR EL ARCHIVO REAL DEL CLIENTE
    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: 'Error al subir el archivo' });
        
        const uploadedFile = files.file[0]; // El archivo .skp
        const fileBuffer = fs.readFileSync(uploadedFile.filepath);

        try {
            // 2. EXTRAER LA MATRIZ DEL .SKP
            // Aquí entra tu librería (ej. openskp). Le pasamos el archivo físico (fileBuffer)
            // y esta nos debe devolver las líneas 3D. 
            // Para que pruebes la matemática hoy, estructuramos cómo se debe ver lo que te devuelve el lector:
            
            /* const lineas3D = extractSkpGeometry(fileBuffer); */
            
            // Ejemplo de la estructura exacta que tu lector debe extraer (Un cubo 3D real de 100x100x100):
            const lineas3D = [
                // Base (Z = 0)
                { start: [0, 0, 0], end: [100, 0, 0] },
                { start: [100, 0, 0], end: [100, 100, 0] },
                { start: [100, 100, 0], end: [0, 100, 0] },
                { start: [0, 100, 0], end: [0, 0, 0] },
                // Pilares (Eje Z)
                { start: [0, 0, 0], end: [0, 0, 100] },
                { start: [100, 0, 0], end: [100, 0, 100] },
                { start: [100, 100, 0], end: [100, 100, 100] },
                { start: [0, 100, 0], end: [0, 100, 100] },
                // Techo (Z = 100)
                { start: [0, 0, 100], end: [100, 0, 100] },
                { start: [100, 0, 100], end: [100, 100, 100] },
                { start: [100, 100, 100], end: [0, 100, 100] },
                { start: [0, 100, 100], end: [0, 0, 100] }
            ];

            // 3. TRANSFORMACIÓN MATEMÁTICA (De 3D a Vista Isométrica 2D)
            const angulo = 30 * (Math.PI / 180); // 30 grados para perspectiva isométrica
            const lineas2D = lineas3D.map(linea => {
                // Función matemática real para proyectar un punto 3D (X, Y, Z) en un papel 2D (X2, Y2)
                const proyectarPunto = (x, y, z) => {
                    const x2d = (x - y) * Math.cos(angulo);
                    const y2d = (x + y) * Math.sin(angulo) - z; // El Z sube/baja la posición
                    return [x2d, y2d];
                };

                return {
                    start: proyectarPunto(linea.start[0], linea.start[1], linea.start[2]),
                    end: proyectarPunto(linea.end[0], linea.end[1], linea.end[2])
                };
            });

            // 4. MOTOR CAD (Dibuja el DXF con las nuevas coordenadas proyectadas)
            let d = new Drawing();
            d.setUnits('Decimeters');
            d.layer('GEOMETRIA_PROYECTADA', Drawing.ACI.WHITE, 'CONTINUOUS');
            
            // Trazamos todas las líneas ya convertidas a 2D
            lineas2D.forEach(linea => {
                d.drawLine(linea.start[0], linea.start[1], linea.end[0], linea.end[1]);
            });

            // 5. DEVOLVER EL ARCHIVO REAL AL USUARIO
            const dxfString = d.toDxfString();
            res.setHeader('Content-Type', 'application/dxf');
            res.setHeader('Content-Disposition', `attachment; filename="${uploadedFile.originalFilename}_2D.dxf"`);
            res.status(200).send(dxfString);

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'El motor falló al procesar la geometría.' });
        }
    });
}
