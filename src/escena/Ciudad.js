// Ciudad OSM: edificios (cajas instanciadas), calles (LineSegments) y servicios (sprites con etiqueta).
import * as THREE from 'three'
import { latLngACelda } from '../motores/ca_propagacion.js'

export class Ciudad {
  constructor(scene, terreno, grid, ciudad) {
    this.scene = scene; this.terreno = terreno; this.grid = grid
    this.grupo = new THREE.Group()
    scene.add(this.grupo)
    this.construir(ciudad)
  }

  aMundo(lat, lng, dy = 0) {
    const [i, j] = latLngACelda(this.grid, lat, lng)
    const p = this.terreno.celdaAMundo(i, j)
    p.y += dy
    return p
  }

  dentro(lat, lng) {
    const [i, j] = latLngACelda(this.grid, lat, lng)
    return i >= 0 && j >= 0 && i < this.grid.alto && j < this.grid.ancho
  }

  construir(ciudad) {
    this.grupo.clear()
    this.servicios = []
    const edificios = (ciudad.edificios || []).filter((e) => e.coords.length >= 3 && this.dentro(e.coords[0][0], e.coords[0][1]))
    if (edificios.length) {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial({ color: 0xcfc6b8, shininess: 10 }), edificios.length)
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
      edificios.forEach((e, n) => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, cy = 0
        for (const [la, lo] of e.coords) { const w = this.aMundo(la, lo); minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x); minZ = Math.min(minZ, w.z); maxZ = Math.max(maxZ, w.z); cy += w.y }
        cy /= e.coords.length
        const h = e.altura_m * this.terreno.exageracion
        p.set((minX + maxX) / 2, cy + h / 2, (minZ + maxZ) / 2)
        s.set(Math.max(4, maxX - minX), h, Math.max(4, maxZ - minZ))
        m.compose(p, q, s); mesh.setMatrixAt(n, m)
      })
      mesh.castShadow = true
      this.grupo.add(mesh)
    }
    const pts = []
    for (const c of ciudad.calles || []) {
      for (let k = 0; k + 1 < c.coords.length; k++) {
        if (!this.dentro(c.coords[k][0], c.coords[k][1]) || !this.dentro(c.coords[k + 1][0], c.coords[k + 1][1])) continue
        const a = this.aMundo(c.coords[k][0], c.coords[k][1], 0.8), b = this.aMundo(c.coords[k + 1][0], c.coords[k + 1][1], 0.8)
        pts.push(a, b)
      }
    }
    if (pts.length) {
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      this.grupo.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x55504a, linewidth: 2 })))
    }
    for (const s of ciudad.servicios || []) {
      if (!this.dentro(s.lat, s.lng)) continue
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: etiqueta(s.nombre, s.critico ? '#ffd166' : '#dddddd', s.tipo), depthTest: false, transparent: true }))
      const p = this.aMundo(s.lat, s.lng, 25)
      sprite.position.copy(p); sprite.scale.set(90, 22, 1)
      sprite.userData = s
      this.grupo.add(sprite)
      if (s.critico) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(495, 500, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }))
        ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y - 20, p.z)
        this.grupo.add(ring)
        this.servicios.push({ s, ring, sprite })
      }
    }
  }

  marcarAmenazadas(amenazadas) {
    for (const { s, ring } of this.servicios) {
      const a = amenazadas.find((x) => x.id === s.id)
      ring.material.color.set(a && a.amenazada ? 0xff3333 : 0xffd166)
      ring.material.opacity = a && a.amenazada ? 0.8 : 0.35
    }
  }

  dispose() { this.scene.remove(this.grupo) }
}

const ICONOS = { hospital: '🏥', school: '🏫', fire_station: '🚒', clinic: '🏥', kindergarten: '🏫' }
export function etiqueta(texto, color = '#fff', tipo = '') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(10,10,14,0.72)'; g.fillRect(0, 0, 512, 128)
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(3, 3, 506, 122)
  g.fillStyle = color; g.font = 'bold 52px sans-serif'; g.textBaseline = 'middle'
  g.fillText(`${tipo ? (ICONOS[tipo] || '📍') + ' ' : ''}${texto}`.slice(0, 22), 18, 64)
  const t = new THREE.CanvasTexture(c)
  return t
}
