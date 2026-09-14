import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GAME_SCENE_ASPECT,
  albumCropRect,
  centerSquareRect,
  coverCropRect,
  jpegOutputSize,
} from './cropRects.ts'

test('coverCropRect crops landscape to 9:16 without letterbox', () => {
  const r = coverCropRect(1920, 1080, GAME_SCENE_ASPECT)
  assert.equal(r.sy, 0)
  assert.equal(r.sh, 1080)
  assert.ok(r.sw < 1920)
  assert.ok(Math.abs(r.sw / r.sh - GAME_SCENE_ASPECT) < 0.02)
  assert.equal(r.sx + r.sw <= 1920, true)
  assert.ok(r.sx > 0)
})

test('coverCropRect crops portrait taller than 9:16 on top/bottom', () => {
  const r = coverCropRect(1080, 2400, GAME_SCENE_ASPECT)
  assert.equal(r.sx, 0)
  assert.equal(r.sw, 1080)
  assert.ok(r.sh < 2400)
  assert.ok(r.sy > 0)
  assert.ok(Math.abs(r.sw / r.sh - GAME_SCENE_ASPECT) < 0.02)
})

test('coverCropRect keeps a 9:16 source intact', () => {
  const r = coverCropRect(1080, 1920, GAME_SCENE_ASPECT)
  assert.equal(r.sx, 0)
  assert.equal(r.sy, 0)
  assert.equal(r.sw, 1080)
  assert.equal(r.sh, 1920)
})

test('centerSquareRect takes the min edge from center', () => {
  const wide = centerSquareRect(2000, 1000)
  assert.equal(wide.sw, 1000)
  assert.equal(wide.sh, 1000)
  assert.equal(wide.sy, 0)
  assert.equal(wide.sx, 500)

  const tall = centerSquareRect(800, 1200)
  assert.equal(tall.sw, 800)
  assert.equal(tall.sh, 800)
  assert.equal(tall.sx, 0)
  assert.equal(tall.sy, 200)

  const square = centerSquareRect(512, 512)
  assert.deepEqual(square, { sx: 0, sy: 0, sw: 512, sh: 512 })
})

test('albumCropRect routes scene vs item', () => {
  const scene = albumCropRect(1600, 900, 'scene')
  const item = albumCropRect(1600, 900, 'item')
  assert.notEqual(scene.sw, item.sw)
  assert.equal(item.sw, item.sh)
  assert.ok(Math.abs(scene.sw / scene.sh - GAME_SCENE_ASPECT) < 0.02)
})

test('jpegOutputSize caps the long edge at 768 and never upscales', () => {
  assert.deepEqual(jpegOutputSize(1080, 1920, 768), { width: 432, height: 768 })
  assert.deepEqual(jpegOutputSize(400, 400, 768), { width: 400, height: 400 })
  const sq = jpegOutputSize(2000, 2000, 768)
  assert.equal(sq.width, 768)
  assert.equal(sq.height, 768)
})
