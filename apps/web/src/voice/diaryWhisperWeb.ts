import { WebPlugin } from '@capacitor/core'

/**
 * Browser stub: on-device Whisper is Capacitor-only.
 * Never routes diary ASR to cloud OpenAI.
 */
export class DiaryWhisperWeb extends WebPlugin {
  async isReady(): Promise<{ ready: boolean; detail?: string }> {
    return {
      ready: false,
      detail: 'web_unavailable',
    }
  }

  async prepareModel(): Promise<{ ready: boolean; detail?: string }> {
    return {
      ready: false,
      detail: 'web_unavailable',
    }
  }

  async transcribe(_options: {
    wavBase64: string
    language?: string
  }): Promise<{ text: string }> {
    throw this.unavailable('DiaryWhisper is only available in the native App')
  }
}
