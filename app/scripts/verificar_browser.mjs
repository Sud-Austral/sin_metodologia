// Verificacion con un navegador Chromium REAL (Playwright) contra el dev
// server de Vite ya corriendo en http://localhost:5180. Comprueba:
//  1. La pagina carga sin errores fatales de consola (nunca pantalla en blanco)
//  2. WebGPU disponible o no, y que el ChatPanel muestra el fallback correcto
//  3. Persistencia en IndexedDB: un mensaje sobrevive un reload real
//  4. FPS aproximados midiendo requestAnimationFrame durante 3s
// Ejecutar (con el dev server ya arriba en :5180), desde app/:
//   node scripts/verificar_browser.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = 'http://localhost:5180/'
const resultado = { fecha: new Date().toISOString(), pasos: [] }

function log(paso, datos) {
  resultado.pasos.push({ paso, ...datos })
  console.log(`[${paso}]`, JSON.stringify(datos))
}

const browser = await chromium.launch()
const page = await browser.newPage()
const consoleErrors = []
const consoleAll = []
page.on('console', (msg) => {
  consoleAll.push(`${msg.type()}: ${msg.text()}`)
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
try {
  await page.waitForSelector('input[placeholder*="ROS"]', { timeout: 20000 })
} catch (e) {
  log('timeout_espera_chatpanel', { error: e.message })
}

const tieneRoot = await page.evaluate(() => !!document.getElementById('root'))
const textoVisible = await page.evaluate(() => document.body.innerText.slice(0, 2000))
const htmlLength = (await page.content()).length

log('carga_inicial', { tieneRoot, htmlLength, erroresConsola: consoleErrors.length, muestraTexto: textoVisible.slice(0, 300) })

const webgpuDisponible = await page.evaluate(() => !!navigator.gpu)
log('webgpu', { webgpuDisponible })

// Verificar que el ChatPanel (o el mensaje de fallback) este presente -- nunca pantalla en blanco
const bodyNoVacio = textoVisible.trim().length > 0
log('no_pantalla_en_blanco', { bodyNoVacio })

// Intentar enviar un mensaje de chat si el input existe
let mensajeEnviado = false
try {
  const input = await page.$('input[placeholder*="ROS"]')
  if (input) {
    await input.fill('¿Cuál es el ROS actual?')
    await input.press('Enter')
    try {
      await page.waitForFunction(() => !document.body.innerText.includes('Pensando'), { timeout: 10000 })
    } catch (e) {
      log('timeout_espera_respuesta_chat', { error: e.message })
    }
    mensajeEnviado = true
  }
} catch (e) {
  log('error_envio_chat', { error: e.message })
}
const textoTrasEnvio = await page.evaluate(() => document.body.innerText.slice(0, 1500))
log('texto_tras_envio_chat', { textoTrasEnvio })
log('chat_mensaje_enviado', { mensajeEnviado })

// Persistencia IndexedDB: leer si hay bases de datos registradas
const dbsAntes = await page.evaluate(async () => {
  if (!indexedDB.databases) return null
  const dbs = await indexedDB.databases()
  return dbs.map((d) => d.name)
})
log('indexeddb_antes_reload', { dbsAntes })

await page.reload({ waitUntil: 'load' })
try {
  await page.waitForSelector('input[placeholder*="ROS"]', { timeout: 15000 })
} catch (e) {
  log('timeout_espera_chatpanel_tras_reload', { error: e.message })
}
await page.waitForTimeout(500)
const textoTrasReload = await page.evaluate(() => document.body.innerText.slice(0, 2000))
const dbsDespues = await page.evaluate(async () => {
  if (!indexedDB.databases) return null
  const dbs = await indexedDB.databases()
  return dbs.map((d) => d.name)
})
log('tras_reload', { dbsDespues, muestraTexto: textoTrasReload.slice(0, 300) })

// FPS aproximados: contar rAF durante 3000ms
const fps = await page.evaluate(async () => {
  return await new Promise((resolve) => {
    let frames = 0
    const t0 = performance.now()
    function contar() {
      frames++
      if (performance.now() - t0 < 3000) requestAnimationFrame(contar)
      else resolve(frames / 3)
    }
    requestAnimationFrame(contar)
  })
})
log('fps_medidos', { fps })

await page.screenshot({ path: '../ejercicio/salidas/captura_pantalla.png', fullPage: false }).catch((e) => log('error_screenshot', { error: e.message }))

resultado.erroresConsolaCompletos = consoleErrors
resultado.consolaCompleta = consoleAll.slice(0, 80)
resultado.webgpuDisponible = webgpuDisponible
resultado.fpsMedidos = fps
resultado.dbsAntes = dbsAntes
resultado.dbsDespues = dbsDespues

fs.writeFileSync('../ejercicio/salidas/verificacion_browser.json', JSON.stringify(resultado, null, 2))
console.log('=== RESULTADO GUARDADO en ejercicio/salidas/verificacion_browser.json ===')

await browser.close()
