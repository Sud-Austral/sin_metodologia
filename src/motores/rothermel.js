// Rothermel simplificado: ROS base por modelo KITRAL, corregido por viento, pendiente
// y humedad del combustible fino. Unidades: ROS en m/min, viento km/h, pendiente en %.
import { obtenerModelo } from './kitral.js'

export function factorHumedad(hum, humExt) {
  if (hum >= humExt) return 0
  const x = hum / humExt
  // Decae de 1 (hum=0) a 0 (hum=humExt), con forma cóncava (tipo Rothermel eta_M).
  const f = 1 - 2.59 * x + 5.11 * x * x - 3.52 * x * x * x
  return Math.max(0, Math.min(1, f))
}

export function factorViento(vientoKmh) {
  const v = Math.max(0, vientoKmh)
  return 1 + 0.045 * Math.pow(v, 1.35)
}

export function factorPendiente(pendientePct) {
  // Pendiente a favor acelera; en contra reduce (asimétrico).
  const p = Math.max(-100, Math.min(100, pendientePct)) / 100
  return p >= 0 ? 1 + 5.275 * Math.pow(p, 2) * 2.4 : Math.max(0.2, 1 + p * 0.8)
}

// ROS máximo (cabeza) en m/min.
export function calcularROS(modeloKitral, vientoKmh, pendientePct, humedadCombustible, params = {}) {
  const m = obtenerModelo(modeloKitral)
  const ajuste = params.ajusteROS ?? 1.0
  const sequia = params.factorSequia ?? 1.0
  let base = m.ros_base
  if (m.clase === 1 && params.curadoPasto != null) base *= 0.4 + 0.6 * (params.curadoPasto / 100)
  const ros = base * factorHumedad(humedadCombustible, m.hum_ext) * factorViento(vientoKmh) * factorPendiente(pendientePct) * ajuste * sequia
  return Math.max(0, ros)
}

// Intensidad de Byram (kW/m) e altura de llama (m).
export function intensidadByram(modeloKitral, rosMmin) {
  const m = obtenerModelo(modeloKitral)
  const H = 18000 // kJ/kg
  return H * m.carga_kg_m2 * (rosMmin / 60) // kW/m
}

export function alturaLlama(modeloKitral, rosMmin) {
  const I = intensidadByram(modeloKitral, rosMmin)
  return 0.0775 * Math.pow(I, 0.46)
}

// Excentricidad de la elipse de Huygens según viento (Alexander 1985 simplificado).
export function excentricidad(vientoKmh) {
  const u = vientoKmh / 3.6
  const lb = Math.min(8, 1 + 0.4 * u)
  return Math.sqrt(1 - 1 / (lb * lb))
}

// ROS en una dirección dada (θ = ángulo entre dirección de propagación y viento, rad).
export function rosDireccional(rosCabeza, theta, vientoKmh) {
  const e = excentricidad(vientoKmh)
  return rosCabeza * (1 - e) / (1 - e * Math.cos(theta))
}

// Interpolación entre dos modelos (Sección 6.2, mejora propuesta).
export function calcularROS_interpolado(modelo1, modelo2, vientoKmh, pendientePct, hum, factor = 0.5, params) {
  const r1 = calcularROS(modelo1, vientoKmh, pendientePct, hum, params)
  const r2 = calcularROS(modelo2, vientoKmh, pendientePct, hum, params)
  return r1 * (1 - factor) + r2 * factor
}

// Distancia de pavesas (spotting) en metros, función empírica de altura de llama y viento.
export function distanciaPavesas(alturaLlamaM, vientoKmh) {
  return Math.max(0, 8 * alturaLlamaM * Math.sqrt(Math.max(0, vientoKmh) / 10))
}
