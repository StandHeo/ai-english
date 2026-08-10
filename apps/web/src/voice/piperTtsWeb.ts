import { WebPlugin } from '@capacitor/core'

/** Browser stub: Piper TTS is Capacitor / Android only. */
export class PiperTtsWeb extends WebPlugin {
  async isReady(): Promise<{ ready: boolean; voiceId?: string; detail?: string }> {
    return { ready: false, detail: 'web_unavailable' }
  }

  async prepareModel(): Promise<{ ready: boolean; voiceId?: string; detail?: string }> {
    return { ready: false, detail: 'web_unavailable' }
  }

  async speak(_options: { text: string; rate?: number }): Promise<{ status: string }> {
    throw this.unavailable('PiperTts is only available in the native App')
  }

  async stop(): Promise<{ status: string }> {
    return { status: 'stopped' }
  }
}
