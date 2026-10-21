// Función cliente INFERIDA (no está literal en la Sección 8.3, que solo
// lista 6 endpoints explícitos) pero es necesaria para reproducir los
// Ejemplos 5 y 7 del documento fuente ("Guardá la estrategia actual" /
// "Ejecutar Plan C"). Contrato propuesto equivalente:
//   POST /api/v1/chat/guardar-estrategia {nombre, snapshot}
import { estado } from './simEstado.js'
import { guardarEstrategia } from '../db/indexeddb.js'

export async function chatGuardarEstrategia({ nombre } = {}) {
  const nombreFinal = nombre || `Plan ${estado.modelo} T=${estado.tiempoMin}`
  const snapshot = {
    tiempoMin: estado.tiempoMin,
    hectareas: estado.hectareas,
    ros: estado.ros,
    recursos: estado.recursos.map((r) => ({ id: r.id, estado: r.estado, destino: r.destino || null })),
    fecha: new Date().toISOString(),
  }
  try {
    const guardado = await guardarEstrategia(nombreFinal, snapshot)
    return { ok: true, nombre: nombreFinal, id: guardado.id, snapshot }
  } catch (e) {
    // IndexedDB no disponible (p.ej. Node) -> se documenta, no se rompe el flujo
    return { ok: false, nombre: nombreFinal, snapshot, error: e.message }
  }
}
