// Modelos de combustible K1-K13, inspirados en la nomenclatura KITRAL (Chile)
// pero con parámetros PROPIOS, simplificados y físicamente razonables (no son
// la tabla oficial KITRAL calibrada — ver ejercicio/metadatos.json -> supuestos).
//
// Campos por modelo:
//   id          : K1..K13
//   nombre      : descripción corta
//   ros0        : ROS de referencia en m/min (viento 0 km/h, pendiente 0%,
//                 humedad combustible = 10%)
//   mx          : humedad de extinción (%) — sobre este valor el combustible
//                 no sostiene combustión (ROS -> 0)
//   residenciaMin: minutos que una celda permanece "quemando" antes de pasar
//                  a "quemado" (usado para altura de llama / burnout)
//   alturaLlamaRef: altura de llama de referencia (m) a ROS0
//   color       : color hex para visualización (terreno/vegetación)
//   categoria   : agrupación gruesa usada en clasificación por percentiles
//                 (Sección 5.2 del documento): pasto | matorral | arbolado

export const MODELOS_KITRAL = {
  K1: { id: 'K1', nombre: 'Pastizal bajo', ros0: 3.5, mx: 25, residenciaMin: 4, alturaLlamaRef: 1.2, color: '#d9c25a', categoria: 'pasto' },
  K2: { id: 'K2', nombre: 'Matorral bajo / pradera', ros0: 2.8, mx: 28, residenciaMin: 6, alturaLlamaRef: 1.8, color: '#c7b24a', categoria: 'pasto' },
  K3: { id: 'K3', nombre: 'Matorral mediano', ros0: 2.2, mx: 30, residenciaMin: 8, alturaLlamaRef: 2.6, color: '#a3a23c', categoria: 'matorral' },
  K4: { id: 'K4', nombre: 'Matorral denso', ros0: 1.8, mx: 32, residenciaMin: 10, alturaLlamaRef: 3.4, color: '#8f9a3a', categoria: 'matorral' },
  K5: { id: 'K5', nombre: 'Plantación joven (pino/eucalipto)', ros0: 1.6, mx: 25, residenciaMin: 12, alturaLlamaRef: 4.0, color: '#6f9450', categoria: 'matorral' },
  K6: { id: 'K6', nombre: 'Plantación adulta podada', ros0: 1.1, mx: 24, residenciaMin: 14, alturaLlamaRef: 3.2, color: '#4f8a4f', categoria: 'arbolado' },
  K7: { id: 'K7', nombre: 'Plantación adulta sin manejo', ros0: 1.4, mx: 26, residenciaMin: 14, alturaLlamaRef: 4.6, color: '#3f7d47', categoria: 'arbolado' },
  K8: { id: 'K8', nombre: 'Renoval denso', ros0: 1.0, mx: 30, residenciaMin: 16, alturaLlamaRef: 4.2, color: '#357048', categoria: 'arbolado' },
  K9: { id: 'K9', nombre: 'Bosque nativo abierto', ros0: 0.8, mx: 35, residenciaMin: 18, alturaLlamaRef: 5.0, color: '#2c6246', categoria: 'arbolado' },
  K10: { id: 'K10', nombre: 'Bosque nativo denso', ros0: 0.55, mx: 38, residenciaMin: 20, alturaLlamaRef: 5.6, color: '#255440', categoria: 'arbolado' },
  K11: { id: 'K11', nombre: 'Bosque nativo húmedo (siempreverde)', ros0: 0.4, mx: 42, residenciaMin: 22, alturaLlamaRef: 6.0, color: '#1f4a3a', categoria: 'arbolado' },
  K12: { id: 'K12', nombre: 'Bosque mixto / mallín', ros0: 0.3, mx: 45, residenciaMin: 24, alturaLlamaRef: 6.2, color: '#1a4034', categoria: 'arbolado' },
  K13: { id: 'K13', nombre: 'Bosque denso / turbera', ros0: 0.18, mx: 50, residenciaMin: 28, alturaLlamaRef: 6.5, color: '#153329', categoria: 'arbolado' },
}

export const ORDEN_MODELOS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12', 'K13']

export function idModeloANumero(id) {
  return ORDEN_MODELOS.indexOf(id) + 1 // 1..13, 0 = sin dato
}

export function numeroAIdModelo(n) {
  return ORDEN_MODELOS[n - 1] || 'K2'
}

export function obtenerModelo(idOrNumero) {
  if (typeof idOrNumero === 'number') return MODELOS_KITRAL[numeroAIdModelo(idOrNumero)]
  return MODELOS_KITRAL[idOrNumero] || MODELOS_KITRAL.K2
}

// Clasificación automática por percentiles de elevación + pendiente,
// tal como describe la Sección 5.2 del documento fuente.
// Devuelve un Uint8Array con el número de modelo (1-13) por celda.
export function clasificarVegetacionPorPercentiles(dem, pendiente, width, height) {
  const n = width * height
  const elevOrdenada = Float32Array.from(dem).sort()
  const p40 = elevOrdenada[Math.floor(0.40 * (n - 1))]
  const p72 = elevOrdenada[Math.floor(0.72 * (n - 1))]
  const modelos = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const elev = dem[i]
    const pend = pendiente[i]
    let categoria
    if (elev > p72 && pend > 0.2) categoria = 'pasto'
    else if (elev > p40) categoria = 'matorral'
    else categoria = 'arbolado'

    // Dentro de cada categoría, variar el modelo específico según pendiente
    // (más pendiente / más seco -> modelo con ROS más alto dentro del grupo)
    let id
    if (categoria === 'pasto') id = pend > 0.35 ? 'K1' : 'K2'
    else if (categoria === 'matorral') {
      if (pend > 0.35) id = 'K3'
      else if (pend > 0.2) id = 'K4'
      else id = 'K5'
    } else {
      // arbolado: usar elevación relativa dentro del tercio bajo para variar densidad
      const rel = elev / (p40 || 1)
      if (rel > 0.9) id = 'K6'
      else if (rel > 0.75) id = 'K7'
      else if (rel > 0.6) id = 'K8'
      else if (rel > 0.45) id = 'K9'
      else if (rel > 0.3) id = 'K10'
      else if (rel > 0.15) id = 'K11'
      else id = Math.random() > 0.5 ? 'K12' : 'K13'
    }
    modelos[i] = idModeloANumero(id)
  }
  return modelos
}
