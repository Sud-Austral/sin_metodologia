// Cálculo de velocidad de propagación (ROS) tipo Rothermel SIMPLIFICADO.
// No reproduce la ecuación completa de Rothermel (1972) con todos sus
// coeficientes de superficie/volumen y empaquetamiento; usa una forma
// reducida con 3 factores multiplicativos (viento, pendiente, humedad)
// sobre un ROS0 de referencia por modelo de combustible. Es "físicamente
// razonable" (orden de magnitud y tendencias correctas) pero NO es la
// calibración oficial KITRAL. Documentado en ejercicio/metadatos.json.
import { obtenerModelo } from './kitral.js'

const WIND_K = 0.07 // sensibilidad del viento (por km/h)
const WIND_MAX_FACTOR = 6.0
const SLOPE_K = 3.0 // sensibilidad de la pendiente (pendiente en fracción 0-1 => %/100)
const HUM_EXP = 1.5

/**
 * factorViento: 1 + WIND_K * U, saturado en WIND_MAX_FACTOR.
 * Si el viento sopla en contra de la dirección de avance, el factor se
 * reduce (ROS de flanco/cola más lenta que cabeza), lo que se modela
 * fuera de esta función (ver ca_propagacion.js) multiplicando por
 * cos(ángulo) proyectado.
 */
export function factorViento(vientoKmh) {
  const f = 1 + WIND_K * Math.max(0, vientoKmh)
  return Math.min(f, WIND_MAX_FACTOR)
}

/**
 * factorPendiente: pendiente en % (0-100+). Pendiente positiva = a favor
 * (upslope en la dirección de avance), negativa = en contra.
 */
export function factorPendiente(pendientePct) {
  const p = pendientePct / 100
  const f = 1 + SLOPE_K * p * Math.abs(p)
  return Math.max(0.15, f)
}

/**
 * factorHumedad: si humedad >= Mx (humedad de extinción del modelo), el
 * combustible no sostiene combustión -> factor 0.
 */
export function factorHumedad(humedadPct, mx) {
  if (humedadPct >= mx) return 0
  return Math.pow(Math.max(0, 1 - humedadPct / mx), HUM_EXP)
}

/**
 * calcularROS: ROS en m/min para un modelo de combustible dado,
 * condiciones de viento (componente en la dirección de avance, km/h),
 * pendiente (% en la dirección de avance) y humedad de combustible (%).
 */
export function calcularROS(modeloIdOrNumero, vientoKmh, pendientePct, humedadPct) {
  const modelo = obtenerModelo(modeloIdOrNumero)
  const fv = factorViento(vientoKmh)
  const fp = factorPendiente(pendientePct)
  const fh = factorHumedad(humedadPct, modelo.mx)
  const ros = modelo.ros0 * fv * fp * fh
  return { ros, modelo, fv, fp, fh }
}

/** Altura de llama aproximada: crece con ROS y con la intensidad de línea. */
export function calcularAlturaLlama(modeloIdOrNumero, ros) {
  const modelo = obtenerModelo(modeloIdOrNumero)
  // Fórmula simplificada: altura = base_modelo * (1 + ln(1+ROS/ROS0))
  const base = modelo.alturaLlamaRef
  const factor = modelo.ros0 > 0 ? 1 + Math.log(1 + ros / modelo.ros0) * 0.5 : 1
  return base * factor
}

/** Intensidad de línea de fuego simplificada (kW/m), usada solo para UI. */
export function calcularIntensidad(modeloIdOrNumero, ros) {
  const modelo = obtenerModelo(modeloIdOrNumero)
  const cargaCombustibleProxy = 8 + (13 - modelo.ros0 * 2) // más combustible en modelos de bosque denso (proxy)
  return ros * cargaCombustibleProxy * 18.6 // 18.6 MJ/kg calor de combustión aprox * factor de escala
}

/** Interpolación de ROS entre dos modelos de combustible adyacentes (Sección 6.2). */
export function calcularROSInterpolado(modeloA, modeloB, factorTransicion, vientoKmh, pendientePct, humedadPct) {
  const { ros: rosA } = calcularROS(modeloA, vientoKmh, pendientePct, humedadPct)
  const { ros: rosB } = calcularROS(modeloB, vientoKmh, pendientePct, humedadPct)
  return rosA * (1 - factorTransicion) + rosB * factorTransicion
}
