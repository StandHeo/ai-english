const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function speakBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.9
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

export async function requestTts(text: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.mode === 'browser' || data.text) {
        await speakBrowser(data.text || text)
        return
      }
    }
  } catch {
    // fall through
  }
  await speakBrowser(text)
}

export async function submitSpeech(opts: {
  blob?: Blob
  text?: string
  expect: string[]
}): Promise<{ transcript: string; matched: boolean }> {
  const form = new FormData()
  form.append('expect', opts.expect.join('|'))
  if (opts.text) form.append('text', opts.text)
  if (opts.blob) form.append('audio', opts.blob, 'speech.webm')

  const res = await fetch(`${API_BASE}/api/asr`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('asr_failed')
  return res.json()
}
