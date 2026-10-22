// Proveedor de IA en navegador: WebLLM (@mlc-ai/web-llm) sobre WebGPU.
// Reemplaza a Ollama + Mistral-7B. Si no hay WebGPU → fallback a plantillas (nunca pantalla en blanco).
export const MODELO_NAVEGADOR = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
export const TIMEOUT_MS = 30000

export async function detectarWebGPU() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return { disponible: false, razon: 'navigator.gpu no existe (navegador sin WebGPU)' }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return { disponible: false, razon: 'requestAdapter() devolvió null' }
    let info = null
    try { info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null) } catch { /* opcional */ }
    return { disponible: true, gpu: info ? `${info.vendor || ''} ${info.architecture || ''} ${info.device || ''} ${info.description || ''}`.trim() : 'desconocida' }
  } catch (e) {
    return { disponible: false, razon: e.message }
  }
}

export function crearProveedorWebLLM({ modelo = MODELO_NAVEGADOR, onProgress = () => {} } = {}) {
  let engine = null
  let estado = 'inactivo' // inactivo | cargando | listo | error
  let error = null
  let descarga_s = null
  let historial = []

  async function cargar() {
    if (estado === 'listo') return true
    estado = 'cargando'
    const t0 = performance.now()
    try {
      const webllm = await import('@mlc-ai/web-llm')
      engine = await webllm.CreateMLCEngine(modelo, { initProgressCallback: (p) => onProgress(p) })
      descarga_s = +((performance.now() - t0) / 1000).toFixed(1)
      estado = 'listo'
      return true
    } catch (e) {
      estado = 'error'; error = e.message
      throw e
    }
  }

  async function generar(system, user) {
    if (estado !== 'listo') throw new Error('Modelo no cargado')
    const mensajes = [{ role: 'system', content: system }, ...historial.slice(-6), { role: 'user', content: user }]
    const t0 = performance.now()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const reply = await Promise.race([
        engine.chat.completions.create({ messages: mensajes, temperature: 0.7, top_p: 0.9, max_tokens: 400 }),
        new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error(`Timeout IA (>${TIMEOUT_MS / 1000}s)`)))),
      ])
      const texto = reply.choices[0].message.content
      historial.push({ role: 'user', content: user }, { role: 'assistant', content: texto })
      return { texto, tokens: reply.usage?.completion_tokens ?? null, tokens_prompt: reply.usage?.prompt_tokens ?? null, latencia_s: +((performance.now() - t0) / 1000).toFixed(2), modelo }
    } finally { clearTimeout(timer) }
  }

  return {
    nombre: 'webllm', modelo, cargar, generar,
    get estado() { return estado }, get error() { return error }, get descarga_s() { return descarga_s },
    listo: () => estado === 'listo', reiniciarHistorial: () => { historial = [] },
  }
}

// Proveedor nulo: siempre fallback a plantillas.
export const PROVEEDOR_PLANTILLAS = { nombre: 'plantillas', modelo: 'plantillas-deterministas', listo: () => false, estado: 'fallback' }
