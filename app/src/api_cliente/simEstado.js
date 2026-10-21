// Estado de simulación en memoria, compartido por las 8 funciones cliente
// (equivalentes a los endpoints de la Sección 8.3). En el documento fuente
// este estado vivía en PostgreSQL + el grid_ca viajaba por HTTP; aquí todo
// vive en el cliente (restricción dura: solo frontend).
export const estado = {
  simulacionId: 'demo-los-lagos-1',
  conversacionId: null,
  nombre: 'Los Lagos — Demo 15 enero',
  minutos: 0,
  hectareas: 0,
  ros: 0,
  alturaLlama: 0,
  dirViento: 90,
  velViento: 22,
  humCombustible: 9,
  modelo: 'K2',
  modeloNumero: 2,
  lat: -41.234,
  lng: -72.445,
  pausado: false,
  recursos: [
    { id: 'R-22', tipo: 'brigada', estado: 'disponible', lat: -41.245, lng: -72.46 },
    { id: 'H-01', tipo: 'helicoptero', estado: 'disponible', lat: -41.22, lng: -72.44 },
    { id: 'E-5', tipo: 'excavadora', estado: 'disponible', lat: -41.25, lng: -72.44 },
  ],
  amenazadas: [
    { nombre: 'Escuela Pucatrihue', lat: -41.236, lng: -72.447, distanciaKm: 0.3 },
    { nombre: 'Puerto Montt', lat: -41.4717, lng: -72.9369, distanciaKm: 18.5 },
  ],
  historialROS: [],
  historialHectareas: [],
}

export function recursosMarkdown() {
  return estado.recursos.map((r) => `- ${r.id} (${r.tipo}): ${r.estado}`).join('\n')
}

export function amenazadasMarkdown() {
  return estado.amenazadas.map((a) => `- ${a.nombre} (${a.distanciaKm} km)`).join('\n')
}

export function actualizarEstadisticas(parcial) {
  Object.assign(estado, parcial)
  estado.recursosMarkdown = recursosMarkdown()
  estado.amenazadasMarkdown = amenazadasMarkdown()
}

export function registrarMuestraHistorial() {
  estado.historialROS.push({ minutos: estado.minutos, ros: estado.ros })
  estado.historialHectareas.push({ minutos: estado.minutos, hectareas: estado.hectareas })
}

export function reiniciarEstado() {
  estado.minutos = 0
  estado.hectareas = 0
  estado.ros = 0
  estado.pausado = false
  estado.historialROS = []
  estado.historialHectareas = []
}
