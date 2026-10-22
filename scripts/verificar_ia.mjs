// Verificación de la IA en navegador (WebLLM sobre WebGPU) con Chrome headless + CDP:
// carga el modelo (descarga real), mide tiempo de descarga, latencia de respuesta y guarda
// ejercicio/salidas/ia-navegador.json. Uso: node scripts/verificar_ia.mjs [url] [chrome.exe]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_APP = process.argv[2] || 'http://localhost:4173/sin_metodologia/'
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9444
const MAX_CARGA_MS = 15 * 60 * 1000
const DIR = new URL('../ejercicio/salidas/', import.meta.url)
mkdirSync(DIR, { recursive: true })
const perfil = join(tmpdir(), `chrome-ia-${Date.now()}`)
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${perfil}`, '--window-size=1600,900', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle', '--use-angle=default', URL_APP], { stdio: 'ignore' })
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function conectar() {
  for (let k = 0; k < 30; k++) { try { const l = await (await fetch(`http://localhost:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch { /* esperar */ } await dormir(500) }
  throw new Error('Chrome no expuso el puerto de depuración')
}
const ws = new WebSocket(await conectar())
await new Promise((r) => (ws.onopen = r))
let idc = 0; const pend = new Map(); const consola = []
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === 'Runtime.consoleAPICalled') consola.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')) }
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expr, timeout = 60000) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value }
await cdp('Runtime.enable')

const res = { url: URL_APP, fecha: new Date().toISOString() }
try {
  let m = null
  for (let k = 0; k < 80 && !(m && m.ticks >= 1); k++) { m = await ev('window.__metricas || null'); await dormir(1500) }
  if (!m) throw new Error('La app no publicó métricas')
  res.webgpu = m.webgpu; res.gpu = m.gpu
  if (!m.webgpu) throw new Error('Sin WebGPU en este Chrome: no se puede cargar WebLLM')
  const t0 = Date.now()
  await ev('window.__app.cargarIA(); true')
  let estado = 'cargando', detalle = ''
  while (Date.now() - t0 < MAX_CARGA_MS) {
    const s = await ev(`(()=>{ const b=document.querySelector('.badge'); const a=document.querySelector('.chat-ia-aviso'); return {badge:b?b.textContent:'', aviso:a?a.textContent.slice(0,160):''} })()`)
    detalle = s.aviso
    if (/local · WebGPU/.test(s.badge)) { estado = 'listo'; break }
    if (/^error/.test(s.badge) || /no cargó/.test(s.aviso)) { estado = 'error'; break }
    await dormir(5000)
  }
  res.carga = { estado, segundos: +((Date.now() - t0) / 1000).toFixed(1), detalle }
  console.log('carga', JSON.stringify(res.carga))
  if (estado !== 'listo') throw new Error(`IA no quedó lista: ${estado} ${detalle}`)
  res.modelo = await ev('window.__app.api.getProveedorIA().modelo')
  // Tamaño en cache (Cache Storage de WebLLM)
  res.cache_mb = await ev(`(async()=>{ try { const e = await navigator.storage.estimate(); return +(e.usage/1048576).toFixed(1) } catch { return null } })()`)
  res.preguntas = []
  for (const p of ['¿Cuál es el ROS actual?', 'Desplegar Brigada R-22 al norte', '¿Brigada norte o este?']) {
    // Vía window.__app.enviar (misma ruta que el usuario: activa el modo ahorro GPU del render)
    const r = await ev(`(async()=>{ const e=window.__app.estado(); const t0=performance.now(); await window.__app.enviar(${JSON.stringify(p)}); const lat=(performance.now()-t0)/1000; const ms=await window.__app.db.mensajesDe(e.conversacion_id); const u=ms.at(-1); return {ok:true, modelo:u.modelo, fuente:/plantillas|fallback/.test(u.modelo||'')?'fallback':'webllm', latencia_s:+lat.toFixed(2), tokens:u.tokens_utilizados, comando:u.comando?.accion??null, respuesta:u.contenido} })()`, 200000)
    res.preguntas.push({ pregunta: p, ...r })
    console.log('pregunta', JSON.stringify({ p, latencia_s: r.latencia_s, tokens: r.tokens, fuente: r.fuente, comando: r.comando }))
  }
  res.recursos = await ev(`window.__app.estado().recursos.filter(r=>r.estado!=='DISPONIBLE').map(r=>({id:r.id,estado:r.estado,eta:r.eta_min}))`)
  res.ok = true
} catch (e) { res.ok = false; res.error = e.message; console.error('ERROR', e.message) }
res.consola = consola.filter((l) => !l.includes('[metricas]')).slice(-40)
writeFileSync(new URL('ia-navegador.json', DIR), JSON.stringify(res, null, 2))
console.log('RESUMEN', JSON.stringify({ ok: res.ok, carga: res.carga, modelo: res.modelo, cache_mb: res.cache_mb, latencias: res.preguntas?.map((p) => p.latencia_s) }))
ws.close(); chrome.kill()
process.exit(res.ok ? 0 : 1)
