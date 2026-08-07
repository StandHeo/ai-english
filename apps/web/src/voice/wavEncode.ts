/** Encode AudioBuffer as 16 kHz mono 16-bit PCM WAV (base64, no data: prefix). */
export async function blobToWav16kBase64(blob: Blob): Promise<string> {
  const arrayBuf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0))
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
    const src = offline.createBufferSource()
    // Mixdown to mono
    const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate)
    const ch0 = mono.getChannelData(0)
    const channels = decoded.numberOfChannels
    for (let i = 0; i < decoded.length; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) sum += decoded.getChannelData(c)[i] || 0
      ch0[i] = sum / channels
    }
    src.buffer = mono
    src.connect(offline.destination)
    src.start(0)
    const rendered = await offline.startRendering()
    const pcm = rendered.getChannelData(0)
    const wav = encodeWavPcm16(pcm, 16000)
    return bufferToBase64(wav)
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  writeStr(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeStr(view, 8, 'WAVE')
  writeStr(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(view, 36, 'data')
  view.setUint32(40, dataLength, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
