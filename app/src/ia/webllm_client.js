// LLM que corre DENTRO del navegador vía WebLLM (@mlc-ai/web-llm, WebGPU).
// Donde el documento fuente pedía "Ollama + Mistral-7B" (backend + proceso
// local del SO), aquí se usa un modelo pequeño cuantizado que el propio
// navegador descarga y ejecuta sobre WebGPU -- sin backend, sin proceso
// externo. Si no hay WebGPU, NUNCA se deja la UI en blanco: se usa un
// respondedor de plantilla (ver respuestaFallback) y se avisa con claridad.
import { ensamblarPromptSistema } from './contexto.js'

export const MODELO_WEBLLM = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

export function detectarWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

export class ClienteIA {
  constructor() {
    this.engine = null
    this.listo = false
    this.webgpuDisponible = detectarWebGPU()
    this.tamanoModeloMB = null
    this.descargaModeloS = null
  }

  /** Intenta cargar el motor WebLLM. Nunca lanza: retorna {ok, razon}. */
  async inicializar(onProgress) {
    if (!this.webgpuDisponible) {
      return { ok: false, razon: 'sin_webgpu', mensaje: 'Este navegador no expone WebGPU (navigator.gpu). El chat requiere Chrome/Edge recientes con WebGPU habilitado. Se usará un respondedor de plantilla local mientras tanto.' }
    }
    const t0 = performance.now()
    try {
      const webllm = await import('@mlc-ai/web-llm')
      this.engine = await webllm.CreateMLCEngine(MODELO_WEBLLM, {
        initProgressCallback: (reporte) => {
          if (reporte?.text && onProgress) onProgress(reporte)
        },
      })
      this.listo = true
      this.descargaModeloS = (performance.now() - t0) / 1000
      return { ok: true }
    } catch (e) {
      return { ok: false, razon: 'error_carga', mensaje: `No se pudo inicializar WebLLM: ${e.message}` }
    }
  }

  async responder(pregunta, estadisticas) {
    if (!this.listo || !this.engine) {
      throw new Error('ClienteIA no está inicializado (sin WebGPU o modelo no cargado)')
    }
    const mensajes = [
      { role: 'system', content: ensamblarPromptSistema(estadisticas) },
      { role: 'user', content: pregunta },
    ]
    const t0 = performance.now()
    const resp = await this.engine.chat.completions.create({ messages: mensajes, temperature: 0.7 })
    const latenciaS = (performance.now() - t0) / 1000
    return {
      respuesta: resp.choices[0].message.content,
      tokensUtilizados: resp.usage?.total_tokens ?? null,
      latenciaS,
      modelo: MODELO_WEBLLM,
    }
  }
}
