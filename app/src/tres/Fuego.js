// Fuego: llamas + humo reactivos al grid CA (Sección 6.3/8.1). Shaders
// simplificados respecto al documento fuente (que especifica GLSL mucho
// más elaborado); aquí se usan InstancedMesh con un shader reducido que
// igual produce bultos irregulares, color gradiente base->punta y
// parpadeo, billboard hacia cámara.
import * as THREE from 'three'

const VS_LLAMA = `
attribute float iFase;
attribute float iEscala;
varying vec2 vUv;
varying float vFase;
void main() {
  vUv = uv;
  vFase = iFase;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position * iEscala, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

const FS_LLAMA = `
precision mediump float;
varying vec2 vUv;
varying float vFase;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float bulto = 1.0 + 0.25 * sin(vFase * 3.0 + r * 6.0);
  float i = smoothstep(1.0, 0.15, r / bulto);
  i *= i;
  if (i < 0.02) discard;
  vec3 col = mix(vec3(1.0, 0.8, 0.3), vec3(0.75, 0.12, 0.02), d.y * 0.5 + 0.5);
  gl_FragColor = vec4(col * i, i);
}
`

export class GeneradorLlamas {
  constructor(scene, maxBocanadas = 4000) {
    this.scene = scene
    this.maxBocanadas = maxBocanadas
    const geometry = new THREE.PlaneGeometry(1, 1)
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS_LLAMA,
      fragmentShader: FS_LLAMA,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.mesh = new THREE.InstancedMesh(geometry, this.material, maxBocanadas)
    this.mesh.geometry.setAttribute('iFase', new THREE.InstancedBufferAttribute(new Float32Array(maxBocanadas), 1))
    this.mesh.geometry.setAttribute('iEscala', new THREE.InstancedBufferAttribute(new Float32Array(maxBocanadas).fill(1), 1))
    this.mesh.count = 0
    scene.add(this.mesh)
    this.tiempo = 0
  }

  /** Reconstruye las bocanadas desde las celdas "quemando" del grid. */
  actualizarDesdeGrid(frenteIdx, width, cellSize, dem, alturaLlamaM = 4) {
    const dummy = new THREE.Object3D()
    const origenX = -(width * cellSize) / 2
    const n = Math.min(frenteIdx.length, this.maxBocanadas)
    const faseAttr = this.mesh.geometry.attributes.iFase
    const escalaAttr = this.mesh.geometry.attributes.iEscala

    for (let i = 0; i < n; i++) {
      const idx = frenteIdx[i]
      const row = Math.floor(idx / width)
      const col = idx % width
      const x = origenX + col * cellSize
      const z = origenX + row * cellSize
      const y = ((dem && dem[idx]) || 0) * 1.5 + alturaLlamaM * 0.4
      dummy.position.set(x, y, z)
      dummy.scale.setScalar(alturaLlamaM)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
      faseAttr.setX(i, Math.random() * Math.PI * 2)
      escalaAttr.setX(i, cellSize * (0.8 + Math.random() * 0.4))
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    faseAttr.needsUpdate = true
    escalaAttr.needsUpdate = true
  }

  actualizar(dt) {
    this.tiempo += dt
  }
}

export class GeneradorHumo {
  constructor(scene, maxParticulas = 2000) {
    this.scene = scene
    this.maxParticulas = maxParticulas
    this.particulas = []
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxParticulas * 3), 3))
    const material = new THREE.PointsMaterial({ color: 0x888888, size: 8, transparent: true, opacity: 0.4, depthWrite: false })
    this.points = new THREE.Points(geometry, material)
    scene.add(this.points)
  }

  emitirDesdeFrente(frenteIdx, width, cellSize, dem, alturaBaseM = 6) {
    const origenX = -(width * cellSize) / 2
    for (const idx of frenteIdx) {
      if (this.particulas.length >= this.maxParticulas) break
      const row = Math.floor(idx / width)
      const col = idx % width
      const x = origenX + col * cellSize + (Math.random() - 0.5) * cellSize
      const z = origenX + row * cellSize + (Math.random() - 0.5) * cellSize
      const y = ((dem && dem[idx]) || 0) * 1.5 + alturaBaseM
      this.particulas.push({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3),
        edad: 0,
        duracion: 60 + Math.random() * 60,
      })
    }
  }

  actualizar(dt) {
    for (const p of this.particulas) {
      p.edad += dt
      p.pos.addScaledVector(p.vel, dt)
      p.vel.y -= 0.01 * dt
    }
    this.particulas = this.particulas.filter((p) => p.edad <= p.duracion)

    const posAttr = this.points.geometry.attributes.position
    for (let i = 0; i < this.maxParticulas; i++) {
      if (i < this.particulas.length) {
        const p = this.particulas[i]
        posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z)
      } else {
        posAttr.setXYZ(i, 0, -10000, 0) // ocultar fuera de vista
      }
    }
    posAttr.needsUpdate = true
  }
}
