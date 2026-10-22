import React, { useCallback, useEffect, useRef, useState } from 'react'
import ChatPanel from './ChatPanel.jsx'
import ControlPanel from './ControlPanel.jsx'
import { Escena3D } from '../escena/escena3D.js'
import { crearMotorWorker } from '../motores/motor_worker.js'
import * as sim from '../estado/simulacion.js'
import * as api from '../api/cliente.js'
import * as db from '../lib/db.js'
import { cargarDEM } from '../lib/descarga_dem.js'
import { cargarCiudad, ciudadSintetica } from '../lib/cache_osm.js'
import { cargarMeteo, meteoSintetica, nivelPeligro } from '../motores/meteorologia.js'
import { detectarWebGPU, crearProveedorWebLLM, MODELO_NAVEGADOR } from '../ia/webllm.js'
import { encenderCelda, construirLineaControl, ESTADO, latLngACelda } from '../motores/ca_propagacion.js'

const slug = (s) => 'sim-' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')

export default function App() {
  const contRef = useRef(null)
  const escenaRef = useRef(null)
  const motorRef = useRef(null)
  const estRef = useRef(null)
  const [stats, setStats] = useState(null)
  const [historial, setHistorial] = useState([])
  const [mensajes, setMensajes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [pestana, setPestana] = useState('FUEGO')
  const [modoClick, setModoClick] = useState(null)
  const [carga, setCarga] = useState({ fase: 'Iniciando…', error: null })
  const [demInfo, setDemInfo] = useState({ fuente: '…' })
  const [meteoInfo, setMeteoInfo] = useState({ fuente: '…' })
  const [ia, setIa] = useState({ estado: 'inactivo', webgpu: null, progreso: 0, detalle: '', modelo: MODELO_NAVEGADOR, gpu: null })
  const [estrategias, setEstrategias] = useState([])
  const [conversaciones, setConversaciones] = useState([])
  const [fps, setFps] = useState(0)
  const [msTick, setMsTick] = useState(0)
  const [aviso, setAviso] = useState(null)
  const [chatVisible, setChatVisible] = useState(true)
  const proveedorRef = useRef(null)
  const metaRef = useRef({ ia, demInfo, mensajes, meteoInfo })
  metaRef.current = { ia, demInfo, mensajes, meteoInfo }

  const refrescar = useCallback(() => {
    const est = estRef.current; if (!est) return
    setStats(sim.estadisticas(est))
    setHistorial(est.historial.slice())
    escenaRef.current?.actualizarRecursos(est)
  }, [])

  const notificar = (m, ms = 6000) => { setAviso(m); setTimeout(() => setAviso(null), ms) }

  const refrescarListas = useCallback(async () => {
    const est = estRef.current; if (!est) return
    setEstrategias(await db.listar('estrategias', (e) => e.simulacion_id === est.id))
    setConversaciones((await db.listar('conversaciones', (c) => c.simulacion_id === est.id)).sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion)))
  }, [])

  const cargarConversacion = useCallback(async (id) => {
    const est = estRef.current; if (!est) return
    est.conversacion_id = id
    const ms = await db.mensajesDe(id)
    setMensajes(ms.map((m) => ({ id: m.id, rol: m.rol, contenido: m.contenido, tokens: m.tokens_utilizados })))
    refrescarListas()
  }, [refrescarListas])

  // ---- Carga de escenario: DEM + OSM + meteo, luego estado + escena + worker ----
  const cargarEscenario = useCallback(async ({ nombre, lat, lng, fecha, hora_inicio }) => {
    try {
      motorRef.current?.terminar(); motorRef.current = null
      setCarga({ fase: 'Descargando DEM Terrarium…', error: null })
      const radioKm = 240 * 13 / 2000
      const [dem, ciudad, meteo] = await Promise.all([
        cargarDEM(lat, lng, radioKm),
        Promise.race([cargarCiudad(lat, lng, radioKm), new Promise((r) => setTimeout(() => r(null), 40000))]),
        cargarMeteo(lat, lng, fecha, 3).then((m) => ({ serie: m, fuente: m.aviso ? `open-meteo (${m.aviso})` : 'open-meteo' })).catch((e) => ({ serie: meteoSintetica(72), fuente: `sintetica (${e.message})` })),
      ])
      console.log('[dem] ' + JSON.stringify({ fuente: dem.fuente, ms: dem.ms, tiles: dem.tiles, error: dem.error, resolucionOrigen_m: dem.resolucionOrigen_m }))
      console.log('[osm] ' + JSON.stringify({ fuente: ciudad?.fuente, error: ciudad?.error, edificios: ciudad?.edificios?.length }))
      console.log('[meteo] ' + JSON.stringify({ fuente: meteo.fuente, horas: meteo.serie.length }))
      setDemInfo({ fuente: dem.fuente, ms: dem.ms, tiles: dem.tiles, aviso: dem.aviso })
      if (dem.aviso) notificar(`⚠️ ${dem.aviso}`)
      const ciudadFinal = ciudad || { ...ciudadSintetica(lat, lng), error: 'Overpass timeout 40 s' }
      setCarga({ fase: 'Construyendo escena…', error: null })
      const id = slug(nombre)
      const est = sim.crearSimulacion({ id, nombre, lat, lng, fecha, hora_inicio, dem: dem.dem, fuente_dem: dem.fuente, ciudad: ciudadFinal, meteo: meteo.serie })
      est.usarMeteo = false
      const m0 = meteo.serie[Math.max(0, parseInt(hora_inicio?.slice(0, 2) || '14', 10))] || meteo.serie[0]
      if (m0) { est.viento_kmh = m0.vientoKmh; est.viento_dir = m0.dirVientoGrados; est.humedad = Math.max(2, Math.round(m0.humedadFino)); est.temp = m0.temp; est.hr = m0.hr }
      setMeteoInfo({ fuente: meteo.fuente, horas: meteo.serie.length, actual: m0, peligro: m0 ? nivelPeligro(m0.fwiIndice) : '' })
      estRef.current = est
      api.registrarSimulacion(est)
      await db.cacheSet('ultima_simulacion', { id, nombre, lat, lng, fecha, hora_inicio })
      if (!escenaRef.current) escenaRef.current = new Escena3D(contRef.current)
      escenaRef.current.cargarEstado(est)
      escenaRef.current.onTickRequest = () => motorRef.current?.tick()
      escenaRef.current.onClickCelda = (c) => clickCelda(c)
      motorRef.current = crearMotorWorker(est, {
        onTick: () => { const e = estRef.current; escenaRef.current.actualizarGrid(e, sim.estadisticas(e).amenazadas); setMsTick(motorRef.current.msPromedio()); refrescar() },
        onError: (m) => notificar(`❌ Worker: ${m}`),
      })
      const prev = await db.ultimaConversacion(id)
      if (prev) await cargarConversacion(prev.id); else setMensajes([])
      refrescar(); refrescarListas()
      setCarga({ fase: null, error: null })
    } catch (e) {
      console.error(e)
      setCarga({ fase: null, error: e.message })
    }
  }, [refrescar, refrescarListas, cargarConversacion])

  function clickCelda({ modo, i, j, lat, lng }) {
    const est = estRef.current; if (!est) return
    if (modo === 'ignicion') { encenderCelda(est.grid, i, j, est.grid.tiempo_min); sim.registrarAccion(est, 'foco', `Nuevo foco en ${lat.toFixed(4)}, ${lng.toFixed(4)}`); notificar('🔥 Nuevo foco') }
    else if (modo === 'desplegar') { const sel = document.querySelector('.tabla tr.sel td')?.textContent || 'R-22'; api.despachoDesplegar({ simulacion_id: est.id, recurso_id: sel, lat, lng }).then((r) => notificar(r.ok ? `🎯 ${r.data.nombre} ETA ${r.data.eta_min} min` : `❌ ${r.detail}`)) }
    else if (modo === 'retardante') { api.simulacionAplicarRetardante({ simulacion_id: est.id, producto: 'Phos-Chek', volumen: 1200, zona: { lat, lng, radio_m: 300 } }).then((r) => notificar(r.ok ? `🧪 ${r.data.celdas_tratadas} celdas tratadas` : `❌ ${r.detail}`)) }
    else if (modo === 'corte') { const n = construirLineaControl(est.grid, lat, lng, 200, (est.viento_dir + 90) % 360, 1); sim.registrarAccion(est, 'cortafuego', `Cortafuego 200 m (${n} celdas)`); notificar(`✂️ Cortafuego ${n} celdas`) }
    else if (modo === 'exclusion') {
      const g = est.grid; const r = Math.ceil(150 / g.celda); let n = 0
      for (let a = i - r; a <= i + r; a++) for (let b = j - r; b <= j + r; b++) { if (a < 0 || b < 0 || a >= g.alto || b >= g.ancho || (a - i) ** 2 + (b - j) ** 2 > r * r) continue; const k = a * g.ancho + b; if (g.state[k] === ESTADO.SIN_QUEMAR) { g.state[k] = ESTADO.BARRERA; n++ } }
      sim.registrarAccion(est, 'exclusion', `Zona de exclusión r=150 m (${n} celdas)`); notificar(`⛔ Exclusión ${n} celdas`)
    }
    escenaRef.current.actualizarGrid(est); refrescar()
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const gpu = await detectarWebGPU()
      if (vivo) setIa((s) => ({ ...s, webgpu: gpu.disponible, detalle: gpu.disponible ? '' : gpu.razon, gpu: gpu.gpu || null }))
      const ult = await db.cacheGet('ultima_simulacion').catch(() => null)
      await cargarEscenario(ult || { nombre: 'Los Lagos 15 enero', lat: -41.42, lng: -72.70, fecha: '2026-01-15', hora_inicio: '14:00' })
    })()
    const t = setInterval(() => setFps(escenaRef.current?.fps || 0), 1000)
    // Métricas para verificación automatizada (headless): window.__metricas y consola.
    const tm = setInterval(() => {
      const est = estRef.current; if (!est || !escenaRef.current) return
      const { ia: iaM, demInfo: demM, mensajes: msM } = metaRef.current
      const m = { t: Date.now(), fps: +(escenaRef.current.fps || 0).toFixed(1), ms_tick_worker: +(motorRef.current?.msPromedio() || 0).toFixed(2), ticks: motorRef.current?.ticks || 0, tiempo_min: est.grid.tiempo_min, hectareas: +est.grid.stats.hectareas.toFixed(2), webgpu: iaM.webgpu, gpu: iaM.gpu, ia_estado: iaM.estado, dem: demM.fuente, dem_ms: demM.ms, dem_tiles: demM.tiles ?? null, osm: est.ciudad?.fuente, osm_error: est.ciudad?.error ?? null, osm_edificios: est.ciudad?.edificios?.length ?? 0, meteo: metaRef.current.meteoInfo?.fuente ?? null, meteo_horas: metaRef.current.meteoInfo?.horas ?? null, conversacion_id: est.conversacion_id, mensajes: msM.length, grid: `${est.grid.ancho}x${est.grid.alto}` }
      window.__metricas = m
      console.log('[metricas] ' + JSON.stringify(m))
    }, 2000)
    window.__app = { enviar: (p) => enviar(p), api, db, sim, estado: () => estRef.current, escena: () => escenaRef.current, cargarIA: () => cargarIA() }
    return () => { vivo = false; clearInterval(t); clearInterval(tm); motorRef.current?.terminar(); escenaRef.current?.dispose(); escenaRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (escenaRef.current) escenaRef.current.modoClick = modoClick }, [modoClick])

  async function cargarIA() {
    setIa((s) => ({ ...s, estado: 'cargando', progreso: 0, detalle: 'Iniciando descarga…' }))
    const t0 = performance.now()
    const p = crearProveedorWebLLM({ onProgress: (pr) => setIa((s) => ({ ...s, progreso: Math.round((pr.progress || 0) * 100), detalle: pr.text?.slice(0, 90) || '' })) })
    try {
      await p.cargar()
      proveedorRef.current = p; api.setProveedorIA(p)
      setIa((s) => ({ ...s, estado: 'listo', progreso: 100, detalle: `modelo listo en ${((performance.now() - t0) / 1000).toFixed(0)} s` }))
      notificar(`🧠 IA local lista (${MODELO_NAVEGADOR})`)
    } catch (e) {
      setIa((s) => ({ ...s, estado: 'error', detalle: e.message }))
      notificar(`❌ IA no cargó: ${e.message}. Se usan plantillas.`)
    }
  }

  async function enviar(pregunta) {
    const est = estRef.current; if (!est) return
    setMensajes((m) => [...m, { rol: 'user', contenido: pregunta }])
    setCargando(true)
    if (escenaRef.current) escenaRef.current.ahorroGPU = api.getProveedorIA().listo?.() === true
    try {
      const r = await api.chatConsultar({ pregunta, simulacion_id: est.id })
      if (!r.ok) setMensajes((m) => [...m, { rol: 'assistant', contenido: `❌ Error: ${r.detail}`, error: true }])
      else setMensajes((m) => [...m, { rol: 'assistant', contenido: r.data.respuesta, tokens: r.data.tokens_utilizados, latencia_s: r.data.latencia_s, fuente: r.data.fuente }])
      escenaRef.current?.actualizarGrid(est); refrescar(); refrescarListas()
    } catch (e) {
      setMensajes((m) => [...m, { rol: 'assistant', contenido: `❌ Error: ${e.message}`, error: true }])
    } finally { setCargando(false); if (escenaRef.current) escenaRef.current.ahorroGPU = false }
  }

  const acciones = {
    control: async (a) => { const est = estRef.current; const r = await api.simulacionControl({ simulacion_id: est.id, accion: a }); if (a === 'reiniciar' && r.ok) { motorRef.current?.reinit(); escenaRef.current.cargarEstado(est) } refrescar(); notificar(r.ok ? `✅ ${a}` : `❌ ${r.detail}`) },
    exageracion: (e) => escenaRef.current?.setExageracion(e),
    cargarEscenario,
    desplegarDireccion: async (id, d) => { const est = estRef.current; const p = sim.puntoEnDireccion(est, d, 600); const r = await api.despachoDesplegar({ simulacion_id: est.id, recurso_id: id, lat: p.lat, lng: p.lng }); notificar(r.ok ? `🎯 ${r.data.nombre} → ${d}, ETA ${r.data.eta_min} min` : `❌ ${r.detail}`); refrescar() },
    desplegarEn: async (id, lat, lng) => { const est = estRef.current; const r = await api.despachoDesplegar({ simulacion_id: est.id, recurso_id: id, lat, lng }); notificar(r.ok ? `🎯 ${r.data.nombre} ETA ${r.data.eta_min} min` : `❌ ${r.detail}`); refrescar() },
    exportar: async (f) => { const est = estRef.current; const r = await api.chatExportar({ conversacion_id: est.conversacion_id, formato: f, simulacion_id: est.id }); notificar(r.ok ? `⬇️ ${r.data.archivo} (${r.data.bytes} bytes)` : `❌ ${r.detail}`) },
    guardarEstrategia: async () => { const est = estRef.current; const r = await api.estrategiaGuardar({ simulacion_id: est.id }); notificar(r.ok ? `💾 ${r.data.nombre} → ${r.data.archivo}` : `❌ ${r.detail}`); refrescarListas() },
    nuevaConversacion: async () => { const est = estRef.current; const c = await db.crearConversacion(est.id); est.conversacion_id = c.id; setMensajes([]); proveedorRef.current?.reiniciarHistorial(); refrescarListas() },
    cargarConversacion,
  }

  return (
    <div className="app">
      <div className="visor" ref={contRef} />
      {carga.fase && <div className="overlay"><div className="spinner" /><div>{carga.fase}</div></div>}
      {carga.error && <div className="overlay error"><div>❌ {carga.error}</div><button className="btn" onClick={() => cargarEscenario({ nombre: 'Los Lagos 15 enero', lat: -41.42, lng: -72.70, fecha: '2026-01-15', hora_inicio: '14:00' })}>Reintentar</button></div>}
      {stats && (
        <>
          <div className="hud">
            <b>{estRef.current.nombre}</b> · T+{stats.minutos} min · {stats.hectareas} ha · ROS {stats.ros_cabeza} m/min · llama {stats.altura_llama} m · viento {stats.vel_viento} km/h/{stats.dir_viento}° · {fps.toFixed(0)} FPS · tick {msTick.toFixed(1)} ms
            {stats.pausado && <span className="warn"> ⏸️ PAUSADA</span>}
            {modoClick && <span className="on"> · modo clic: {modoClick}</span>}
            <button className="btn btn-xs" onClick={() => setChatVisible((v) => !v)}>{chatVisible ? 'ocultar chat' : 'mostrar chat'}</button>
          </div>
          <ChatPanel mensajes={mensajes} cargando={cargando} visible={chatVisible} onEnviar={enviar} ia={ia} onCargarIA={cargarIA} />
          <ControlPanel stats={stats} est={estRef.current} historial={historial} pestana={pestana} setPestana={setPestana} acciones={acciones} modoClick={modoClick} setModoClick={setModoClick} estrategias={estrategias} conversaciones={conversaciones} meteoInfo={meteoInfo} demInfo={demInfo} fps={fps} msTick={msTick} ia={ia} />
        </>
      )}
      {aviso && <div className="toast">{aviso}</div>}
    </div>
  )
}
