// Ciudades OSM vía Overpass API, con cache en IndexedDB (7 días) y fallback sintético.
import { calcularBounds } from './descarga_dem.js'
import { cacheGet, cacheSet } from './db.js'
import { M_POR_GRADO_LAT } from '../motores/ca_propagacion.js'

export const URL_OVERPASS = 'https://overpass-api.de/api/interpreter'
export const ESPEJOS_OVERPASS = [URL_OVERPASS, 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const TTL_MS = 7 * 24 * 3600 * 1000
const TIMEOUT_ESPEJO_MS = 12000

export function consultaOverpass(bounds) {
  return `[out:json][timeout:25][bbox:${bounds.sur},${bounds.oeste},${bounds.norte},${bounds.este}];
(
  way["building"];
  way["highway"];
  node["amenity"];
  node["amenity"="fire_station"];
  node["amenity"="hospital"];
  node["amenity"="school"];
);
out geom;`
}

export const CRITICOS = { hospital: 'Hospital', school: 'Escuela', fire_station: 'Cuartel bomberos', clinic: 'Consultorio', kindergarten: 'Jardín infantil' }

// Normaliza la respuesta Overpass a { edificios, calles, servicios }
export function procesar_osm(data) {
  const edificios = [], calles = [], servicios = []
  for (const el of data.elements || []) {
    const tags = el.tags || {}
    if (el.type === 'way' && el.geometry) {
      const coords = el.geometry.map((g) => [g.lat, g.lon])
      if (tags.building) {
        const niveles = parseInt(tags['building:levels'] || '1', 10) || 1
        edificios.push({ id: el.id, coords, altura_m: niveles * 3.2, nombre: tags.name || null })
      } else if (tags.highway) {
        calles.push({ id: el.id, coords, tipo: tags.highway, nombre: tags.name || null })
      }
    } else if (el.type === 'node' && tags.amenity) {
      servicios.push({ id: el.id, lat: el.lat, lng: el.lon, tipo: tags.amenity, nombre: tags.name || CRITICOS[tags.amenity] || tags.amenity, critico: !!CRITICOS[tags.amenity] })
    }
  }
  return { edificios, calles, servicios }
}

export function distanciaM(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * M_POR_GRADO_LAT
  const dLng = (lng2 - lng1) * M_POR_GRADO_LAT * Math.cos((lat1 + lat2) / 2 * Math.PI / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

// Zonas críticas: buffer 500 m; alerta si cualquier punto del frente entra.
export function instalacionesAmenazadas(servicios, frente, bufferM = 500) {
  const out = []
  for (const s of servicios) {
    if (!s.critico) continue
    let min = Infinity
    for (const [lat, lng] of frente) { const d = distanciaM(s.lat, s.lng, lat, lng); if (d < min) min = d }
    out.push({ ...s, distancia_m: Math.round(min), amenazada: min <= bufferM })
  }
  return out.sort((a, b) => a.distancia_m - b.distancia_m)
}

// Ciudad sintética (fallback sin red): una villa con escuela, hospital y cuartel al norte del foco.
export function ciudadSintetica(lat, lng) {
  const dLat = 900 / M_POR_GRADO_LAT, dLng = 900 / (M_POR_GRADO_LAT * Math.cos(lat * Math.PI / 180))
  const edificios = [], calles = []
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    const la = lat + dLat + r * 0.00035, lo = lng - 0.0014 + c * 0.0004
    edificios.push({ id: `sb${r}${c}`, coords: [[la, lo], [la, lo + 0.00022], [la + 0.00018, lo + 0.00022], [la + 0.00018, lo]], altura_m: 3.2 + (r + c) % 3 * 3.2, nombre: null })
  }
  for (let r = 0; r <= 6; r++) calles.push({ id: `sc${r}`, coords: [[lat + dLat + r * 0.00035 - 0.00008, lng - 0.0016], [lat + dLat + r * 0.00035 - 0.00008, lng + 0.0018]], tipo: 'residential', nombre: `Calle ${r + 1}` })
  calles.push({ id: 'sacc', coords: [[lat - 0.002, lng - 0.0016], [lat + dLat, lng - 0.0016]], tipo: 'tertiary', nombre: 'Acceso Los Copihues' })
  const servicios = [
    { id: 'ss1', lat: lat + dLat + 0.0012, lng: lng + 0.0004, tipo: 'school', nombre: 'Escuela Pucatrihue', critico: true },
    { id: 'ss2', lat: lat + dLat + 0.0019, lng: lng - 0.0008, tipo: 'hospital', nombre: 'Posta rural', critico: true },
    { id: 'ss3', lat: lat + dLat + 0.0003, lng: lng + dLng, tipo: 'fire_station', nombre: 'Cuartel bomberos', critico: true },
  ]
  return { edificios, calles, servicios, fuente: 'sintetico' }
}

export async function cargarCiudad(lat, lng, radioKm, fetchImpl = globalThis.fetch) {
  const bounds = calcularBounds(lat, lng, radioKm)
  const clave = `osm:${lat.toFixed(3)}:${lng.toFixed(3)}:${radioKm}`
  const c = await cacheGet(clave).catch(() => null)
  if (c && Date.now() - c.fecha < TTL_MS) return { ...c.datos, fuente: 'cache' }
  const errores = []
  for (const url of ESPEJOS_OVERPASS) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctrl && setTimeout(() => ctrl.abort(), TIMEOUT_ESPEJO_MS)
    try {
      const resp = await fetchImpl(url, { method: 'POST', body: 'data=' + encodeURIComponent(consultaOverpass(bounds)), signal: ctrl?.signal })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const datos = procesar_osm(await resp.json())
      await cacheSet(clave, { datos, fecha: Date.now() }).catch(() => {})
      return { ...datos, fuente: 'overpass', espejo: url }
    } catch (e) {
      errores.push(`${url}: ${e.name === 'AbortError' ? `timeout ${TIMEOUT_ESPEJO_MS / 1000}s` : e.message}`)
    } finally { if (timer) clearTimeout(timer) }
  }
  console.warn('Overpass falló en todos los espejos, usando ciudad sintética:', errores.join(' | '))
  return { ...ciudadSintetica(lat, lng), error: errores.join(' | ') }
}
