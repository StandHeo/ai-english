import { Capacitor } from '@capacitor/core'

const MODEL_URL = '/models/en-us-small.tar'
const MODEL_ID = 'vosk-model-small-en-us-0.15'

type VoskEngine = {
  loadModel: (opts: {
    url: string
    id: string
    storagePath?: string
  }) => Promise<VoskModelSession>
  createTransferer: (
    audioContext: AudioContext,
    bufferSize?: number,
  ) => Promise<AudioWorkletNode>
  dispose: () => Promise<void>
}

type VoskModelSession = {
  transcribe: (
    blocks: Float32Array[],
    opts: {
      sampleRate: number
      grammar?: string
      transfer?: boolean
    },
  ) => Promise<{ text: string }>
  unload: () => void
}

export type VoskPcmSession = {
  stop: (grammarWords?: string[]) => Promise<{ text: string; detail?: string }>
}

let enginePromise: Promise<VoskEngine> | null = null
let modelPromise: Promise<VoskModelSession> | null = null

export function isNativeVoskAvailable(): boolean {
  return Capacitor.isNativePlatform()
}

async function getEngine(): Promise<VoskEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const mod = await import('monosklet/worker')
      return mod.createVoskletMonoWorker() as Promise<VoskEngine>
    })()
  }
  return enginePromise
}

/** 预加载模型（首次较慢）；可在进关卡时调用。 */
export async function ensureVoskModel(): Promise<void> {
  if (!isNativeVoskAvailable()) return
  if (!modelPromise) {
    modelPromise = (async () => {
      const engine = await getEngine()
      return engine.loadModel({
        url: MODEL_URL,
        id: MODEL_ID,
        storagePath: 'en-us',
      })
    })()
  }
  await modelPromise
}

/** 在已授权的 MediaStream 上开始采 mono PCM；stop 时交给 Vosk 转写。 */
export async function startVoskPcmCapture(
  stream: MediaStream,
): Promise<VoskPcmSession> {
  await ensureVoskModel()
  const engine = await getEngine()
  const model = await modelPromise!

  const audioContext = new AudioContext()
  await audioContext.resume()
  const sampleRate = audioContext.sampleRate
  const source = audioContext.createMediaStreamSource(stream)
  const transferer = await engine.createTransferer(audioContext, 128 * 15)
  const blocks: Float32Array[] = []

  transferer.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (event.data?.length) {
      // transfer:false 路径需要拷贝，避免 buffer 被回收
      blocks.push(new Float32Array(event.data))
    }
  }
  source.connect(transferer)

  let stopped = false
  return {
    stop: async (grammarWords?: string[]) => {
      if (stopped) return { text: '', detail: 'Vosk PCM 已结束' }
      stopped = true
      source.disconnect()
      transferer.disconnect()
      transferer.port.onmessage = null
      try {
        await audioContext.close()
      } catch {
        // ignore
      }

      if (blocks.length === 0) {
        return { text: '', detail: 'Vosk：未采到 PCM 音频' }
      }

      const words = (grammarWords || [])
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
      const grammar =
        words.length > 0
          ? JSON.stringify([...new Set([...words, '[unk]'])])
          : undefined

      try {
        const { text } = await model.transcribe(blocks, {
          sampleRate,
          grammar,
          transfer: false,
        })
        const trimmed = (text || '').trim()
        return {
          text: trimmed,
          detail: trimmed
            ? '来源：App 离线 Vosk'
            : 'Vosk 已运行，但没有识别出文字',
        }
      } catch (err) {
        return {
          text: '',
          detail: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}
