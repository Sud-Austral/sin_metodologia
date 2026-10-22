// Motor de escena Three.js: terreno + vegetación + ciudad + fuego + recursos, loop de render
// desacoplado del worker KITRAL (tick cada TICK_INTERVAL frames), picking de celdas y captura PNG.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Terreno } from './Terreno.js'
import { Vegetacion } from './Vegetacion.js'
import { Ciudad } from './Ciudad.js'
import { Fuego } from './Fuego.js'
import { Recursos } from './Recursos.js'
import { celdaALatLng } from '../motores/ca_propagacion.js'

export const TICK_INTERVAL = 10

export class Escena3D {
  constructor(container) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = false
    container.appendChild(this.renderer.domElement)
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0b0f16)
    this.scene.fog = new THREE.Fog(0x0b0f16, 2500, 7000)
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 1, 20000)
    this.camera.position.set(0, 1400, 1900)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI / 2 - 0.03; this.controls.maxDistance = 9000
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a2418, 0.9))
    const sol = new THREE.DirectionalLight(0xfff1d6, 1.4); sol.position.set(-1200, 1800, 600); this.scene.add(sol)
    this.raycaster = new THREE.Raycaster()
    this.frame = 0; this.fps = 0; this._fpsAcc = 0; this._fpsT = performance.now()
    this.onTickRequest = null; this.onClickCelda = null; this.modoClick = null
    this.reloj = new THREE.Clock()
    this._onResize = () => this.resize(); window.addEventListener('resize', this._onResize)
    this._onClick = (e) => this.click(e); this.renderer.domElement.addEventListener('pointerdown', this._onClick)
    this.activo = true
    this.animar()
  }

  cargarEstado(est) {
    this.limpiar()
    this.est = est
    this.terreno = new Terreno(this.scene, est.grid, est.exageracion)
    this.vegetacion = new Vegetacion(this.scene, this.terreno, est.grid)
    this.ciudad = new Ciudad(this.scene, this.terreno, est.grid, est.ciudad)
    this.fuego = new Fuego(this.scene)
    this.recursos = new Recursos(this.scene, this.terreno, est.grid)
    this.actualizarGrid(est)
    this.actualizarRecursos(est)
    const ext = est.grid.ancho * est.grid.celda
    this.controls.target.set(0, 50, 0); this.camera.position.set(ext * 0.15, ext * 0.45, ext * 0.6)
  }

  limpiar() {
    for (const k of ['terreno', 'vegetacion', 'ciudad', 'fuego', 'recursos']) { if (this[k]) { this[k].dispose(); this[k] = null } }
  }

  actualizarGrid(est, amenazadas = null) {
    if (!this.terreno) return
    this.terreno.colorear(est.grid)
    this.vegetacion.actualizar(est.grid)
    this.fuego.actualizarSegunGrid(est.grid, this.terreno, est.grid.stats, { kmh: est.viento_kmh, dir: est.viento_dir }, est.exageracion)
    if (amenazadas) this.ciudad.marcarAmenazadas(amenazadas)
  }

  actualizarRecursos(est) { if (this.recursos) this.recursos.actualizar(est.recursos, est.retardantes, est.grid) }

  setExageracion(e) {
    if (!this.est) return
    this.est.exageracion = e
    this.terreno.setExageracion(e, this.est.grid)
    this.vegetacion.poblar(this.est.grid); this.vegetacion.actualizar(this.est.grid)
    this.ciudad.grid = this.est.grid; this.ciudad.construir(this.est.ciudad)
    this.actualizarRecursos(this.est)
  }

  click(e) {
    if (!this.modoClick || !this.terreno || e.button !== 0) return
    const r = this.renderer.domElement.getBoundingClientRect()
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(m, this.camera)
    const hit = this.raycaster.intersectObject(this.terreno.mesh)[0]
    if (!hit) return
    const g = this.est.grid
    const j = Math.round(hit.point.x / g.celda + (g.ancho - 1) / 2), i = Math.round(hit.point.z / g.celda + (g.alto - 1) / 2)
    const [lat, lng] = celdaALatLng(g, i, j)
    this.onClickCelda?.({ modo: this.modoClick, i, j, lat, lng })
  }

  animar() {
    if (!this.activo) return
    requestAnimationFrame(() => this.animar())
    this.frame++
    const dt = Math.min(0.1, this.reloj.getDelta())
    if (this.frame % TICK_INTERVAL === 0) this.onTickRequest?.()
    if (this.fuego) this.fuego.actualizar(dt)
    if (this.vegetacion) this.vegetacion.lod(this.camera)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this._fpsAcc++
    const now = performance.now()
    if (now - this._fpsT >= 1000) { this.fps = this._fpsAcc * 1000 / (now - this._fpsT); this._fpsAcc = 0; this._fpsT = now }
  }

  capturarPNG() { try { return this.renderer.domElement.toDataURL('image/png') } catch { return null } }
  resize() { const w = this.container.clientWidth, h = this.container.clientHeight; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h) }
  dispose() { this.activo = false; window.removeEventListener('resize', this._onResize); this.renderer.domElement.removeEventListener('pointerdown', this._onClick); this.limpiar(); this.renderer.dispose(); this.renderer.domElement.remove() }
}
