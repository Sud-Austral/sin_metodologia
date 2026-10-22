// Bench: ms por tick del motor CA real con grid 240×240 (celdas 13 m).
// Uso: node scripts/bench_tick.mjs [ticks]
import { initCA, tickCA, calcularSuperficieHa } from '../src/motores/ca_propagacion.js'
import os from 'node:os'

const N = parseInt(process.argv[2] || '120', 10)
let g = initCA(null, -41.42, -72.70, 240, 240, 13, null, { semilla: 3 })
const params = { ajusteROS: 0.7, curadoPasto: 85, factorSequia: 1.0 }
const tiempos = []
for (let k = 0; k < N; k++) {
  const t0 = performance.now()
  g = tickCA(g, g.tiempo_min, 22, 180, 0, 9, 5, params)
  tiempos.push(performance.now() - t0)
}
const ord = tiempos.slice().sort((a, b) => a - b)
const prom = tiempos.reduce((a, b) => a + b, 0) / N
const res = {
  grid: '240x240', celda_m: 13, ticks: N, dt_min: 5, tiempo_simulado_min: g.tiempo_min,
  ms_promedio: +prom.toFixed(3), ms_mediana: +ord[Math.floor(N / 2)].toFixed(3), ms_p95: +ord[Math.floor(N * 0.95)].toFixed(3), ms_max: +ord[N - 1].toFixed(3),
  hectareas_final: +calcularSuperficieHa(g).toFixed(2), celdas_ardiendo_final: g.ardiendo.length,
  cumple_100ms: ord[Math.floor(N * 0.95)] < 100,
  node: process.version, cpu: os.cpus()[0]?.model, fecha: new Date().toISOString(),
}
console.log(JSON.stringify(res, null, 2))
