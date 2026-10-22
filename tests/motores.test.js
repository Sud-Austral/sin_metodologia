import { describe, it, expect } from 'vitest'
import { MODELOS_KITRAL, obtenerModelo, clasificarVegetacion, C_PASTO, C_MATORRAL, C_ARBOLADO } from '../src/motores/kitral.js'
import { calcularROS, factorHumedad, factorViento, alturaLlama, rosDireccional, calcularROS_interpolado, excentricidad } from '../src/motores/rothermel.js'
import { initCA, tickCA, gridAFrente, gridAPerimetro, calcularSuperficieHa, expandirGridSiNecesario, aplicarRetardanteGrid, construirLineaControl, celdaALatLng, latLngACelda, calcularPendiente, demSintetico, ESTADO } from '../src/motores/ca_propagacion.js'
import { calcularFWI_canadiense, procesarFWI, meteoSintetica, meteoParaMinuto, urlOpenMeteo, humedadFinoEmpirica } from '../src/motores/meteorologia.js'

describe('KITRAL', () => {
  it('define 13 modelos K1–K13 con clase y ROS base decreciente de pasto a bosque', () => {
    expect(Object.keys(MODELOS_KITRAL)).toHaveLength(13)
    expect(obtenerModelo(1).clase).toBe(C_PASTO)
    expect(obtenerModelo(4).clase).toBe(C_MATORRAL)
    expect(obtenerModelo(13).clase).toBe(C_ARBOLADO)
    expect(obtenerModelo(1).ros_base).toBeGreaterThan(obtenerModelo(13).ros_base)
    expect(() => obtenerModelo(14)).toThrow()
  })
  it('clasifica vegetación por percentiles p40/p72 y pendiente', () => {
    const dem = demSintetico(40, 40, 13)
    const pend = calcularPendiente(dem, 40, 40, 13)
    const { modelo, p40, p72 } = clasificarVegetacion(dem, pend, 40, 40)
    expect(p72).toBeGreaterThan(p40)
    expect(modelo.length).toBe(1600)
    for (const m of modelo) expect(m >= 1 && m <= 13).toBe(true)
    const bajas = Array.from(modelo).filter((m, i) => dem[i] <= p40)
    expect(bajas.every((m) => m >= 7)).toBe(true) // bajo p40 → arbolado K7–K13
  })
})

describe('Rothermel', () => {
  it('ROS crece con viento y decrece con humedad; se extingue sobre humedad de extinción', () => {
    expect(calcularROS(2, 30, 0, 9)).toBeGreaterThan(calcularROS(2, 0, 0, 9))
    expect(calcularROS(2, 20, 0, 5)).toBeGreaterThan(calcularROS(2, 20, 0, 12))
    expect(calcularROS(2, 20, 0, 15)).toBe(0)
    expect(factorHumedad(0, 20)).toBe(1)
    expect(factorViento(0)).toBe(1)
  })
  it('pendiente a favor acelera y en contra frena', () => {
    expect(calcularROS(3, 10, 30, 10)).toBeGreaterThan(calcularROS(3, 10, 0, 10))
    expect(calcularROS(3, 10, -30, 10)).toBeLessThan(calcularROS(3, 10, 0, 10))
  })
  it('altura de llama es positiva y creciente con ROS', () => {
    expect(alturaLlama(2, 10)).toBeGreaterThan(alturaLlama(2, 2))
    expect(alturaLlama(2, 0)).toBe(0)
  })
  it('ROS direccional: cabeza > flanco > cola; excentricidad en [0,1)', () => {
    const e = excentricidad(25)
    expect(e).toBeGreaterThan(0); expect(e).toBeLessThan(1)
    expect(rosDireccional(10, 0, 25)).toBeCloseTo(10)
    expect(rosDireccional(10, Math.PI / 2, 25)).toBeLessThan(10)
    expect(rosDireccional(10, Math.PI, 25)).toBeLessThan(rosDireccional(10, Math.PI / 2, 25))
  })
  it('interpola ROS entre dos modelos', () => {
    const r1 = calcularROS(1, 10, 0, 8), r2 = calcularROS(13, 10, 0, 8)
    const ri = calcularROS_interpolado(1, 13, 10, 0, 8, 0.5)
    expect(ri).toBeCloseTo((r1 + r2) / 2)
  })
})

describe('Autómata celular', () => {
  it('initCA crea grid 240×240 de 13 m con una celda ardiendo en el punto de ignición', () => {
    const g = initCA(null, -41.42, -72.7, 240, 240, 13)
    expect(g.state.length).toBe(57600)
    expect(g.ardiendo).toHaveLength(1)
    const [i, j] = latLngACelda(g, -41.42, -72.7)
    expect(g.state[i * 240 + j]).toBe(ESTADO.ARDIENDO)
  })
  it('conversión celda↔latlng es inversa', () => {
    const g = initCA(null, -41.42, -72.7, 60, 60, 13)
    const [lat, lng] = celdaALatLng(g, 10, 50)
    expect(latLngACelda(g, lat, lng)).toEqual([10, 50])
  })
  it('el fuego crece con el tiempo y más rápido con viento', () => {
    let a = initCA(null, -41.42, -72.7, 120, 120, 13, null, { modeloUniforme: 2 })
    let b = initCA(null, -41.42, -72.7, 120, 120, 13, null, { modeloUniforme: 2 })
    for (let k = 0; k < 12; k++) { a = tickCA(a, a.tiempo_min, 5, 180, 0, 9, 5); b = tickCA(b, b.tiempo_min, 30, 180, 0, 9, 5) }
    expect(calcularSuperficieHa(a)).toBeGreaterThan(0.1)
    expect(calcularSuperficieHa(b)).toBeGreaterThan(calcularSuperficieHa(a))
    expect(a.tiempo_min).toBe(60)
  })
  it('con precipitación el fuego no se propaga', () => {
    let g = initCA(null, -41.42, -72.7, 60, 60, 13, null, { modeloUniforme: 2 })
    for (let k = 0; k < 6; k++) g = tickCA(g, g.tiempo_min, 20, 180, 0, 9, 5, { precipitacion: 2 })
    expect(g.stats.hectareas).toBeLessThan(0.05)
  })
  it('el fuego se propaga preferentemente a sotavento', () => {
    let g = initCA(null, -41.42, -72.7, 120, 120, 13, null, { modeloUniforme: 2 })
    for (let k = 0; k < 10; k++) g = tickCA(g, g.tiempo_min, 30, 180, 0, 9, 5) // viento del sur → avanza al norte (i decreciente)
    let norte = 0, sur = 0
    for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) if (g.state[i * 120 + j] !== ESTADO.SIN_QUEMAR) { if (i < 60) norte++; else if (i > 60) sur++ }
    expect(norte).toBeGreaterThan(sur * 2)
  })
  it('tick de 240×240 toma menos de 100 ms', () => {
    let g = initCA(null, -41.42, -72.7, 240, 240, 13)
    for (let k = 0; k < 20; k++) g = tickCA(g, g.tiempo_min, 25, 315, 0, 8, 5)
    const t0 = performance.now()
    for (let k = 0; k < 10; k++) g = tickCA(g, g.tiempo_min, 25, 315, 0, 8, 5)
    expect((performance.now() - t0) / 10).toBeLessThan(100)
  })
  it('frente y perímetro devuelven coordenadas lat/lng', () => {
    let g = initCA(null, -41.42, -72.7, 80, 80, 13, null, { modeloUniforme: 2 })
    for (let k = 0; k < 6; k++) g = tickCA(g, g.tiempo_min, 20, 180, 0, 9, 5)
    const f = gridAFrente(g), p = gridAPerimetro(g)
    expect(f.length).toBeGreaterThan(0); expect(p.length).toBeGreaterThan(f.length / 2)
    expect(Math.abs(f[0][0] + 41.42)).toBeLessThan(0.02)
  })
  it('retardante reduce el área quemada y una línea de control la detiene', () => {
    const run = (mod) => { let g = initCA(null, -41.42, -72.7, 120, 120, 13, null, { modeloUniforme: 2 }); mod(g); for (let k = 0; k < 12; k++) g = tickCA(g, g.tiempo_min, 25, 180, 0, 9, 5); return calcularSuperficieHa(g) }
    const base = run(() => {})
    const conRet = run((g) => { const [lat, lng] = celdaALatLng(g, 45, 60); expect(aplicarRetardanteGrid(g, lat, lng, 300, 0.6, 240)).toBeGreaterThan(10) })
    const conLinea = run((g) => { const [lat, lng] = celdaALatLng(g, 50, 60); construirLineaControl(g, lat, lng, 1500, 90, 2) })
    expect(conRet).toBeLessThan(base)
    expect(conLinea).toBeLessThan(base)
  })
  it('expande el grid cuando el fuego se acerca al borde', () => {
    let g = initCA(null, -41.42, -72.7, 40, 40, 13, null, { modeloUniforme: 1 })
    for (let k = 0; k < 40 && g.ancho === 40; k++) { g = tickCA(g, g.tiempo_min, 30, 180, 0, 6, 5); g = expandirGridSiNecesario(g, 6, 20) }
    expect(g.ancho).toBe(80); expect(g.expansiones).toBe(1)
    expect(g.ardiendo.length).toBeGreaterThan(0)
    expect(g.state.length).toBe(6400)
  })
})

describe('Meteorología', () => {
  it('FWI crece con viento y baja con HR; humedad fino empírica', () => {
    expect(calcularFWI_canadiense(30, 20, 40, 0)).toBeGreaterThan(calcularFWI_canadiense(30, 20, 5, 0))
    expect(calcularFWI_canadiense(30, 20, 20, 0)).toBeGreaterThan(calcularFWI_canadiense(30, 80, 20, 0))
    expect(humedadFinoEmpirica(100)).toBe(30)
  })
  it('procesa respuesta Open-Meteo (m/s → km/h) y construye URL', () => {
    const serie = procesarFWI({ hourly: { time: ['2026-01-15T00:00', '2026-01-15T01:00'], temperature_2m: [20, 21], relative_humidity_2m: [50, 40], precipitation: [0, 0.6], wind_speed_10m: [5, 10], wind_direction_10m: [180, 200] } })
    expect(serie).toHaveLength(2)
    expect(serie[1].vientoKmh).toBe(36)
    expect(serie[1].precipitacion).toBe(0.6)
    expect(urlOpenMeteo(-41.4, -72.7, '2026-01-15', 3)).toContain('end_date=2026-01-18')
    expect(() => procesarFWI({})).toThrow()
  })
  it('1 minuto simulado = 1 hora meteorológica', () => {
    const s = meteoSintetica(72)
    expect(meteoParaMinuto(s, 0).horaAbs).toBe(0)
    expect(meteoParaMinuto(s, 10).horaAbs).toBe(10)
    expect(meteoParaMinuto(s, 500).horaAbs).toBe(71)
  })
})
