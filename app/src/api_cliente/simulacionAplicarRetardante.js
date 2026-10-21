// Equivalente cliente de: POST /api/v1/simulacion/aplicar-retardante
// Contrato original: {producto, volumen, zona} -> reduce ROS en el grid
import { aplicarRetardante } from '../motores/ca_propagacion.js'

/**
 * @param {object} opts
 * @param {object} opts.grid grid CA (si se corre sin worker) — opcional
 * @param {Worker} opts.worker worker con el grid — opcional (uno de los dos)
 */
export async function simulacionAplicarRetardante({
  producto = 'Phos-Chek',
  volumenLitros = 1200,
  row,
  col,
  radioCeldas = 5,
  grid = null,
  worker = null,
} = {}) {
  if (row == null || col == null) throw new Error('simulacionAplicarRetardante: row/col son obligatorios')
  const factorReduccion = Math.min(0.6, 0.15 + volumenLitros / 6000)

  if (grid) aplicarRetardante(grid, row, col, radioCeldas, factorReduccion)
  if (worker) worker.postMessage({ cmd: 'retardante', row, col, radioCeldas, factorReduccion })

  return {
    producto,
    volumenLitros,
    reduccionROSPct: Math.round(factorReduccion * 100),
    zona: { row, col, radioCeldas },
    duracionHoras: 4,
  }
}
