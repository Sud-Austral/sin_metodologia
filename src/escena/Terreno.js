// Terreno: malla desde DEM (13 m), colorizada por vegetación (4 tonos) y estado de quema.
import * as THREE from 'three'
import { ESTADO } from '../motores/ca_propagacion.js'
import { claseDeModelo } from '../motores/kitral.js'

const COLORES = {
  pasto: new THREE.Color(0xb9b06a),
  matorral: new THREE.Color(0x7a9a4e),
  arbolado: new THREE.Color(0x3d6b3a),
  roca: new THREE.Color(0x8d8d85),
  ardiendo: new THREE.Color(0xff5a1a),
  quemado: new THREE.Color(0x1c1612),
  barrera: new THREE.Color(0xd9c27a),
  retardante: new THREE.Color(0xc24d6b),
  agua: new THREE.Color(0x3a6fa8),
}

export class Terreno {
  constructor(scene, grid, exageracion = 1.5) {
    this.scene = scene
    this.exageracion = exageracion
    this.construir(grid)
  }

  construir(grid) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
    const { ancho, alto, celda, elev } = grid
    this.ancho = ancho; this.alto = alto; this.celda = celda
    let min = Infinity
    for (let i = 0; i < elev.length; i++) if (elev[i] < min) min = elev[i]
    this.elevMin = min
    const geo = new THREE.PlaneGeometry((ancho - 1) * celda, (alto - 1) * celda, ancho - 1, alto - 1)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < alto; i++) for (let j = 0; j < ancho; j++) {
      const k = i * ancho + j
      pos.setY(k, (elev[k] - min) * this.exageracion)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    const col = new Float32Array(ancho * alto * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    this.mesh.receiveShadow = true
    this.scene.add(this.mesh)
    this.colorear(grid)
  }

  // y del terreno en coordenadas de celda (i fila, j columna), interpolado.
  alturaEn(i, j) {
    const ii = Math.min(this.alto - 1, Math.max(0, i)), jj = Math.min(this.ancho - 1, Math.max(0, j))
    const i0 = Math.floor(ii), j0 = Math.floor(jj), i1 = Math.min(this.alto - 1, i0 + 1), j1 = Math.min(this.ancho - 1, j0 + 1)
    const e = this.grid.elev
    const fi = ii - i0, fj = jj - j0
    const h = e[i0 * this.ancho + j0] * (1 - fi) * (1 - fj) + e[i0 * this.ancho + j1] * (1 - fi) * fj + e[i1 * this.ancho + j0] * fi * (1 - fj) + e[i1 * this.ancho + j1] * fi * fj
    return (h - this.elevMin) * this.exageracion
  }

  celdaAMundo(i, j) {
    return new THREE.Vector3((j - (this.ancho - 1) / 2) * this.celda, this.alturaEn(i, j), (i - (this.alto - 1) / 2) * this.celda)
  }

  colorear(grid) {
    this.grid = grid
    if (grid.ancho !== this.ancho || grid.alto !== this.alto) { this.construir(grid); return }
    const col = this.mesh.geometry.attributes.color
    const { state, modelo, retard, pend } = grid
    const c = new THREE.Color()
    for (let k = 0; k < state.length; k++) {
      const s = state[k]
      if (s === ESTADO.ARDIENDO) c.copy(COLORES.ardiendo)
      else if (s === ESTADO.QUEMADO) c.copy(COLORES.quemado)
      else if (s === ESTADO.BARRERA) c.copy(COLORES.barrera)
      else if (s === ESTADO.AGUA) c.copy(COLORES.agua)
      else {
        const cl = claseDeModelo(modelo[k])
        c.copy(pend[k] > 0.6 ? COLORES.roca : cl === 1 ? COLORES.pasto : cl === 2 ? COLORES.matorral : COLORES.arbolado)
        if (retard[k] > 0) c.lerp(COLORES.retardante, 0.5)
        // sombreado leve por pendiente para relieve legible
        c.multiplyScalar(1 - Math.min(0.35, pend[k] * 0.4))
      }
      col.setXYZ(k, c.r, c.g, c.b)
    }
    col.needsUpdate = true
  }

  setExageracion(e, grid) { this.exageracion = e; this.construir(grid) }

  dispose() { if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose() } }
}
