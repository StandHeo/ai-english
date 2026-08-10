import { Capacitor, registerPlugin } from '@capacitor/core'

export type PiperTtsStatus = {
  available: boolean
  platform: 'web' | 'native'
  ready: boolean
  voiceId?: string
  detail?: string
}

type PiperTtsPlugin = {
  isReady(): Promise<{ ready: boolean; voiceId?: string; detail?: string }>
  prepareModel(): Promise<{ ready: boolean; voiceId?: string; detail?: string }>
  speak(options: {
    text: string
    rate?: number
    pitch?: number
    voiceId?: string
  }): Promise<{ status: string; voiceId?: string }>
  stop(): Promise<{ status: string }>
}

const PiperTts = registerPlugin<PiperTtsPlugin>('PiperTts', {
  web: () => import('./piperTtsWeb').then((m) => new m.PiperTtsWeb()),
})

let readyCache: boolean | null = null
let preparePromise: Promise<boolean> | null = null

export async function getPiperTtsStatus(): Promise<PiperTtsStatus> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      platform: 'web',
      ready: false,
      detail: 'Piper 仅在 App（APK）中可用，浏览器仍用系统朗读。',
    }
  }
  try {
    const r = await PiperTts.isReady()
    readyCache = Boolean(r.ready)
    return {
      available: true,
      platform: 'native',
      ready: Boolean(r.ready),
      voiceId: r.voiceId,
      detail: r.detail,
    }
  } catch (err) {
    return {
      available: true,
      platform: 'native',
      ready: false,
      detail: err instanceof Error ? err.message : 'Piper 插件未加载',
    }
  }
}

export async function ensurePiperReady(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (readyCache) return true
  if (!preparePromise) {
    preparePromise = (async () => {
      try {
        let r = await PiperTts.isReady()
        if (!r.ready) r = await PiperTts.prepareModel()
        readyCache = Boolean(r.ready)
        return readyCache
      } catch {
        readyCache = false
        return false
      } finally {
        preparePromise = null
      }
    })()
  }
  return preparePromise
}

/** Speak with Piper. Throws if unavailable — caller should fall back to system TTS. */
export async function speakPiper(
  text: string,
  rate = 1,
  pitch = 1,
  voiceId: 'amy' | 'danny' = 'amy',
): Promise<void> {
  const ok = await ensurePiperReady()
  if (!ok) throw new Error('piper_not_ready')
  await PiperTts.speak({ text, rate, pitch, voiceId })
}

export async function stopPiper(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await PiperTts.stop()
  } catch {
    // ignore
  }
}
