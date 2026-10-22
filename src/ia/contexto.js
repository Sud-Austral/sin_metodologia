// Ensambla el prompt de sistema con el estado dinámico de la simulación (Sección 7.2).
export const LIMITE_CONTEXTO = 3000

export function ensamblarContexto(estadisticas, pregunta = '') {
  const e = estadisticas || {}
  const f = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : v ?? 0)
  let prompt = `Eres un experto en incendios forestales que asiste a un despachador de CONAF Los Lagos.

ESTADO ACTUAL DE LA SIMULACIÓN:
- Nombre: ${e.nombre ?? 'Demo'}
- Tiempo transcurrido: ${e.minutos ?? 0} minutos
- Superficie quemada: ${f(e.hectareas)} ha
- ROS (velocidad frente): ${f(e.ros_cabeza)} m/min
- Altura de llama: ${f(e.altura_llama)} m
- Dirección viento: ${e.dir_viento ?? 0}°
- Velocidad viento: ${e.vel_viento ?? 0} km/h
- Humedad combustible: ${e.hum_combustible ?? 0}%
- Modelo combustible: ${e.modelo ?? 'K2'}

UBICACIÓN:
- Latitud: ${e.lat ?? 0}
- Longitud: ${e.lng ?? 0}
- Zona: Los Lagos, Chile

RECURSOS DISPONIBLES:
${e.recursos_markdown || '- Sin información'}

INSTALACIONES AMENAZADAS:
${e.amenazadas_markdown || '- Sin información'}

Responde en español, sé conciso pero técnico.
Si es estrategia, sugiere acciones específicas (ej: "Desplegar brigada X al norte").
Incluye números cuando sea posible (distancias, tiempos, ROS).`
  if (pregunta) prompt += `\n\nPREGUNTA DEL DESPACHADOR:\n${pregunta}`
  return recortarContexto(prompt)
}

// Recorta si el contexto es muy largo (Sección 11, troubleshooting).
export function recortarContexto(prompt, limite = LIMITE_CONTEXTO) {
  if (prompt.length > limite) return prompt.slice(0, limite - 500) + '...'
  return prompt
}
