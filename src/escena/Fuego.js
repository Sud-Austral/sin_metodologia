// Fuego: GeneradorLlamas (bocanadas instanciadas con shader de la Sección 6.3),
// GeneradorHumo (partículas con turbulencia pseudo-Perlin) y brillo (luz puntual + rescoldos).
import * as THREE from 'three'
import { ESTADO } from '../motores/ca_propagacion.js'

const MAX_BOCANADAS = 40000
const MAX_HUMO = 1400
const BOCANADAS_POR_LENGUA = 5
const RESIDENCIA_MIN = 0.4

const VS_LLAMA = `
attribute vec3 iPos;
attribute vec2 iEsc;
attribute vec2 iFase;
attribute float iAlt;
varying vec2 vUv;
varying float vDist;
varying float vFase;
varying float vInt;
varying float vAlt;
uniform float uTiempo;
uniform vec2 uIncl;
void main() {
  vUv = uv;
  vFase = iFase.x + uTiempo * 2.0;
  vInt = iFase.y;
  vAlt = iAlt;
  vec3 der = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 arr = vec3(0.0, 1.0, 0.0);
  float osc = 0.08 * sin(uTiempo * 7.0 + iFase.x * 9.0);
  vec3 p = iPos + der * (position.x * iEsc.x * (1.0 + osc)) + arr * ((position.y + 0.5) * iEsc.y);
  p.xz += uIncl * (position.y + 0.5) * iEsc.y; // inclinación por viento
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`

const FS_LLAMA = `
precision mediump float;
varying vec2 vUv;
varying float vDist;
varying float vFase;
varying float vInt;
varying float vAlt;
uniform float uCerca, uLejos;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float ang = atan(d.y, d.x);
  float bulto = 1.0
    + 0.30 * sin(ang * 3.0 + vFase * 2.3)
    + 0.18 * sin(ang * 5.0 - vFase * 3.7)
    + 0.10 * sin(ang * 9.0 + vFase * 5.1);
  float rr = length(vec2(d.x, d.y * 0.78)) / max(0.35, bulto);
  float i = smoothstep(1.0, 0.12, rr);
  i *= i;
  i *= 0.72 + 0.28 * sin(vFase * 6.1 + r * 5.0);
  i *= 1.0 - vAlt * 0.72;
  if (i < 0.012) discard;
  vec3 col = mix(vec3(1.0, 0.78, 0.34), vec3(1.0, 0.38, 0.06), smoothstep(0.0, 0.30, vAlt));
  col = mix(col, vec3(0.66, 0.10, 0.01), smoothstep(0.40, 1.0, vAlt));
  float niebla = 1.0 - clamp((vDist - uCerca) / (uLejos - uCerca), 0.0, 0.72);
  gl_FragColor = vec4(col * i * vInt * niebla * 0.95, 1.0);
}`

export class GeneradorLlamas {
  constructor(scene, maxBocanadas = MAX_BOCANADAS) {
    this.scene = scene; this.maxBocanadas = maxBocanadas
    this.bocanadas = []
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(maxBocanadas * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.iEsc = new THREE.InstancedBufferAttribute(new Float32Array(maxBocanadas * 2), 2).setUsage(THREE.DynamicDrawUsage)
    this.iFase = new THREE.InstancedBufferAttribute(new Float32Array(maxBocanadas * 2), 2).setUsage(THREE.DynamicDrawUsage)
    this.iAlt = new THREE.InstancedBufferAttribute(new Float32Array(maxBocanadas), 1).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iEsc', this.iEsc); geo.setAttribute('iFase', this.iFase); geo.setAttribute('iAlt', this.iAlt)
    geo.instanceCount = 0
    this.geometry = geo
    this.material = new THREE.ShaderMaterial({ vertexShader: VS_LLAMA, fragmentShader: FS_LLAMA, uniforms: { uCerca: { value: 200 }, uLejos: { value: 2500 }, uTiempo: { value: 0 }, uIncl: { value: new THREE.Vector2(0, 0) } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  // frente: lista de posiciones mundo (Vector3) de celdas ardiendo; ros m/min; alturaLlama m; viento {kmh, dir}
  emitirLengua(frente, ros, altura_llama, intensidad, viento, exageracion = 1) {
    const paso_lengua = 1.5
    const profundidad = Math.max(2, ros * RESIDENCIA_MIN * 10)
    const h = Math.max(1.5, altura_llama) * exageracion
    const dir = ((viento.dir + 180) % 360) * Math.PI / 180
    for (const pt of frente) {
      for (let b = 0; b < BOCANADAS_POR_LENGUA; b++) {
        const fase = b / BOCANADAS_POR_LENGUA
        const dist_fondo = profundidad * fase
        const offset_frente = (Math.random() - 0.5) * paso_lengua * 2
        const escala = 0.8 + Math.random() * 0.4
        this.bocanadas.push({
          x: pt.x + Math.sin(dir) * dist_fondo + offset_frente, y: pt.y + h * fase * 0.3, z: pt.z - Math.cos(dir) * dist_fondo + offset_frente * 0.5,
          escala, fase: Math.random() * Math.PI, intensidad, altura_relativa: fase, altura: h * (0.6 + fase * 0.6), tiempo_vida: 0.4 + Math.random() * 0.3,
        })
      }
    }
    if (this.bocanadas.length > this.maxBocanadas) this.bocanadas = this.bocanadas.slice(this.bocanadas.length - this.maxBocanadas)
    this.material.uniforms.uIncl.value.set(Math.sin(dir) * Math.min(0.9, viento.kmh / 40), -Math.cos(dir) * Math.min(0.9, viento.kmh / 40))
  }

  actualizar(dt, tiempo) {
    this.bocanadas = this.bocanadas.filter((b) => { b.tiempo_vida -= dt; return b.tiempo_vida > 0 })
    this.material.uniforms.uTiempo.value = tiempo
    this.updateInstances()
  }

  updateInstances() {
    const n = Math.min(this.bocanadas.length, this.maxBocanadas)
    for (let k = 0; k < n; k++) {
      const b = this.bocanadas[k]
      this.iPos.setXYZ(k, b.x, b.y, b.z)
      this.iEsc.setXY(k, b.altura * 0.55 * b.escala, b.altura * b.escala)
      this.iFase.setXY(k, b.fase, b.intensidad)
      this.iAlt.setX(k, b.altura_relativa)
    }
    this.geometry.instanceCount = n
    this.iPos.needsUpdate = true; this.iEsc.needsUpdate = true; this.iFase.needsUpdate = true; this.iAlt.needsUpdate = true
  }

  dispose() { this.scene.remove(this.mesh); this.geometry.dispose(); this.material.dispose() }
}

function texturaHumo() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(90,85,80,0.55)'); grad.addColorStop(1, 'rgba(60,60,60,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// Ruido pseudo-Perlin barato (suma de senos) en [0,1].
export function perlin(x, y, t) {
  return 0.5 + 0.25 * Math.sin(x * 1.7 + t) * Math.cos(y * 1.3 - t * 0.7) + 0.25 * Math.sin((x + y) * 0.9 + t * 1.9)
}

export class GeneradorHumo {
  constructor(scene, max = MAX_HUMO) {
    this.scene = scene; this.max = max; this.particulas = []
    this.geo = new THREE.BufferGeometry()
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('position', this.pos)
    this.geo.setDrawRange(0, 0)
    this.mat = new THREE.PointsMaterial({ size: 60, map: texturaHumo(), transparent: true, depthWrite: false, opacity: 0.6, sizeAttenuation: true })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  emitirHumo(frente, altura_llama, viento, exageracion = 1) {
    const duracion_humo = 15 * 60
    const linea_base = Math.max(2, altura_llama) * 1.5 * exageracion
    const dir = ((viento.dir + 180) % 360) * Math.PI / 180
    const v = viento.kmh / 3.6
    for (const pt of frente) {
      if (this.particulas.length >= this.max) break
      for (let h = 0; h < 3; h++) {
        if (Math.random() > 0.25) continue
        this.particulas.push({ pos: new THREE.Vector3(pt.x, pt.y + linea_base + h * 50 * 0.2, pt.z), vel: new THREE.Vector3(Math.sin(dir) * v * 0.5, 1 + Math.random() * 0.5, -Math.cos(dir) * v * 0.5), edad: 0, duracion: duracion_humo * (0.3 + Math.random() * 0.4), escala: 50 + Math.random() * 30 })
      }
    }
  }

  actualizar(dt, time) {
    for (const p of this.particulas) {
      p.edad += dt
      if (p.edad > p.duracion) continue
      const ruido = perlin(p.pos.x * 0.01, p.pos.y * 0.01, time * 0.1)
      p.vel.x += (ruido - 0.5) * 0.1
      p.vel.y -= 0.0005 * dt
      p.pos.addScaledVector(p.vel, dt * 6)
    }
    this.particulas = this.particulas.filter((p) => p.edad <= p.duracion)
    // Culling: si excede, fade out más rápido (recorte de las más viejas)
    if (this.particulas.length > this.max) this.particulas.splice(0, this.particulas.length - this.max)
    const n = this.particulas.length
    for (let k = 0; k < n; k++) this.pos.setXYZ(k, this.particulas[k].pos.x, this.particulas[k].pos.y, this.particulas[k].pos.z)
    this.pos.needsUpdate = true
    this.geo.setDrawRange(0, n)
  }

  dispose() { this.scene.remove(this.points); this.geo.dispose(); this.mat.dispose() }
}

export class Fuego {
  constructor(scene) {
    this.scene = scene
    this.llamas = new GeneradorLlamas(scene)
    this.humo = new GeneradorHumo(scene)
    this.luz = new THREE.PointLight(0xff7a20, 0, 900, 1.2)
    scene.add(this.luz)
    this.frenteMundo = []
    this.tiempo = 0
  }

  // Llamado en cada tick del CA: recalcula las posiciones mundo del frente.
  actualizarSegunGrid(grid, terreno, stats, viento, exageracion) {
    const { ancho, ardiendo, state } = grid
    const pts = []
    const paso = Math.max(1, Math.ceil(ardiendo.length / 2500))
    for (let k = 0; k < ardiendo.length; k += paso) {
      const idx = ardiendo[k]
      if (state[idx] !== ESTADO.ARDIENDO) continue
      pts.push(terreno.celdaAMundo((idx / ancho) | 0, idx % ancho))
    }
    this.frenteMundo = pts
    this.stats = stats; this.viento = viento; this.exageracion = exageracion
    if (pts.length) {
      const c = pts[Math.floor(pts.length / 2)]
      this.luz.position.set(c.x, c.y + 30, c.z)
      this.luz.intensity = Math.min(6, 1 + pts.length / 100) * 400
    } else this.luz.intensity = 0
  }

  actualizar(dt) {
    this.tiempo += dt
    if (this.frenteMundo.length && this.stats) {
      const ros = this.stats.ros_cabeza || 1
      const alt = this.stats.altura_llama || 1.5
      const intensidad = Math.min(1.6, 0.7 + alt / 8)
      // Re-emitir una fracción del frente por frame para mantener parpadeo continuo
      const sub = this.frenteMundo.filter(() => Math.random() < 0.35)
      this.llamas.emitirLengua(sub, ros, alt, intensidad, this.viento, this.exageracion)
      if (Math.random() < 0.5) this.humo.emitirHumo(sub, alt, this.viento, this.exageracion)
    }
    this.llamas.actualizar(dt, this.tiempo)
    this.humo.actualizar(dt, this.tiempo)
    this.luz.intensity *= 0.95 + 0.1 * Math.random()
  }

  dispose() { this.llamas.dispose(); this.humo.dispose(); this.scene.remove(this.luz) }
}
