// Terreno: malla Three.js generada desde el DEM (real Terrarium o sintético
// de fallback), coloreada según el tipo de vegetación (4 tonos, Sección 8.1
// Terreno.js) y actualizable celda a celda cuando el fuego quema.
import * as THREE from 'three'
import { MODELOS_KITRAL, numeroAIdModelo } from '../motores/kitral.js'

const COLOR_QUEMADO = new THREE.Color('#1a1410')

/**
 * crearTerreno: construye un PlaneGeometry subdividido width x height,
 * desplaza cada vértice según el DEM (exagerado para que se note en
 * pantalla) y colorea por vertex color según el modelo de combustible.
 */
export function crearTerreno(dem, fuelModel, width, height, cellSize, exageracion = 1.5) {
  const geometry = new THREE.PlaneGeometry(width * cellSize, height * cellSize, width - 1, height - 1)
  geometry.rotateX(-Math.PI / 2)

  const posiciones = geometry.attributes.position
  const colores = new Float32Array(posiciones.count * 3)
  const color = new THREE.Color()

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      const vIdx = row * width + col // misma indexación: PlaneGeometry width segments = width-1 -> width vertices por fila
      posiciones.setY(vIdx, (dem[idx] || 0) * exageracion)

      const modelo = MODELOS_KITRAL[numeroAIdModelo(fuelModel[idx] || 2)]
      color.set(modelo.color)
      colores[vIdx * 3] = color.r
      colores[vIdx * 3 + 1] = color.g
      colores[vIdx * 3 + 2] = color.b
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colores, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData = { width, height, cellSize }
  return mesh
}

/** Actualiza el color de las celdas quemadas/quemando en la malla existente. */
export function actualizarColorQuemado(mesh, state, width, height) {
  const colores = mesh.geometry.attributes.color
  const color = new THREE.Color()
  for (let i = 0; i < state.length; i++) {
    if (state[i] === 0) continue
    if (state[i] === 1) color.set('#ff6a1a')
    else color.set(COLOR_QUEMADO.getHex())
    colores.setXYZ(i, color.r, color.g, color.b)
  }
  colores.needsUpdate = true
}
