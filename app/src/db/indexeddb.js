// Persistencia en IndexedDB de conversaciones y decisiones (requisito:
// "conversaciones recuperables al reabrir"). Usa la librería `idb` (wrapper
// con promesas sobre la API nativa de IndexedDB del navegador).
import { openDB } from 'idb'

const DB_NAME = 'simulador3d_coigue'
const DB_VERSION = 1
const STORE_CONVERSACIONES = 'conversaciones'
const STORE_MENSAJES = 'mensajes'
const STORE_ESTRATEGIAS = 'estrategias'

let dbPromise = null

export function getDB() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB no disponible en este entorno')
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_CONVERSACIONES)) {
          db.createObjectStore(STORE_CONVERSACIONES, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_MENSAJES)) {
          const store = db.createObjectStore(STORE_MENSAJES, { keyPath: 'id', autoIncrement: true })
          store.createIndex('conversacionId', 'conversacionId')
        }
        if (!db.objectStoreNames.contains(STORE_ESTRATEGIAS)) {
          db.createObjectStore(STORE_ESTRATEGIAS, { keyPath: 'id', autoIncrement: true })
        }
      },
    })
  }
  return dbPromise
}

export async function crearConversacion(simulacionId) {
  const db = await getDB()
  const id = `conv-${simulacionId}-${Date.now()}`
  const conv = { id, simulacionId, fechaCreacion: new Date().toISOString(), numMensajes: 0 }
  await db.put(STORE_CONVERSACIONES, conv)
  return conv
}

export async function guardarMensaje(conversacionId, rol, contenido, meta = {}) {
  const db = await getDB()
  const mensaje = { conversacionId, rol, contenido, timestamp: new Date().toISOString(), ...meta }
  const id = await db.add(STORE_MENSAJES, mensaje)
  const conv = await db.get(STORE_CONVERSACIONES, conversacionId)
  if (conv) {
    conv.numMensajes = (conv.numMensajes || 0) + 1
    await db.put(STORE_CONVERSACIONES, conv)
  }
  return { id, ...mensaje }
}

export async function listarMensajes(conversacionId) {
  const db = await getDB()
  const tx = db.transaction(STORE_MENSAJES, 'readonly')
  const idx = tx.store.index('conversacionId')
  const mensajes = await idx.getAll(conversacionId)
  await tx.done
  return mensajes.sort((a, b) => a.id - b.id)
}

export async function listarConversaciones() {
  const db = await getDB()
  return db.getAll(STORE_CONVERSACIONES)
}

export async function guardarEstrategia(nombre, snapshot) {
  const db = await getDB()
  const estrategia = { nombre, snapshot, fecha: new Date().toISOString() }
  const id = await db.add(STORE_ESTRATEGIAS, estrategia)
  return { id, ...estrategia }
}

export async function listarEstrategias() {
  const db = await getDB()
  return db.getAll(STORE_ESTRATEGIAS)
}
