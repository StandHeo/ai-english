import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { IMAGE_MAX_CHARS, IMAGE_MAX_EDGE } from './compressImage'
import { albumCropRect, jpegOutputSize } from './cropRects'

export function isAlbumPickCanceled(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /cancel|cancelled|canceled|user cancelled|picker was cancelled/i.test(msg)
}

function canvasJpegFromCrop(
  bitmap: ImageBitmap,
  role: 'scene' | 'item',
  quality: number,
): string {
  const crop = albumCropRect(bitmap.width, bitmap.height, role)
  const { width, height } = jpegOutputSize(crop.sw, crop.sh, IMAGE_MAX_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('image_canvas_unavailable')
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** 相册图：按槽角色裁切后压成 JPEG，不保留相机原片 */
export async function processAlbumImage(
  blob: Blob,
  role: 'scene' | 'item',
): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    let quality = 0.85
    let url = canvasJpegFromCrop(bitmap, role, quality)
    while (url.length > IMAGE_MAX_CHARS && quality > 0.4) {
      quality -= 0.15
      url = canvasJpegFromCrop(bitmap, role, quality)
    }
    if (url.length > IMAGE_MAX_CHARS) throw new Error('image_too_large')
    return url
  } finally {
    bitmap.close()
  }
}

async function blobFromPhoto(dataUrl?: string, webPath?: string): Promise<Blob | null> {
  const src = dataUrl || webPath
  if (!src) return null
  const res = await fetch(src)
  if (!res.ok) throw new Error('album_photo_unreadable')
  return res.blob()
}

async function pickViaCamera(allowEditing: boolean): Promise<Blob | null> {
  const photo = await Camera.getPhoto({
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
    allowEditing,
    quality: 90,
  })
  try {
    return await blobFromPhoto(photo.dataUrl, photo.webPath)
  } finally {
    if (photo.webPath?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(photo.webPath)
      } catch {
        /* ignore */
      }
    }
  }
}

function pickViaFileInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      input.remove()
      resolve(file)
    }
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null)
      }, 400)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    window.addEventListener('focus', onFocus)
    input.click()
  })
}

/**
 * 原生相册（道具槽可系统裁切）；无 Camera 插件时回退 file input。
 * 用户取消返回 null。
 */
export async function pickAlbumImage(opts: { allowEditing: boolean }): Promise<Blob | null> {
  if (Capacitor.isPluginAvailable('Camera')) {
    try {
      return await pickViaCamera(opts.allowEditing)
    } catch (err) {
      if (isAlbumPickCanceled(err)) return null
      if (Capacitor.isNativePlatform()) throw err
    }
  }
  return pickViaFileInput()
}
