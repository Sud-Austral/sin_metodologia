import { describe, it, expect } from 'vitest'
import { initCA, ignitarCelda, tickCA, gridAPerimetro, gridAFrente, calcularSuperficieHa, ESTADO } from './ca_propagacion.js'

function gridHomogeneo(width, height, cellSize, modeloNumero = 2) {
  const n = width * height
  const fuelModel = new Uint8Array(n).fill(modeloNumero)
  const slopeX = new Float32Array(n)
  const slopeY = new Float32Array(n)
  return initCA(width, height, cellSize, fuelModel, slopeX, slopeY)
}

describe('ca_propagacion: initCA / ignitarCelda', () => {
  it('crea un grid con el tamaño correcto y todo sin quemar', () => {
    const grid = gridHomogeneo(20, 20, 13)
    expect(grid.state.length).toBe(400)
    expect(grid.state.every((s) => s === ESTADO.SIN_QUEMAR)).toBe(true)
    expect(grid.burningList.length).toBe(0)
  })

  it('ignitarCelda marca la celda como quemando y la agrega a burningList', () => {
    const grid = gridHomogeneo(20, 20, 13)
    ignitarCelda(grid, 10, 10, 0)
    const idx = 10 * 20 + 10
    expect(grid.state[idx]).toBe(ESTADO.QUEMANDO)
    expect(grid.burningList).toContain(idx)
  })
})

describe('ca_propagacion: tickCA propaga el fuego', () => {
  it('con viento y combustible seco, el fuego avanza y la superficie crece', () => {
    const grid = gridHomogeneo(60, 60, 13, 2) // K2, matorral bajo, ROS alto-medio
    ignitarCelda(grid, 30, 30, 0)
    let tiempo = 0
    let haAnterior = calcularSuperficieHa(grid)
    for (let i = 0; i < 20; i++) {
      tickCA(grid, tiempo, 25, 90, 8, 5, { ajusteROS: 1 })
      tiempo += 5
    }
    const haFinal = calcularSuperficieHa(grid)
    expect(haFinal).toBeGreaterThan(haAnterior)
    expect(grid.burningList.length).toBeGreaterThan(0)
  })

  it('con humedad igual o superior a la de extinción, el fuego NO se propaga (ROS=0)', () => {
    const grid = gridHomogeneo(40, 40, 13, 2) // K2 tiene Mx=28
    ignitarCelda(grid, 20, 20, 0)
    let tiempo = 0
    for (let i = 0; i < 10; i++) {
      tickCA(grid, tiempo, 25, 90, 90, 5, {}) // humedad 90% >> Mx
      tiempo += 5
    }
    // Solo la celda original puede haberse quemado por burnout, pero no hay
    // nuevas ignitaciones: la superficie no debe superar 1 celda.
    const haFinal = calcularSuperficieHa(grid)
    const areaUnaCelda = (13 * 13) / 10000
    expect(haFinal).toBeLessThanOrEqual(areaUnaCelda + 1e-6)
  })

  it('el perímetro y el frente son subconjuntos de celdas quemadas/quemando', () => {
    const grid = gridHomogeneo(50, 50, 13, 1) // K1 pastizal, ROS alto
    ignitarCelda(grid, 25, 25, 0)
    let tiempo = 0
    for (let i = 0; i < 15; i++) {
      tickCA(grid, tiempo, 20, 0, 10, 5, {})
      tiempo += 5
    }
    const perimetro = gridAPerimetro(grid)
    const frente = gridAFrente(grid)
    expect(perimetro.length).toBeGreaterThan(0)
    for (const [row, col] of perimetro) {
      const idx = row * grid.width + col
      expect(grid.state[idx]).not.toBe(ESTADO.SIN_QUEMAR)
    }
    for (const [row, col] of frente) {
      const idx = row * grid.width + col
      expect(grid.state[idx]).toBe(ESTADO.QUEMANDO)
    }
  })

  it('calcularSuperficieHa cuenta exactamente las celdas no "sin quemar"', () => {
    const grid = gridHomogeneo(10, 10, 13, 5)
    ignitarCelda(grid, 5, 5, 0)
    ignitarCelda(grid, 5, 6, 0)
    const ha = calcularSuperficieHa(grid)
    const esperado = (2 * 13 * 13) / 10000
    expect(ha).toBeCloseTo(esperado, 6)
  })
})

describe('ca_propagacion: rendimiento (referencia, no asserta tiempo exacto en CI)', () => {
  it('un tick sobre 240x240 no lanza excepciones y retorna un grid consistente', () => {
    const width = 240
    const height = 240
    const grid = gridHomogeneo(width, height, 13, 2)
    ignitarCelda(grid, 120, 120, 0)
    expect(() => tickCA(grid, 0, 22, 90, 9, 5, { ajusteROS: 0.7, curadoPasto: 85, factorSequia: 1.0 })).not.toThrow()
    expect(grid.state.length).toBe(width * height)
  })
})
