// Autómata celular KITRAL: grid de celdas de 13 m, propagación por tiempo de llegada
// (Huygens elíptico) con viento, pendiente local y humedad. Pensado para correr dentro
// de un Web Worker, pero no depende del DOM (también corre en Node para pruebas/bench).
import { calcularROS, rosDireccional, factorPendiente, alturaLlama, distanciaPavesas } from './rothermel.js'
import { clasificarVegetacion } from './kitral.js'

export const ESTADO = { SIN_QUEMAR: 0, ARDIENDO: 1, QUEMADO: 2, BARRERA: 3, AGUA: 4 }
export const M_POR_GRADO_LAT = 111320

const VECINOS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
]

export function calcularPendiente(dem, ancho, alto, celda) {
  // Gradiente 3x3 (Horn). Devuelve pendiente como fracción (rise/run).
  const pend = new Float32Array(ancho * alto)
  const at = (i, j) => dem[Math.min(alto - 1, Math.max(0, i)) * ancho + Math.min(ancho - 1, Math.max(0, j))]
  for (let i = 0; i < alto; i++) {
    for (let j = 0; j < ancho; j++) {
      const dzdx = (at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i, j - 1) - at(i + 1, j - 1)) / (8 * celda)
      const dzdy = (at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i - 1, j) - at(i - 1, j + 1)) / (8 * celda)
      pend[i * ancho + j] = Math.sqrt(dzdx * dzdx + dzdy * dzdy)
    }
  }
  return pend
}

// DEM sintético determinista (fallback cuando no hay Terrarium ni DEM local).
export function demSintetico(ancho, alto, celda, semilla = 1) {
  const dem = new Float32Array(ancho * alto)
  for (let i = 0; i < alto; i++) {
    for (let j = 0; j < ancho; j++) {
      const x = (j / ancho) * 6 + semilla
      const y = (i / alto) * 6 + semilla
      dem[i * ancho + j] = 120 + 90 * Math.sin(x * 1.3) * Math.cos(y * 0.9) + 40 * Math.sin(x * 3.1 + y * 2.2) + 0.9 * (alto - i) * celda / 13
    }
  }
  return dem
}

export function celdaALatLng(grid, i, j) {
  const lat = grid.lat0 + (grid.alto / 2 - i - 0.5) * grid.celda / M_POR_GRADO_LAT
  const lng = grid.lng0 + (j - grid.ancho / 2 + 0.5) * grid.celda / (M_POR_GRADO_LAT * Math.cos(grid.lat0 * Math.PI / 180))
  return [lat, lng]
}

export function latLngACelda(grid, lat, lng) {
  const i = Math.round(grid.alto / 2 - 0.5 - (lat - grid.lat0) * M_POR_GRADO_LAT / grid.celda)
  const j = Math.round(grid.ancho / 2 - 0.5 + (lng - grid.lng0) * M_POR_GRADO_LAT * Math.cos(grid.lat0 * Math.PI / 180) / grid.celda)
  return [i, j]
}

export function initCA(georaster, latIgn, lngIgn, ancho = 240, alto = 240, celda = 13, dem = null, opciones = {}) {
  const n = ancho * alto
  const elev = dem && dem.length === n ? Float32Array.from(dem) : demSintetico(ancho, alto, celda, opciones.semilla ?? 1)
  const pend = calcularPendiente(elev, ancho, alto, celda)
  let modelo
  if (georaster && georaster.modelo && georaster.modelo.length === n) modelo = Uint8Array.from(georaster.modelo)
  else if (opciones.modeloUniforme) modelo = new Uint8Array(n).fill(opciones.modeloUniforme)
  else modelo = clasificarVegetacion(elev, pend, ancho, alto, opciones.semilla ?? 7).modelo
  const grid = {
    ancho, alto, celda,
    lat0: opciones.lat0 ?? latIgn,
    lng0: opciones.lng0 ?? lngIgn,
    elev, pend, modelo,
    state: new Uint8Array(n),
    tIgn: new Float32Array(n).fill(Infinity),
    retard: new Float32Array(n), // fracción de reducción de ROS (0–1)
    retardHasta: new Float32Array(n), // minuto hasta el que dura el retardante
    tiempo_min: 0,
    ardiendo: [],
    expansiones: 0,
    stats: { ros_cabeza: 0, altura_llama: 0, hectareas: 0, celdas_ardiendo: 0, celdas_quemadas: 0 },
  }
  const [i, j] = latLngACelda(grid, latIgn, lngIgn)
  encenderCelda(grid, i, j, 0)
  return grid
}

export function encenderCelda(grid, i, j, t = grid.tiempo_min) {
  if (i < 0 || j < 0 || i >= grid.alto || j >= grid.ancho) return false
  const idx = i * grid.ancho + j
  if (grid.state[idx] !== ESTADO.SIN_QUEMAR) return false
  grid.state[idx] = ESTADO.ARDIENDO
  grid.tIgn[idx] = t
  grid.ardiendo.push(idx)
  return true
}

function residencia(modeloK) {
  if (modeloK <= 2) return 4
  if (modeloK <= 6) return 10
  return 20
}

export function tickCA(grid, tiempo_min, viento_kmh, viento_dir, pendiente, humedad, dt, params = {}) {
  const { ancho, alto, celda, state, tIgn, modelo, elev, retard, retardHasta } = grid
  const lluvia = params.precipitacion > 0
  const hum = lluvia ? 100 : humedad
  // Dirección hacia la que sopla el viento (viento_dir = de dónde viene, convención meteorológica).
  const dirSopla = ((viento_dir + 180) % 360) * Math.PI / 180
  // ROS de cabeza por modelo (pendiente 0), se corrige por pendiente local por par de celdas.
  const rosModelo = new Float32Array(14)
  for (let k = 1; k <= 13; k++) rosModelo[k] = calcularROS(k, viento_kmh, 0, hum, params)
  const pendBase = (pendiente ?? 0) / 100

  const subDt = Math.max(0.25, Math.min(1, dt))
  let t = tiempo_min
  const tFin = tiempo_min + dt
  let rosMax = 0
  let modeloCabeza = 2
  let semilla = (params.semilla ?? 11) + Math.floor(tiempo_min * 7)
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff }

  while (t < tFin - 1e-9) {
    const tSub = Math.min(tFin, t + subDt)
    const nuevos = []
    for (let a = 0; a < grid.ardiendo.length; a++) {
      const c = grid.ardiendo[a]
      if (state[c] !== ESTADO.ARDIENDO) continue
      const ci = (c / ancho) | 0
      const cj = c - ci * ancho
      for (let v = 0; v < 8; v++) {
        const ni = ci + VECINOS[v][0]
        const nj = cj + VECINOS[v][1]
        if (ni < 0 || nj < 0 || ni >= alto || nj >= ancho) continue
        const nIdx = ni * ancho + nj
        if (state[nIdx] !== ESTADO.SIN_QUEMAR) continue
        const dist = (VECINOS[v][0] !== 0 && VECINOS[v][1] !== 0) ? celda * Math.SQRT2 : celda
        // Bearing de propagación: desde c hacia n (x=este=dj, y=norte=-di)
        const bearing = Math.atan2(VECINOS[v][1], -VECINOS[v][0]) // rad desde norte, sentido horario
        const theta = bearing - dirSopla
        const slopePct = ((elev[nIdx] - elev[c]) / dist + pendBase) * 100
        let ros = rosDireccional(rosModelo[modelo[nIdx]], theta, viento_kmh) * factorPendiente(slopePct)
        if (retard[nIdx] > 0) {
          if (retardHasta[nIdx] > 0 && t > retardHasta[nIdx]) { retard[nIdx] = 0 } else ros *= (1 - retard[nIdx])
        }
        if (ros <= 1e-4) continue
        const tArr = Math.max(tIgn[c], t) + dist / ros
        if (tArr < tIgn[nIdx]) tIgn[nIdx] = tArr
        if (ros > rosMax) { rosMax = ros; modeloCabeza = modelo[nIdx] }
      }
      // Pavesas (spotting)
      if (params.pavesas && viento_kmh > 15 && rnd() < 0.002) {
        const h = alturaLlama(modelo[c], rosMax || rosModelo[modelo[c]])
        const d = distanciaPavesas(h, viento_kmh) / celda
        const pi = Math.round(ci - Math.cos(dirSopla) * d)
        const pj = Math.round(cj + Math.sin(dirSopla) * d)
        if (pi >= 0 && pj >= 0 && pi < alto && pj < ancho && state[pi * ancho + pj] === ESTADO.SIN_QUEMAR) {
          tIgn[pi * ancho + pj] = Math.min(tIgn[pi * ancho + pj], tSub)
        }
      }
    }
    // Ignición de celdas cuyo tiempo de llegada cayó dentro del sub-paso.
    const n = ancho * alto
    for (let idx = 0; idx < n; idx++) {
      if (state[idx] === ESTADO.SIN_QUEMAR && tIgn[idx] <= tSub) { state[idx] = ESTADO.ARDIENDO; nuevos.push(idx) }
    }
    // Extinción por residencia.
    const vivos = []
    for (let a = 0; a < grid.ardiendo.length; a++) {
      const c = grid.ardiendo[a]
      if (state[c] !== ESTADO.ARDIENDO) continue
      if (tSub - tIgn[c] >= residencia(modelo[c])) state[c] = ESTADO.QUEMADO
      else vivos.push(c)
    }
    for (const nv of nuevos) vivos.push(nv)
    grid.ardiendo = vivos
    t = tSub
  }
  grid.tiempo_min = tFin
  let quemadas = 0
  for (let idx = 0; idx < ancho * alto; idx++) if (state[idx] === ESTADO.QUEMADO) quemadas++
  grid.stats = {
    ros_cabeza: rosMax,
    altura_llama: rosMax > 0 ? alturaLlama(modeloCabeza, rosMax) : 0,
    modelo_cabeza: modeloCabeza,
    hectareas: calcularSuperficieHa(grid),
    celdas_ardiendo: grid.ardiendo.length,
    celdas_quemadas: quemadas,
  }
  return grid
}

export function calcularSuperficieHa(grid) {
  let c = 0
  const s = grid.state
  for (let i = 0; i < s.length; i++) if (s[i] === ESTADO.ARDIENDO || s[i] === ESTADO.QUEMADO) c++
  return c * grid.celda * grid.celda / 10000
}

function tieneVecinoSinQuemar(grid, idx) {
  const { ancho, alto, state } = grid
  const i = (idx / ancho) | 0
  const j = idx - i * ancho
  for (let v = 0; v < 8; v++) {
    const ni = i + VECINOS[v][0], nj = j + VECINOS[v][1]
    if (ni < 0 || nj < 0 || ni >= alto || nj >= ancho) return true
    if (state[ni * ancho + nj] === ESTADO.SIN_QUEMAR) return true
  }
  return false
}

// Frente: celdas ardiendo con al menos un vecino sin quemar. Devuelve [[lat,lng],...].
export function gridAFrente(grid) {
  const pts = []
  for (const idx of grid.ardiendo) {
    if (grid.state[idx] === ESTADO.ARDIENDO && tieneVecinoSinQuemar(grid, idx)) {
      pts.push(celdaALatLng(grid, (idx / grid.ancho) | 0, idx % grid.ancho))
    }
  }
  return pts
}

// Perímetro: celdas quemadas/ardiendo con vecino sin quemar, ordenadas por ángulo
// alrededor del centroide (anillo aproximado para KMZ/visualización).
export function gridAPerimetro(grid) {
  const { ancho, alto, state } = grid
  const celdas = []
  let ci = 0, cj = 0
  for (let idx = 0; idx < ancho * alto; idx++) {
    if ((state[idx] === ESTADO.ARDIENDO || state[idx] === ESTADO.QUEMADO) && tieneVecinoSinQuemar(grid, idx)) {
      const i = (idx / ancho) | 0, j = idx % ancho
      celdas.push([i, j]); ci += i; cj += j
    }
  }
  if (celdas.length === 0) return []
  ci /= celdas.length; cj /= celdas.length
  celdas.sort((a, b) => Math.atan2(a[0] - ci, a[1] - cj) - Math.atan2(b[0] - ci, b[1] - cj))
  return celdas.map(([i, j]) => celdaALatLng(grid, i, j))
}

export function centroideFuego(grid) {
  let ci = 0, cj = 0, n = 0
  const { ancho, alto, state } = grid
  for (let idx = 0; idx < ancho * alto; idx++) {
    if (state[idx] === ESTADO.ARDIENDO || state[idx] === ESTADO.QUEMADO) { ci += (idx / ancho) | 0; cj += idx % ancho; n++ }
  }
  if (!n) return celdaALatLng(grid, alto / 2, ancho / 2)
  return celdaALatLng(grid, ci / n, cj / n)
}

// Expande el grid (margen de celdas) si el fuego se acerca al borde. Las nuevas celdas
// heredan elevación del borde y modelo clasificado por elevación.
export function expandirGridSiNecesario(grid, margen = 6, crecimiento = 60) {
  const { ancho, alto, state } = grid
  let cerca = false
  for (const idx of grid.ardiendo) {
    const i = (idx / ancho) | 0, j = idx % ancho
    if (i < margen || j < margen || i >= alto - margen || j >= ancho - margen) { cerca = true; break }
  }
  if (!cerca) return grid
  const nA = ancho + 2 * crecimiento, nH = alto + 2 * crecimiento
  const copiar = (src, Ctor, relleno) => {
    const dst = new Ctor(nA * nH)
    if (relleno !== undefined) dst.fill(relleno)
    for (let i = 0; i < alto; i++) for (let j = 0; j < ancho; j++) dst[(i + crecimiento) * nA + j + crecimiento] = src[i * ancho + j]
    return dst
  }
  const elev = copiar(grid.elev, Float32Array)
  for (let i = 0; i < nH; i++) for (let j = 0; j < nA; j++) {
    if (i >= crecimiento && i < crecimiento + alto && j >= crecimiento && j < crecimiento + ancho) continue
    const si = Math.min(alto - 1, Math.max(0, i - crecimiento)), sj = Math.min(ancho - 1, Math.max(0, j - crecimiento))
    elev[i * nA + j] = grid.elev[si * ancho + sj]
  }
  const modelo = copiar(grid.modelo, Uint8Array)
  for (let i = 0; i < nH * nA; i++) if (modelo[i] === 0) modelo[i] = 3 + (i % 5)
  const nuevo = {
    ...grid, ancho: nA, alto: nH, elev, modelo,
    pend: calcularPendiente(elev, nA, nH, grid.celda),
    state: copiar(state, Uint8Array),
    tIgn: copiar(grid.tIgn, Float32Array, Infinity),
    retard: copiar(grid.retard, Float32Array),
    retardHasta: copiar(grid.retardHasta, Float32Array),
    ardiendo: grid.ardiendo.map((idx) => (((idx / ancho) | 0) + crecimiento) * nA + (idx % ancho) + crecimiento),
    expansiones: grid.expansiones + 1,
  }
  return nuevo
}

// Aplicar retardante en radio (m) alrededor de lat/lng: reduce ROS en `reduccion` durante `duracionMin`.
export function aplicarRetardanteGrid(grid, lat, lng, radioM, reduccion = 0.33, duracionMin = 240) {
  const [ci, cj] = latLngACelda(grid, lat, lng)
  const r = Math.ceil(radioM / grid.celda)
  let celdas = 0
  for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
    if (i < 0 || j < 0 || i >= grid.alto || j >= grid.ancho) continue
    if ((i - ci) * (i - ci) + (j - cj) * (j - cj) > r * r) continue
    const idx = i * grid.ancho + j
    if (grid.state[idx] !== ESTADO.SIN_QUEMAR) continue
    grid.retard[idx] = Math.max(grid.retard[idx], Math.min(0.95, reduccion))
    grid.retardHasta[idx] = grid.tiempo_min + duracionMin
    celdas++
  }
  return celdas
}

// Línea de control (barrera) de longitud L (m) centrada en lat/lng y orientada con bearing (grados).
export function construirLineaControl(grid, lat, lng, longitudM, bearingDeg = 90, anchoCeldas = 1) {
  const [ci, cj] = latLngACelda(grid, lat, lng)
  const pasos = Math.max(1, Math.round(longitudM / grid.celda))
  const b = bearingDeg * Math.PI / 180
  let celdas = 0
  for (let s = -pasos / 2; s <= pasos / 2; s++) {
    for (let w = 0; w < anchoCeldas; w++) {
      const i = Math.round(ci - Math.cos(b) * s + Math.sin(b) * w)
      const j = Math.round(cj + Math.sin(b) * s + Math.cos(b) * w)
      if (i < 0 || j < 0 || i >= grid.alto || j >= grid.ancho) continue
      const idx = i * grid.ancho + j
      if (grid.state[idx] === ESTADO.SIN_QUEMAR) { grid.state[idx] = ESTADO.BARRERA; celdas++ }
    }
  }
  return celdas
}

export function snapshotGrid(grid) {
  return {
    ancho: grid.ancho, alto: grid.alto, celda: grid.celda, lat0: grid.lat0, lng0: grid.lng0,
    tiempo_min: grid.tiempo_min, stats: { ...grid.stats },
    perimetro: gridAPerimetro(grid), frente: gridAFrente(grid), centroide: centroideFuego(grid),
  }
}
