// Carga de DEM real desde tiles Terrarium (AWS Open Data, 30 m) y remuestreo a 13 m.
// Fallback: DEM sintético (no hay DEM local grueso en este repo).
import { demSintetico, calcularPendiente, M_POR_GRADO_LAT } from '../motores/ca_propagacion.js'
import { cacheGet, cacheSet } from './db.js'

export const URL_TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

export function calcularBounds(lat, lng, radioKm) {
  const dLat = radioKm * 1000 / M_POR_GRADO_LAT
  const dLng = radioKm * 1000 / (M_POR_GRADO_LAT * Math.cos(lat * Math.PI / 180))
  return { norte: lat + dLat, sur: lat - dLat, este: lng + dLng, oeste: lng - dLng }
}

export function latLngATile(lat, lng, z) {
  const n = Math.pow(2, z)
  const x = (lng + 180) / 360 * n
  const latR = lat * Math.PI / 180
  const y = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n
  return { x, y }
}

export function tileALatLng(x, y, z) {
  const n = Math.pow(2, z)
  const lng = x / n * 360 - 180
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI
  return { lat, lng }
}

// Decodifica RGB Terrarium: elev = (R*256 + G + B/256) - 32768
export function decodificarRGB(pixels, width, height) {
  const elev = new Float32Array(width * height)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    elev[i / 4] = (r * 256 + g + b / 256) - 32768
  }
  return elev
}

// Remuestreo bilineal de una malla (srcW x srcH) a (dstW x dstH).
export function remuestrear(src, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH)
  for (let i = 0; i < dstH; i++) {
    const sy = (i / (dstH - 1)) * (srcH - 1)
    const y0 = Math.floor(sy), y1 = Math.min(srcH - 1, y0 + 1), fy = sy - y0
    for (let j = 0; j < dstW; j++) {
      const sx = (j / (dstW - 1)) * (srcW - 1)
      const x0 = Math.floor(sx), x1 = Math.min(srcW - 1, x0 + 1), fx = sx - x0
      const a = src[y0 * srcW + x0], b = src[y0 * srcW + x1], c = src[y1 * srcW + x0], d = src[y1 * srcW + x1]
      out[i * dstW + j] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    }
  }
  return out
}

async function descargarTile(z, x, y, fetchImpl) {
  const resp = await fetchImpl(URL_TERRARIUM(z, x, y))
  if (!resp.ok) throw new Error(`Terrarium ${z}/${x}/${y} HTTP ${resp.status}`)
  const blob = await resp.blob()
  const bmp = await createImageBitmap(blob)
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height })
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height)
  return { elev: decodificarRGB(data.data, bmp.width, bmp.height), w: bmp.width, h: bmp.height }
}

// Descarga el mosaico de tiles que cubre bounds en zoom z, lo une y recorta al bbox.
export async function fetchTerrariumTiles(bounds, z = 12, fetchImpl = globalThis.fetch) {
  const tl = latLngATile(bounds.norte, bounds.oeste, z)
  const br = latLngATile(bounds.sur, bounds.este, z)
  const x0 = Math.floor(tl.x), x1 = Math.floor(br.x), y0 = Math.floor(tl.y), y1 = Math.floor(br.y)
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1
  if (nx * ny > 16) throw new Error(`Demasiados tiles (${nx * ny}); reduce radio o zoom`)
  const tiles = await Promise.all([].concat(...Array.from({ length: ny }, (_, iy) => Array.from({ length: nx }, (_, ix) => descargarTile(z, x0 + ix, y0 + iy, fetchImpl).then((t) => ({ ...t, ix, iy }))))))
  const tw = tiles[0].w, th = tiles[0].h
  const W = nx * tw, H = ny * th
  const mosaico = new Float32Array(W * H)
  for (const t of tiles) for (let r = 0; r < th; r++) mosaico.set(t.elev.subarray(r * tw, (r + 1) * tw), (t.iy * th + r) * W + t.ix * tw)
  // recorte al bbox en coordenadas de píxel
  const px0 = Math.floor((tl.x - x0) * tw), py0 = Math.floor((tl.y - y0) * th)
  const px1 = Math.ceil((br.x - x0) * tw), py1 = Math.ceil((br.y - y0) * th)
  const cw = px1 - px0, ch = py1 - py0
  const rec = new Float32Array(cw * ch)
  for (let r = 0; r < ch; r++) rec.set(mosaico.subarray((py0 + r) * W + px0, (py0 + r) * W + px1), r * cw)
  return { elev: rec, w: cw, h: ch, z, tiles: nx * ny }
}

// API principal (Sección 5.1). Devuelve { dem: Float32Array(ancho*alto), pend, fuente, ms, ... }
export async function cargarDEM(lat, lng, radioKm, ancho = 240, alto = 240, celda = 13, opciones = {}) {
  const t0 = (globalThis.performance || Date).now()
  const bounds = calcularBounds(lat, lng, radioKm)
  const clave = `dem:${lat.toFixed(4)}:${lng.toFixed(4)}:${radioKm}:${ancho}x${alto}`
  const cacheado = await cacheGet(clave).catch(() => null)
  if (cacheado && cacheado.dem) {
    const dem = Float32Array.from(cacheado.dem)
    return { dem, pend: calcularPendiente(dem, ancho, alto, celda), fuente: 'cache', ms: (globalThis.performance || Date).now() - t0, bounds }
  }
  try {
    if (typeof createImageBitmap === 'undefined') throw new Error('Sin createImageBitmap (entorno sin DOM)')
    const raw = await fetchTerrariumTiles(bounds, opciones.zoom ?? 12, opciones.fetch)
    const dem = remuestrear(raw.elev, raw.w, raw.h, ancho, alto)
    await cacheSet(clave, { dem: Array.from(dem), fecha: Date.now() }).catch(() => {})
    return { dem, pend: calcularPendiente(dem, ancho, alto, celda), fuente: 'terrarium', tiles: raw.tiles, ms: (globalThis.performance || Date).now() - t0, bounds, resolucionOrigen_m: raw.w ? (radioKm * 2000) / raw.w : null }
  } catch (e) {
    console.warn('Terrarium falló, usando DEM sintético:', e.message)
    const dem = demSintetico(ancho, alto, celda, 1)
    return { dem, pend: calcularPendiente(dem, ancho, alto, celda), fuente: 'sintetico', error: e.message, ms: (globalThis.performance || Date).now() - t0, bounds, aviso: 'Usando relieve sintético, simulación es menos precisa' }
  }
}
