// Web Worker KITRAL: ejecuta tickCA() fuera del hilo de render.
// Protocolo: init {elev, modelo, pend, ancho, alto, celda, lat0, lng0}; tick {state, tIgn, retard, retardHasta,
// ardiendo, tiempo_min, viento_kmh, viento_dir, humedad, dt, params}. Responde init_ok / tick_ok con arrays
// transferidos (sin copia) + perímetro, frente y hectáreas.
import { tickCA, gridAPerimetro, gridAFrente, calcularSuperficieHa, expandirGridSiNecesario, centroideFuego } from './ca_propagacion.js'

let base = null // arrays estáticos del grid (elev, modelo, pend) y geometría

self.onmessage = (evt) => {
  const d = evt.data
  if (d.cmd === 'init') {
    base = { elev: d.elev, modelo: d.modelo, pend: d.pend, ancho: d.ancho, alto: d.alto, celda: d.celda, lat0: d.lat0, lng0: d.lng0, expansiones: d.expansiones || 0 }
    self.postMessage({ tipo: 'init_ok', ancho: d.ancho, alto: d.alto })
    return
  }
  if (d.cmd === 'tick') {
    if (!base) { self.postMessage({ tipo: 'error', detalle: 'Worker sin init' }); return }
    const t0 = performance.now()
    let grid = { ...base, state: d.state, tIgn: d.tIgn, retard: d.retard, retardHasta: d.retardHasta, ardiendo: d.ardiendo, tiempo_min: d.tiempo_min, stats: {} }
    grid = tickCA(grid, d.tiempo_min, d.viento_kmh, d.viento_dir, d.pendiente ?? 0, d.humedad, d.dt, d.params || {})
    const anchoAntes = grid.ancho
    grid = expandirGridSiNecesario(grid)
    const expandido = grid.ancho !== anchoAntes
    if (expandido) base = { elev: grid.elev, modelo: grid.modelo, pend: grid.pend, ancho: grid.ancho, alto: grid.alto, celda: grid.celda, lat0: grid.lat0, lng0: grid.lng0, expansiones: grid.expansiones }
    const msg = {
      tipo: 'tick_ok', ms: performance.now() - t0,
      state: grid.state, tIgn: grid.tIgn, retard: grid.retard, retardHasta: grid.retardHasta, ardiendo: grid.ardiendo,
      tiempo_min: grid.tiempo_min, stats: grid.stats,
      perimetro: gridAPerimetro(grid), frente: gridAFrente(grid), hectareas: calcularSuperficieHa(grid), centroide: centroideFuego(grid),
      expandido, ancho: grid.ancho, alto: grid.alto,
      elev: expandido ? grid.elev : null, modelo: expandido ? grid.modelo : null, pend: expandido ? grid.pend : null,
    }
    const transfer = [grid.state.buffer, grid.tIgn.buffer, grid.retard.buffer, grid.retardHasta.buffer]
    self.postMessage(msg, transfer)
  }
}
