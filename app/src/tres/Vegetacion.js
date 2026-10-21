// Vegetación: InstancedMesh de billboards simplificados (planos con color
// procedural, sin fotos reales -- Sección 5.2/8.1). Se subsamplea el grid
// para no exceder el presupuesto de GPU (documento fuente: máx 160,000
// instancias simultáneas).
import * as THREE from 'three'
import { MODELOS_KITRAL, numeroAIdModelo } from '../motores/kitral.js'

export function crearVegetacion(fuelModel, dem, width, height, cellSize, { paso = 2, maxInstancias = 160000 } = {}) {
  const posiciones = []
  for (let row = 0; row < height; row += paso) {
    for (let col = 0; col < width; col += paso) {
      posiciones.push({ row, col, idx: row * width + col })
      if (posiciones.length >= maxInstancias) break
    }
    if (posiciones.length >= maxInstancias) break
  }

  const geometry = new THREE.PlaneGeometry(cellSize * paso * 0.7, cellSize * paso * 1.2)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 })
  const mesh = new THREE.InstancedMesh(geometry, material, posiciones.length)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(posiciones.length * 3), 3)

  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const origenX = -(width * cellSize) / 2
  const origenZ = -(height * cellSize) / 2

  posiciones.forEach((p, i) => {
    const x = origenX + p.col * cellSize
    const z = origenZ + p.row * cellSize
    const y = (dem[p.idx] || 0) * 1.5
    dummy.position.set(x, y, z)
    dummy.rotation.y = Math.random() * Math.PI
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)

    const modelo = MODELOS_KITRAL[numeroAIdModelo(fuelModel[p.idx] || 2)]
    color.set(modelo.color)
    mesh.instanceColor.setXYZ(i, color.r, color.g, color.b)
  })

  mesh.userData = { posiciones, paso }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/** LOD simplificado: oculta vegetación lejana al pasar de cierta distancia de cámara. */
export function aplicarLOD(mesh, camera, distanciaMaxima = 400) {
  mesh.visible = camera.position.length() < distanciaMaxima * 3 // heurística simple, no por-instancia
}

/** Oscurece/apaga la vegetación de las celdas quemadas (Sección 8.1 Vegetacion.js). */
export function actualizarVegetacionQuemada(mesh, state, width) {
  const { posiciones } = mesh.userData
  const color = new THREE.Color('#2a2420')
  let cambios = false
  posiciones.forEach((p, i) => {
    if (state[p.idx] && state[p.idx] >= 1) {
      mesh.instanceColor.setXYZ(i, color.r, color.g, color.b)
      cambios = true
    }
  })
  if (cambios) mesh.instanceColor.needsUpdate = true
}
