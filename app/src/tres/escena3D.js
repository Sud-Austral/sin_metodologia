// Orquestador de la escena Three.js (equivalente a escena3D.js del
// documento fuente). Crea renderer/cámara/luces, el terreno, la
// vegetación, el fuego y (opcionalmente) la ciudad; corre el loop de
// render y dispara ticks al Web Worker del CA cada TICK_INTERVAL frames
// (Sección 6.1), sin bloquear el render.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { crearTerreno, actualizarColorQuemado } from './Terreno.js'
import { crearVegetacion, actualizarVegetacionQuemada } from './Vegetacion.js'
import { GeneradorLlamas, GeneradorHumo } from './Fuego.js'
import { crearCiudad } from './Ciudad.js'

const TICK_INTERVAL = 10 // llamar al worker cada 10 frames, como en el documento fuente

export function crearEscena(canvas, { width, height, cellSize, dem, fuelModel }) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0a0a12')
  scene.fog = new THREE.Fog('#0a0a12', width * cellSize * 0.4, width * cellSize * 1.3)

  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight || 1, 1, 20000)
  camera.position.set(0, width * cellSize * 0.5, width * cellSize * 0.6)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600, false)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const sol = new THREE.DirectionalLight(0xffffff, 1.0)
  sol.position.set(500, 800, 300)
  scene.add(sol)

  const terreno = crearTerreno(dem, fuelModel, width, height, cellSize)
  scene.add(terreno)

  const vegetacion = crearVegetacion(fuelModel, dem, width, height, cellSize)
  scene.add(vegetacion)

  const llamas = new GeneradorLlamas(scene)
  const humo = new GeneradorHumo(scene)

  let ciudad = null

  let frameCounter = 0
  let animando = false
  let rafId = null
  let onTick = null // callback externo (recibe {state, perimetro, frente, hectareas, tiempoMin, msPorTick})

  function agregarCiudad(osmData, origenLat, origenLng) {
    if (ciudad) scene.remove(ciudad)
    ciudad = crearCiudad(osmData, origenLat, origenLng)
    scene.add(ciudad)
    return ciudad
  }

  function actualizarDesdeCA({ state, frente }) {
    actualizarColorQuemado(terreno, state, width, height)
    actualizarVegetacionQuemada(vegetacion, state, width)
    const frenteIdx = frente.map(([row, col]) => row * width + col)
    llamas.actualizarDesdeGrid(frenteIdx, width, cellSize, dem)
    humo.emitirDesdeFrente(frenteIdx, width, cellSize, dem)
  }

  function animate() {
    if (!animando) return
    frameCounter++
    controls.update()
    llamas.actualizar(0.016)
    humo.actualizar(0.3)

    if (frameCounter % TICK_INTERVAL === 0 && onTick) {
      onTick()
    }

    renderer.render(scene, camera)
    rafId = requestAnimationFrame(animate)
  }

  function iniciar() {
    if (animando) return
    animando = true
    animate()
  }

  function detener() {
    animando = false
    if (rafId) cancelAnimationFrame(rafId)
  }

  function redimensionar(w, h) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    terreno,
    vegetacion,
    llamas,
    humo,
    agregarCiudad,
    actualizarDesdeCA,
    iniciar,
    detener,
    redimensionar,
    set onTick(fn) {
      onTick = fn
    },
  }
}
