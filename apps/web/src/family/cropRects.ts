/** 竖屏关卡画面宽高比（宽/高），与 `.level-screen` 手机竖屏接近 */
export const GAME_SCENE_ASPECT = 9 / 16

export type CropRect = { sx: number; sy: number; sw: number; sh: number }

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** CSS `object-fit: cover` 等价：从源图居中切出目标宽高比 */
export function coverCropRect(
  srcW: number,
  srcH: number,
  aspect = GAME_SCENE_ASPECT,
): CropRect {
  const w = Math.max(1, Math.round(srcW))
  const h = Math.max(1, Math.round(srcH))
  const destAspect = aspect > 0 ? aspect : GAME_SCENE_ASPECT
  const srcAspect = w / h
  if (srcAspect > destAspect) {
    const sw = clampInt(h * destAspect, 1, w)
    const sx = clampInt((w - sw) / 2, 0, w - sw)
    return { sx, sy: 0, sw, sh: h }
  }
  const sh = clampInt(w / destAspect, 1, h)
  const sy = clampInt((h - sh) / 2, 0, h - sh)
  return { sx: 0, sy, sw: w, sh }
}

export function centerSquareRect(srcW: number, srcH: number): CropRect {
  const w = Math.max(1, Math.round(srcW))
  const h = Math.max(1, Math.round(srcH))
  const side = Math.min(w, h)
  return {
    sx: clampInt((w - side) / 2, 0, w - side),
    sy: clampInt((h - side) / 2, 0, h - side),
    sw: side,
    sh: side,
  }
}

export function albumCropRect(
  srcW: number,
  srcH: number,
  role: 'scene' | 'item',
): CropRect {
  return role === 'scene' ? coverCropRect(srcW, srcH) : centerSquareRect(srcW, srcH)
}

export function jpegOutputSize(
  cropW: number,
  cropH: number,
  maxEdge = 768,
): { width: number; height: number } {
  const w = Math.max(1, cropW)
  const h = Math.max(1, cropH)
  const cap = Math.max(1, maxEdge)
  const scale = Math.min(1, cap / Math.max(w, h, 1))
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}
