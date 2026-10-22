// Ejecuta cada función de cliente (8 endpoints) con entrada válida e inválida y guarda
// ejercicio/salidas/endpoint-<funcion>.json con la salida literal.
import { mkdirSync, writeFileSync } from 'node:fs'
import * as sim from '../src/estado/simulacion.js'
import * as api from '../src/api/cliente.js'
import * as db from '../src/lib/db.js'

const DIR = new URL('../ejercicio/salidas/', import.meta.url)
mkdirSync(DIR, { recursive: true })
await db.limpiarTodo()
const est = sim.crearSimulacion({ id: 'sim-endpoints', nombre: 'Endpoints', semilla: 3 })
api.registrarSimulacion(est)
for (let k = 0; k < 12; k++) sim.avanzar(est)
const id = est.id
const recortar = (v) => JSON.parse(JSON.stringify(v, (k, x) => {
  if (x instanceof Uint8Array) return `<${x.length} bytes>`
  if (typeof x === 'string' && x.length > 1500) return x.slice(0, 1500) + `…(+${x.length - 1500} chars)`
  if (Array.isArray(x) && x.length > 12 && typeof x[0] !== 'object') return [...x.slice(0, 6), `…(${x.length} items)`]
  return x
}))

const pruebas = [
  { funcion: 'chatConsultar', contrato: 'POST /api/v1/chat/consultar', valida: { pregunta: '¿Cuál es el ROS actual?', simulacion_id: id }, invalida: { pregunta: '', simulacion_id: id } },
  { funcion: 'despachoDesplegar', contrato: 'POST /api/v1/despacho/desplegar', valida: { simulacion_id: id, recurso_id: 'R-22', lat: -41.41, lng: -72.70 }, invalida: { simulacion_id: id, recurso_id: 'R-22', lat: 999, lng: 0 } },
  { funcion: 'simulacionAplicarRetardante', contrato: 'POST /api/v1/simulacion/aplicar-retardante', valida: { simulacion_id: id, producto: 'Phos-Chek', volumen: 1200, zona: { lat: -41.415, lng: -72.70, radio_m: 400 } }, invalida: { simulacion_id: id, producto: 'Phos-Chek', volumen: -1, zona: { lat: -41.415, lng: -72.70 } } },
  { funcion: 'simulacionControl', contrato: 'POST /api/v1/simulacion/control', valida: { simulacion_id: id, accion: 'pausar' }, invalida: { simulacion_id: id, accion: 'volar' }, despues: () => api.simulacionControl({ simulacion_id: id, accion: 'reanudar' }) },
  { funcion: 'chatExportar', contrato: 'GET /api/v1/chat/exportar/{conversacion_id}?formato=', valida: () => ({ conversacion_id: est.conversacion_id, formato: 'markdown', simulacion_id: id }), invalida: { conversacion_id: 'no-existe', formato: 'markdown' } },
  { funcion: 'analisisEstadisticas', contrato: 'GET /api/v1/analisis/estadisticas', valida: { simulacion_id: id }, invalida: { simulacion_id: 'no-existe' } },
  { funcion: 'estrategiaGuardar', contrato: 'POST /api/v1/estrategia/guardar', valida: { simulacion_id: id, nombre: 'Plan Brigada+Retardante Los Lagos T=60' }, invalida: {} },
  { funcion: 'simulacionProyectar', contrato: 'POST /api/v1/simulacion/proyectar', valida: { simulacion_id: id, viento_kmh: 35, en_min: 30 }, invalida: { simulacion_id: id, viento_kmh: 35, en_min: 1 } },
]
const resumen = []
for (const p of pruebas) {
  const entradaV = typeof p.valida === 'function' ? p.valida() : p.valida
  const rv = await api[p.funcion](entradaV)
  const ri = await api[p.funcion](p.invalida)
  if (p.despues) await p.despues()
  const salida = { contrato: p.contrato, funcion: p.funcion, valida: { entrada: entradaV, salida: recortar(rv) }, invalida: { entrada: p.invalida, salida: recortar(ri) } }
  writeFileSync(new URL(`endpoint-${p.funcion}.json`, DIR), JSON.stringify(salida, null, 2))
  resumen.push({ funcion: p.funcion, contrato: p.contrato, valida_status: rv.status, invalida_status: ri.status, ok: rv.ok && !ri.ok })
}
writeFileSync(new URL('endpoints-resumen.json', DIR), JSON.stringify(resumen, null, 2))
console.log(JSON.stringify(resumen, null, 2))
