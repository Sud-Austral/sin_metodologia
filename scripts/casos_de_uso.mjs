// Reproduce los 8 casos de uso de la Sección 9 contra las funciones reales de cliente
// (modo plantillas, sin navegador) y escribe ejercicio/salidas/caso-N.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import * as sim from '../src/estado/simulacion.js'
import * as api from '../src/api/cliente.js'
import * as db from '../src/lib/db.js'

const DIR = new URL('../ejercicio/salidas/', import.meta.url)
mkdirSync(DIR, { recursive: true })

const CASOS = [
  { n: 1, titulo: 'Lectura Simple', turnos: ['¿Cuál es el ROS actual?'] },
  { n: 2, titulo: 'Control — Desplegar Brigada', turnos: ['Desplegar Brigada R-22 al norte, acceso Los Copihues'] },
  { n: 3, titulo: 'Proyección Alternativa', turnos: ['¿Qué pasa si viento sube a 35 km/h en 30 min?'] },
  { n: 4, titulo: 'Análisis Estratégico', turnos: ['¿Brigada norte o este?'] },
  { n: 5, titulo: 'Guardado de Decisión', turnos: ['Guardá la estrategia actual'] },
  { n: 6, titulo: 'Análisis de Amenaza', turnos: ['Riesgo para Puerto Montt'] },
  { n: 7, titulo: 'Modo Conversacional — Multi-turn', turnos: ['¿Hay alternativa sin helicóptero?', '¿Y retardante por tierra?', 'Ejecutar Plan C'] },
  { n: 8, titulo: 'Exportación Inteligente', turnos: ['Exporta todo a PDF'] },
]

await db.limpiarTodo()
const est = sim.crearSimulacion({ id: 'sim-los-lagos-15-enero', nombre: 'Los Lagos 15 enero', semilla: 3 })
api.registrarSimulacion(est)
for (let k = 0; k < 24; k++) sim.avanzar(est) // T+120 min, como en los ejemplos
const resumen = []
for (const c of CASOS) {
  const antes = sim.estadisticas(est)
  const out = [`# Caso ${c.n}: ${c.titulo}`, '', `Generado: ${new Date().toISOString()} · ejecutado con \`node scripts/casos_de_uso.mjs\` contra \`src/api/cliente.js\` (proveedor: plantillas deterministas, sin navegador).`, '', `Estado previo: T+${antes.minutos} min, ${antes.hectareas} ha, ROS ${antes.ros_cabeza} m/min, viento ${antes.vel_viento} km/h desde ${antes.dir_viento}°, humedad ${antes.hum_combustible} %.`, '']
  const resultados = []
  for (const t of c.turnos) {
    const r = await api.chatConsultar({ pregunta: t, simulacion_id: est.id })
    out.push(`## 👤 Despachador`, '', t, '', `## 🤖 IA`, '', r.ok ? r.data.respuesta : `ERROR ${r.status}: ${r.detail}`, '')
    out.push(`<details><summary>Metadatos del turno</summary>`, '', '```json', JSON.stringify(r.ok ? { status: r.status, modelo: r.data.modelo, tokens_utilizados: r.data.tokens_utilizados, latencia_s: r.data.latencia_s, fuente: r.data.fuente, comando: r.data.comando?.accion ?? null, resultado: r.data.resultado } : r, null, 2), '```', '', '</details>', '')
    resultados.push({ turno: t, ok: r.ok, comando: r.data?.comando?.accion ?? null })
  }
  const despues = sim.estadisticas(est)
  out.push(`## Efecto en el estado`, '', `- Recursos: ${despues.recursos.filter((r) => r.estado !== 'DISPONIBLE').map((r) => `${r.id} ${r.estado}${r.eta_min ? ` ETA ${r.eta_min}` : ''}`).join(', ') || 'ninguno desplegado'}`, `- Acciones registradas: ${est.acciones.length}`, `- Retardantes activos: ${est.retardantes.length}`, `- Pausada: ${despues.pausado}`, '')
  writeFileSync(new URL(`caso-${c.n}.md`, DIR), out.join('\n'))
  resumen.push({ n: c.n, titulo: c.titulo, turnos: resultados })
  // avanzar 2 ticks entre casos para que ETAs/llegadas se reflejen
  for (let k = 0; k < 2; k++) sim.avanzar(est)
}
const conv = await db.ultimaConversacion(est.id)
const ms = await db.mensajesDe(conv.id)
resumen.push({ persistencia: { conversacion_id: conv.id, mensajes: ms.length, estrategias: (await db.listar('estrategias')).length, acciones_db: (await db.listar('acciones')).length } })
writeFileSync(new URL('casos-resumen.json', DIR), JSON.stringify(resumen, null, 2))
console.log(JSON.stringify(resumen, null, 2))
