export type AsrInput = {
  audio?: Buffer
  mimeType?: string
  forcedText?: string
  expectHint?: string[]
}

/**
 * Vendor-agnostic ASR. Without cloud keys, uses forcedText or first expect hint (dev mock).
 */
export async function recognizeSpeech(input: AsrInput): Promise<string> {
  if (input.forcedText && input.forcedText.trim()) {
    return input.forcedText.trim()
  }

  const provider = process.env.ASR_PROVIDER || 'mock'
  if (provider === 'mock') {
    // Dev/demo: if audio uploaded without transcript, pretend child said the primary expect.
    if (input.expectHint?.[0]) return input.expectHint[0]
    return ''
  }

  // Placeholder for real providers (OpenAI Whisper, Azure, etc.)
  throw new Error(`ASR provider "${provider}" not configured. Set ASR_PROVIDER=mock or implement vendor.`)
}
