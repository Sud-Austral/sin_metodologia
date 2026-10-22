// Estado de la simulación (sin DOM): grid CA + recursos + meteorología + historial + acciones.
import { initCA, tickCA, expandirGridSiNecesario, gridAFrente, gridAPerimetro, centroideFuego, aplicarRetardanteGrid, construirLineaControl, latLngACelda, ESTADO, M_POR_GRADO_LAT } from '../motores/ca_propagacion.js'
import { alturaLlama, calcularROS, rosDireccional } from '../motores/rothermel.js'
import { nombreModelo } from '../motores/kitral.js'
import { meteoParaMinuto } from '../motores/meteorologia.js'
import { distanciaM, instalacionesAmenazadas, ciudadSintetica } from '../lib/cache_osm.js'
import { uuid } from '../lib/db.js'

export const PARAMS_DEFECTO = { ajusteROS: 0.7, curadoPasto: 85, factorSequia: 1.0, pavesas: false }

export function flotaDefecto() {
  return [
    { id: 'R-22', tipo: 'brigada', nombre: 'Brigada R-22', personal: 12, velocidad_kmh: 40, capacidad: 'Línea manual 200 m / 45 min', estado: 'DISPONIBLE' },
    { id: 'R-15', tipo: 'brigada', nombre: 'Brigada R-15', personal: 10, velocidad_kmh: 40, capacidad: 'Línea manual 200 m / 45 min', estado: 'DISPONIBLE' },
    { id: 'H-01', tipo: 'helicoptero', nombre: 'Helicóptero H-01', velocidad_kmh: 150, capacidad: 'Bambi 1.200 L retardante', estado: 'DISPONIBLE' },
    { id: 'E-5', tipo: 'excavadora', nombre: 'Excavadora E-5', velocidad_kmh: 25, capacidad: 'Línea mecanizada 15 m ancho', estado: 'DISPONIBLE' },
    { id: 'C-1', tipo: 'cisterna', nombre: 'Camión cisterna C-1', velocidad_kmh: 50, capacidad: '5.000 L agua + gel', estado: 'DISPONIBLE' },
    { id: 'M-1', tipo: 'motobomba', nombre: 'Motobombas (3 u.)', velocidad_kmh: 45, capacidad: '3 × 400 L/min', estado: 'DISPONIBLE' },
  ]
}

export function crearSimulacion(op = {}) {
  const lat = op.lat ?? -41.42, lng = op.lng ?? -72.70
  const ancho = op.ancho ?? 240, alto = op.alto ?? 240, celda = op.celda ?? 13
  const grid = initCA(op.georaster ?? null, lat, lng, ancho, alto, celda, op.dem ?? null, { semilla: op.semilla ?? 3, modeloUniforme: op.modeloUniforme })
  const base = { lat: lat - 0.012, lng: lng - 0.012 } // base de recursos a ~1.5 km al SO
  const recursos = (op.recursos ?? flotaDefecto()).map((r) => ({ ...r, lat: base.lat, lng: base.lng, destino: null, eta_min: null, mision: null }))
  const est = {
    id: op.id ?? uuid(),
    nombre: op.nombre ?? 'Los Lagos 15 enero',
    lat, lng, fecha: op.fecha ?? '2026-01-15', hora_inicio: op.hora_inicio ?? '14:00',
    fuente_dem: op.fuente_dem ?? (op.dem ? 'externo' : 'sintetico'),
    grid, params: { ...PARAMS_DEFECTO, ...(op.params || {}) },
    viento_kmh: op.viento_kmh ?? 22, viento_dir: op.viento_dir ?? 180, humedad: op.humedad ?? 9,
    temp: op.temp ?? 28, hr: op.hr ?? 25, precipitacion: 0,
    usarMeteo: !!op.meteo, meteo: op.meteo ?? null, aceleracionMeteo: 60,
    pausado: false, dt: op.dt ?? 5, exageracion: 1.5,
    recursos,
    ciudad: op.ciudad ?? ciudadSintetica(lat, lng),
    historial: [], acciones: [], retardantes: [], estrategias: [], eventos: [],
    conversacion_id: null,
  }
  registrarHistorial(est)
  return est
}

function registrarHistorial(est) {
  const s = est.grid.stats
  est.historial.push({ t: est.grid.tiempo_min, ros: +s.ros_cabeza.toFixed(2), ha: +s.hectareas.toFixed(3), altura: +s.altura_llama.toFixed(2), ardiendo: s.celdas_ardiendo, viento_kmh: est.viento_kmh, humedad: est.humedad })
}

export function registrarAccion(est, tipo, detalle, extra = {}) {
  const a = { t: est.grid.tiempo_min, tipo, detalle, timestamp: new Date().toISOString(), ...extra }
  est.acciones.push(a)
  return a
}

// Aplica meteorología real al minuto simulado (1 min = 1 h meteorológica).
export function aplicarMeteo(est) {
  if (!est.usarMeteo || !est.meteo) return null
  const m = meteoParaMinuto(est.meteo, est.grid.tiempo_min, est.aceleracionMeteo)
  if (!m) return null
  est.viento_kmh = m.vientoKmh; est.viento_dir = m.dirVientoGrados; est.humedad = m.humedadFino
  est.temp = m.temp; est.hr = m.hr; est.precipitacion = m.precipitacion
  return m
}

export function avanzar(est, dt = est.dt) {
  if (est.pausado) return est
  aplicarMeteo(est)
  moverRecursos(est, dt)
  est.grid = tickCA(est.grid, est.grid.tiempo_min, est.viento_kmh, est.viento_dir, 0, est.humedad, dt, { ...est.params, precipitacion: est.precipitacion })
  const antes = est.grid.ancho
  est.grid = expandirGridSiNecesario(est.grid)
  if (est.grid.ancho !== antes) est.eventos.push({ t: est.grid.tiempo_min, tipo: 'expansion', detalle: `Grid expandido a ${est.grid.ancho}×${est.grid.alto}` })
  registrarHistorial(est)
  return est
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
  const dx = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2 * Math.PI / 180)
  const dy = lat2 - lat1
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
}

export function moverRecursos(est, dt) {
  for (const r of est.recursos) {
    if (r.estado !== 'EN TRÁNSITO' || !r.destino) continue
    const d = distanciaM(r.lat, r.lng, r.destino.lat, r.destino.lng)
    const paso = r.velocidad_kmh * 1000 / 60 * dt
    if (paso >= d) {
      r.lat = r.destino.lat; r.lng = r.destino.lng; r.eta_min = 0; r.estado = 'EN SITIO'
      llegadaRecurso(est, r)
    } else {
      const f = paso / d
      r.lat += (r.destino.lat - r.lat) * f; r.lng += (r.destino.lng - r.lng) * f
      r.eta_min = Math.max(0, Math.round((d - paso) / (r.velocidad_kmh * 1000 / 60)))
    }
  }
}

function llegadaRecurso(est, r) {
  const [clat, clng] = centroideFuego(est.grid)
  const b = bearingDeg(clat, clng, r.lat, r.lng)
  if (r.tipo === 'brigada') {
    const celdas = construirLineaControl(est.grid, r.lat, r.lng, 200, b + 90, 1)
    registrarAccion(est, 'linea_control', `${r.nombre} construye línea manual 200 m (${celdas} celdas)`, { recurso_id: r.id })
  } else if (r.tipo === 'excavadora') {
    const celdas = construirLineaControl(est.grid, r.lat, r.lng, 300, b + 90, 2)
    registrarAccion(est, 'linea_mecanizada', `${r.nombre} construye línea mecanizada 300 m × 15 m (${celdas} celdas)`, { recurso_id: r.id })
  } else if (r.tipo === 'helicoptero') {
    const celdas = aplicarRetardanteGrid(est.grid, r.lat, r.lng, 800, 0.33, 240)
    est.retardantes.push({ lat: r.lat, lng: r.lng, radio_m: 800, producto: 'Phos-Chek', volumen_l: 1200, hasta: est.grid.tiempo_min + 240 })
    registrarAccion(est, 'retardante_aereo', `${r.nombre} descarga 1.200 L Phos-Chek, radio 800 m (${celdas} celdas, ROS -33 %)`, { recurso_id: r.id })
  } else if (r.tipo === 'cisterna' || r.tipo === 'motobomba') {
    const celdas = aplicarRetardanteGrid(est.grid, r.lat, r.lng, 300, 0.22, 120)
    est.retardantes.push({ lat: r.lat, lng: r.lng, radio_m: 300, producto: 'agua+gel', volumen_l: r.tipo === 'cisterna' ? 5000 : 1200, hasta: est.grid.tiempo_min + 120 })
    registrarAccion(est, 'retardante_terrestre', `${r.nombre} aplica retardante terrestre radio 300 m (${celdas} celdas, ROS -22 %)`, { recurso_id: r.id })
  }
}

export function desplegarRecurso(est, recurso_id, lat, lng, mision = null) {
  const r = est.recursos.find((x) => x.id.toLowerCase() === String(recurso_id).toLowerCase())
  if (!r) return { error: `Recurso ${recurso_id} no existe en la flota` }
  const d = distanciaM(r.lat, r.lng, lat, lng)
  r.destino = { lat, lng }
  r.eta_min = Math.max(1, Math.round(d / (r.velocidad_kmh * 1000 / 60)))
  r.estado = 'EN TRÁNSITO'
  r.mision = mision
  const ruta = [[r.lat, r.lng], [lat, lng]]
  registrarAccion(est, 'desplegar', `${r.nombre} → ${lat.toFixed(4)}, ${lng.toFixed(4)} (ETA ${r.eta_min} min)`, { recurso_id: r.id, destino: { lat, lng }, eta_min: r.eta_min })
  return { recurso: r, eta_min: r.eta_min, distancia_m: Math.round(d), ruta }
}

export function aplicarRetardante(est, producto, volumen_l, zona) {
  const radio = zona.radio_m ?? Math.min(1200, Math.max(100, Math.sqrt(volumen_l) * 25))
  const reduccion = producto.toLowerCase().includes('agua') ? 0.22 : 0.33
  const duracion = producto.toLowerCase().includes('agua') ? 120 : 240
  const celdas = aplicarRetardanteGrid(est.grid, zona.lat, zona.lng, radio, reduccion, duracion)
  est.retardantes.push({ lat: zona.lat, lng: zona.lng, radio_m: radio, producto, volumen_l, hasta: est.grid.tiempo_min + duracion })
  registrarAccion(est, 'retardante', `${producto} ${volumen_l} L, radio ${radio} m → ${celdas} celdas, ROS -${Math.round(reduccion * 100)} % por ${duracion} min`)
  return { celdas, radio_m: radio, reduccion_ros: reduccion, duracion_min: duracion }
}

export function controlar(est, accion) {
  if (accion === 'pausar') est.pausado = true
  else if (accion === 'reanudar') est.pausado = false
  else if (accion === 'reiniciar') {
    const nuevo = crearSimulacion({ id: est.id, nombre: est.nombre, lat: est.lat, lng: est.lng, fecha: est.fecha, dem: est.grid.elev.length === est.grid.ancho * est.grid.alto && est.grid.expansiones === 0 ? est.grid.elev : null, georaster: est.grid.expansiones === 0 ? { modelo: est.grid.modelo } : null, viento_kmh: est.viento_kmh, viento_dir: est.viento_dir, humedad: est.humedad, meteo: est.meteo, ciudad: est.ciudad, params: est.params, fuente_dem: est.fuente_dem })
    nuevo.conversacion_id = est.conversacion_id
    Object.assign(est, nuevo)
  } else return { error: `Acción inválida: ${accion}` }
  registrarAccion(est, 'control', accion)
  return { pausado: est.pausado, tiempo_min: est.grid.tiempo_min }
}

// Punto de referencia hacia una dirección cardinal a `distM` del frente (centroide + offset).
export function puntoEnDireccion(est, direccion, distM = 600) {
  const dirs = { norte: 0, noreste: 45, este: 90, sureste: 135, sur: 180, suroeste: 225, oeste: 270, noroeste: 315, n: 0, ne: 45, e: 90, se: 135, s: 180, so: 225, sw: 225, o: 270, w: 270, no: 315, nw: 315 }
  const b = (dirs[direccion?.toLowerCase()] ?? 0) * Math.PI / 180
  const [clat, clng] = centroideFuego(est.grid)
  // Borde del fuego en esa dirección: avanza desde el centroide hasta salir del área quemada
  let lat = clat, lng = clng
  for (let k = 0; k < 200; k++) {
    const [i, j] = latLngACelda(est.grid, lat, lng)
    if (i < 0 || j < 0 || i >= est.grid.alto || j >= est.grid.ancho) break
    const s = est.grid.state[i * est.grid.ancho + j]
    if (s !== ESTADO.ARDIENDO && s !== ESTADO.QUEMADO) break
    lat += Math.cos(b) * est.grid.celda / M_POR_GRADO_LAT
    lng += Math.sin(b) * est.grid.celda / (M_POR_GRADO_LAT * Math.cos(lat * Math.PI / 180))
  }
  lat += Math.cos(b) * distM / M_POR_GRADO_LAT
  lng += Math.sin(b) * distM / (M_POR_GRADO_LAT * Math.cos(lat * Math.PI / 180))
  return { lat: +lat.toFixed(5), lng: +lng.toFixed(5) }
}

// ROS por flanco (cabeza, flancos, cola) en m/min según viento actual.
export function rosPorSector(est) {
  const k = est.grid.stats.modelo_cabeza || 2
  const cabeza = est.grid.stats.ros_cabeza || calcularROS(k, est.viento_kmh, 0, est.humedad, est.params)
  return {
    cabeza: +cabeza.toFixed(2),
    flanco: +rosDireccional(cabeza, Math.PI / 2, est.viento_kmh).toFixed(2),
    cola: +rosDireccional(cabeza, Math.PI, est.viento_kmh).toFixed(2),
    direccion_cabeza: (est.viento_dir + 180) % 360,
  }
}

export function lugaresConocidos(est) {
  const base = [
    { nombre: 'Puerto Montt', lat: -41.4717, lng: -72.9411, tipo: 'ciudad', poblacion: 245000 },
    { nombre: 'Puerto Varas', lat: -41.3195, lng: -72.9854, tipo: 'ciudad', poblacion: 44000 },
    { nombre: 'Cochamó', lat: -41.4983, lng: -72.3103, tipo: 'pueblo', poblacion: 4000 },
    { nombre: 'Río Puelo', lat: -41.6500, lng: -72.3000, tipo: 'pueblo', poblacion: 1500 },
    { nombre: 'Lago Chapo', lat: -41.4333, lng: -72.5500, tipo: 'lago' },
  ]
  const locales = (est.ciudad?.servicios || []).filter((s) => s.critico).map((s) => ({ nombre: s.nombre, lat: s.lat, lng: s.lng, tipo: s.tipo }))
  const acceso = (est.ciudad?.calles || []).filter((c) => c.nombre && /acceso/i.test(c.nombre)).map((c) => ({ nombre: c.nombre, lat: c.coords[0][0], lng: c.coords[0][1], tipo: 'acceso' }))
  return [...locales, ...acceso, ...base]
}

export function buscarLugar(est, texto) {
  if (!texto) return null
  const t = texto.toLowerCase()
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return lugaresConocidos(est).find((l) => norm(t).includes(norm(l.nombre))) || null
}

// Distancia y ETA del frente a un punto, según ROS en la dirección del punto.
export function etaHacia(est, lat, lng) {
  const frente = gridAFrente(est.grid)
  const [clat, clng] = centroideFuego(est.grid)
  let min = Infinity
  for (const [fl, fg] of (frente.length ? frente : [[clat, clng]])) { const d = distanciaM(lat, lng, fl, fg); if (d < min) min = d }
  const b = bearingDeg(clat, clng, lat, lng) * Math.PI / 180
  const theta = b - ((est.viento_dir + 180) % 360) * Math.PI / 180
  const rosCab = est.grid.stats.ros_cabeza || calcularROS(est.grid.stats.modelo_cabeza || 2, est.viento_kmh, 0, est.humedad, est.params)
  const ros = rosDireccional(rosCab, theta, est.viento_kmh)
  return { distancia_m: Math.round(min), ros_direccion: +ros.toFixed(2), eta_min: ros > 0.01 ? Math.round(min / ros) : null, bearing: Math.round(b * 180 / Math.PI) }
}

export function estadisticas(est) {
  const s = est.grid.stats
  const frente = gridAFrente(est.grid)
  const amen = instalacionesAmenazadas(est.ciudad?.servicios || [], frente.length ? frente : [centroideFuego(est.grid)])
  const sect = rosPorSector(est)
  const recursos_markdown = est.recursos.map((r) => `- ${r.nombre} (${r.id}): ${r.estado}${r.eta_min ? `, ETA ${r.eta_min} min` : ''} — ${r.capacidad}`).join('\n')
  const amenazadas_markdown = amen.length ? amen.map((a) => `- ${a.nombre} (${a.tipo}): ${a.distancia_m} m${a.amenazada ? ' ⚠️ AMENAZADA' : ''}`).join('\n') : '- Sin información'
  return {
    nombre: est.nombre, simulacion_id: est.id, minutos: est.grid.tiempo_min,
    hectareas: +s.hectareas.toFixed(2), ros_cabeza: +s.ros_cabeza.toFixed(2), ros_flanco: sect.flanco, ros_cola: sect.cola,
    altura_llama: +s.altura_llama.toFixed(2), dir_viento: est.viento_dir, vel_viento: est.viento_kmh, hum_combustible: est.humedad,
    temp: est.temp, hr: est.hr, precipitacion: est.precipitacion,
    modelo: `K${s.modelo_cabeza || 2}`, modelo_nombre: nombreModelo(s.modelo_cabeza || 2),
    lat: est.lat, lng: est.lng, pausado: est.pausado, celdas_ardiendo: s.celdas_ardiendo, celdas_quemadas: s.celdas_quemadas,
    frente_puntos: frente.length, perimetro_puntos: gridAPerimetro(est.grid).length,
    amenazadas: amen, recursos: est.recursos.map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, estado: r.estado, eta_min: r.eta_min, lat: r.lat, lng: r.lng })),
    recursos_markdown, amenazadas_markdown, acciones: est.acciones.length, grid: `${est.grid.ancho}×${est.grid.alto}`, fuente_dem: est.fuente_dem,
  }
}

// Clona el estado (grid incluido) para proyectar escenarios alternativos.
export function clonarEstado(est) {
  const g = est.grid
  const grid = { ...g, elev: g.elev, pend: g.pend, modelo: g.modelo, state: Uint8Array.from(g.state), tIgn: Float32Array.from(g.tIgn), retard: Float32Array.from(g.retard), retardHasta: Float32Array.from(g.retardHasta), ardiendo: g.ardiendo.slice(), stats: { ...g.stats } }
  return { ...est, grid, recursos: est.recursos.map((r) => ({ ...r })), historial: est.historial.slice(), acciones: est.acciones.slice(), retardantes: est.retardantes.slice(), estrategias: est.estrategias.slice(), eventos: [], pausado: false }
}

export function proyectar(est, cambios = {}, minutos = 30) {
  const actual = clonarEstado(est)
  const alt = clonarEstado(est)
  if (cambios.viento_kmh != null) alt.viento_kmh = cambios.viento_kmh
  if (cambios.viento_dir != null) alt.viento_dir = cambios.viento_dir
  if (cambios.humedad != null) alt.humedad = cambios.humedad
  actual.usarMeteo = false; alt.usarMeteo = false
  const pasos = Math.max(1, Math.round(minutos / est.dt))
  for (let i = 0; i < pasos; i++) { avanzar(actual, est.dt); avanzar(alt, est.dt) }
  return { actual: estadisticas(actual), proyectado: estadisticas(alt), minutos: pasos * est.dt, cambios, estadoAlt: alt }
}

export function snapshot(est) {
  return { id: est.id, nombre: est.nombre, tiempo_min: est.grid.tiempo_min, stats: est.grid.stats, perimetro: gridAPerimetro(est.grid), frente: gridAFrente(est.grid), centroide: centroideFuego(est.grid), recursos: est.recursos.map((r) => ({ ...r })), retardantes: est.retardantes.slice() }
}

export { alturaLlama }
