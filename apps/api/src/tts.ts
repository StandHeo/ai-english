export type TtsResult = {
  mode: 'browser' | 'audio_url'
  text: string
  audioUrl?: string
}

/**
 * MVP: tell client to use browser speechSynthesis. Swap for cloud TTS later.
 */
export async function synthesizeSpeech(text: string): Promise<TtsResult> {
  const provider = process.env.TTS_PROVIDER || 'browser'
  if (provider === 'browser') {
    return { mode: 'browser', text }
  }
  throw new Error(`TTS provider "${provider}" not configured`)
}
