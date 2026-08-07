import { WebPlugin } from '@capacitor/core'

/**
 * Browser stub: on-device Whisper is Capacitor-only.
 * Never routes diary ASR to cloud OpenAI.
 */
export class DiaryWhisperWeb extends WebPlugin {
  async listModels(): Promise<{
    models: Array<{ id: string; label: string; ready: boolean; packaged: boolean }>
    defaultId: string
  }> {
    return {
      models: [
        { id: 'tiny', label: 'Tiny（更快）', ready: false, packaged: false },
        { id: 'base', label: 'Base（更准，稍慢）', ready: false, packaged: false },
        { id: 'small', label: 'Small（更准，较慢）', ready: false, packaged: false },
      ],
      defaultId: 'tiny',
    }
  }

  async isReady(_options?: { modelId?: string }): Promise<{ ready: boolean; detail?: string; modelId?: string }> {
    return {
      ready: false,
      detail: 'web_unavailable',
    }
  }

  async prepareModel(_options?: {
    modelId?: string
  }): Promise<{ ready: boolean; detail?: string; modelId?: string }> {
    return {
      ready: false,
      detail: 'web_unavailable',
    }
  }

  async transcribe(_options: {
    wavBase64: string
    language?: string
    modelId?: string
  }): Promise<{ text: string; modelId?: string }> {
    throw this.unavailable('DiaryWhisper is only available in the native App')
  }
}
