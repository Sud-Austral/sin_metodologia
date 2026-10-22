// Persistencia en IndexedDB (navegador) con fallback en memoria (Node / pruebas).
// Almacenes: conversaciones, mensajes, estrategias, acciones, cache.
const NOMBRE = 'coigue_sim3d'
const VERSION = 1
const ALMACENES = ['conversaciones', 'mensajes', 'estrategias', 'acciones', 'cache']

const memoria = Object.fromEntries(ALMACENES.map((a) => [a, new Map()]))
let dbPromise = null

export function hayIndexedDB() {
  return typeof indexedDB !== 'undefined'
}

function abrir() {
  if (!hayIndexedDB()) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const a of ALMACENES) if (!db.objectStoreNames.contains(a)) db.createObjectStore(a, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(db, almacen, modo, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(almacen, modo)
    const req = fn(t.objectStore(almacen))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) })
}

export async function guardar(almacen, obj) {
  if (!obj.id) obj.id = uuid()
  const db = await abrir()
  if (!db) { memoria[almacen].set(obj.id, structuredClone(obj)); return obj }
  await tx(db, almacen, 'readwrite', (s) => s.put(obj))
  return obj
}

export async function obtener(almacen, id) {
  const db = await abrir()
  if (!db) return memoria[almacen].get(id) ?? null
  return (await tx(db, almacen, 'readonly', (s) => s.get(id))) ?? null
}

export async function listar(almacen, filtro = null) {
  const db = await abrir()
  let todos
  if (!db) todos = Array.from(memoria[almacen].values())
  else todos = await tx(db, almacen, 'readonly', (s) => s.getAll())
  return filtro ? todos.filter(filtro) : todos
}

export async function borrar(almacen, id) {
  const db = await abrir()
  if (!db) return memoria[almacen].delete(id)
  await tx(db, almacen, 'readwrite', (s) => s.delete(id))
  return true
}

export async function limpiarTodo() {
  const db = await abrir()
  for (const a of ALMACENES) {
    if (!db) memoria[a].clear()
    else await tx(db, a, 'readwrite', (s) => s.clear())
  }
}

export const cacheGet = async (clave) => { const r = await obtener('cache', clave); return r ? r.valor : null }
export const cacheSet = (clave, valor) => guardar('cache', { id: clave, valor, fecha: Date.now() })

// --- Conversaciones y mensajes (equivalente a chat_conversaciones / chat_mensajes) ---
export async function crearConversacion(simulacion_id, usuario = 'despachador') {
  return guardar('conversaciones', { id: uuid(), simulacion_id, usuario, fecha_creacion: new Date().toISOString(), num_mensajes: 0 })
}

export async function guardarMensaje({ conversacion_id, rol, contenido, tokens = null, modelo = null, timestamp = null, comando = null }) {
  const msg = await guardar('mensajes', { id: uuid(), conversacion_id, rol, contenido, tokens_utilizados: tokens, modelo, timestamp: timestamp || new Date().toISOString(), comando })
  const conv = await obtener('conversaciones', conversacion_id)
  if (conv) { conv.num_mensajes = (conv.num_mensajes || 0) + 1; await guardar('conversaciones', conv) }
  return msg
}

export async function mensajesDe(conversacion_id) {
  const ms = await listar('mensajes', (m) => m.conversacion_id === conversacion_id)
  return ms.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export async function ultimaConversacion(simulacion_id) {
  const cs = await listar('conversaciones', (c) => !simulacion_id || c.simulacion_id === simulacion_id)
  return cs.sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))[0] ?? null
}
