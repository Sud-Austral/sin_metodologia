// Verificación en navegador real (Chrome headless + CDP por WebSocket, sin dependencias):
// carga la app servida por `vite preview`, mide FPS / ms por tick / DEM / WebGPU, ejecuta
// comandos por chat, cambia pestañas, exporta markdown, recarga para comprobar persistencia
// y guarda ejercicio/salidas/navegador.json + captura PNG.
// Uso: node scripts/verificar_navegador.mjs [url] [chrome.exe]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_APP = process.argv[2] || 'http://localhost:4173/sin_metodologia/'
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const DIR = new URL('../ejercicio/salidas/', import.meta.url)
mkdirSync(DIR, { recursive: true })
const perfil = join(tmpdir(), `chrome-verif-${Date.now()}`)
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${perfil}`, '--window-size=1600,900', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle', '--use-angle=default', URL_APP], { stdio: 'ignore' })
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function conectar() {
  for (let k = 0; k < 30; k++) {
    try {
      const lista = await (await fetch(`http://localhost:${PORT}/json/list`)).json()
      const page = lista.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* aún no arranca */ }
    await dormir(500)
  }
  throw new Error('Chrome no expuso el puerto de depuración')
}

const ws = new WebSocket(await conectar())
await new Promise((r) => (ws.onopen = r))
let idc = 0
const pend = new Map()
const consola = []
const errores = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled') { const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' '); consola.push(`[${m.params.type}] ${txt}`); if (m.params.type === 'error') errores.push(txt) }
  if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''))
}
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expr, timeout = 60000) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value }
await cdp('Runtime.enable'); await cdp('Page.enable')

async function esperarMetricas(cond, maxMs = 120000) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) { const m = await ev('window.__metricas || null'); if (m && cond(m)) return m; await dormir(1500) }
  throw new Error('Timeout esperando métricas')
}

const res = { url: URL_APP, fecha: new Date().toISOString(), pasos: [] }
const paso = (n, v) => { res.pasos.push({ n, ...v }); console.log(n, JSON.stringify(v)) }
try {
  const t0 = Date.now()
  const m0 = await esperarMetricas((m) => m.ticks >= 5)
  paso('carga_y_primeros_ticks', { segundos: +((Date.now() - t0) / 1000).toFixed(1), ...m0 })
  res.webgpu = await ev(`(async()=>{ if(!navigator.gpu) return {disponible:false, razon:'navigator.gpu ausente'}; const a=await navigator.gpu.requestAdapter(); if(!a) return {disponible:false, razon:'requestAdapter null'}; const i=a.info||{}; return {disponible:true, gpu:[i.vendor,i.architecture,i.device,i.description].filter(Boolean).join(' ')} })()`)
  res.webgl = await ev(`(()=>{ const c=document.createElement('canvas'); const g=c.getContext('webgl2')||c.getContext('webgl'); if(!g) return null; const d=g.getExtension('WEBGL_debug_renderer_info'); return d? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) })()`)
  // FPS: muestrear 10 s con rAF
  res.fps = await ev(`new Promise(r=>{ let n=0; const t0=performance.now(); function f(){ n++; if(performance.now()-t0<10000) requestAnimationFrame(f); else r(+(n*1000/(performance.now()-t0)).toFixed(1)) } requestAnimationFrame(f) })`, 20000)
  const m1 = await ev('window.__metricas')
  res.ms_tick_worker = m1.ms_tick_worker; res.ticks = m1.ticks; res.dem = { fuente: m1.dem, ms: m1.dem_ms, tiles: m1.dem_tiles }; res.osm = { fuente: m1.osm, error: m1.osm_error, edificios: m1.osm_edificios }; res.meteo = { fuente: m1.meteo, horas: m1.meteo_horas }; res.grid = m1.grid
  paso('medicion', { fps: res.fps, ms_tick_worker: res.ms_tick_worker, ticks: res.ticks, dem: res.dem, osm: res.osm, meteo: res.meteo, webgpu: res.webgpu, webgl: res.webgl })
  // Chat: pregunta simple (latencia) y comando desplegar
  const t1 = Date.now(); await ev(`window.__app.enviar('¿Cuál es el ROS actual?')`, 30000); const lat1 = (Date.now() - t1) / 1000
  await dormir(500)
  const n1 = await ev(`document.querySelectorAll('.msg').length`)
  const txt1 = await ev(`[...document.querySelectorAll('.msg.assistant .burbuja')].at(-1)?.innerText.slice(0,200)`)
  paso('chat_pregunta_simple', { latencia_s: +lat1.toFixed(2), mensajes_dom: n1, respuesta: txt1 })
  const t2 = Date.now(); await ev(`window.__app.enviar('Desplegar Brigada R-22 al norte, acceso Los Copihues')`, 30000); const lat2 = (Date.now() - t2) / 1000
  await dormir(500)
  const rec = await ev(`window.__app.estado().recursos.filter(r=>r.estado!=='DISPONIBLE').map(r=>({id:r.id,estado:r.estado,eta:r.eta_min}))`)
  const sprites = await ev(`(()=>{ const e=window.__app.escena(); return e.recursos.sprites.size + ' sprites, rutas visibles: ' + [...e.recursos.rutas.values()].filter(r=>r.visible).length })()`)
  paso('chat_comando_desplegar', { latencia_s: +lat2.toFixed(2), recursos: rec, escena: sprites })
  // Cambiar las 6 pestañas sin errores
  const errAntes = errores.length
  const tabs = await ev(`(async()=>{ const out=[]; for (const b of document.querySelectorAll('.tab')) { b.click(); await new Promise(r=>setTimeout(r,250)); out.push(b.textContent + ':' + (document.querySelector('.tab.activa')?.textContent===b.textContent)) } return out })()`)
  paso('pestanas', { tabs, errores_nuevos: errores.length - errAntes })
  // Exportar markdown y KMZ
  const exp = await ev(`(async()=>{ const e=window.__app.estado(); const r=await window.__app.api.chatExportar({conversacion_id:e.conversacion_id, formato:'markdown', simulacion_id:e.id}); const k=await window.__app.api.chatExportar({formato:'kmz', simulacion_id:e.id}); return {md:{ok:r.ok, archivo:r.data?.archivo, bytes:r.data?.bytes, mensajes:r.data?.mensajes}, kmz:{ok:k.ok, archivo:k.data?.archivo, bytes:k.data?.bytes}} })()`)
  paso('exportar', exp)
  // Persistencia: recargar y comprobar que la conversación vuelve
  const convAntes = await ev(`window.__app.estado().conversacion_id`)
  const msgsAntes = await ev(`document.querySelectorAll('.msg').length`)
  await cdp('Page.reload'); await dormir(3000)
  const m2 = await esperarMetricas((m) => m.ticks >= 2)
  const convDespues = await ev(`window.__app.estado().conversacion_id`)
  const msgsDespues = await ev(`document.querySelectorAll('.msg').length`)
  paso('persistencia_recarga', { conversacion_antes: convAntes, conversacion_despues: convDespues, mensajes_antes: msgsAntes, mensajes_despues: msgsDespues, recupera: convAntes === convDespues && msgsDespues >= msgsAntes, dem_tras_recarga: m2.dem, dem_ms_tras_recarga: m2.dem_ms })
  const idb = await ev(`(async()=>{ const c=await window.__app.db.listar('conversaciones'); const m=await window.__app.db.listar('mensajes'); return {conversaciones:c.length, mensajes:m.length, indexedDB: typeof indexedDB!=='undefined'} })()`)
  paso('indexeddb', idb)
  const shot = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL('captura-navegador.png', DIR), Buffer.from(shot.data, 'base64'))
  res.ok = true
} catch (e) {
  res.ok = false; res.error = e.message
  console.error('ERROR', e)
}
res.errores_consola = errores
res.consola_recortada = consola.filter((l) => !l.includes('[metricas]')).slice(0, 60)
writeFileSync(new URL('navegador.json', DIR), JSON.stringify(res, null, 2))
console.log('RESUMEN', JSON.stringify({ ok: res.ok, fps: res.fps, ms_tick_worker: res.ms_tick_worker, webgpu: res.webgpu, dem: res.dem, errores: errores.length }))
ws.close(); chrome.kill()
process.exit(res.ok ? 0 : 1)
