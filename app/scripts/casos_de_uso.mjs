// Reproduce los 8 casos de uso de la Sección 9 del documento fuente contra
// la implementación REAL (parseador de intenciones + funciones cliente +
// respondedor de plantilla, que es lo que realmente se ejecuta en este
// entorno de verificación porque no hay WebGPU real disponible -- ver
// ejercicio/no_comprobado). Las respuestas NO son las ilustrativas del
// documento: son las que el código de este ejercicio produce de verdad,
// a partir de números reales del estado simulado.
// Ejecutar desde app/: node scripts/casos_de_uso.mjs
import 'fake-indexeddb/auto'
import fs from 'node:fs'
import { chatConsultar } from '../src/api_cliente/chatConsultar.js'
import { estado, actualizarEstadisticas, registrarMuestraHistorial } from '../src/api_cliente/simEstado.js'

function avanzarEstado(minutos, hectareas, ros) {
  estado.minutos = minutos
  estado.hectareas = hectareas
  estado.ros = ros
  registrarMuestraHistorial()
}

async function escribirCaso(n, titulo, turnos) {
  let md = `# Caso de uso ${n}: ${titulo}\n\n`
  md += `_Transcripción REAL obtenida ejecutando app/src/api_cliente/chatConsultar.js contra el estado simulado de abajo. `
  md += `El modelo usado es "fallback-template-local" (respuestas de plantilla) porque este entorno de verificación no tiene WebGPU/GPU real disponible -- ver ejercicio/no_comprobado.md._\n\n`
  md += `Estado al iniciar: minutos=${estado.minutos}, hectareas=${estado.hectareas}, ros=${estado.ros}, viento=${estado.velViento}km/h, humedad=${estado.humCombustible}%, modelo=${estado.modelo}\n\n`
  for (const pregunta of turnos) {
    const r = await chatConsultar({ pregunta })
    md += `**Despachador**: ${pregunta}\n\n`
    md += `**IA** (modelo: ${r.modelo}):\n\n${r.respuesta}\n\n`
    if (r.comandoEjecutado) {
      md += `_Comando detectado y ejecutado: \`${r.comandoEjecutado.accion}\`, parámetros: ${JSON.stringify(r.comandoEjecutado.parametros)}, resultado: ${JSON.stringify(r.comandoEjecutado.resultado)}_\n\n`
    } else {
      md += `_No se detectó ningún comando ejecutable en esta pregunta (se trató como consulta)._\n\n`
    }
    md += `---\n\n`
  }
  fs.writeFileSync(`../ejercicio/salidas/caso-${n}.md`, md)
  console.log(`caso-${n}.md escrito (${turnos.length} turnos)`)
}

// Caso 1: lectura simple (ROS)
avanzarEstado(120, 45.3, 8.2)
actualizarEstadisticas({ velViento: 22, humCombustible: 9, modelo: 'K2', modeloNumero: 2 })
await escribirCaso(1, 'Lectura simple (ROS)', ['¿Cuál es el ROS actual?'])

// Caso 2: control — desplegar brigada
await escribirCaso(2, 'Control — Desplegar Brigada', ['Desplegar Brigada R-22 al norte, acceso Los Copihues'])

// Caso 3: proyección alternativa (viento sube)
await escribirCaso(3, 'Proyección alternativa', ['¿Qué pasa si viento sube a 35 km/h en 30 min?'])

// Caso 4: análisis estratégico
await escribirCaso(4, 'Análisis estratégico (¿Brigada norte o este?)', ['¿Brigada norte o este?'])

// Caso 5: guardado de decisión
await escribirCaso(5, 'Guardado de decisión', ['Guardá la estrategia actual'])

// Caso 6: análisis de amenaza (riesgo Puerto Montt)
actualizarEstadisticas({ distanciaObjetivoKm: 18.5 })
await escribirCaso(6, 'Análisis de amenaza (riesgo Puerto Montt)', ['¿Cuál es el riesgo para Puerto Montt?'])

// Caso 7: modo conversacional multi-turno
await escribirCaso(7, 'Modo conversacional multi-turno', [
  '¿Hay alternativa sin helicóptero?',
  '¿Y retardante por tierra?',
  'Ejecutar Plan C',
])

// Caso 8: exportación inteligente
await escribirCaso(8, 'Exportación inteligente', ['Exporta todo a PDF'])

console.log('Casos de uso completos.')
