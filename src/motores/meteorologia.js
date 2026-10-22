// Meteorología Open-Meteo (desde el navegador) + FWI canadiense simplificado.
const BASE = 'https://api.open-meteo.com/v1/forecast'

export function urlOpenMeteo(lat, lon, fecha, dias = 3) {
  const fin = sumarDias(fecha, dias)
  return `${BASE}?latitude=${lat}&longitude=${lon}&start_date=${fecha}&end_date=${fin}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m` +
    `&wind_speed_unit=ms&timezone=America%2FSantiago`
}

export function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// FWI canadiense simplificado (índice 0–100): combina FFMC aproximado, viento y HR.
export function calcularFWI_canadiense(temp, hr, vientoKmh, precipMm) {
  // FFMC aproximado (Van Wagner, simplificado a estado estacionario)
  let mo = 147.2 * (101 - 85) / (59.5 + 85)
  if (precipMm > 0.5) mo = Math.min(250, mo + 42.5 * precipMm * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / precipMm)))
  const ed = 0.942 * Math.pow(hr, 0.679) + 11 * Math.exp((hr - 100) / 10) + 0.18 * (21.1 - temp) * (1 - Math.exp(-0.115 * hr))
  const m = mo > ed ? ed + (mo - ed) * Math.pow(10, -0.0579 * (0.424 * (1 - Math.pow(hr / 100, 1.7)) + 0.0694 * Math.sqrt(vientoKmh) * (1 - Math.pow(hr / 100, 8))) * 0.581 * Math.exp(0.0365 * temp)) : ed
  const ffmc = Math.max(0, Math.min(101, 59.5 * (250 - m) / (147.2 + m)))
  // ISI
  const fW = Math.exp(0.05039 * vientoKmh)
  const fF = 91.9 * Math.exp(-0.1386 * m) * (1 + Math.pow(m, 5.31) / 4.93e7)
  const isi = 0.208 * fW * fF
  // FWI ~ escala del ISI con un BUI nominal (fijo, sin series de sequía)
  const bui = 60
  const fD = 0.626 * Math.pow(bui, 0.809) + 2
  const B = 0.1 * isi * fD
  const fwi = B > 1 ? Math.exp(2.72 * Math.pow(0.434 * Math.log(B), 0.647)) : B
  return Math.round(Math.min(100, Math.max(0, fwi)) * 10) / 10
}

export function humedadFinoEmpirica(hr) {
  return 30 * Math.pow(hr / 100, 2)
}

export function procesarFWI(data) {
  const h = data.hourly
  if (!h || !h.time) throw new Error('Respuesta Open-Meteo sin bloque hourly')
  return h.time.map((t, idx) => {
    const temp = h.temperature_2m[idx]
    const hr = h.relative_humidity_2m[idx]
    const vientoKmh = Math.round(h.wind_speed_10m[idx] * 3.6 * 10) / 10 // m/s → km/h
    const precip = h.precipitation[idx] ?? 0
    return {
      hora: t,
      horaAbs: idx,
      temp, hr, vientoKmh,
      dirVientoGrados: h.wind_direction_10m[idx],
      precipitacion: precip,
      humedadFino: Math.round(humedadFinoEmpirica(hr) * 10) / 10,
      fwiIndice: calcularFWI_canadiense(temp, hr, vientoKmh, precip),
    }
  })
}

export function nivelPeligro(fwi) {
  if (fwi < 5) return 'BAJO'
  if (fwi < 12) return 'MODERADO'
  if (fwi < 25) return 'ALTO'
  if (fwi < 40) return 'MUY ALTO'
  return 'EXTREMO'
}

export async function cargarMeteo(lat, lon, fecha, dias = 3, fetchImpl = globalThis.fetch) {
  const resp = await fetchImpl(urlOpenMeteo(lat, lon, fecha, dias))
  if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`)
  const data = await resp.json()
  return procesarFWI(data)
}

// Meteorología sintética de fallback (sin red): tarde seca de verano en Los Lagos.
export function meteoSintetica(horas = 72) {
  const out = []
  for (let i = 0; i < horas; i++) {
    const h = i % 24
    const temp = 14 + 12 * Math.max(0, Math.sin((h - 6) / 24 * Math.PI * 2))
    const hr = Math.round(85 - 55 * Math.max(0, Math.sin((h - 6) / 24 * Math.PI * 2)))
    const vientoKmh = Math.round(8 + 14 * Math.max(0, Math.sin((h - 9) / 24 * Math.PI * 2)))
    out.push({ hora: `sintetica+${i}h`, horaAbs: i, temp: Math.round(temp), hr, vientoKmh, dirVientoGrados: 315, precipitacion: 0, humedadFino: Math.round(humedadFinoEmpirica(hr) * 10) / 10, fwiIndice: calcularFWI_canadiense(temp, hr, vientoKmh, 0) })
  }
  return out
}

// Integración dinámica (Sección 5.4): 1 minuto simulado = 1 hora meteorológica.
// aceleracion=60 → índice horario = minuto simulado; aceleracion=1 → tiempo real.
export function meteoParaMinuto(serie, minutoSim, aceleracion = 60) {
  if (!serie || !serie.length) return null
  const idx = Math.min(serie.length - 1, Math.floor(minutoSim * aceleracion / 60))
  return serie[idx]
}
