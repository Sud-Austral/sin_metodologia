// Equivalente cliente de: POST /api/v1/despacho/desplegar
// Contrato original: {recurso_id, lat, lng} -> despliega brigada, actualiza grid
import { estado } from './simEstado.js'
import { haversineKm } from '../motores/geo.js'

export async function despachoDesplegar({ recursoId, destinoLat, destinoLng, destinoNombre } = {}) {
  if (!recursoId) throw new Error('despachoDesplegar: recursoId es obligatorio')
  let recurso = estado.recursos.find((r) => r.id === recursoId)
  if (!recurso) {
    recurso = { id: recursoId, tipo: 'brigada', estado: 'disponible', lat: estado.lat, lng: estado.lng }
    estado.recursos.push(recurso)
  }
  const lat = destinoLat ?? estado.lat
  const lng = destinoLng ?? estado.lng
  const distanciaKm = haversineKm(recurso.lat, recurso.lng, lat, lng)
  const velocidadKmh = recurso.tipo === 'helicoptero' ? 180 : recurso.tipo === 'excavadora' ? 15 : 25
  const etaMin = (distanciaKm / velocidadKmh) * 60

  recurso.estado = 'en_transito'
  recurso.destino = { lat, lng, nombre: destinoNombre || null }
  recurso.etaMin = Number(etaMin.toFixed(1))

  return {
    recursoId: recurso.id,
    tipo: recurso.tipo,
    destino: recurso.destino,
    distanciaKm: Number(distanciaKm.toFixed(2)),
    etaMin: recurso.etaMin,
    estado: recurso.estado,
  }
}
