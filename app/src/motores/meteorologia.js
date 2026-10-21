// Meteorología real desde Open-Meteo (Sección 5.4), fetch directo desde el
// navegador (o Node si hay fetch global, como en este harness de pruebas).
// Incluye una estimación de FWI (Fire Weather Index) SIMPLIFICADA -- no es
// el cálculo canadiense completo (que requiere estado persistente día a
// día de FFMC/DMC/DC), sino una aproximación de un solo paso, documentada
// como tal.

const BASE_URL = 'https://api.open-meteo.com/v1/forecast'

export async function cargarMeteo(lat, lon, { dias = 3 } = {}) {
  const url =
    `${BASE_URL}?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m` +
    `&forecast_days=${dias}&timezone=America%2FSantiago`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`)
  const data = await resp.json()
  return procesarFWI(data)
}

/**
 * procesarFWI: transforma la respuesta horaria de Open-Meteo en un arreglo
 * de registros con humedad de combustible fino estimada y un FWI
 * simplificado (0-100, mayor = más peligro).
 */
export function procesarFWI(dataOpenMeteo) {
  const h = dataOpenMeteo.hourly
  if (!h) return []
  const n = h.time.length
  const registros = []
  for (let i = 0; i < n; i++) {
    const temp = h.temperature_2m[i]
    const hr = h.relative_humidity_2m[i]
    const vientoMs = h.wind_speed_10m[i]
    const precip = h.precipitation ? h.precipitation[i] : 0
    const dirViento = h.wind_direction_10m[i]

    const humedadFino = 30 * Math.pow(hr / 100, 2)
    const fwiIndice = calcularFWISimplificado({ temp, hr, vientoKmh: vientoMs * 3.6, precip })

    registros.push({
      horaISO: h.time[i],
      temp,
      hr,
      vientoKmh: Number((vientoMs * 3.6).toFixed(1)),
      dirVientoGrados: dirViento,
      precipMm: precip,
      humedadFino: Number(humedadFino.toFixed(2)),
      fwiIndice: Number(fwiIndice.toFixed(1)),
    })
  }
  return registros
}

/**
 * FWI simplificado de un solo paso (0-100): combina temperatura alta,
 * humedad relativa baja y viento alto en un índice de peligro. Si hay
 * precipitación, el índice baja fuertemente (combustible se humedece).
 * NO es el FWI canadiense oficial (que acumula estado entre días).
 */
export function calcularFWISimplificado({ temp, hr, vientoKmh, precip = 0 }) {
  let indice = Math.max(0, temp - 10) * 1.5 + Math.max(0, 40 - hr) * 1.2 + vientoKmh * 0.8
  if (precip > 0) indice *= Math.max(0, 1 - precip * 0.3)
  return Math.min(100, Math.max(0, indice))
}

/** Clasifica el FWI en categorías de peligro (uso en UI/análisis). */
export function clasificarPeligroFWI(fwi) {
  if (fwi < 15) return 'bajo'
  if (fwi < 35) return 'moderado'
  if (fwi < 60) return 'alto'
  if (fwi < 80) return 'muy_alto'
  return 'extremo'
}
