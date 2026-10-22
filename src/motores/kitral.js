// Modelos de combustible KITRAL (K1–K13).
// Valores paramétricos (carga, altura de lecho, humedad de extinción, ROS base a 10 % de
// humedad sin viento ni pendiente). Son aproximaciones calibradas para el simulador, no
// la tabla oficial KITRAL (que no está disponible en este repositorio).

export const C_PASTO = 1
export const C_MATORRAL = 2
export const C_ARBOLADO = 3

export const MODELOS_KITRAL = {
  1: { nombre: 'Pastizal bajo', clase: C_PASTO, carga_kg_m2: 0.4, altura_m: 0.3, hum_ext: 15, ros_base: 9.0 },
  2: { nombre: 'Pastizal alto', clase: C_PASTO, carga_kg_m2: 0.8, altura_m: 0.8, hum_ext: 15, ros_base: 11.0 },
  3: { nombre: 'Matorral bajo', clase: C_MATORRAL, carga_kg_m2: 1.2, altura_m: 0.8, hum_ext: 20, ros_base: 5.5 },
  4: { nombre: 'Matorral medio', clase: C_MATORRAL, carga_kg_m2: 1.8, altura_m: 1.5, hum_ext: 22, ros_base: 4.5 },
  5: { nombre: 'Matorral alto', clase: C_MATORRAL, carga_kg_m2: 2.5, altura_m: 2.5, hum_ext: 25, ros_base: 3.8 },
  6: { nombre: 'Matorral con árboles', clase: C_MATORRAL, carga_kg_m2: 2.2, altura_m: 2.0, hum_ext: 25, ros_base: 3.2 },
  7: { nombre: 'Plantación joven', clase: C_ARBOLADO, carga_kg_m2: 1.6, altura_m: 0.5, hum_ext: 25, ros_base: 2.6 },
  8: { nombre: 'Plantación adulta', clase: C_ARBOLADO, carga_kg_m2: 1.4, altura_m: 0.4, hum_ext: 28, ros_base: 2.0 },
  9: { nombre: 'Bosque nativo abierto', clase: C_ARBOLADO, carga_kg_m2: 1.5, altura_m: 0.5, hum_ext: 28, ros_base: 1.8 },
  10: { nombre: 'Bosque nativo semidenso', clase: C_ARBOLADO, carga_kg_m2: 1.8, altura_m: 0.5, hum_ext: 30, ros_base: 1.4 },
  11: { nombre: 'Bosque mixto', clase: C_ARBOLADO, carga_kg_m2: 2.0, altura_m: 0.6, hum_ext: 30, ros_base: 1.2 },
  12: { nombre: 'Bosque denso con sotobosque', clase: C_ARBOLADO, carga_kg_m2: 2.4, altura_m: 0.8, hum_ext: 32, ros_base: 1.0 },
  13: { nombre: 'Bosque denso', clase: C_ARBOLADO, carga_kg_m2: 2.2, altura_m: 0.4, hum_ext: 35, ros_base: 0.7 },
}

export function obtenerModelo(k) {
  const m = MODELOS_KITRAL[k]
  if (!m) throw new Error(`Modelo KITRAL inválido: K${k}`)
  return m
}

export function nombreModelo(k) {
  return `K${k} ${obtenerModelo(k).nombre}`
}

export function claseDeModelo(k) {
  return obtenerModelo(k).clase
}

// Clasificación automática por percentiles de elevación + pendiente (Sección 5.2).
// Devuelve un Uint8Array con el modelo KITRAL por celda.
export function clasificarVegetacion(dem, pendiente, ancho, alto, semilla = 7) {
  const n = ancho * alto
  const todaElev = Float32Array.from(dem).sort()
  const p40 = todaElev[Math.floor(0.4 * todaElev.length)]
  const p72 = todaElev[Math.floor(0.72 * todaElev.length)]
  const modelo = new Uint8Array(n)
  let s = semilla
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  for (let i = 0; i < n; i++) {
    const elev = dem[i]
    const pend = pendiente ? pendiente[i] : 0
    let tipo
    if (elev > p72 && pend > 0.2) tipo = C_PASTO
    else if (elev > p40) tipo = C_MATORRAL
    else tipo = C_ARBOLADO
    const r = rnd()
    if (tipo === C_PASTO) modelo[i] = r < 0.5 ? 1 : 2
    else if (tipo === C_MATORRAL) modelo[i] = 3 + Math.floor(r * 4) // K3–K6
    else modelo[i] = 7 + Math.floor(r * 7) // K7–K13
  }
  return { modelo, p40, p72 }
}
