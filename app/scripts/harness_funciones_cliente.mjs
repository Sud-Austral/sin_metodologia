// Harness que invoca las 8 funciones cliente REALES (no mocks) y guarda su
// salida real en ejercicio/salidas/. Usa fake-indexeddb para que
// crearConversacion/guardarMensaje/guardarEstrategia (IndexedDB) funcionen
// en Node, igual que harían en el navegador.
// Ejecutar desde app/: node scripts/harness_funciones_cliente.mjs
import 'fake-indexeddb/auto'
import fs from 'node:fs'
import { chatConsultar } from '../src/api_cliente/chatConsultar.js'
import { despachoDesplegar } from '../src/api_cliente/despachoDesplegar.js'
import { despachoEta } from '../src/api_cliente/despachoEta.js'
import { simulacionAplicarRetardante } from '../src/api_cliente/simulacionAplicarRetardante.js'
import { simulacionControl } from '../src/api_cliente/simulacionControl.js'
import { chatExportar } from '../src/api_cliente/chatExportar.js'
import { analisisEstadisticas } from '../src/api_cliente/analisisEstadisticas.js'
import { chatGuardarEstrategia } from '../src/api_cliente/chatGuardarEstrategia.js'
import { estado, actualizarEstadisticas, registrarMuestraHistorial } from '../src/api_cliente/simEstado.js'

const resultados = {}

async function run(nombre, fn) {
  const t0 = performance.now()
  try {
    const r = await fn()
    resultados[nombre] = { ok: true, ms: Number((performance.now() - t0).toFixed(2)), resultado: r }
  } catch (e) {
    resultados[nombre] = { ok: false, ms: Number((performance.now() - t0).toFixed(2)), error: e.message }
  }
}

// Simular estado de simulación avanzado (como si llevara 65 min corriendo)
actualizarEstadisticas({ minutos: 65, hectareas: 45.3, ros: 8.2, alturaLlama: 12.5, modelo: 'K2', modeloNumero: 2 })
for (let m = 0; m <= 65; m += 5) {
  estado.minutos = m
  estado.ros = 6 + m * 0.03
  estado.hectareas = m * 0.7
  registrarMuestraHistorial()
}
estado.minutos = 65
estado.ros = 8.2
estado.hectareas = 45.3

await run('1_despachoDesplegar', () => despachoDesplegar({ recursoId: 'R-22', destinoLat: -41.234, destinoLng: -72.445, destinoNombre: 'Acceso Los Copihues' }))
await run('2_despachoEta', () => despachoEta({ recursoId: 'H-01', destinoLat: -41.234, destinoLng: -72.445 }))
await run('3_simulacionAplicarRetardante', () => simulacionAplicarRetardante({ volumenLitros: 1200, row: 120, col: 120, radioCeldas: 6 }))
await run('4_simulacionControl_pausar', () => simulacionControl({ accion: 'pausar' }))
await run('5_simulacionControl_reanudar', () => simulacionControl({ accion: 'reanudar' }))
await run('6_chatConsultar_pregunta_simple', () => chatConsultar({ pregunta: '¿Cuál es el ROS actual?' }))
await run('7_chatConsultar_comando_desplegar', () => chatConsultar({ pregunta: 'Desplegar Brigada R-22 al norte, acceso Los Copihues' }))
await run('8_chatGuardarEstrategia', () => chatGuardarEstrategia({ nombre: 'Plan Brigada+Retardante Los Lagos T=65' }))
await run('9_analisisEstadisticas', () => analisisEstadisticas())
await run('10_chatExportar_markdown', () => chatExportar({ formato: 'markdown' }))
await run('11_chatExportar_csv', () => chatExportar({ formato: 'csv' }))
await run('12_chatExportar_kmz', () => chatExportar({ formato: 'kmz', perimetroLatLng: [[-41.234, -72.445], [-41.235, -72.446], [-41.236, -72.444]] }))

fs.writeFileSync('../ejercicio/salidas/funciones_cliente_salida.json', JSON.stringify(resultados, null, 2))
console.log(JSON.stringify(resultados, null, 2))
