import { describe, it, expect, beforeEach } from 'vitest'
import { parseadorIntenciones, extraerRecurso, extraerVolumen } from '../src/ia/intenciones.js'
import { ensamblarContexto, recortarContexto } from '../src/ia/contexto.js'
import * as sim from '../src/estado/simulacion.js'
import * as api from '../src/api/cliente.js'
import * as db from '../src/lib/db.js'
import { conversacionAMarkdown, estadisticasACSV, gridAKML, gridAKMZ, gridAGeoJSON, generarPDF, pdfABytes } from '../src/lib/exportar.js'
import { procesar_osm, instalacionesAmenazadas, ciudadSintetica, distanciaM } from '../src/lib/cache_osm.js'
import { decodificarRGB, remuestrear, calcularBounds, latLngATile } from '../src/lib/descarga_dem.js'

describe('Parseador de intenciones', () => {
  it('detecta desplegar con recurso y dirección', () => {
    const c = parseadorIntenciones('Desplegar Brigada R-22 al norte, acceso Los Copihues')
    expect(c.accion).toBe('desplegar_recurso')
    expect(c.parametros.recurso_id).toBe('R-22')
    expect(c.parametros.direccion).toBe('norte')
    expect(c.parametros.lugar).toBe('Los Copihues')
  })
  it('detecta retardante con volumen, control, exportar, guardar, proyectar, plan', () => {
    expect(parseadorIntenciones('Aplicar retardante Phos-Chek 2.400 L al norte')).toMatchObject({ accion: 'aplicar_retardante', parametros: { volumen: 2400, producto: 'Phos-Chek' } })
    expect(parseadorIntenciones('pausa la simulación').parametros.accion).toBe('pausar')
    expect(parseadorIntenciones('reanudar').parametros.accion).toBe('reanudar')
    expect(parseadorIntenciones('Exporta todo a PDF')).toMatchObject({ accion: 'exportar', parametros: { formato: 'pdf', todo: true } })
    expect(parseadorIntenciones('exportar conversación a markdown').parametros.formato).toBe('markdown')
    expect(parseadorIntenciones('Guardá la estrategia actual').accion).toBe('guardar_estrategia')
    expect(parseadorIntenciones('¿Qué pasa si viento sube a 35 km/h en 30 min?')).toMatchObject({ accion: 'proyectar', parametros: { viento_kmh: 35, en_min: 30 } })
    expect(parseadorIntenciones('Ejecutar Plan C').parametros.plan).toBe('C')
    expect(parseadorIntenciones('Evacuar Escuela Pucatrihue').accion).toBe('evacuar')
  })
  it('clasifica consultas y devuelve null para texto irrelevante', () => {
    expect(parseadorIntenciones('¿Cuál es el ROS actual?').accion).toBe('lectura_ros')
    expect(parseadorIntenciones('¿Brigada norte o este?').accion).toBe('analisis_estrategico')
    expect(parseadorIntenciones('Riesgo para Puerto Montt').parametros.lugar).toBe('Puerto Montt')
    expect(parseadorIntenciones('¿Hay alternativa sin helicóptero?').accion).toBe('alternativa')
    expect(parseadorIntenciones('¿Y retardante por tierra?').parametros.opcion).toBe('retardante_terrestre')
    expect(parseadorIntenciones('hola')).toBeNull()
    expect(parseadorIntenciones('')).toBeNull()
  })
  it('extrae recursos y volúmenes', () => {
    expect(extraerRecurso('manda el helicóptero')).toBe('H-01')
    expect(extraerRecurso('E5 al este')).toBe('E-5')
    expect(extraerVolumen('1,200 litros')).toBe(1200)
    expect(extraerVolumen('sin cifra')).toBeNull()
    expect(extraerVolumen('1200 litros')).toBe(1200)
  })
})

describe('Contexto dinámico', () => {
  it('incluye las cifras del estado y recorta a 3000 caracteres', () => {
    const est = sim.crearSimulacion({ ancho: 60, alto: 60 })
    const p = ensamblarContexto(sim.estadisticas(est), '¿ROS?')
    expect(p).toContain('Tiempo transcurrido: 0 minutos')
    expect(p).toContain('Velocidad viento: 22 km/h')
    expect(p).toContain('Brigada R-22')
    expect(p).toContain('PREGUNTA DEL DESPACHADOR')
    expect(recortarContexto('x'.repeat(5000)).length).toBeLessThanOrEqual(3000)
  })
})

describe('Endpoints de cliente (contrato HTTP)', () => {
  let est
  beforeEach(async () => {
    await db.limpiarTodo()
    est = sim.crearSimulacion({ ancho: 120, alto: 120, modeloUniforme: 2 })
    api.registrarSimulacion(est)
    for (let k = 0; k < 6; k++) sim.avanzar(est)
  })
  it('chatConsultar valida entrada y responde con markdown + persistencia', async () => {
    expect((await api.chatConsultar({ pregunta: '', simulacion_id: est.id })).status).toBe(422)
    expect((await api.chatConsultar({ pregunta: 'hola', simulacion_id: 'nope' })).status).toBe(404)
    const r = await api.chatConsultar({ pregunta: '¿Cuál es el ROS actual?', simulacion_id: est.id })
    expect(r.ok).toBe(true)
    expect(r.data.respuesta).toMatch(/ROS .*actual es \*\*\d+\.\d m\/min\*\*/)
    expect(r.data.modelo).toBe('plantillas-deterministas')
    const ms = await db.mensajesDe(r.data.conversacion_id)
    expect(ms.map((m) => m.rol)).toEqual(['user', 'assistant'])
  })
  it('desplegar: valida y mueve el recurso; el comando por chat lo ejecuta', async () => {
    expect((await api.despachoDesplegar({ simulacion_id: est.id, recurso_id: 'R-22', lat: 999, lng: 0 })).status).toBe(422)
    expect((await api.despachoDesplegar({ simulacion_id: est.id, recurso_id: 'Z-9', lat: -41.41, lng: -72.7 })).status).toBe(404)
    const r = await api.despachoDesplegar({ simulacion_id: est.id, recurso_id: 'R-22', lat: -41.41, lng: -72.7 })
    expect(r.ok).toBe(true); expect(r.data.estado).toBe('EN TRÁNSITO'); expect(r.data.eta_min).toBeGreaterThan(0)
    const c = await api.chatConsultar({ pregunta: 'Desplegar Brigada R-15 al norte', simulacion_id: est.id })
    expect(c.data.respuesta).toContain('✅ Comandos ejecutados')
    expect(est.recursos.find((x) => x.id === 'R-15').estado).toBe('EN TRÁNSITO')
    for (let k = 0; k < 10; k++) sim.avanzar(est)
    expect(est.recursos.find((x) => x.id === 'R-22').estado).toBe('EN SITIO')
    expect(est.acciones.some((a) => a.tipo === 'linea_control')).toBe(true)
  })
  it('aplicar-retardante valida y reduce ROS en celdas', async () => {
    expect((await api.simulacionAplicarRetardante({ simulacion_id: est.id, producto: 'Phos-Chek', volumen: -5, zona: { lat: -41.41, lng: -72.7 } })).status).toBe(422)
    expect((await api.simulacionAplicarRetardante({ simulacion_id: est.id, producto: 'Phos-Chek', volumen: 1200 })).status).toBe(422)
    const r = await api.simulacionAplicarRetardante({ simulacion_id: est.id, producto: 'Phos-Chek', volumen: 1200, zona: { lat: -41.415, lng: -72.7, radio_m: 300 } })
    expect(r.ok).toBe(true); expect(r.data.celdas_tratadas).toBeGreaterThan(100); expect(r.data.reduccion_ros).toBe(0.33)
  })
  it('control: pausar detiene el avance, reanudar lo retoma, reiniciar vuelve a T=0', async () => {
    expect((await api.simulacionControl({ simulacion_id: est.id, accion: 'volar' })).status).toBe(422)
    const t = est.grid.tiempo_min
    await api.simulacionControl({ simulacion_id: est.id, accion: 'pausar' }); sim.avanzar(est)
    expect(est.grid.tiempo_min).toBe(t)
    await api.simulacionControl({ simulacion_id: est.id, accion: 'reanudar' }); sim.avanzar(est)
    expect(est.grid.tiempo_min).toBe(t + est.dt)
    await api.simulacionControl({ simulacion_id: est.id, accion: 'reiniciar' })
    expect(est.grid.tiempo_min).toBe(0); expect(est.grid.ardiendo).toHaveLength(1)
  })
  it('exportar: markdown/json/csv/kmz/pdf y errores 404/422', async () => {
    await api.chatConsultar({ pregunta: '¿ROS?', simulacion_id: est.id })
    expect((await api.chatExportar({ conversacion_id: 'x', formato: 'xml' })).status).toBe(422)
    expect((await api.chatExportar({ conversacion_id: 'x', formato: 'markdown' })).status).toBe(404)
    const md = await api.chatExportar({ conversacion_id: est.conversacion_id, formato: 'markdown', simulacion_id: est.id })
    expect(md.ok).toBe(true); expect(md.data.contenido).toContain('# Conversación IA'); expect(md.data.archivo).toMatch(/\.md$/)
    const csv = await api.chatExportar({ formato: 'csv', simulacion_id: est.id })
    expect(csv.data.contenido.split('\n')[0]).toBe('t_min,ros_m_min,hectareas,altura_llama_m,celdas_ardiendo,viento_kmh,humedad_pct')
    const kmz = await api.chatExportar({ formato: 'kmz', simulacion_id: est.id })
    expect(kmz.data.bytes).toBeGreaterThan(200); expect(kmz.data.contenido[0]).toBe(0x50) // 'P' de PK zip
    const pdf = await api.chatExportar({ conversacion_id: est.conversacion_id, formato: 'pdf', simulacion_id: est.id })
    expect(pdf.data.bytes).toBeGreaterThan(1000); expect(String.fromCharCode(...pdf.data.contenido.slice(0, 4))).toBe('%PDF')
  })
  it('estadisticas devuelve series alineadas con el historial', async () => {
    const r = await api.analisisEstadisticas({ simulacion_id: est.id })
    expect(r.data.series.ros_vs_tiempo.length).toBe(est.historial.length)
    expect(r.data.series.hectareas_vs_tiempo.at(-1)[1]).toBe(est.historial.at(-1).ha)
  })
  it('estrategia guardar persiste snapshot y genera PDF; proyectar compara escenarios', async () => {
    const r = await api.estrategiaGuardar({ simulacion_id: est.id, nombre: 'Prueba' })
    expect(r.ok).toBe(true); expect(r.data.pdf_bytes).toBeGreaterThan(1000)
    expect(await db.listar('estrategias')).toHaveLength(1)
    expect((await api.simulacionProyectar({ simulacion_id: est.id, viento_kmh: 500 })).status).toBe(422)
    const p = await api.simulacionProyectar({ simulacion_id: est.id, viento_kmh: 40, en_min: 30 })
    expect(p.ok).toBe(true)
    expect(p.data.proyectado.ros_cabeza).toBeGreaterThan(p.data.actual.ros_cabeza)
    expect(est.grid.tiempo_min).toBe(30) // la proyección no altera el estado real
  })
  it('la conversación es recuperable tras "reabrir" (misma simulacion_id)', async () => {
    await api.chatConsultar({ pregunta: '¿ROS?', simulacion_id: est.id })
    const conv = await db.ultimaConversacion(est.id)
    expect(conv.num_mensajes).toBe(2)
    expect((await db.mensajesDe(conv.id))[0].contenido).toBe('¿ROS?')
  })
})

describe('Exportaciones', () => {
  it('markdown, CSV, KML/KMZ, GeoJSON y PDF', async () => {
    const est = sim.crearSimulacion({ ancho: 60, alto: 60, modeloUniforme: 2 })
    for (let k = 0; k < 4; k++) sim.avanzar(est)
    const md = conversacionAMarkdown({ id: 'c1', fecha_creacion: 'f' }, [{ rol: 'user', contenido: 'hola', timestamp: 't' }], sim.estadisticas(est))
    expect(md).toContain('👤 Despachador')
    expect(estadisticasACSV(est.historial).split('\n').length).toBe(est.historial.length + 2)
    const snap = sim.snapshot(est)
    expect(gridAKML(snap)).toContain('<Polygon>')
    expect(gridAGeoJSON(snap).features.some((f) => f.properties.tipo === 'perimetro')).toBe(true)
    const kmz = await gridAKMZ(snap)
    expect(kmz.length).toBeGreaterThan(100)
    const bytes = pdfABytes(generarPDF({ estadisticas: sim.estadisticas(est), mensajes: [], acciones: [] }))
    expect(bytes.length).toBeGreaterThan(1000)
  })
})

describe('OSM y DEM (sin red)', () => {
  it('procesa Overpass, detecta amenazas en buffer 500 m, ciudad sintética', () => {
    const d = procesar_osm({ elements: [
      { type: 'way', id: 1, tags: { building: 'yes', 'building:levels': '2' }, geometry: [{ lat: -41.4, lon: -72.7 }, { lat: -41.4, lon: -72.701 }, { lat: -41.401, lon: -72.701 }] },
      { type: 'way', id: 2, tags: { highway: 'residential', name: 'Calle 1' }, geometry: [{ lat: -41.4, lon: -72.7 }, { lat: -41.41, lon: -72.7 }] },
      { type: 'node', id: 3, tags: { amenity: 'hospital', name: 'Hospital X' }, lat: -41.4, lon: -72.7 },
    ] })
    expect(d.edificios[0].altura_m).toBeCloseTo(6.4)
    expect(d.calles[0].nombre).toBe('Calle 1')
    expect(d.servicios[0].critico).toBe(true)
    const am = instalacionesAmenazadas(d.servicios, [[-41.402, -72.7]])
    expect(am[0].amenazada).toBe(true); expect(am[0].distancia_m).toBeLessThan(300)
    expect(instalacionesAmenazadas(d.servicios, [[-41.45, -72.7]])[0].amenazada).toBe(false)
    expect(ciudadSintetica(-41.42, -72.7).servicios).toHaveLength(3)
    expect(distanciaM(-41.42, -72.7, -41.42, -72.7)).toBe(0)
  })
  it('decodifica Terrarium y remuestrea', () => {
    // elev = R*256 + G + B/256 - 32768 → R=128,G=10,B=0 → 10 m
    const px = new Uint8ClampedArray([128, 10, 0, 255, 128, 20, 0, 255, 128, 30, 0, 255, 128, 40, 0, 255])
    const e = decodificarRGB(px, 2, 2)
    expect(Array.from(e)).toEqual([10, 20, 30, 40])
    const r = remuestrear(e, 2, 2, 3, 3)
    expect(r.length).toBe(9); expect(r[4]).toBeCloseTo(25)
    const b = calcularBounds(-41.42, -72.7, 1.56)
    expect(b.norte - b.sur).toBeCloseTo(0.028, 2)
    expect(latLngATile(-41.42, -72.7, 12).x).toBeGreaterThan(1220)
  })
})
