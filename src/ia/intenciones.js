// Parseador de intenciones: detecta comandos ejecutables en texto (del usuario o de la IA).
// Devuelve { accion, parametros, texto_original } o null.

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const DIRECCIONES = ['noreste', 'noroeste', 'sureste', 'suroeste', 'norte', 'sur', 'este', 'oeste']

export function extraerRecurso(t) {
  const m = t.match(/\b([rhecm])-?(\d{1,2})\b/i)
  if (m) return `${m[1].toUpperCase()}-${m[2]}`
  if (/helic[oó]ptero/i.test(t)) return 'H-01'
  if (/excavadora/i.test(t)) return 'E-5'
  if (/cisterna|cami[oó]n/i.test(t)) return 'C-1'
  if (/motobomba/i.test(t)) return 'M-1'
  if (/brigada/i.test(t)) return 'R-22'
  return null
}

export function extraerDireccion(t) {
  const n = norm(t)
  for (const d of DIRECCIONES) if (new RegExp(`\\b(al |hacia |flanco |frente )?${d}\\b`).test(n)) return d
  return null
}

export function extraerVolumen(t) {
  const m = t.replace(/(\d)[.,](\d{3})/g, '$1$2').match(/(\d{3,6})\s*(l|lt|litros?)\b/i)
  return m ? parseInt(m[1], 10) : null
}

export function extraerLugar(t) {
  const m = t.match(/(?:acceso|a|hacia|en|para|sobre)\s+([A-ZÁÉÍÓÚ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚ][\wáéíóúñ]+)*)/)
  return m ? m[1] : null
}

export function parseadorIntenciones(texto) {
  if (!texto || typeof texto !== 'string') return null
  const t = texto.trim()
  const n = norm(t)
  const base = (accion, parametros = {}) => ({ accion, parametros, texto_original: t })

  // Control
  if (/\b(pausa|pausar|detener|deten|congela)\b/.test(n)) return base('control', { accion: 'pausar' })
  if (/\b(reanudar|reanuda|continuar|continua|seguir|play)\b/.test(n) && !/escenario/.test(n)) return base('control', { accion: 'reanudar' })
  if (/\b(reiniciar|reinicia|reset|desde cero)\b/.test(n)) return base('control', { accion: 'reiniciar' })

  // Exportación
  if (/\b(exporta|exportar|descarga|descargar|genera(r)? (un )?(pdf|reporte|informe))\b/.test(n)) {
    let formato = 'markdown'
    if (/pdf|informe|reporte/.test(n)) formato = 'pdf'
    else if (/kmz|kml|google earth/.test(n)) formato = 'kmz'
    else if (/csv|excel|estad/.test(n)) formato = 'csv'
    else if (/json/.test(n)) formato = 'json'
    return base('exportar', { formato, todo: /todo/.test(n) })
  }

  // Guardar estrategia / decisión
  if (/\b(guarda|guardar|graba|grabar|salva|registra)\b/.test(n) && /(estrategia|plan|decision|actual|snapshot)/.test(n)) {
    const m = t.match(/["“]([^"”]+)["”]/)
    return base('guardar_estrategia', { nombre: m ? m[1] : null })
  }

  // Ejecutar plan
  const plan = n.match(/\b(ejecutar|ejecuta|activar|activa|aplicar|aplica)\s+(el\s+)?plan\s+([abc])\b/)
  if (plan) return base('ejecutar_plan', { plan: plan[3].toUpperCase() })

  // Retardante (explícito, con volumen o producto)
  if (/retardante|phos-?chek|descarga aerea|descarga de agua/.test(n) && !/(^|\s)(y|¿y)\s+retardante por tierra/.test(n) && /(aplica|aplicar|lanza|lanzar|descarga|descargar|usar|usa|aumentar|aumenta)/.test(n)) {
    const volumen = extraerVolumen(t) || 1200
    const producto = /agua|tierra|terrestre|cisterna/.test(n) ? 'agua+gel' : 'Phos-Chek'
    return base('aplicar_retardante', { producto, volumen, direccion: extraerDireccion(t), zona: null })
  }

  // Desplegar
  if (/\b(desplegar|despliega|despacha|despachar|enviar|envia|manda|mandar|mover|mueve)\b/.test(n) && /(brigada|helic|excavadora|cisterna|motobomba|\b[rhecm]-?\d)/.test(n)) {
    return base('desplegar_recurso', { recurso_id: extraerRecurso(t), direccion: extraerDireccion(t), lugar: extraerLugar(t), coords: extraerCoords(t) })
  }

  // Evacuar
  if (/\bevacuar|evacua|evacuacion\b/.test(n)) return base('evacuar', { lugar: extraerLugar(t) || t.replace(/.*evacuar\s*/i, '') })

  // Proyección alternativa
  const vm = n.match(/viento\D{0,30}?(\d{1,3})\s*km/) || n.match(/(\d{1,3})\s*km\/?h/)
  if (/(que pasa si|qu[eé] pasar[ií]a|escenario|si el viento|si viento|proyecta|proyectar|simula si)/.test(n) && vm) {
    const en = n.match(/en\s+(\d{1,3})\s*min/)
    const hum = n.match(/humedad\D{0,10}(\d{1,2})\s*%/)
    return base('proyectar', { viento_kmh: parseInt(vm[1], 10), en_min: en ? parseInt(en[1], 10) : 30, humedad: hum ? parseInt(hum[1], 10) : null })
  }

  // Consultas (no ejecutan, pero se clasifican)
  if (/riesgo|amenaza|peligro/.test(n) && /(para|de|en|sobre|a)\s+\S/.test(n)) return base('analisis_amenaza', { lugar: extraerLugar(t) || t.replace(/.*(para|de|en|sobre)\s+/i, '').trim() })
  if (/\b(norte|sur|este|oeste)\s+o\s+(norte|sur|este|oeste)\b/.test(n) || /(donde|a donde|que flanco|prioridad|estrategia)/.test(n)) return base('analisis_estrategico', {})
  if (/sin helic|alternativa|plan b/.test(n)) return base('alternativa', { sin: 'helicoptero' })
  if (/por tierra|terrestre/.test(n)) return base('alternativa', { opcion: 'retardante_terrestre' })
  if (/\bros\b|velocidad (del )?(frente|propagacion)/.test(n)) return base('lectura_ros', {})
  if (/hect[aá]reas|superficie|tamano|cuanto (ha )?quem/.test(n)) return base('lectura_superficie', {})
  if (/llama|altura/.test(n)) return base('lectura_llama', {})
  if (/viento|humedad|meteo|clima|tiempo atmosf/.test(n)) return base('lectura_meteo', {})
  if (/recursos|flota|brigadas|disponibles/.test(n)) return base('lectura_recursos', {})
  return null
}

export function extraerCoords(t) {
  const m = t.match(/(-?\d{1,2}\.\d{3,6})\s*,\s*(-?\d{1,3}\.\d{3,6})/)
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null
}

// Compatibilidad con la firma de la Sección 7.2 (sobre la respuesta de la IA).
export const parseador_intenciones = parseadorIntenciones
export const ACCIONES_EJECUTABLES = ['desplegar_recurso', 'aplicar_retardante', 'control', 'evacuar', 'exportar', 'guardar_estrategia', 'ejecutar_plan', 'proyectar']
