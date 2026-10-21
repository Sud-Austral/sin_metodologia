// Exportaciones client-side: markdown, CSV, KML/KMZ y PDF (Sección 8.2
// `exportar.js` + Sección 8.3 `GET /api/v1/chat/exportar`). Todo corre en
// el navegador (o Node para las funciones puras de generación de texto,
// que es lo que este módulo expone para poder probarlas con Vitest sin
// un DOM real).
import Papa from 'papaparse'

/** Markdown de una conversación completa (Ejemplo 8 del documento fuente). */
export function generarMarkdownConversacion(mensajes, estadisticas = {}) {
  const fecha = new Date().toISOString()
  let md = `# Conversación IA del Incendio\n\n`
  md += `- Fecha de exportación: ${fecha}\n`
  md += `- Simulación: ${estadisticas.nombre || 'Demo'}\n`
  md += `- Tiempo transcurrido: ${estadisticas.minutos ?? 0} min\n`
  md += `- Superficie quemada: ${(estadisticas.hectareas ?? 0).toFixed?.(1) ?? estadisticas.hectareas} ha\n`
  md += `- ROS: ${estadisticas.ros ?? 'n/d'} m/min\n\n`
  md += `## Conversación (${mensajes.length} turnos)\n\n`
  for (const m of mensajes) {
    const quien = m.rol === 'user' ? '**Despachador**' : '**IA**'
    md += `${quien}: ${m.contenido}\n\n`
  }
  return md
}

/** CSV de una serie de estadísticas (ROS/hectáreas/tiempo, Sección 8.1 ANÁLISIS). */
export function generarCSVEstadisticas(filas) {
  return Papa.unparse(filas)
}

/** KML de perímetro + frente del incendio, como Polygon/LineString. */
export function generarKML(perimetroLatLng, { nombre = 'Incendio', frenteLatLng = [] } = {}) {
  const coordsPerimetro = perimetroLatLng.map(([lat, lng]) => `${lng},${lat},0`).join(' ')
  const coordsFrente = frenteLatLng.map(([lat, lng]) => `${lng},${lat},0`).join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escaparXML(nombre)}</name>
    <Placemark>
      <name>Perímetro</name>
      <Style><LineStyle><color>ff0000ff</color><width>2</width></LineStyle><PolyStyle><color>7f0000ff</color></PolyStyle></Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsPerimetro}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    ${
      frenteLatLng.length
        ? `<Placemark>
      <name>Frente activo</name>
      <Style><LineStyle><color>ff00a5ff</color><width>3</width></LineStyle></Style>
      <LineString><coordinates>${coordsFrente}</coordinates></LineString>
    </Placemark>`
        : ''
    }
  </Document>
</kml>`
}

function escaparXML(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

// ---- ZIP (formato STORE, sin compresión) mínimo para empaquetar KMZ ----
// KMZ = ZIP con un doc.kml dentro. No usamos ninguna librería externa:
// se implementa el contenedor ZIP "store" (sin deflate) a mano, que es
// válido y lo abren Google Earth / QGIS / la mayoría de lectores KMZ.

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u16le(n) {
  return [n & 0xff, (n >> 8) & 0xff]
}
function u32le(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

/** Genera bytes de un KMZ (ZIP "store") conteniendo un único doc.kml. */
export function generarKMZ(kmlString, nombreEntrada = 'doc.kml') {
  const data = new TextEncoder().encode(kmlString)
  const nameBytes = new TextEncoder().encode(nombreEntrada)
  const crc = crc32(data)
  const offset = 0

  const localHeader = [
    0x50, 0x4b, 0x03, 0x04, // signature
    ...u16le(20), // version needed
    ...u16le(0), // flags
    ...u16le(0), // compression = 0 (store)
    ...u16le(0), ...u16le(0), // time/date (no importa)
    ...u32le(crc),
    ...u32le(data.length), // compressed size
    ...u32le(data.length), // uncompressed size
    ...u16le(nameBytes.length),
    ...u16le(0), // extra field length
  ]

  const centralHeader = [
    0x50, 0x4b, 0x01, 0x02,
    ...u16le(20), ...u16le(20),
    ...u16le(0), ...u16le(0),
    ...u16le(0), ...u16le(0),
    ...u32le(crc),
    ...u32le(data.length),
    ...u32le(data.length),
    ...u16le(nameBytes.length),
    ...u16le(0), ...u16le(0), ...u16le(0), ...u16le(0),
    ...u32le(0), // external attrs
    ...u32le(offset),
  ]

  const endRecord = [
    0x50, 0x4b, 0x05, 0x06,
    ...u16le(0), ...u16le(0),
    ...u16le(1), ...u16le(1),
    ...u32le(centralHeader.length + nameBytes.length),
    ...u32le(localHeader.length + nameBytes.length + data.length),
    ...u16le(0),
  ]

  const bytes = new Uint8Array(
    localHeader.length + nameBytes.length + data.length + centralHeader.length + nameBytes.length + endRecord.length,
  )
  let p = 0
  bytes.set(localHeader, p); p += localHeader.length
  bytes.set(nameBytes, p); p += nameBytes.length
  bytes.set(data, p); p += data.length
  bytes.set(centralHeader, p); p += centralHeader.length
  bytes.set(nameBytes, p); p += nameBytes.length
  bytes.set(endRecord, p); p += endRecord.length

  return bytes
}

/** Descarga un archivo en el navegador (no-op fuera del navegador: retorna false). */
export function descargarArchivo(contenido, nombreArchivo, mime = 'text/plain') {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return false
  }
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

/**
 * generarPDF: usa html2canvas + jsPDF para capturar un nodo DOM. Requiere
 * navegador real (document, canvas); si no está disponible retorna null
 * y deja constancia explícita (no se simula el PDF).
 */
export async function generarPDF(nodoDOM, nombreArchivo = 'reporte.pdf') {
  if (typeof document === 'undefined') return null
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')
  const canvas = await html2canvas(nodoDOM)
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const ratio = pageWidth / canvas.width
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, canvas.height * ratio)
  pdf.save(nombreArchivo)
  return nombreArchivo
}
