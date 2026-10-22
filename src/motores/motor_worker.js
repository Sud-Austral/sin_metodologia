// Adaptador main-thread ↔ kitral_worker.js. El estado autoritativo vive en est.grid (main);
// el worker calcula el tick sobre copias y devuelve arrays transferidos. Mutaciones hechas en
// main mientras el tick está en vuelo (barreras, retardante, igniciones manuales) se fusionan.
import { ESTADO } from './ca_propagacion.js'
import { aplicarMeteo, moverRecursos } from '../estado/simulacion.js'

export function crearMotorWorker(est, { onTick = () => {}, onError = () => {} } = {}) {
  const worker = new Worker(new URL('./kitral_worker.js', import.meta.url), { type: 'module' })
  let enVuelo = false
  let listo = false
  let ultimoMs = 0
  let ticks = 0
  const medidas = []

  function init() {
    const g = est.grid
    listo = false
    worker.postMessage({ cmd: 'init', elev: g.elev, modelo: g.modelo, pend: g.pend, ancho: g.ancho, alto: g.alto, celda: g.celda, lat0: g.lat0, lng0: g.lng0, expansiones: g.expansiones })
  }

  worker.onmessage = (evt) => {
    const d = evt.data
    if (d.tipo === 'init_ok') { listo = true; return }
    if (d.tipo === 'error') { enVuelo = false; onError(d.detalle); return }
    if (d.tipo !== 'tick_ok') return
    const g = est.grid
    if (d.expandido) {
      est.grid = { ...g, ancho: d.ancho, alto: d.alto, elev: d.elev, modelo: d.modelo, pend: d.pend, state: d.state, tIgn: d.tIgn, retard: d.retard, retardHasta: d.retardHasta, ardiendo: d.ardiendo, tiempo_min: d.tiempo_min, stats: d.stats, expansiones: g.expansiones + 1 }
      est.eventos.push({ t: d.tiempo_min, tipo: 'expansion', detalle: `Grid expandido a ${d.ancho}×${d.alto}` })
    } else {
      // Fusionar mutaciones hechas en main durante el vuelo
      const n = g.state.length
      for (let i = 0; i < n; i++) {
        const sm = g.state[i]
        if (sm === ESTADO.BARRERA && d.state[i] === ESTADO.SIN_QUEMAR) d.state[i] = ESTADO.BARRERA
        else if (sm === ESTADO.ARDIENDO && d.state[i] === ESTADO.SIN_QUEMAR) { d.state[i] = ESTADO.ARDIENDO; d.tIgn[i] = g.tIgn[i]; d.ardiendo.push(i) }
        if (g.retard[i] > d.retard[i]) { d.retard[i] = g.retard[i]; d.retardHasta[i] = g.retardHasta[i] }
      }
      g.state = d.state; g.tIgn = d.tIgn; g.retard = d.retard; g.retardHasta = d.retardHasta; g.ardiendo = d.ardiendo
      g.tiempo_min = d.tiempo_min; g.stats = d.stats
    }
    const s = est.grid.stats
    est.historial.push({ t: est.grid.tiempo_min, ros: +s.ros_cabeza.toFixed(2), ha: +s.hectareas.toFixed(3), altura: +s.altura_llama.toFixed(2), ardiendo: s.celdas_ardiendo, viento_kmh: est.viento_kmh, humedad: est.humedad })
    ultimoMs = d.ms; ticks++; medidas.push(d.ms); if (medidas.length > 100) medidas.shift()
    enVuelo = false
    onTick({ perimetro: d.perimetro, frente: d.frente, centroide: d.centroide, hectareas: d.hectareas, ms: d.ms, expandido: d.expandido })
  }
  worker.onerror = (e) => { enVuelo = false; onError(e.message) }

  function tick(dt = est.dt) {
    if (!listo || enVuelo || est.pausado) return false
    aplicarMeteo(est)
    moverRecursos(est, dt)
    const g = est.grid
    enVuelo = true
    worker.postMessage({ cmd: 'tick', state: g.state.slice(), tIgn: g.tIgn.slice(), retard: g.retard.slice(), retardHasta: g.retardHasta.slice(), ardiendo: g.ardiendo.slice(), tiempo_min: g.tiempo_min, viento_kmh: est.viento_kmh, viento_dir: est.viento_dir, humedad: est.humedad, dt, params: { ...est.params, precipitacion: est.precipitacion } })
    return true
  }

  init()
  return {
    tick, reinit: init,
    get enVuelo() { return enVuelo }, get listo() { return listo }, get ultimoMs() { return ultimoMs }, get ticks() { return ticks },
    msPromedio: () => (medidas.length ? medidas.reduce((a, b) => a + b, 0) / medidas.length : 0),
    terminar: () => worker.terminate(),
  }
}
