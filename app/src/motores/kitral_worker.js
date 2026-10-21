// Web Worker que aísla el tick del CA del hilo de render (Sección 6.1).
// Vite soporta `new Worker(new URL('./kitral_worker.js', import.meta.url), { type: 'module' })`.
import { initCA, tickCA, gridAPerimetro, gridAFrente, calcularSuperficieHa, ignitarCelda, aplicarRetardante } from './ca_propagacion.js'

let grid = null

self.onmessage = (evt) => {
  const data = evt.data
  const cmd = data.cmd

  if (cmd === 'init') {
    const { width, height, cellSize, fuelModel, slopeX, slopeY, filaIgnicion, colIgnicion } = data
    grid = initCA(width, height, cellSize, fuelModel, slopeX, slopeY)
    ignitarCelda(grid, filaIgnicion, colIgnicion, 0)
    self.postMessage({
      tipo: 'init_ok',
      hectareas: calcularSuperficieHa(grid),
      tiempoMin: grid.tiempoMin,
    })
    return
  }

  if (cmd === 'tick') {
    if (!grid) {
      self.postMessage({ tipo: 'error', error: 'grid no inicializado' })
      return
    }
    const t0 = performance.now()
    tickCA(grid, grid.tiempoMin, data.vientoKmh, data.vientoDir, data.humedad, data.dt, data.params || {})
    const msPorTick = performance.now() - t0

    self.postMessage({
      tipo: 'tick_ok',
      state: grid.state, // Uint8Array -> transferible
      perimetro: gridAPerimetro(grid),
      frente: gridAFrente(grid),
      hectareas: calcularSuperficieHa(grid),
      tiempoMin: grid.tiempoMin,
      msPorTick,
      nCeldasQuemando: grid.burningList.length,
    })
    return
  }

  if (cmd === 'retardante') {
    if (!grid) return
    aplicarRetardante(grid, data.row, data.col, data.radioCeldas, data.factorReduccion)
    self.postMessage({ tipo: 'retardante_ok' })
    return
  }

  if (cmd === 'reset') {
    grid = null
    self.postMessage({ tipo: 'reset_ok' })
  }
}
