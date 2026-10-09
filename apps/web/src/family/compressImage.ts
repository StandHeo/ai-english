export const IMAGE_MAX_EDGE = 768
export const IMAGE_MAX_CHARS = 750_000

const MAX_EDGE = IMAGE_MAX_EDGE
const MAX_CHARS = IMAGE_MAX_CHARS

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

/** 配图失败时的米色 SVG 占位底色；出现在 URL/SVG 正文中即视为假图。 */
export const MOCK_SLOT_FILL = '#ffe8c8'

export function mockSlotDataUrl(label: string): string {
  const safe = label.replace(/[<>&"']/g, '').slice(0, 24) || 'fun'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="100%" height="100%" fill="${MOCK_SLOT_FILL}"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
    font-family="sans-serif" font-size="42" fill="#5a3d1b">${safe}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** 同步识别 data: SVG 失败占位（尚未进 IDB 时）。 */
export function isFallbackMockImageUrl(url: string | undefined | null): boolean {
  if (!url) return false
  if (!/^data:image\/svg\+xml/i.test(url)) return false
  try {
    const decoded = /%[0-9a-f]{2}/i.test(url) ? decodeURIComponent(url) : url
    return new RegExp(MOCK_SLOT_FILL, 'i').test(decoded)
  } catch {
    return /ffe8c8/i.test(url)
  }
}

/** 含 blob: 解析后的 SVG 占位；JPEG 化后的假图无法可靠识别。 */
export async function isFallbackMockImage(url: string | undefined | null): Promise<boolean> {
  if (!url) return false
  if (isFallbackMockImageUrl(url)) return true
  if (!url.startsWith('blob:') && !/^data:image\/svg/i.test(url)) return false
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    if (blob.type && !/svg/i.test(blob.type)) return false
    const text = await blob.text()
    return new RegExp(MOCK_SLOT_FILL, 'i').test(text)
  } catch {
    return false
  }
}
