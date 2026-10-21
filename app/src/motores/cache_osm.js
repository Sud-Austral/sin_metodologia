// Descarga de ciudades/infraestructura vía Overpass API (Sección 5.3), con
// cache en IndexedDB y fallback explícito si Overpass no responde (es
// público, gratuito y conocido por fallar o limitar -- verificado en este
// mismo ejercicio: ver ejercicio/EQUIVOCACIONES.md).

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export function construirQueryOverpass(bounds) {
  return `[out:json][timeout:20];(way["building"](${bounds.sur},${bounds.oeste},${bounds.norte},${bounds.este});way["highway"](${bounds.sur},${bounds.oeste},${bounds.norte},${bounds.este});node["amenity"](${bounds.sur},${bounds.oeste},${bounds.norte},${bounds.este});node["fire_station"](${bounds.sur},${bounds.oeste},${bounds.norte},${bounds.este});node["hospital"](${bounds.sur},${bounds.oeste},${bounds.norte},${bounds.este}););out geom;`
}

export function calcularBounds(lat, lng, radioKm) {
  const dLat = radioKm / 111
  const dLng = radioKm / (111 * Math.cos((lat * Math.PI) / 180))
  return {
    sur: lat - dLat,
    norte: lat + dLat,
    oeste: lng - dLng,
    este: lng + dLng,
  }
}

/** Procesa la respuesta cruda de Overpass a geometría simple consumible por Three.js. */
export function procesarOSM(data) {
  const edificios = []
  const calles = []
  const servicios = []
  if (!data || !Array.isArray(data.elements)) return { edificios, calles, servicios }

  for (const el of data.elements) {
    if (el.type === 'way' && el.tags?.building && el.geometry) {
      edificios.push({ id: el.id, puntos: el.geometry.map((p) => [p.lat, p.lon]) })
    } else if (el.type === 'way' && el.tags?.highway && el.geometry) {
      calles.push({ id: el.id, puntos: el.geometry.map((p) => [p.lat, p.lon]), tipo: el.tags.highway })
    } else if (el.type === 'node' && (el.tags?.amenity || el.tags?.fire_station || el.tags?.hospital)) {
      servicios.push({
        id: el.id,
        lat: el.lat,
        lon: el.lon,
        tipo: el.tags.fire_station ? 'bomberos' : el.tags.hospital ? 'hospital' : el.tags.amenity,
      })
    }
  }
  return { edificios, calles, servicios }
}

/** Escenario sintético mínimo usado como fallback cuando Overpass no responde. */
export function escenarioOSMSintetico(lat, lng) {
  return {
    edificios: [
      { id: 'synt-1', puntos: [[lat + 0.002, lng + 0.002], [lat + 0.0025, lng + 0.002], [lat + 0.0025, lng + 0.0025], [lat + 0.002, lng + 0.0025]] },
    ],
    calles: [{ id: 'synt-calle-1', puntos: [[lat, lng - 0.004], [lat, lng + 0.004]], tipo: 'secondary' }],
    servicios: [
      { id: 'synt-escuela', lat: lat + 0.0022, lon: lng + 0.0022, tipo: 'school' },
      { id: 'synt-hospital', lat: lat - 0.003, lon: lng - 0.001, tipo: 'hospital' },
    ],
    fuente: 'sintetico',
  }
}

/**
 * cargarCiudad: intenta Overpass real; si falla (timeout, 429, CORS, lo que
 * sea) cae al escenario sintético. Nunca lanza una excepción hacia arriba.
 */
export async function cargarCiudad(lat, lng, radioKm = 3, { timeoutMs = 8000 } = {}) {
  const bounds = calcularBounds(lat, lng, radioKm)
  const query = construirQueryOverpass(bounds)
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: query,
      signal: controller?.signal,
    })
    if (timer) clearTimeout(timer)
    if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`)
    const data = await resp.json()
    const procesado = procesarOSM(data)
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return { ...procesado, fuente: 'overpass', msCarga: t1 - t0, error: null }
  } catch (e) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return { ...escenarioOSMSintetico(lat, lng), msCarga: t1 - t0, error: e.message }
  }
}
