import { describe, it, expect } from 'vitest'
import { parseIntencion } from './intenciones.js'

describe('parseIntencion', () => {
  it('retorna null para una consulta sin comando (pregunta simple)', () => {
    expect(parseIntencion('¿Cuál es el ROS actual?')).toBeNull()
  })

  it('detecta "desplegar" y extrae recurso + dirección', () => {
    const r = parseIntencion('Desplegar Brigada R-22 al norte, acceso Los Copihues')
    expect(r).not.toBeNull()
    expect(r.accion).toBe('desplegar_recurso')
    expect(r.parametros.recursoId).toBe('R-22')
    expect(r.parametros.direccion).toBe('norte')
  })

  it('detecta "retardante" y extrae volumen en litros', () => {
    const r = parseIntencion('Aplicar retardante Phos-Chek, 1200 litros en el flanco norte')
    expect(r.accion).toBe('aplicar_retardante')
    expect(r.parametros.volumenLitros).toBe(1200)
  })

  it('detecta "pausa"', () => {
    const r = parseIntencion('Pausa la simulación un momento')
    expect(r.accion).toBe('pausar')
  })

  it('detecta "evacuar" y el lugar con "acceso ..."', () => {
    const r = parseIntencion('Evacuar acceso Los Copihues de inmediato')
    expect(r.accion).toBe('evacuar')
    expect(r.parametros.lugar.toLowerCase()).toContain('los copihues')
  })

  it('detecta "exportar" y el formato', () => {
    const r = parseIntencion('Exporta todo a PDF')
    expect(r.accion).toBe('exportar')
    expect(r.parametros.formato).toBe('pdf')
  })

  it('detecta "guardar estrategia"', () => {
    const r = parseIntencion('Guardá la estrategia actual')
    expect(r.accion).toBe('guardar_estrategia')
  })

  it('NO confunde "¿qué pasa si viento sube?" con un comando', () => {
    expect(parseIntencion('¿Qué pasa si viento sube a 35 km/h en 30 min?')).toBeNull()
  })
})
