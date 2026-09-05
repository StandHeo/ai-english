const MAX_EDGE = 768
const MAX_CHARS = 750_000

function canvasJpeg(bitmap: ImageBitmap, quality: number): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height, 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('image_canvas_unavailable')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function compressImageBlob(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    let quality = 0.85
    let url = canvasJpeg(bitmap, quality)
    while (url.length > MAX_CHARS && quality > 0.4) {
      quality -= 0.15
      url = canvasJpeg(bitmap, quality)
    }
    if (url.length > MAX_CHARS) throw new Error('image_too_large')
    return url
  } finally {
    bitmap.close()
  }
}

export async function compressBytes(bytes: Uint8Array, mime = 'image/jpeg'): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: mime })
  return compressImageBlob(blob)
}

export async function compressDataUrl(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return compressImageBlob(blob)
}

export function mockSlotDataUrl(label: string): string {
  const safe = label.replace(/[<>&"']/g, '').slice(0, 24) || 'fun'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="100%" height="100%" fill="#ffe8c8"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
    font-family="sans-serif" font-size="42" fill="#5a3d1b">${safe}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
