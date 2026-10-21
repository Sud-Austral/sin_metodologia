// Ciudad: edificios 3D (BoxGeometry), calles (LineSegments) y servicios
// (sprites) a partir de los datos de cache_osm.js (reales de Overpass o
// del escenario sintético de fallback). Sección 5.3/8.1.
import * as THREE from 'three'

/**
 * proyectarLatLngALocal: convierte lat/lng a coordenadas locales en metros
 * relativas a un origen, usando una aproximación plana (válida para el
 * radio pequeño de este simulador, unos pocos km).
 */
export function proyectarLatLngALocal(lat, lng, origenLat, origenLng) {
  const mPorGradoLat = 111320
  const mPorGradoLng = 111320 * Math.cos((origenLat * Math.PI) / 180)
  const x = (lng - origenLng) * mPorGradoLng
  const z = (lat - origenLat) * mPorGradoLat
  return { x, z }
}

export function crearCiudad(osmData, origenLat, origenLng) {
  const grupo = new THREE.Group()
  grupo.userData.fuente = osmData.fuente
  grupo.userData.error = osmData.error || null

  const materialEdificio = new THREE.MeshStandardMaterial({ color: '#8a8a8f', roughness: 0.8 })
  for (const ed of osmData.edificios || []) {
    const puntos = ed.puntos.map(([lat, lon]) => proyectarLatLngALocal(lat, lon, origenLat, origenLng))
    if (puntos.length < 3) continue
    const ancho = Math.max(4, Math.hypot(puntos[1].x - puntos[0].x, puntos[1].z - puntos[0].z))
    const alto = 6 + Math.random() * 6
    const geometry = new THREE.BoxGeometry(ancho, alto, ancho)
    const mesh = new THREE.Mesh(geometry, materialEdificio)
    const cx = puntos.reduce((s, p) => s + p.x, 0) / puntos.length
    const cz = puntos.reduce((s, p) => s + p.z, 0) / puntos.length
    mesh.position.set(cx, alto / 2, cz)
    mesh.userData = { id: ed.id, tipo: 'edificio' }
    grupo.add(mesh)
  }

  const materialCalle = new THREE.LineBasicMaterial({ color: '#333333' })
  for (const calle of osmData.calles || []) {
    const puntos = calle.puntos.map(([lat, lon]) => {
      const { x, z } = proyectarLatLngALocal(lat, lon, origenLat, origenLng)
      return new THREE.Vector3(x, 0.1, z)
    })
    const geometry = new THREE.BufferGeometry().setFromPoints(puntos)
    const linea = new THREE.Line(geometry, materialCalle)
    linea.userData = { id: calle.id, tipo: 'calle' }
    grupo.add(linea)
  }

  const coloresServicio = { bomberos: '#ff3333', hospital: '#33aaff', school: '#ffcc33', default: '#33ff88' }
  for (const serv of osmData.servicios || []) {
    const { x, z } = proyectarLatLngALocal(serv.lat, serv.lon, origenLat, origenLng)
    const spriteMat = new THREE.SpriteMaterial({ color: coloresServicio[serv.tipo] || coloresServicio.default })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.scale.set(15, 15, 1)
    sprite.position.set(x, 8, z)
    sprite.userData = { id: serv.id, tipo: serv.tipo, esServicio: true }
    grupo.add(sprite)
  }

  return grupo
}

/** Zonas críticas: distancia del frente a cada servicio sensible (hospital/escuela/bomberos). */
export function calcularZonasCriticas(osmData, frenteLatLng, origenLat, origenLng, bufferM = 500) {
  const alertas = []
  for (const serv of osmData.servicios || []) {
    if (!['hospital', 'school', 'bomberos', 'fire_station'].includes(serv.tipo)) continue
    const { x: sx, z: sz } = proyectarLatLngALocal(serv.lat, serv.lon, origenLat, origenLng)
    let distanciaMin = Infinity
    for (const [lat, lng] of frenteLatLng) {
      const { x, z } = proyectarLatLngALocal(lat, lng, origenLat, origenLng)
      const d = Math.hypot(x - sx, z - sz)
      if (d < distanciaMin) distanciaMin = d
    }
    if (distanciaMin <= bufferM) {
      alertas.push({ servicio: serv.id, tipo: serv.tipo, distanciaM: Math.round(distanciaMin) })
    }
  }
  return alertas
}
