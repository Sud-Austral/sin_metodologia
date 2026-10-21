// Medición REAL de ms/tick del motor CA 240x240 (celda 13 m), fuera de Vitest,
// para registrar un número reproducible en ejercicio/metadatos.json
// (mediciones.ms_por_tick_grid_240). Ejecutar con:
//   node ejercicio/bench_tick.mjs
import { performance } from 'node:perf_hooks'
import { initCA, tickCA, ignitarCelda, calcularSuperficieHa } from '../app/src/motores/ca_propagacion.js'

const WIDTH = 240
const HEIGHT = 240
const CELL = 13
const N = WIDTH * HEIGHT

// Fuel model pseudoaleatorio pero determinístico (seed fija) para reproducibilidad
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(42)

const fuelModel = new Uint8Array(N)
const slopeX = new Float32Array(N)
const slopeY = new Float32Array(N)
for (let i = 0; i < N; i++) {
  fuelModel[i] = 1 + Math.floor(rand() * 13)
  slopeX[i] = (rand() - 0.5) * 0.4
  slopeY[i] = (rand() - 0.5) * 0.4
}

const grid = initCA(WIDTH, HEIGHT, CELL, fuelModel, slopeX, slopeY)
ignitarCelda(grid, Math.floor(HEIGHT / 2), Math.floor(WIDTH / 2), 0)

const N_TICKS = 60
const tiempos = []
let tiempoMin = 0
for (let i = 0; i < N_TICKS; i++) {
  const t0 = performance.now()
  tickCA(grid, tiempoMin, 22, 90, 9, 5, { ajusteROS: 0.7, curadoPasto: 85, factorSequia: 1.0 })
  const t1 = performance.now()
  tiempos.push(t1 - t0)
  tiempoMin += 5
}

const avg = tiempos.reduce((a, b) => a + b, 0) / tiempos.length
const max = Math.max(...tiempos)
const min = Math.min(...tiempos)
const haFinal = calcularSuperficieHa(grid)

const resultado = {
  grid: `${WIDTH}x${HEIGHT}`,
  cellSize: CELL,
  n_ticks: N_TICKS,
  ms_por_tick_avg: Number(avg.toFixed(3)),
  ms_por_tick_max: Number(max.toFixed(3)),
  ms_por_tick_min: Number(min.toFixed(3)),
  hectareas_quemadas_final: Number(haFinal.toFixed(2)),
  celdas_quemando_final: grid.burningList.length,
  node_version: process.version,
  fecha: new Date().toISOString(),
}

console.log(JSON.stringify(resultado, null, 2))
