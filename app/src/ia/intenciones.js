// Parseador de intenciones: detecta si un mensaje de chat (del despachador
// o de la respuesta de la IA) corresponde a un comando ejecutable, tal como
// describe la Sección 7.2 del documento fuente (`parseador_intenciones`).
// Aquí se aplica tanto al mensaje del USUARIO (para decidir qué función
// cliente ejecutar) como opcionalmente al texto de la IA.

const PALABRAS_CLAVE = [
  { re: /\bevacuar\b/i, accion: 'evacuar' },
  { re: /\bretardante\b/i, accion: 'aplicar_retardante' },
  { re: /\b(pausa|pausar|detener|detén)\b/i, accion: 'pausar' },
  { re: /\b(reanudar|continuar|resume|reanuda)\b/i, accion: 'reanudar' },
  { re: /\b(reiniciar|reinicia|reset)\b/i, accion: 'reiniciar' },
  // Nota: \b falla como límite final tras una vocal acentuada (á no es \w en
  // JS sin /u ni \p{...}), por eso se usa un lookahead manual en vez de \b
  // al cierre de "guardá". Bug real encontrado por el test de este mismo
  // archivo (ver ejercicio/EQUIVOCACIONES.md).
  { re: /\b(?:guarda|guardá|guardar)(?=[^a-zA-Z0-9]|$).*\b(estrategia|plan|decisión|decision)\b/i, accion: 'guardar_estrategia' },
  { re: /\b(exportar|exporta|descargar|descarga)\b/i, accion: 'exportar' },
  { re: /\b(desplegar|despliega|manda|envía|envia)\b/i, accion: 'desplegar_recurso' },
]

const RE_RECURSO = /\b([A-Za-z]{1,3}-\d{1,3})\b/ // ej: R-22, H-01, E-5
const RE_DIRECCION = /\b(norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)\b/i
const RE_VOLUMEN = /(\d+[.,]?\d*)\s*(l|lt|lts|litros)\b/i
const RE_FORMATO = /\b(pdf|markdown|md|kmz|csv|json)\b/i
const RE_LUGAR = /\bacceso\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)(?:[.,]|$)/i

/**
 * parseIntencion: analiza un texto y retorna un comando estructurado o null
 * si no hay ninguna acción reconocible (caso -> es una consulta/pregunta).
 */
export function parseIntencion(texto) {
  if (!texto || typeof texto !== 'string') return null
  const limpio = texto.trim()
  if (!limpio) return null

  for (const { re, accion } of PALABRAS_CLAVE) {
    if (re.test(limpio)) {
      return {
        accion,
        parametros: extraerParametros(accion, limpio),
        textoOriginal: limpio,
      }
    }
  }
  return null
}

function extraerParametros(accion, texto) {
  const recursoMatch = texto.match(RE_RECURSO)
  const direccionMatch = texto.match(RE_DIRECCION)
  const volumenMatch = texto.match(RE_VOLUMEN)
  const formatoMatch = texto.match(RE_FORMATO)
  const lugarMatch = texto.match(RE_LUGAR)

  switch (accion) {
    case 'desplegar_recurso':
      return {
        recursoId: recursoMatch ? recursoMatch[1].toUpperCase() : null,
        direccion: direccionMatch ? direccionMatch[1].toLowerCase() : null,
        lugar: lugarMatch ? lugarMatch[1].trim() : null,
      }
    case 'aplicar_retardante':
      return {
        volumenLitros: volumenMatch ? parseFloat(volumenMatch[1].replace(',', '.')) : 1200,
        direccion: direccionMatch ? direccionMatch[1].toLowerCase() : null,
      }
    case 'exportar':
      return {
        formato: formatoMatch ? formatoMatch[1].toLowerCase().replace('md', 'markdown') : 'markdown',
      }
    case 'evacuar':
      return { lugar: lugarMatch ? lugarMatch[1].trim() : null }
    case 'guardar_estrategia':
      return {}
    default:
      return {}
  }
}

export const ACCIONES_RECONOCIDAS = [
  'evacuar',
  'aplicar_retardante',
  'pausar',
  'reanudar',
  'reiniciar',
  'guardar_estrategia',
  'exportar',
  'desplegar_recurso',
]
