// Recursos (brigadas, helicópteros, maquinaria) como sprites con etiqueta + ruta al destino,
// y zonas de retardante como discos translúcidos.
import * as THREE from 'three'
import { latLngACelda } from '../motores/ca_propagacion.js'
import { etiqueta } from './Ciudad.js'

const ICONO = { brigada: '🚒', helicoptero: '🚁', excavadora: '🚜', cisterna: '🚛', motobomba: '🧯' }
const COLOR = { DISPONIBLE: '#9ad', 'EN TRÁNSITO': '#ffb703', 'EN SITIO': '#5be37a' }

export class Recursos {
  constructor(scene, terreno, grid) {
    this.scene = scene; this.terreno = terreno; this.grid = grid
    this.grupo = new THREE.Group(); scene.add(this.grupo)
    this.sprites = new Map(); this.rutas = new Map(); this.discos = []
  }

  aMundo(lat, lng, dy = 0) {
    const [i, j] = latLngACelda(this.grid, lat, lng)
    const p = this.terreno.celdaAMundo(Math.min(this.grid.alto - 1, Math.max(0, i)), Math.min(this.grid.ancho - 1, Math.max(0, j)))
    p.y += dy; return p
  }

  actualizar(recursos, retardantes, grid) {
    this.grid = grid
    for (const r of recursos) {
      let s = this.sprites.get(r.id)
      const clave = `${r.estado}|${r.eta_min}`
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: etiqueta(r.id, COLOR[r.estado], ''), depthTest: false, transparent: true }))
        s.scale.set(70, 17, 1); s.userData.clave = ''
        this.grupo.add(s); this.sprites.set(r.id, s)
      }
      if (s.userData.clave !== clave) {
        s.material.map?.dispose()
        s.material.map = etiquetaRecurso(r); s.material.needsUpdate = true; s.userData.clave = clave
      }
      s.position.copy(this.aMundo(r.lat, r.lng, r.tipo === 'helicoptero' ? 120 : 14))
      let ruta = this.rutas.get(r.id)
      if (r.destino && r.estado === 'EN TRÁNSITO') {
        const pts = [this.aMundo(r.lat, r.lng, 6), this.aMundo(r.destino.lat, r.destino.lng, 6)]
        if (!ruta) { ruta = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffb703, dashSize: 12, gapSize: 8 })); this.grupo.add(ruta); this.rutas.set(r.id, ruta) }
        else ruta.geometry.setFromPoints(pts)
        ruta.computeLineDistances(); ruta.visible = true
      } else if (ruta) ruta.visible = false
    }
    // Discos de retardante
    while (this.discos.length < retardantes.length) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xd63a6e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }))
      d.rotation.x = -Math.PI / 2; this.grupo.add(d); this.discos.push(d)
    }
    retardantes.forEach((z, k) => { const d = this.discos[k]; d.position.copy(this.aMundo(z.lat, z.lng, 3)); d.scale.set(z.radio_m, z.radio_m, 1); d.visible = true })
    for (let k = retardantes.length; k < this.discos.length; k++) this.discos[k].visible = false
  }

  dispose() { this.scene.remove(this.grupo) }
}

function etiquetaRecurso(r) {
  const txt = `${ICONO[r.tipo] || '📍'} ${r.id} ${r.estado === 'EN TRÁNSITO' ? `ETA ${r.eta_min}'` : r.estado === 'EN SITIO' ? 'EN SITIO' : ''}`
  return etiqueta(txt, COLOR[r.estado] || '#fff', '')
}
