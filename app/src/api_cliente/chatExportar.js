// Equivalente cliente de: GET /api/v1/chat/exportar/{conversacion_id}?formato=pdf|markdown|json
// Aquí se agrega también "csv" y "kmz" (Sección 8.2 exportar.js) bajo el mismo contrato lógico.
import { estado } from './simEstado.js'
import { listarMensajes } from '../db/indexeddb.js'
import { generarMarkdownConversacion, generarCSVEstadisticas, generarKML, generarKMZ, descargarArchivo, generarPDF } from '../motores/exportar.js'

export async function chatExportar({ formato = 'markdown', perimetroLatLng = [], nodoDOM = null } = {}) {
  let mensajes = []
  try {
    mensajes = estado.conversacionId ? await listarMensajes(estado.conversacionId) : []
  } catch {
    mensajes = [] // IndexedDB no disponible en este entorno (p.ej. Node)
  }

  if (formato === 'markdown') {
    const contenido = generarMarkdownConversacion(mensajes, estado)
    const nombreArchivo = `conversacion_${Date.now()}.md`
    descargarArchivo(contenido, nombreArchivo, 'text/markdown')
    return { formato, nombreArchivo, tamanoBytes: contenido.length, contenido }
  }

  if (formato === 'json') {
    const contenido = JSON.stringify({ mensajes, estadisticas: estado }, null, 2)
    const nombreArchivo = `conversacion_${Date.now()}.json`
    descargarArchivo(contenido, nombreArchivo, 'application/json')
    return { formato, nombreArchivo, tamanoBytes: contenido.length, contenido }
  }

  if (formato === 'csv') {
    const filas = estado.historialHectareas.map((h, i) => ({
      minutos: h.minutos,
      hectareas: h.hectareas,
      ros: estado.historialROS[i]?.ros ?? null,
    }))
    const contenido = generarCSVEstadisticas(filas)
    const nombreArchivo = `estadisticas_${Date.now()}.csv`
    descargarArchivo(contenido, nombreArchivo, 'text/csv')
    return { formato, nombreArchivo, tamanoBytes: contenido.length, contenido }
  }

  if (formato === 'kmz') {
    const kml = generarKML(perimetroLatLng, { nombre: estado.nombre })
    const bytes = generarKMZ(kml)
    const nombreArchivo = `perimetro_${Date.now()}.kmz`
    descargarArchivo(bytes, nombreArchivo, 'application/vnd.google-earth.kmz')
    return { formato, nombreArchivo, tamanoBytes: bytes.length }
  }

  if (formato === 'pdf') {
    const nombreArchivo = `reporte_${Date.now()}.pdf`
    const resultado = nodoDOM ? await generarPDF(nodoDOM, nombreArchivo) : null
    return { formato, nombreArchivo: resultado, tamanoBytes: null, nota: nodoDOM ? null : 'Se requiere un nodoDOM real (navegador) para generar el PDF' }
  }

  throw new Error(`chatExportar: formato no soportado "${formato}"`)
}
