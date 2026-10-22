// Respuestas plantilla (fallback sin IA en navegador). Usan SIEMPRE cifras reales del estado.
import { estadisticas, etaHacia, buscarLugar, rosPorSector, lugaresConocidos } from '../estado/simulacion.js'
import { nivelPeligro } from '../motores/meteorologia.js'

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1)
const fmtMin = (m) => (m == null ? 'n/d' : m < 120 ? `${m} min` : `${f1(m / 60)} h`)
const fmtDist = (m) => (m < 1000 ? `${m} m` : `${f1(m / 1000)} km`)

function lugarMasCercano(est) {
  const e = estadisticas(est)
  if (e.amenazadas.length) {
    const a = e.amenazadas[0]
    const eta = etaHacia(est, a.lat, a.lng)
    return { nombre: a.nombre, ...eta }
  }
  const l = lugaresConocidos(est)[0]
  return { nombre: l.nombre, ...etaHacia(est, l.lat, l.lng) }
}

export function respuestaLecturaROS(est) {
  const e = estadisticas(est)
  const cerca = lugarMasCercano(est)
  const favor = e.vel_viento >= 15 ? 'a favor' : 'moderado'
  const hum = e.hum_combustible < 10 ? 'muy baja' : e.hum_combustible < 18 ? 'baja' : 'moderada'
  return `El ROS (Rate of Spread) actual es **${f1(e.ros_cabeza)} m/min**.

El frente avanza ${Math.round(e.ros_cabeza * 60)} metros cada hora. A esta velocidad, llega a ${cerca.nombre} (~${fmtDist(cerca.distancia_m)}) en aproximadamente ${fmtMin(cerca.eta_min)}.

Factores:
- Viento ${e.vel_viento} km/h desde ${e.dir_viento}° (${favor})
- Humedad combustible ${e.hum_combustible}% (${hum})
- Modelo ${e.modelo} (${e.modelo_nombre.replace(/^K\d+ /, '')})
- Altura de llama ${f1(e.altura_llama)} m, ${f1(e.hectareas)} ha quemadas en ${e.minutos} min

Recomendación: ${e.ros_cabeza > 5 ? `Acelerar despliegue al ${cardinal(cerca.bearing)}.` : 'Mantener monitoreo y preposicionar brigada en el flanco de cabeza.'}`
}

export function cardinal(b) {
  const n = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
  return n[Math.round(((b % 360) + 360) % 360 / 45) % 8]
}

export function respuestaDespliegue(est, resultados) {
  const lineas = ['✅ Comandos ejecutados:', '']
  resultados.forEach((r, i) => {
    if (r.error) { lineas.push(`${i + 1}. ❌ ${r.error}`); return }
    const rec = r.recurso
    lineas.push(`${i + 1}. ${rec.nombre}:`)
    lineas.push(`   - Destino: ${rec.destino.lat.toFixed(4)}, ${rec.destino.lng.toFixed(4)}`)
    lineas.push(`   - Ruta: ${fmtDist(r.distancia_m)} en línea recta [mostrada en mapa]`)
    lineas.push(`   - ETA: ${rec.eta_min} minutos`)
    lineas.push(`   - Estado: ${rec.estado}`)
    if (rec.tipo === 'helicoptero') { lineas.push('   - Misión: Retardante Phos-Chek (1.200 L), radio 800 m del frente'); lineas.push('   - Duración: 4 horas · Efecto esperado: ROS ↓ 33 %') }
    if (rec.tipo === 'brigada') lineas.push('   - Misión: línea manual 200 m al llegar')
    lineas.push('')
  })
  lineas.push(`Impacto: en ${Math.min(...resultados.filter((r) => !r.error).map((r) => r.eta_min), 999)} min el grid CA mostrará la línea/zona tratada.`)
  return lineas.join('\n')
}

export function respuestaRetardante(est, r, p) {
  return `✅ Retardante aplicado: ${p.producto} ${p.volumen.toLocaleString('es-CL')} L
- Zona: radio ${r.radio_m} m centrado en ${p.zona.lat.toFixed(4)}, ${p.zona.lng.toFixed(4)}
- Celdas tratadas: ${r.celdas}
- Efecto: ROS ↓ ${Math.round(r.reduccion_ros * 100)} % durante ${r.duracion_min} min

Impacto: en el próximo tick el grid CA mostrará la zona retardada.`
}

export function respuestaControl(est, accion) {
  const e = estadisticas(est)
  const txt = { pausar: '⏸️ Simulación pausada', reanudar: '▶️ Simulación reanudada', reiniciar: '🔄 Simulación reiniciada' }[accion]
  return `${txt} en T+${e.minutos} min (${f1(e.hectareas)} ha, ROS ${f1(e.ros_cabeza)} m/min).`
}

export function respuestaProyeccion(est, pr) {
  const a = pr.actual, p = pr.proyectado
  const pct = (x, y) => (x > 0 ? `${y >= x ? '+' : ''}${Math.round((y - x) / x * 100)}%` : 'n/d')
  const cercaA = a.amenazadas[0], cercaP = p.amenazadas[0]
  const etaA = cercaA ? etaHacia(est, cercaA.lat, cercaA.lng) : null
  const etaP = cercaP ? etaHacia(pr.estadoAlt, cercaP.lat, cercaP.lng) : null
  const filaEta = cercaA ? `| ETA ${cercaA.nombre} | T+${fmtMin(etaA.eta_min)} | T+${fmtMin(etaP.eta_min)}${etaP.eta_min != null && etaP.eta_min < 15 ? ' (CRÍTICO)' : ''} |` : ''
  return `🔮 Escenario alternativo proyectado (${pr.minutos} min, viento ${pr.cambios.viento_kmh ?? est.viento_kmh} km/h${pr.cambios.humedad != null ? `, humedad ${pr.cambios.humedad}%` : ''}):

| Métrica | Actual (T+${pr.minutos}) | Proyectado |
|---------|--------|-----------|
| ROS | ${f1(a.ros_cabeza)} m/min | ${f1(p.ros_cabeza)} m/min (${pct(a.ros_cabeza, p.ros_cabeza)}) |
| Altura llama | ${f1(a.altura_llama)} m | ${f1(p.altura_llama)} m (${pct(a.altura_llama, p.altura_llama)}) |
| Superficie | ${f1(a.hectareas)} ha | ${f1(p.hectareas)} ha (${p.hectareas > a.hectareas * 1.3 ? '↗↗↗' : pct(a.hectareas, p.hectareas)}) |
${filaEta}

Acción urgente:
${cercaP && etaP.eta_min != null && etaP.eta_min < 30 ? `- Evacuar ${cercaP.nombre} YA\n` : ''}- Aumentar retardante a ${Math.round(2400 * Math.max(1, p.ros_cabeza / Math.max(0.1, a.ros_cabeza)) / 100) * 100} L
- Solicitar helicóptero adicional

¿Quieres continuar en este escenario?`
}

export function respuestaEstrategica(est) {
  const e = estadisticas(est)
  const s = rosPorSector(est)
  const cab = cardinal(s.direccion_cabeza)
  const flanco = cardinal(s.direccion_cabeza + 90)
  const amen = e.amenazadas.find((a) => a.amenazada) || e.amenazadas[0]
  const eta = amen ? etaHacia(est, amen.lat, amen.lng) : null
  return `Desplegar al **${cab.toUpperCase()}** — frente activo.

Análisis:
- Frente principal (${cab}): ROS ${f1(s.cabeza)} m/min${amen ? `, amenaza ${amen.nombre} (${fmtDist(amen.distancia_m)})` : ''}
- Flanco ${flanco}: ROS ${f1(s.flanco)} m/min, menos crítico
- Cola: ROS ${f1(s.cola)} m/min

Táctica:
1. Brigada R-22 → ${cab}, línea manual 200 m
2. Excavadora E-5 → flanco ${flanco} (segundo paso)
3. Retardante aéreo H-01 → frente ${cab} (4 horas)

Riesgo: ${eta && eta.eta_min != null ? `si el retardante demora >${Math.max(1, Math.round(eta.eta_min / 3))} min, el frente llega a ${amen.nombre} en T+${fmtMin(eta.eta_min)}.` : 'sin instalaciones en la trayectoria inmediata.'}
Recomendación: ${eta && eta.eta_min != null && eta.eta_min < 60 ? 'Evacuación preventiva.' : 'Monitoreo cada 15 min.'}`
}

export function respuestaGuardado(est, estrategia, archivo) {
  const e = estadisticas(est)
  const enTransito = est.recursos.filter((r) => r.estado !== 'DISPONIBLE')
  return `✅ Estrategia guardada: "${estrategia.nombre}"

Snapshot:
${enTransito.length ? enTransito.map((r) => `- ${r.nombre} ${r.estado}${r.eta_min ? `, ETA T+${r.eta_min}` : ''}`).join('\n') : '- Sin recursos desplegados'}
- Retardantes activos: ${est.retardantes.length}
- Expectativa: ${est.retardantes.length ? 'ROS ↓ 33 % en zonas tratadas' : 'sin mitigación aplicada'}; ${e.amenazadas.some((a) => a.amenazada) ? '⚠️ instalaciones amenazadas' : 'no llega a instalaciones críticas en el horizonte actual'}

📄 PDF generado: ${archivo}
- Resumen ejecutivo
- Estado simulación (T+${e.minutos}, ${f1(e.hectareas)} ha)
- Conversación completa (${estrategia.turnos} turnos)
- Análisis estratégico
- Mapa con perímetro + recursos

Descarga: [${archivo}]`
}

export function respuestaAmenaza(est, lugarTxt) {
  const lugar = buscarLugar(est, lugarTxt) || lugaresConocidos(est).find((l) => l.tipo === 'ciudad')
  const eta = etaHacia(est, lugar.lat, lugar.lng)
  const horas = eta.eta_min != null ? eta.eta_min / 60 : null
  const nivel = horas == null ? 'SIN TRAYECTORIA' : horas > 24 ? 'BAJO RIESGO' : horas > 8 ? 'RIESGO MEDIO' : horas > 2 ? 'RIESGO ALTO' : 'CRÍTICO'
  const etaRot = etaHacia({ ...est, viento_dir: (eta.bearing + 180) % 360 }, lugar.lat, lugar.lng)
  const eta3 = eta.eta_min != null ? Math.round(eta.eta_min / 3) : null
  return `**${lugar.nombre}**
Distancia: ${fmtDist(eta.distancia_m)} (línea recta, rumbo ${eta.bearing}°)
ROS en esa dirección: ${f1(eta.ros_direccion)} m/min
ETA actual: ${horas == null ? 'no alcanzable con viento actual' : `${f1(horas)} horas`} (${nivel})

Condiciones que cambiarían:
- Viento rota a ${(eta.bearing + 180) % 360}° (directo): ETA ${etaRot.eta_min != null ? `${f1(etaRot.eta_min / 60)} h` : 'n/d'} (MEDIO)
- ROS 3×: ETA ${eta3 != null ? `${f1(eta3 / 60)} h` : 'n/d'} (ALTO)
- Focos secundarios (pavesas): ETA 3–4 h (CRÍTICO)

Recomendación:
- Monitorear cada hora
- ${horas != null && horas < 8 ? 'Activar plan de evacuación' : 'Preparar planes de evacuación (no ejecutar aún)'}
- Alerta si HR <5% o viento >30 km/h`
}

export function respuestaAlternativa(est, p) {
  const e = estadisticas(est)
  if (p.opcion === 'retardante_terrestre') {
    return `✅ VIABLE — Retardante por tierra
- Camión cisterna C-1: 5.000 L agua + gel
- Motobombas M-1: 3 unidades, 400 L/min
- Setup: 5 minutos tras llegada (ETA ${etaRecurso(est, 'C-1')} min)
- Efecto: ROS ↓ 20–25 % (radio 300 m, 2 h)
Combinado con brigada R-22: mejor margen de seguridad.

Di "Ejecutar Plan C" para activarlo (retardante terrestre + brigada manual).`
  }
  const llama = e.altura_llama
  return `Plan B — Mecanización + Línea Manual
- Excavadora E-5 + Brigada R-22 → línea 15 m ancho
- Duración: 45 min (rápido, arriesgado)
- Riesgo: brigada ${llama > 3 ? 'muy expuesta' : 'expuesta'} (llama ${f1(llama)} m ${llama >= 15 ? '>' : '<'} línea 15 m)
Veredicto: ${llama > 3 ? '⚠️ NO RECOMENDADO sin retardante.' : '✅ Aceptable con vigilancia.'}

Alternativa: ¿retardante por tierra?`
}

function etaRecurso(est, id) {
  const r = est.recursos.find((x) => x.id === id)
  if (!r) return 'n/d'
  const l = lugarMasCercano(est)
  const d = Math.sqrt(((r.lat - est.lat) * 111320) ** 2 + ((r.lng - est.lng) * 111320 * Math.cos(est.lat * Math.PI / 180)) ** 2)
  return Math.max(1, Math.round(d / (r.velocidad_kmh * 1000 / 60)))
}

export function respuestaPlan(est, plan, resultados) {
  const r = resultados.filter((x) => !x.error)
  return `✅ Plan ${plan} activado (${plan === 'C' ? 'retardante terrestre + brigada manual' : plan === 'B' ? 'mecanización + línea manual' : 'brigada + retardante aéreo'})
Seguimiento:
${r.map((x) => `- ${x.recurso.nombre} llega en T+${x.eta_min}`).join('\n')}
${resultados.filter((x) => x.error).map((x) => `- ❌ ${x.error}`).join('\n')}`.trim()
}

export function respuestaExportacion(est, formato, archivo, mensajes, tokens) {
  const e = estadisticas(est)
  const lista = formato === 'pdf' ? `Incluye:
- Portada: Simulación "${e.nombre}", ${e.minutos} min
- Resumen: ROS ${f1(e.ros_cabeza)} m/min, ${f1(e.hectareas)} ha, ${e.amenazadas.filter((a) => a.amenazada).length} amenazadas
- Conversación: ${mensajes} turnos (${tokens} tokens)
- Análisis táctico: opciones evaluadas
- Proyecciones: escenarios alternativos consultados
- Acciones ejecutadas: ${est.acciones.length} con timestamps
- Mapas: perímetro (${e.perimetro_puntos} pts), frente (${e.frente_puntos} pts), recursos, zonas críticas
- Anexo: recomendaciones del momento

Compartir: 📧 Encargado del turno, 📱 WhatsApp bomba central, 📋 Archivo local` : `Contenido: ${formato === 'kmz' ? 'perímetro + frente + recursos (Google Earth)' : formato === 'csv' ? `${est.historial.length} filas de estadísticas (t, ROS, ha, altura)` : `${mensajes} mensajes de la conversación`}`
  return `📄 ${formato.toUpperCase()} generado: ${archivo}

${lista}

Descarga: [${archivo}]`
}

export function respuestaEvacuacion(est, lugar) {
  const l = buscarLugar(est, lugar)
  const eta = l ? etaHacia(est, l.lat, l.lng) : null
  return `🚨 Orden de evacuación registrada: ${l ? l.nombre : lugar}
${eta ? `- Distancia al frente: ${fmtDist(eta.distancia_m)} · ETA ${fmtMin(eta.eta_min)}` : '- Lugar no georreferenciado; registrado como texto'}
- Notificar: Carabineros, Bomberos, Municipalidad
- Vía de salida: contraria a ${cardinal(est.viento_dir + 180)}`
}

export function respuestaGenerica(est, pregunta, intent) {
  const e = estadisticas(est)
  if (intent?.accion === 'lectura_superficie') return `Superficie quemada: **${f1(e.hectareas)} ha** en ${e.minutos} min (${e.celdas_quemadas} celdas quemadas, ${e.celdas_ardiendo} ardiendo). Tasa media: ${f1(e.hectareas / Math.max(1, e.minutos) * 60)} ha/h.`
  if (intent?.accion === 'lectura_llama') return `Altura de llama: **${f1(e.altura_llama)} m** (ROS ${f1(e.ros_cabeza)} m/min, ${e.modelo}). ${e.altura_llama > 3 ? 'Ataque directo NO seguro: usar línea indirecta y retardante.' : 'Ataque directo posible con herramientas manuales.'}`
  if (intent?.accion === 'lectura_meteo') return `Meteorología: viento ${e.vel_viento} km/h desde ${e.dir_viento}°, T ${e.temp}°C, HR ${e.hr}%, humedad combustible fino ${e.hum_combustible}%${e.precipitacion ? `, precipitación ${e.precipitacion} mm` : ''}. Peligro: ${nivelPeligro(fwiAprox(e))}.`
  if (intent?.accion === 'lectura_recursos') return `Recursos:\n${e.recursos_markdown}`
  return `No dispongo de IA en este navegador (sin WebGPU o modelo no cargado), pero estos son los datos actuales:
- T+${e.minutos} min, ${f1(e.hectareas)} ha, ROS ${f1(e.ros_cabeza)} m/min, llama ${f1(e.altura_llama)} m
- Viento ${e.vel_viento} km/h desde ${e.dir_viento}°, humedad ${e.hum_combustible}%
- Instalaciones:\n${e.amenazadas_markdown}

Prueba con: "¿Cuál es el ROS actual?", "Desplegar Brigada R-22 al norte", "¿Qué pasa si viento sube a 35 km/h en 30 min?", "Riesgo para Puerto Montt", "Exporta todo a PDF".`
}

function fwiAprox(e) {
  return Math.min(100, e.vel_viento * 0.8 + (100 - e.hr) * 0.3)
}
