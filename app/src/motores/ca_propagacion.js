// Motor de autómata celular (CA) de propagación de incendios, tipo
// KITRAL/Rothermel simplificado. Grid 240x240 celdas de 13 m (Sección 6.1
// del documento fuente). Diseñado para ejecutarse dentro de un Web Worker
// (ver kitral_worker.js) pero es JS puro, sin dependencias de DOM/worker,
// así que también es testeable directamente con Vitest en Node.
//
// Estados de celda: 0 = sin quemar, 1 = quemando, 2 = quemado/consumido.
import { obtenerModelo } from './kitral.js'
import { calcularROS } from './rothermel.js'

const SQRT2 = Math.SQRT2

// Offsets de los 8 vecinos: [dcol, drow]
const VECINOS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]

export const ESTADO = { SIN_QUEMAR: 0, QUEMANDO: 1, QUEMADO: 2 }

/**
 * Crea un grid CA nuevo.
 * @param {number} width ancho en celdas (240)
 * @param {number} height alto en celdas (240)
 * @param {number} cellSize tamaño de celda en metros (13)
 * @param {Uint8Array} fuelModel número de modelo KITRAL (1-13) por celda
 * @param {Float32Array} slopeX gradiente este-oeste (rise/run) por celda
 * @param {Float32Array} slopeY gradiente norte-sur (rise/run) por celda
 */
export function initCA(width, height, cellSize, fuelModel, slopeX, slopeY) {
  const n = width * height
  return {
    width,
    height,
    cellSize,
    fuelModel,
    slopeX: slopeX || new Float32Array(n),
    slopeY: slopeY || new Float32Array(n),
    state: new Uint8Array(n),
    progress: new Float32Array(n),
    tIgn: new Float32Array(n).fill(-1),
    burningList: [],
    tiempoMin: 0,
  }
}

/** Enciende una celda (row, col) al tiempo tiempoMin (minutos). */
export function ignitarCelda(grid, row, col, tiempoMin = 0) {
  const idx = row * grid.width + col
  if (grid.state[idx] === ESTADO.SIN_QUEMAR) {
    grid.state[idx] = ESTADO.QUEMANDO
    grid.tIgn[idx] = tiempoMin
    grid.burningList.push(idx)
  }
  return grid
}

/** Ignita el punto más cercano a (latIgn,lngIgn) usando un origen y escala conocidos (helper opcional). */
export function ignitarEnCentro(grid, tiempoMin = 0) {
  return ignitarCelda(grid, Math.floor(grid.height / 2), Math.floor(grid.width / 2), tiempoMin)
}

/**
 * Avanza la simulación `dt` minutos.
 * @param {object} grid grid CA (mutado in-place y retornado)
 * @param {number} tiempoMin tiempo actual simulado en minutos (antes de este tick)
 * @param {number} vientoKmh velocidad de viento en km/h
 * @param {number} vientoDir dirección hacia donde SOPLA el viento, en grados
 *        (0=Norte, 90=Este, 180=Sur, 270=Oeste), convención de bearing.
 * @param {number} humedadPct humedad de combustible fino, %
 * @param {number} dt paso de tiempo en minutos
 * @param {object} params { ajusteROS, curadoPasto, factorSequia }
 */
export function tickCA(grid, tiempoMin, vientoKmh, vientoDir, humedadPct, dt, params = {}) {
  const { width, height, cellSize, fuelModel, slopeX, slopeY, state, progress, tIgn } = grid
  const ajusteROS = params.ajusteROS ?? 1
  const curadoPasto = (params.curadoPasto ?? 100) / 100
  const factorSequia = params.factorSequia ?? 1
  const vientoDirRad = (vientoDir * Math.PI) / 180

  const nuevosIgnitados = []
  const burnoutIdx = []

  for (const idx of grid.burningList) {
    const row = Math.floor(idx / width)
    const col = idx % width

    for (const [dcol, drow] of VECINOS) {
      const ncol = col + dcol
      const nrow = row + drow
      if (ncol < 0 || ncol >= width || nrow < 0 || nrow >= height) continue
      const nidx = nrow * width + ncol
      if (state[nidx] !== ESTADO.SIN_QUEMAR) continue

      // Dirección unitaria del avance (este=+x, norte=+y)
      const dirX = dcol
      const dirY = -drow
      const largo = dcol !== 0 && drow !== 0 ? SQRT2 : 1
      const dist = cellSize * largo
      const uX = dirX / largo
      const uY = dirY / largo

      // Alineación del viento con la dirección de avance
      const bearingRad = Math.atan2(dirX, dirY) // 0 = norte
      const alineacion = Math.cos(bearingRad - vientoDirRad)
      const vientoEfectivo = vientoKmh * Math.max(0, alineacion)

      // Pendiente proyectada en la dirección de avance (%, positivo = subida)
      const slopeXAvg = (slopeX[idx] + slopeX[nidx]) / 2
      const slopeYAvg = (slopeY[idx] + slopeY[nidx]) / 2
      const pendientePct = (slopeXAvg * uX + slopeYAvg * uY) * 100

      const modeloNum = fuelModel[nidx]
      const modelo = obtenerModelo(modeloNum)
      const { ros } = calcularROS(modeloNum, vientoEfectivo, pendientePct, humedadPct)

      let rosAjustado = ros * ajusteROS * factorSequia
      if (modelo.categoria === 'pasto') rosAjustado *= curadoPasto
      if (grid.retardante) rosAjustado *= grid.retardante[nidx]

      progress[nidx] += rosAjustado * dt

      if (progress[nidx] >= dist && rosAjustado > 0) {
        state[nidx] = ESTADO.QUEMANDO
        tIgn[nidx] = tiempoMin + dt
        nuevosIgnitados.push(nidx)
      }
    }
  }

  // Burnout: celdas que llevan más que su tiempo de residencia quemando
  const tiempoFinal = tiempoMin + dt
  for (const idx of grid.burningList) {
    const modelo = obtenerModelo(grid.fuelModel[idx])
    if (tiempoFinal - tIgn[idx] >= modelo.residenciaMin) {
      state[idx] = ESTADO.QUEMADO
      burnoutIdx.push(idx)
    }
  }

  const burnoutSet = new Set(burnoutIdx)
  grid.burningList = grid.burningList.filter((idx) => !burnoutSet.has(idx)).concat(nuevosIgnitados)
  grid.tiempoMin = tiempoFinal

  return grid
}

/** Perímetro: celdas quemadas o quemando que lindan con al menos una celda sin quemar. */
export function gridAPerimetro(grid) {
  const { width, height, state } = grid
  const perimetro = []
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      if (state[idx] === ESTADO.SIN_QUEMAR) continue
      let esBorde = false
      for (const [dcol, drow] of VECINOS) {
        const ncol = col + dcol
        const nrow = row + drow
        if (ncol < 0 || ncol >= width || nrow < 0 || nrow >= height) {
          esBorde = true
          break
        }
        if (state[nrow * width + ncol] === ESTADO.SIN_QUEMAR) {
          esBorde = true
          break
        }
      }
      if (esBorde) perimetro.push([row, col])
    }
  }
  return perimetro
}

/** Frente activo: celdas quemando adyacentes a al menos una celda sin quemar. */
export function gridAFrente(grid) {
  const { width, height, state } = grid
  const frente = []
  for (const idx of grid.burningList) {
    const row = Math.floor(idx / width)
    const col = idx % width
    let activo = false
    for (const [dcol, drow] of VECINOS) {
      const ncol = col + dcol
      const nrow = row + drow
      if (ncol < 0 || ncol >= width || nrow < 0 || nrow >= height) continue
      if (state[nrow * width + ncol] === ESTADO.SIN_QUEMAR) {
        activo = true
        break
      }
    }
    if (activo) frente.push([row, col])
  }
  return frente
}

/** Superficie quemada (quemando + quemado) en hectáreas. */
export function calcularSuperficieHa(grid) {
  let n = 0
  for (let i = 0; i < grid.state.length; i++) {
    if (grid.state[i] !== ESTADO.SIN_QUEMAR) n++
  }
  const areaCeldaM2 = grid.cellSize * grid.cellSize
  return (n * areaCeldaM2) / 10000
}

/** ROS promedio del frente activo (m/min), ponderado simple. */
export function calcularROSFrente(grid, vientoKmh, vientoDir, humedadPct, params = {}) {
  const frente = gridAFrente(grid)
  if (frente.length === 0) return 0
  let suma = 0
  for (const [row, col] of frente) {
    const idx = row * grid.width + col
    const modeloNum = grid.fuelModel[idx]
    const { ros } = calcularROS(modeloNum, vientoKmh, 0, humedadPct)
    suma += ros * (params.ajusteROS ?? 1)
  }
  return suma / frente.length
}

/** Aplica retardante: reduce el ROS futuro en una zona (radio en celdas) marcando un multiplicador. */
export function aplicarRetardante(grid, rowCentro, colCentro, radioCeldas, factorReduccion = 0.33) {
  if (!grid.retardante) grid.retardante = new Float32Array(grid.state.length).fill(1)
  for (let row = Math.max(0, rowCentro - radioCeldas); row <= Math.min(grid.height - 1, rowCentro + radioCeldas); row++) {
    for (let col = Math.max(0, colCentro - radioCeldas); col <= Math.min(grid.width - 1, colCentro + radioCeldas); col++) {
      const d = Math.hypot(row - rowCentro, col - colCentro)
      if (d <= radioCeldas) {
        const idx = row * grid.width + col
        grid.retardante[idx] = Math.min(grid.retardante[idx], 1 - factorReduccion)
      }
    }
  }
  return grid
}
