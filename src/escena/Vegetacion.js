// Vegetación: billboards instanciados por tipo (pasto, matorral, arbolado), densidad por clase,
// LOD por distancia (>200 m: silueta reducida) y oscurecimiento al quemarse.
import * as THREE from 'three'
import { crearBillboards, texturaVegetacion } from './billboard.js'
import { claseDeModelo } from '../motores/kitral.js'
import { ESTADO } from '../motores/ca_propagacion.js'

const MAX_POR_TIPO = { arbolado: 24000, matorral: 16000, pasto: 8000 }
const DENSIDAD = { arbolado: 0.55, matorral: 0.35, pasto: 0.12 } // instancias por celda
const COLOR_VIVO = { arbolado: [0.22, 0.42, 0.2], matorral: [0.45, 0.58, 0.28], pasto: [0.72, 0.68, 0.38] }
const COLOR_QUEMADO = [0.12, 0.1, 0.09]

export class Vegetacion {
  constructor(scene, terreno, grid) {
    this.scene = scene; this.terreno = terreno
    this.grupos = {}
    for (const tipo of ['arbolado', 'matorral', 'pasto']) {
      const b = crearBillboards(MAX_POR_TIPO[tipo], texturaVegetacion(tipo))
      this.grupos[tipo] = { ...b, celdas: [], n: 0 }
      scene.add(b.mesh)
    }
    this.poblar(grid)
  }

  poblar(grid) {
    const { ancho, alto, modelo } = grid
    let s = 1234
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    for (const g of Object.values(this.grupos)) { g.n = 0; g.celdas = [] }
    for (let i = 0; i < alto; i++) for (let j = 0; j < ancho; j++) {
      const k = i * ancho + j
      const cl = claseDeModelo(modelo[k])
      const tipo = cl === 1 ? 'pasto' : cl === 2 ? 'matorral' : 'arbolado'
      const g = this.grupos[tipo]
      if (rnd() > DENSIDAD[tipo] || g.n >= MAX_POR_TIPO[tipo]) continue
      const di = rnd() - 0.5, dj = rnd() - 0.5
      const p = this.terreno.celdaAMundo(i + di, j + dj)
      const altura = tipo === 'arbolado' ? 10 + rnd() * 10 : tipo === 'matorral' ? 2 + rnd() * 2 : 0.8 + rnd() * 0.6
      g.iPos.setXYZ(g.n, p.x, p.y, p.z)
      g.iEsc.setXY(g.n, altura * 0.5, altura)
      const c = COLOR_VIVO[tipo]
      g.iCol.setXYZ(g.n, c[0] * (0.85 + rnd() * 0.3), c[1] * (0.85 + rnd() * 0.3), c[2] * (0.85 + rnd() * 0.3))
      g.celdas.push(k); g.n++
    }
    for (const g of Object.values(this.grupos)) { g.geo.instanceCount = g.n; g.iPos.needsUpdate = true; g.iEsc.needsUpdate = true; g.iCol.needsUpdate = true }
    this.gridRef = grid
  }

  actualizar(grid) {
    if (grid.ancho !== this.gridRef?.ancho || grid.alto !== this.gridRef?.alto) { this.poblar(grid); return }
    const { state } = grid
    for (const g of Object.values(this.grupos)) {
      for (let n = 0; n < g.n; n++) {
        const s = state[g.celdas[n]]
        if (s === ESTADO.ARDIENDO || s === ESTADO.QUEMADO) {
          const col = g.iCol
          if (col.getX(n) > 0.15 || col.getY(n) > 0.15) col.setXYZ(n, COLOR_QUEMADO[0], COLOR_QUEMADO[1], COLOR_QUEMADO[2])
        }
      }
      g.iCol.needsUpdate = true
    }
  }

  // LOD: más allá de 200 m de la cámara, siluetas más pequeñas (atenuación por niebla ya en shader).
  lod(camera) {
    for (const g of Object.values(this.grupos)) { g.mesh.material.uniforms.uCerca.value = 200; g.mesh.material.uniforms.uLejos.value = Math.max(1200, camera.position.y * 6) }
  }

  dispose() { for (const g of Object.values(this.grupos)) { this.scene.remove(g.mesh); g.geo.dispose(); g.mesh.material.dispose() } }
}
