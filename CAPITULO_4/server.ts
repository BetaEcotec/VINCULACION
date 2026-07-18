import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize Gemini client lazily to avoid crashing on startup if key is missing
let ai: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('La variable de entorno GEMINI_API_KEY no está configurada. Configúrela en Settings > Secrets.');
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return ai;
}

// Chat / Roleplay endpoint for Soft Skills Practice
app.post('/api/chat/roleplay', async (req, res) => {
  try {
    const { messages, skillType, role } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'El historial de mensajes es requerido.' });
    }

    const aiClient = getGeminiClient();

    let systemInstruction = '';
    if (skillType === 'liderazgo') {
      systemInstruction = `
Eres un inversionista o cliente sumamente exigente de la Universidad Ecotec. Estás evaluando el liderazgo de un emprendedor.
Tu rol es: "${role || 'Inversionista Ángel de Startups'}".
Debes responder de manera realista en español, cuestionando las decisiones del usuario, desafiando sus argumentos con cortesía pero firmeza.
Mantén tus respuestas relativamente cortas (máximo 3-4 oraciones) para mantener la dinámica de chat fluida.
Tu actitud es crítica pero profesional. Estás evaluando su comunicación, liderazgo y capacidad de persuasión.
`;
    } else if (skillType === 'comunicacion') {
      systemInstruction = `
Eres un miembro de tu equipo de desarrollo o un cliente inconforme en una situación difícil.
Tu rol es: "${role || 'Desarrollador Líder frustrado'}".
El usuario intentará comunicarse contigo en español de manera asertiva y efectiva para resolver un conflicto de retraso de proyecto.
Responde con realismo, expresando tus dudas o quejas de manera directa, pero reaccionando de forma constructiva si el usuario demuestra empatía, claridad y escucha activa.
Mantén tus respuestas cortas (máximo 3-4 oraciones).
`;
    } else {
      systemInstruction = `
Eres un socio comercial en medio de una crisis de mercado inesperada.
Tu rol es: "${role || 'Socio estresado ante la competencia'}".
El usuario debe demostrar resiliencia, pensamiento positivo y adaptabilidad en español para convencerte de no abandonar el barco o rendirse.
Pon a prueba su perseverancia y su capacidad para proponer soluciones creativas ante la incertidumbre.
Mantén tus respuestas cortas (máximo 3-4 oraciones).
`;
    }

    // Convert messages to Gemini Content API format
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const responseText = response.text || 'No pude procesar la respuesta en este momento.';
    res.json({ content: responseText });
  } catch (error: any) {
    console.error('Error en el chat de juego de rol:', error);
    res.status(500).json({ error: error.message || 'Error en el servidor de juego de rol.' });
  }
});

// Presentation draft generation endpoint
app.post('/api/presentation/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'El contenido para la presentación es requerido.' });
    }

    const aiClient = getGeminiClient();
    
    const systemInstruction = `
Eres un Diseñador Instruccional Senior y Experto en Presentaciones Corporativas de la Universidad Ecotec.
Tu objetivo es analizar el contenido académico provisto y estructurar una presentación de clase altamente pedagógica, visualmente limpia y conforme a las normas de marca de Ecotec.

REGLAS DE DISEÑO DE ECOTEC:
- Colores:
  * Azul Institucional (Principal): #1E5FA6
  * Azul de Acento: #2D6DB5
  * Títulos: #1A1A1A
  * Cuerpo: #444444
  * Cajas de Recomendación / Callouts: Fondo #EBF3FC, borde izquierdo grueso #1E5FA6
- Diapositivas:
  * Estructura ordenada y secuencial estricta.
  * Máximo 6 bullets por diapositiva. Si el contenido es largo, divídelo en "Parte 1" y "Parte 2".
  * Tablas: Encabezados en #1E5FA6 con letras blancas, filas alternadas en gris claro.
  * Comparativas: Layout de 2 columnas (A vs B) para conceptos opuestos.

ESTRUCTURA DE PRESENTACIÓN EXIGIDA (Secuencial):
Genera una secuencia de entre 6 y 10 diapositivas que cubran:
1. Portada (type: "portada"):
   - session: Código de sesión en formato grande (ej: "S3.1", "S1.1", "S2.2").
   - title: Título del tema o clase en negrita.
2. Unidad (type: "unidad"):
   - unitBadge: "UNIDAD X" (ej: "UNIDAD 1").
   - title: Tema central de la unidad.
3. Objetivo (type: "objetivo"):
   - title: "Objetivo de la Sesión"
   - content: Una frase clara, accionable y pedagógica.
4. Contenido (type: "contenido") - Genera de 2 a 5 diapositivas según el tema:
   - layout: "standard" | "comparison" | "callout" | "table"
   - title: Subtema específico.
   - content:
     * Si layout es "standard": Array de hasta 6 bullets (strings) cortos, claros y potentes.
     * Si layout es "comparison": { col1Title: string, col1Body: string[], col2Title: string, col2Body: string[] }
     * Si layout es "callout": { text: string, advice: string } (consejo/recomendación)
     * Si layout es "table": { headers: string[], rows: string[][] } (tabla comparativa o informativa)
5. Actividades (type: "actividades"):
   - title: "Actividades de Clase"
   - content: Array de actividades numeradas/descritas para realizar en clase (entre 2 y 4).
6. Cierre Académico (type: "cierre"):
   - title: "Cierre Académico"
   - content: { homework: string (Tarea autónoma), references: string[] (Bibliografía en formato APA) }
7. Final (type: "final"):
   - title: "Gracias" (Tamaño extra grande, color azul institucional)

Tu respuesta debe ser UNICAMENTE un arreglo JSON válido con los objetos de las diapositivas.
No incluyas explicaciones, no incluyas bloques de código markdown (\`\`\`json ... \`\`\`), no incluyas texto antes o después. Devuelve solo el JSON crudo.
`;

    const userPrompt = `Analiza este texto o guion académico y genera la presentación completa en JSON según las directrices:
"${prompt}"`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('No se obtuvo respuesta del modelo Gemini.');
    }

    let cleanText = responseText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.substring(7);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    cleanText = cleanText.trim();

    const slides = JSON.parse(cleanText);
    res.json({ slides });
  } catch (error: any) {
    console.error('Error al generar la presentación:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
});

// Serve application
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Ecotec Presentation app running at http://localhost:${port}`);
});
