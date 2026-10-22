// Los 8 "endpoints" de la Sección 8.3 como funciones de cliente con el mismo contrato
// ({ ok, status, data | detail }), sin backend. Cada función es pura sobre el estado registrado.
//
//  1. POST /api/v1/chat/consultar                 → chatConsultar
//  2. POST /api/v1/despacho/desplegar             → despachoDesplegar
//  3. POST /api/v1/simulacion/aplicar-retardante  → simulacionAplicarRetardante
//  4. POST /api/v1/simulacion/control             → simulacionControl
//  5. GET  /api/v1/chat/exportar/{id}?formato=    → chatExportar
//  6. GET  /api/v1/analisis/estadisticas          → analisisEstadisticas
//  7. POST /api/v1/estrategia/guardar             → estrategiaGuardar   (Ejemplo 5)
//  8. POST /api/v1/simulacion/proyectar           → simulacionProyectar (Ejemplo 3)
import * as sim from '../estado/simulacion.js'
import * as db from '../lib/db.js'
import * as exp from '../lib/exportar.js'
import { ensamblarContexto } from '../ia/contexto.js'
import { parseadorIntenciones } from '../ia/intenciones.js'
import * as pl from '../ia/plantillas.js'
import { PROVEEDOR_PLANTILLAS } from '../ia/webllm.js'

const registro = new Map()
let proveedorIA = PROVEEDOR_PLANTILLAS
const proyeccionesPorSim = new Map()

export function registrarSimulacion(est) { registro.set(est.id, est); return est.id }
export function obtenerSimulacion(id) { return registro.get(id) || null }
export function setProveedorIA(p) { proveedorIA = p || PROVEEDOR_PLANTILLAS }
export function getProveedorIA() { return proveedorIA }

const ok = (data, status = 200) => ({ ok: true, status, data })
const err = (status, detail) => ({ ok: false, status, detail })
const esNum = (v) => typeof v === 'number' && Number.isFinite(v)

function requiereSim(id) {
  if (!id) return { e: err(422, 'simulacion_id es obligatorio') }
  const est = obtenerSimulacion(id)
  if (!est) return { e: err(404, `Simulación ${id} no registrada`) }
  return { est }
}

async function asegurarConversacion(est) {
  if (est.conversacion_id) {
    const c = await db.obtener('conversaciones', est.conversacion_id)
    if (c) return c
  }
  const c = await db.crearConversacion(est.id)
  est.conversacion_id = c.id
  return c
}

function resolverPunto(est, p) {
  if (p.coords && esNum(p.coords.lat) && esNum(p.coords.lng)) return p.coords
  const lugar = p.lugar ? sim.buscarLugar(est, p.lugar) : null
  if (lugar) return { lat: lugar.lat, lng: lugar.lng, nombre: lugar.nombre }
  return sim.puntoEnDireccion(est, p.direccion || pl.cardinal((est.viento_dir + 180) % 360), 600)
}

// ---------- 2. POST /api/v1/despacho/desplegar ----------
export async function despachoDesplegar({ simulacion_id, recurso_id, lat, lng, mision = null } = {}) {
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  if (!recurso_id) return err(422, 'recurso_id es obligatorio')
  if (!esNum(lat) || !esNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return err(422, 'lat/lng inválidos')
  const r = sim.desplegarRecurso(est, recurso_id, lat, lng, mision)
  if (r.error) return err(404, r.error)
  await db.guardar('acciones', { id: db.uuid(), simulacion_id, ...est.acciones[est.acciones.length - 1] })
  return ok({ recurso_id: r.recurso.id, nombre: r.recurso.nombre, estado: r.recurso.estado, destino: { lat, lng }, eta_min: r.eta_min, distancia_m: r.distancia_m, ruta: r.ruta, t_min: est.grid.tiempo_min })
}

// ---------- 3. POST /api/v1/simulacion/aplicar-retardante ----------
export async function simulacionAplicarRetardante({ simulacion_id, producto, volumen, zona } = {}) {
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  if (!producto || typeof producto !== 'string') return err(422, 'producto es obligatorio (ej. "Phos-Chek", "agua+gel")')
  if (!esNum(volumen) || volumen <= 0 || volumen > 50000) return err(422, 'volumen debe ser un número entre 1 y 50000 litros')
  if (!zona || !esNum(zona.lat) || !esNum(zona.lng)) return err(422, 'zona {lat, lng, radio_m?} es obligatoria')
  const r = sim.aplicarRetardante(est, producto, volumen, zona)
  await db.guardar('acciones', { id: db.uuid(), simulacion_id, ...est.acciones[est.acciones.length - 1] })
  return ok({ producto, volumen, zona: { ...zona, radio_m: r.radio_m }, celdas_tratadas: r.celdas, reduccion_ros: r.reduccion_ros, duracion_min: r.duracion_min, t_min: est.grid.tiempo_min })
}

// ---------- 4. POST /api/v1/simulacion/control ----------
export async function simulacionControl({ simulacion_id, accion } = {}) {
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  if (!['pausar', 'reanudar', 'reiniciar'].includes(accion)) return err(422, 'accion debe ser "pausar" | "reanudar" | "reiniciar"')
  const r = sim.controlar(est, accion)
  if (r.error) return err(422, r.error)
  return ok({ accion, ...r })
}

// ---------- 6. GET /api/v1/analisis/estadisticas ----------
export async function analisisEstadisticas({ simulacion_id } = {}) {
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  const h = est.historial
  return ok({
    actual: sim.estadisticas(est),
    series: { ros_vs_tiempo: h.map((x) => [x.t, x.ros]), hectareas_vs_tiempo: h.map((x) => [x.t, x.ha]), altura_vs_tiempo: h.map((x) => [x.t, x.altura]) },
    amenazadas: sim.estadisticas(est).amenazadas,
    acciones: est.acciones, eventos: est.eventos, puntos: h.length,
  })
}

// ---------- 7. POST /api/v1/estrategia/guardar ----------
export async function estrategiaGuardar({ simulacion_id, nombre = null, generarPdf = true } = {}) {
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  const conv = await asegurarConversacion(est)
  const mensajes = await db.mensajesDe(conv.id)
  const e2 = sim.estadisticas(est)
  const estrategia = { id: db.uuid(), simulacion_id, conversacion_id: conv.id, nombre: nombre || `Plan ${est.recursos.filter((r) => r.estado !== 'DISPONIBLE').map((r) => r.tipo).join('+') || 'base'} ${est.nombre.split(' ')[0]} ${est.nombre.split(' ')[1] || ''} T=${e2.minutos}`.replace(/\s+/g, ' ').trim(), fecha: new Date().toISOString(), turnos: mensajes.length, snapshot: sim.snapshot(est), estadisticas: e2, acciones: est.acciones.slice() }
  await db.guardar('estrategias', estrategia)
  est.estrategias.push({ id: estrategia.id, nombre: estrategia.nombre, fecha: estrategia.fecha })
  let archivo = null, pdf_bytes = null
  if (generarPdf) {
    archivo = exp.nombreArchivo('analisis_ia', 'pdf')
    const doc = exp.generarPDF({ estadisticas: e2, mensajes, acciones: est.acciones, proyecciones: proyeccionesPorSim.get(simulacion_id) || [], titulo: estrategia.nombre })
    pdf_bytes = exp.pdfABytes(doc)
    if (typeof document !== 'undefined') exp.descargar(archivo, pdf_bytes, 'application/pdf')
  }
  sim.registrarAccion(est, 'guardar_estrategia', estrategia.nombre, { estrategia_id: estrategia.id })
  return ok({ estrategia_id: estrategia.id, nombre: estrategia.nombre, turnos: estrategia.turnos, archivo, pdf_bytes: pdf_bytes ? pdf_bytes.length : 0, snapshot_recursos: estrategia.snapshot.recursos.filter((r) => r.estado !== 'DISPONIBLE').map((r) => ({ id: r.id, estado: r.estado, eta_min: r.eta_min })) })
}

// ---------- 8. POST /api/v1/simulacion/proyectar ----------
export async function simulacionProyectar({ simulacion_id, viento_kmh = null, viento_dir = null, humedad = null, en_min = 30 } = {}) {
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  if (viento_kmh != null && (!esNum(viento_kmh) || viento_kmh < 0 || viento_kmh > 200)) return err(422, 'viento_kmh fuera de rango (0–200)')
  if (!esNum(en_min) || en_min < 5 || en_min > 600) return err(422, 'en_min debe estar entre 5 y 600')
  const pr = sim.proyectar(est, { viento_kmh, viento_dir, humedad }, en_min)
  const res = { minutos: pr.minutos, cambios: pr.cambios, actual: pr.actual, proyectado: pr.proyectado }
  if (!proyeccionesPorSim.has(simulacion_id)) proyeccionesPorSim.set(simulacion_id, [])
  proyeccionesPorSim.get(simulacion_id).push(res)
  return ok({ ...res, respuesta_markdown: pl.respuestaProyeccion(est, pr) })
}

// ---------- 5. GET /api/v1/chat/exportar/{conversacion_id}?formato= ----------
export async function chatExportar({ conversacion_id, formato = 'markdown', simulacion_id = null } = {}) {
  if (!['markdown', 'pdf', 'json', 'kmz', 'csv'].includes(formato)) return err(422, 'formato debe ser pdf | markdown | json | kmz | csv')
  const est = simulacion_id ? obtenerSimulacion(simulacion_id) : [...registro.values()].find((s) => s.conversacion_id === conversacion_id) || null
  const conv = conversacion_id ? await db.obtener('conversaciones', conversacion_id) : null
  if (!conv && ['markdown', 'pdf', 'json'].includes(formato)) return err(404, `Conversación ${conversacion_id} no existe`)
  if (!est && ['kmz', 'csv'].includes(formato)) return err(404, 'Simulación no registrada para exportar KMZ/CSV')
  const mensajes = conv ? await db.mensajesDe(conv.id) : []
  const e2 = est ? sim.estadisticas(est) : null
  let contenido, mime, archivo
  if (formato === 'markdown') { contenido = exp.conversacionAMarkdown(conv, mensajes, e2); mime = 'text/markdown'; archivo = exp.nombreArchivo('conversacion', 'md', est?.nombre) }
  else if (formato === 'json') { contenido = JSON.stringify({ conversacion: conv, mensajes, estadisticas: e2, acciones: est?.acciones ?? [] }, null, 2); mime = 'application/json'; archivo = exp.nombreArchivo('conversacion', 'json', est?.nombre) }
  else if (formato === 'csv') { contenido = exp.estadisticasACSV(est.historial); mime = 'text/csv'; archivo = exp.nombreArchivo('estadisticas', 'csv', est.nombre) }
  else if (formato === 'kmz') { contenido = await exp.gridAKMZ(sim.snapshot(est)); mime = 'application/vnd.google-earth.kmz'; archivo = exp.nombreArchivo('perimetro', 'kmz', est.nombre) }
  else { const doc = exp.generarPDF({ estadisticas: e2, mensajes, acciones: est?.acciones ?? [], proyecciones: proyeccionesPorSim.get(est?.id) || [] }); contenido = exp.pdfABytes(doc); mime = 'application/pdf'; archivo = exp.nombreArchivo('Analisis_IA_Coigue1', 'pdf') }
  const bytes = typeof contenido === 'string' ? new TextEncoder().encode(contenido).length : (contenido.size ?? contenido.length)
  if (typeof document !== 'undefined') exp.descargar(archivo, contenido, mime)
  return ok({ archivo, formato, mime, bytes, mensajes: mensajes.length, contenido })
}

// ---------- 1. POST /api/v1/chat/consultar ----------
export async function chatConsultar({ pregunta, simulacion_id, grid_ca = null, estadisticas = null } = {}) {
  if (!pregunta || typeof pregunta !== 'string' || !pregunta.trim()) return err(422, 'pregunta es obligatoria')
  const { est, e } = requiereSim(simulacion_id); if (e) return e
  const t0 = (globalThis.performance || Date).now()
  const conv = await asegurarConversacion(est)
  const stats = estadisticas || sim.estadisticas(est)
  const prompt_sistema = ensamblarContexto(stats)
  const intent = parseadorIntenciones(pregunta)
  await db.guardarMensaje({ conversacion_id: conv.id, rol: 'user', contenido: pregunta, comando: intent })

  // 1) Ejecutar comando detectado en la pregunta (determinista, siempre)
  const ejecucion = await ejecutarComando(est, intent)

  // 2) Generar texto: IA en navegador si está lista; si no, plantilla con cifras reales
  let respuesta, modelo, tokens = null, latencia_s = null, fuente
  if (proveedorIA.listo && proveedorIA.listo()) {
    try {
      const r = await proveedorIA.generar(prompt_sistema + (ejecucion?.texto ? `\n\nACCIONES YA EJECUTADAS POR EL SISTEMA (resúmelas, no las inventes):\n${ejecucion.texto}` : ''), pregunta)
      respuesta = r.texto; modelo = r.modelo; tokens = r.tokens; latencia_s = r.latencia_s; fuente = 'webllm'
      // Parsear también la respuesta de la IA (Sección 7.2): comandos sugeridos no ejecutados aún
      const sugerido = parseadorIntenciones(r.texto)
      if (sugerido && !ejecucion && ['desplegar_recurso', 'aplicar_retardante'].includes(sugerido.accion)) {
        const ej2 = await ejecutarComando(est, sugerido)
        if (ej2?.texto) respuesta += `\n\n---\n${ej2.texto}`
      } else if (ejecucion?.texto && !/✅/.test(respuesta)) respuesta += `\n\n---\n${ejecucion.texto}`
    } catch (ex) {
      respuesta = `⚠️ IA no respondió (${ex.message}). Respuesta de respaldo:\n\n` + (ejecucion?.texto || pl.respuestaGenerica(est, pregunta, intent))
      modelo = 'plantillas (fallback por error IA)'; fuente = 'fallback'
    }
  } else {
    respuesta = ejecucion?.texto || plantillaParaConsulta(est, pregunta, intent)
    modelo = 'plantillas-deterministas'; fuente = 'plantillas'
    tokens = Math.round(respuesta.split(/\s+/).length * 1.3)
  }
  const timestamp = new Date().toISOString()
  await db.guardarMensaje({ conversacion_id: conv.id, rol: 'assistant', contenido: respuesta, tokens, modelo, timestamp, comando: ejecucion?.comando || null })
  return ok({ respuesta, timestamp, modelo, tokens_utilizados: tokens, latencia_s: latencia_s ?? +(((globalThis.performance || Date).now() - t0) / 1000).toFixed(3), fuente, comando: ejecucion?.comando || intent, conversacion_id: conv.id, resultado: ejecucion?.resultado ?? null })
}

function plantillaParaConsulta(est, pregunta, intent) {
  switch (intent?.accion) {
    case 'lectura_ros': return pl.respuestaLecturaROS(est)
    case 'analisis_estrategico': return pl.respuestaEstrategica(est)
    case 'analisis_amenaza': return pl.respuestaAmenaza(est, intent.parametros.lugar)
    case 'alternativa': return pl.respuestaAlternativa(est, intent.parametros)
    default: return pl.respuestaGenerica(est, pregunta, intent)
  }
}

// Ejecuta un comando estructurado contra el estado. Devuelve { texto, comando, resultado } o null.
export async function ejecutarComando(est, intent) {
  if (!intent) return null
  const p = intent.parametros || {}
  const id = est.id
  switch (intent.accion) {
    case 'desplegar_recurso': {
      const punto = resolverPunto(est, p)
      const ids = [p.recurso_id || 'R-22']
      // "Brigada + helicóptero" en una sola orden (Ejemplo 2): si menciona helicóptero además del recurso principal
      if (/helic/i.test(intent.texto_original) && !/^H-/.test(ids[0])) ids.push('H-01')
      const resultados = []
      for (const rid of ids) {
        const r = await despachoDesplegar({ simulacion_id: id, recurso_id: rid, lat: punto.lat, lng: punto.lng, mision: punto.nombre || p.direccion || null })
        resultados.push(r.ok ? { recurso: est.recursos.find((x) => x.id === r.data.recurso_id), eta_min: r.data.eta_min, distancia_m: r.data.distancia_m } : { error: r.detail })
      }
      // En ejemplo 2 la IA además programa el helicóptero con retardante: lo hacemos explícito si hay H-01 disponible y la orden es "al frente"
      if (ids.length === 1 && ids[0].startsWith('R-') && est.recursos.find((x) => x.id === 'H-01' && x.estado === 'DISPONIBLE')) {
        const h = await despachoDesplegar({ simulacion_id: id, recurso_id: 'H-01', lat: punto.lat, lng: punto.lng, mision: 'retardante' })
        if (h.ok) resultados.push({ recurso: est.recursos.find((x) => x.id === 'H-01'), eta_min: h.data.eta_min, distancia_m: h.data.distancia_m })
      }
      return { texto: pl.respuestaDespliegue(est, resultados), comando: { ...intent, parametros: { ...p, punto } }, resultado: resultados.map((r) => r.error ? r : { recurso_id: r.recurso.id, eta_min: r.eta_min }) }
    }
    case 'aplicar_retardante': {
      const zona = p.zona || resolverPunto(est, p)
      const r = await simulacionAplicarRetardante({ simulacion_id: id, producto: p.producto, volumen: p.volumen, zona })
      if (!r.ok) return { texto: `❌ ${r.detail}`, comando: intent, resultado: r }
      return { texto: pl.respuestaRetardante(est, { radio_m: r.data.zona.radio_m, celdas: r.data.celdas_tratadas, reduccion_ros: r.data.reduccion_ros, duracion_min: r.data.duracion_min }, { producto: p.producto, volumen: p.volumen, zona }), comando: { ...intent, parametros: { ...p, zona } }, resultado: r.data }
    }
    case 'control': {
      const r = await simulacionControl({ simulacion_id: id, accion: p.accion })
      return { texto: r.ok ? pl.respuestaControl(est, p.accion) : `❌ ${r.detail}`, comando: intent, resultado: r.data ?? r }
    }
    case 'proyectar': {
      const r = await simulacionProyectar({ simulacion_id: id, viento_kmh: p.viento_kmh, humedad: p.humedad, en_min: p.en_min })
      return { texto: r.ok ? r.data.respuesta_markdown : `❌ ${r.detail}`, comando: intent, resultado: r.ok ? { actual: r.data.actual.hectareas, proyectado: r.data.proyectado.hectareas } : r }
    }
    case 'guardar_estrategia': {
      const r = await estrategiaGuardar({ simulacion_id: id, nombre: p.nombre })
      const estr = est.estrategias[est.estrategias.length - 1]
      return { texto: r.ok ? pl.respuestaGuardado(est, { ...estr, turnos: r.data.turnos }, r.data.archivo) : `❌ ${r.detail}`, comando: intent, resultado: r.data ?? r }
    }
    case 'exportar': {
      const conv = await asegurarConversacion(est)
      const r = await chatExportar({ conversacion_id: conv.id, formato: p.formato, simulacion_id: id })
      if (!r.ok) return { texto: `❌ ${r.detail}`, comando: intent, resultado: r }
      const mensajes = await db.mensajesDe(conv.id)
      const tokens = mensajes.reduce((s, m) => s + (m.tokens_utilizados || 0), 0)
      return { texto: pl.respuestaExportacion(est, p.formato, r.data.archivo, mensajes.length, tokens), comando: intent, resultado: { archivo: r.data.archivo, bytes: r.data.bytes } }
    }
    case 'ejecutar_plan': {
      const plan = p.plan
      const punto = sim.puntoEnDireccion(est, pl.cardinal((est.viento_dir + 180) % 360), 600)
      const ids = plan === 'C' ? ['C-1', 'M-1', 'R-22'] : plan === 'B' ? ['E-5', 'R-22'] : ['R-22', 'H-01']
      const resultados = []
      for (const rid of ids) {
        const r = await despachoDesplegar({ simulacion_id: id, recurso_id: rid, lat: punto.lat, lng: punto.lng, mision: `Plan ${plan}` })
        resultados.push(r.ok ? { recurso: est.recursos.find((x) => x.id === rid), eta_min: r.data.eta_min } : { error: r.detail })
      }
      sim.registrarAccion(est, 'plan', `Plan ${plan} activado`)
      return { texto: pl.respuestaPlan(est, plan, resultados), comando: { ...intent, parametros: { plan, punto } }, resultado: resultados.map((r) => r.error ? r : { recurso_id: r.recurso.id, eta_min: r.eta_min }) }
    }
    case 'evacuar': {
      sim.registrarAccion(est, 'evacuar', p.lugar)
      await db.guardar('acciones', { id: db.uuid(), simulacion_id: id, ...est.acciones[est.acciones.length - 1] })
      return { texto: pl.respuestaEvacuacion(est, p.lugar), comando: intent, resultado: { lugar: p.lugar } }
    }
    default:
      return null
  }
}

export const ENDPOINTS = [
  { contrato: 'POST /api/v1/chat/consultar', funcion: 'chatConsultar' },
  { contrato: 'POST /api/v1/despacho/desplegar', funcion: 'despachoDesplegar' },
  { contrato: 'POST /api/v1/simulacion/aplicar-retardante', funcion: 'simulacionAplicarRetardante' },
  { contrato: 'POST /api/v1/simulacion/control', funcion: 'simulacionControl' },
  { contrato: 'GET /api/v1/chat/exportar/{conversacion_id}?formato=', funcion: 'chatExportar' },
  { contrato: 'GET /api/v1/analisis/estadisticas', funcion: 'analisisEstadisticas' },
  { contrato: 'POST /api/v1/estrategia/guardar', funcion: 'estrategiaGuardar' },
  { contrato: 'POST /api/v1/simulacion/proyectar', funcion: 'simulacionProyectar' },
]
