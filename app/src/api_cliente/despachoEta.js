// Función cliente INFERIDA (8va función; la Sección 8.3 lista 6 endpoints
// explícitos y la consigna pide completar "los que falten" a partir de los
// casos de uso). Calcula el ETA de un recurso a un destino sin desplegarlo
// todavía (usado por la IA para responder antes de ejecutar el comando).
// Contrato propuesto equivalente: GET /api/v1/despacho/eta?recurso_id=&lat=&lng=
import { estado } from './simEstado.js'
import { haversineKm } from '../motores/geo.js'

export function despachoEta({ recursoId, destinoLat, destinoLng } = {}) {
  const recurso = estado.recursos.find((r) => r.id === recursoId)
  if (!recurso) return { recursoId, etaMin: null, error: 'recurso no encontrado' }
  const lat = destinoLat ?? estado.lat
  const lng = destinoLng ?? estado.lng
  const distanciaKm = haversineKm(recurso.lat, recurso.lng, lat, lng)
  const velocidadKmh = recurso.tipo === 'helicoptero' ? 180 : recurso.tipo === 'excavadora' ? 15 : 25
  const etaMin = (distanciaKm / velocidadKmh) * 60
  return { recursoId, distanciaKm: Number(distanciaKm.toFixed(2)), etaMin: Number(etaMin.toFixed(1)) }
}
