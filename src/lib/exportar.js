// Exportaciones en el cliente: markdown, CSV, JSON, KMZ (JSZip) y PDF (jsPDF).
import JSZip from 'jszip'
import { jsPDF } from 'jspdf'

const esNavegador = typeof document !== 'undefined'
const fechaCorta = () => new Date().toISOString().slice(0, 10)

export function nombreArchivo(prefijo, ext, nombreSim = '') {
  const limpio = nombreSim.replace(/[^\w-]+/g, '_').slice(0, 30)
  return `${prefijo}${limpio ? '_' + limpio : ''}_${fechaCorta()}.${ext}`
}

export function conversacionAMarkdown(conversacion, mensajes, estadisticas = null) {
  const l = [`# Conversación IA — ${estadisticas?.nombre ?? 'Simulación'}`, '', `- Conversación: ${conversacion?.id ?? 'n/d'}`, `- Fecha: ${conversacion?.fecha_creacion ?? new Date().toISOString()}`, `- Mensajes: ${mensajes.length}`, '']
  if (estadisticas) {
    l.push('## Estado de la simulación', '', `| Métrica | Valor |`, `|---|---|`, `| Tiempo | ${estadisticas.minutos} min |`, `| Superficie | ${estadisticas.hectareas} ha |`, `| ROS cabeza | ${estadisticas.ros_cabeza} m/min |`, `| Altura llama | ${estadisticas.altura_llama} m |`, `| Viento | ${estadisticas.vel_viento} km/h desde ${estadisticas.dir_viento}° |`, `| Humedad combustible | ${estadisticas.hum_combustible} % |`, `| Modelo | ${estadisticas.modelo} |`, '')
  }
  l.push('## Mensajes', '')
  for (const m of mensajes) {
    l.push(`### ${m.rol === 'user' ? '👤 Despachador' : '🤖 IA'} — ${m.timestamp}${m.tokens_utilizados ? ` (${m.tokens_utilizados} tokens)` : ''}`, '', m.contenido, '')
    if (m.comando) l.push(`> Comando: \`${m.comando.accion}\` ${JSON.stringify(m.comando.parametros || {})}`, '')
  }
  return l.join('\n')
}

export function estadisticasACSV(historial) {
  const cab = 't_min,ros_m_min,hectareas,altura_llama_m,celdas_ardiendo,viento_kmh,humedad_pct'
  return [cab, ...historial.map((h) => [h.t, h.ros, h.ha, h.altura, h.ardiendo, h.viento_kmh, h.humedad].join(','))].join('\n') + '\n'
}

export function accionesACSV(acciones) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  return ['t_min,tipo,detalle,timestamp', ...acciones.map((a) => [a.t, a.tipo, esc(a.detalle), a.timestamp].join(','))].join('\n') + '\n'
}

export function gridAGeoJSON(snap) {
  const feats = []
  if (snap.perimetro?.length >= 3) feats.push({ type: 'Feature', properties: { tipo: 'perimetro', t_min: snap.tiempo_min, hectareas: snap.stats?.hectareas }, geometry: { type: 'Polygon', coordinates: [[...snap.perimetro.map(([la, lo]) => [lo, la]), [snap.perimetro[0][1], snap.perimetro[0][0]]]] } })
  if (snap.frente?.length) feats.push({ type: 'Feature', properties: { tipo: 'frente', t_min: snap.tiempo_min }, geometry: { type: 'MultiPoint', coordinates: snap.frente.map(([la, lo]) => [lo, la]) } })
  for (const r of snap.recursos || []) feats.push({ type: 'Feature', properties: { tipo: 'recurso', id: r.id, nombre: r.nombre, estado: r.estado, eta_min: r.eta_min }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } })
  for (const z of snap.retardantes || []) feats.push({ type: 'Feature', properties: { tipo: 'retardante', producto: z.producto, radio_m: z.radio_m }, geometry: { type: 'Point', coordinates: [z.lng, z.lat] } })
  return { type: 'FeatureCollection', features: feats }
}

export function gridAKML(snap) {
  const coords = (pts) => pts.map(([la, lo]) => `${lo},${la},0`).join(' ')
  const pm = []
  if (snap.perimetro?.length >= 3) pm.push(`<Placemark><name>Perímetro T+${snap.tiempo_min} (${(snap.stats?.hectareas ?? 0).toFixed(1)} ha)</name><styleUrl>#per</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords([...snap.perimetro, snap.perimetro[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`)
  if (snap.frente?.length) pm.push(`<Placemark><name>Frente activo</name><styleUrl>#fr</styleUrl><MultiGeometry>${snap.frente.map(([la, lo]) => `<Point><coordinates>${lo},${la},0</coordinates></Point>`).join('')}</MultiGeometry></Placemark>`)
  for (const r of snap.recursos || []) pm.push(`<Placemark><name>${r.nombre} (${r.estado})</name><Point><coordinates>${r.lng},${r.lat},0</coordinates></Point></Placemark>`)
  for (const z of snap.retardantes || []) pm.push(`<Placemark><name>Retardante ${z.producto} r=${z.radio_m} m</name><Point><coordinates>${z.lng},${z.lat},0</coordinates></Point></Placemark>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${snap.nombre ?? 'Simulación'} T+${snap.tiempo_min}</name>
<Style id="per"><LineStyle><color>ff0000ff</color><width>2</width></LineStyle><PolyStyle><color>550000ff</color></PolyStyle></Style>
<Style id="fr"><IconStyle><color>ff00a5ff</color><scale>0.6</scale></IconStyle></Style>
${pm.join('\n')}
</Document></kml>`
}

// KMZ = zip con doc.kml. Devuelve Uint8Array (Node) o Blob (navegador).
export async function gridAKMZ(snap) {
  const zip = new JSZip()
  zip.file('doc.kml', gridAKML(snap))
  return zip.generateAsync({ type: esNavegador ? 'blob' : 'uint8array', compression: 'DEFLATE' })
}

// PDF con jsPDF: portada, resumen, conversación, acciones, proyecciones y (opcional) imagen del mapa.
export function generarPDF({ estadisticas: e, mensajes = [], acciones = [], proyecciones = [], imagenMapa = null, titulo = null }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 15
  let y = 0
  const salto = (h = 6) => { y += h; if (y > 280) { doc.addPage(); y = 20 } }
  const texto = (t, tam = 10, estilo = 'normal') => { doc.setFontSize(tam); doc.setFont('helvetica', estilo); const lineas = doc.splitTextToSize(String(t), W - 2 * M); for (const l of lineas) { doc.text(l, M, y); salto(tam * 0.45) } }
  // Portada
  y = 60
  texto(titulo || `Análisis IA — ${e?.nombre ?? 'Simulación'}`, 22, 'bold'); salto(4)
  texto(`Simulación "${e?.nombre}", ${e?.minutos ?? 0} min simulados`, 12); texto(`Generado: ${new Date().toISOString()}`, 10); texto('CONAF Los Lagos — Simulador 3D v2.0 (solo frontend)', 10)
  doc.addPage(); y = 20
  texto('1. Resumen ejecutivo', 16, 'bold'); salto(2)
  texto(`Superficie: ${e?.hectareas} ha · ROS cabeza: ${e?.ros_cabeza} m/min · Altura llama: ${e?.altura_llama} m`)
  texto(`Viento: ${e?.vel_viento} km/h desde ${e?.dir_viento}° · Humedad combustible: ${e?.hum_combustible} % · Modelo: ${e?.modelo}`)
  texto(`Instalaciones amenazadas: ${(e?.amenazadas || []).filter((a) => a.amenazada).length} de ${(e?.amenazadas || []).length} monitoreadas`); salto(4)
  texto('2. Estado de la simulación', 16, 'bold'); salto(2)
  texto(e?.amenazadas_markdown || '- Sin información'); texto(e?.recursos_markdown || '- Sin información'); salto(4)
  texto(`3. Conversación (${mensajes.length} turnos, ${mensajes.reduce((s, m) => s + (m.tokens_utilizados || 0), 0)} tokens)`, 16, 'bold'); salto(2)
  for (const m of mensajes) { texto(`${m.rol === 'user' ? 'Despachador' : 'IA'} — ${m.timestamp}`, 10, 'bold'); texto(m.contenido.replace(/[*_#|`]/g, ''), 9); salto(2) }
  salto(4); texto(`4. Acciones ejecutadas (${acciones.length})`, 16, 'bold'); salto(2)
  for (const a of acciones) texto(`T+${a.t} min · ${a.tipo} · ${a.detalle} · ${a.timestamp}`, 9)
  if (proyecciones.length) { salto(4); texto('5. Proyecciones', 16, 'bold'); salto(2); for (const p of proyecciones) texto(`Viento ${p.cambios?.viento_kmh} km/h en ${p.minutos} min → ROS ${p.proyectado?.ros_cabeza} m/min, ${p.proyectado?.hectareas} ha (actual ${p.actual?.hectareas} ha)`, 9) }
  if (imagenMapa) { doc.addPage(); y = 20; texto('6. Mapa: perímetro, frente, recursos', 16, 'bold'); try { doc.addImage(imagenMapa, 'PNG', M, y + 2, W - 2 * M, (W - 2 * M) * 0.6) } catch { texto('(no se pudo incrustar la imagen)') } }
  salto(6); texto('Anexo: recomendaciones del momento', 12, 'bold'); texto('Ver último mensaje de la IA en la conversación.', 9)
  return doc
}

export function pdfABytes(doc) {
  return new Uint8Array(doc.output('arraybuffer'))
}

// Descarga en navegador (no hace nada en Node).
export function descargar(nombre, contenido, mime = 'application/octet-stream') {
  if (!esNavegador) return false
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}
