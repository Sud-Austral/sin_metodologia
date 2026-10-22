// Material de billboards instanciados (mira a cámara) compartido por vegetación y llamas.
import * as THREE from 'three'

export const VS_BILLBOARD = `
attribute vec3 iPos;
attribute vec2 iEsc;
attribute vec3 iCol;
varying vec2 vUv;
varying vec3 vCol;
varying float vDist;
void main() {
  vUv = uv;
  vCol = iCol;
  vec3 der = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 arr = vec3(0.0, 1.0, 0.0);
  vec3 p = iPos + der * (position.x * iEsc.x) + arr * ((position.y + 0.5) * iEsc.y);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`

export const FS_BILLBOARD = `
precision mediump float;
uniform sampler2D uTex;
uniform float uCerca, uLejos;
varying vec2 vUv;
varying vec3 vCol;
varying float vDist;
void main() {
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.35) discard;
  float niebla = 1.0 - clamp((vDist - uCerca) / (uLejos - uCerca), 0.0, 0.6);
  gl_FragColor = vec4(t.rgb * vCol * niebla, 1.0);
}`

// Textura procedimental de árbol/arbusto/pasto (no hay fotos en el repo).
export function texturaVegetacion(tipo) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128
  const g = c.getContext('2d')
  g.clearRect(0, 0, 64, 128)
  if (tipo === 'arbolado') {
    g.fillStyle = '#4a3120'; g.fillRect(28, 80, 8, 48)
    g.fillStyle = '#ffffff'
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(32, 6 + k * 18); g.lineTo(8 + k * 2, 50 + k * 18); g.lineTo(56 - k * 2, 50 + k * 18); g.closePath(); g.fill() }
  } else if (tipo === 'matorral') {
    g.fillStyle = '#ffffff'
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(14 + (k % 3) * 18, 90 + Math.floor(k / 3) * 18, 16, 0, Math.PI * 2); g.fill() }
  } else {
    g.strokeStyle = '#ffffff'; g.lineWidth = 3
    for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(8 + k * 8, 128); g.quadraticCurveTo(10 + k * 8 + (k % 2 ? 8 : -8), 90, 12 + k * 8, 60 + (k % 3) * 10); g.stroke() }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}

export function crearBillboards(max, textura, { cerca = 300, lejos = 2500 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = base.index
  geo.attributes.position = base.attributes.position
  geo.attributes.uv = base.attributes.uv
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3)
  const iEsc = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2)
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3)
  iPos.setUsage(THREE.DynamicDrawUsage); iEsc.setUsage(THREE.DynamicDrawUsage); iCol.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('iPos', iPos); geo.setAttribute('iEsc', iEsc); geo.setAttribute('iCol', iCol)
  geo.instanceCount = 0
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_BILLBOARD, fragmentShader: FS_BILLBOARD, uniforms: { uTex: { value: textura }, uCerca: { value: cerca }, uLejos: { value: lejos } }, transparent: false, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return { mesh, geo, iPos, iEsc, iCol }
}
