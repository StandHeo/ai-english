import test from 'node:test'
import assert from 'node:assert/strict'
import { isAlbumPickCanceled } from './albumImage.ts'
import { IMAGE_MAX_EDGE } from './compressImage.ts'
import { jpegOutputSize } from './cropRects.ts'

test('isAlbumPickCanceled recognizes plugin cancel text', () => {
  assert.equal(isAlbumPickCanceled(new Error('User cancelled photos app')), true)
  assert.equal(isAlbumPickCanceled('No image picked'), false)
  assert.equal(isAlbumPickCanceled(new Error('image_too_large')), false)
})

test('processed album JPEG long edge stays at IMAGE_MAX_EDGE', () => {
  const out = jpegOutputSize(4000, 3000, IMAGE_MAX_EDGE)
  assert.equal(Math.max(out.width, out.height), IMAGE_MAX_EDGE)
  assert.ok(out.width <= IMAGE_MAX_EDGE && out.height <= IMAGE_MAX_EDGE)
})
