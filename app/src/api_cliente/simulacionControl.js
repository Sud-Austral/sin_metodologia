// Equivalente cliente de: POST /api/v1/simulacion/control
// Contrato original: {accion: "pausar" | "reanudar" | "reiniciar"}
import { estado, reiniciarEstado } from './simEstado.js'

const ACCIONES_VALIDAS = ['pausar', 'reanudar', 'reiniciar']

export async function simulacionControl({ accion } = {}) {
  if (!ACCIONES_VALIDAS.includes(accion)) {
    throw new Error(`simulacionControl: acción desconocida "${accion}" (válidas: ${ACCIONES_VALIDAS.join(', ')})`)
  }
  if (accion === 'pausar') estado.pausado = true
  else if (accion === 'reanudar') estado.pausado = false
  else if (accion === 'reiniciar') reiniciarEstado()

  return { accion, pausado: estado.pausado, minutos: estado.minutos }
}
