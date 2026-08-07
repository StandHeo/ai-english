import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findIconName,
  generateIconImagesForLevel,
  iconToDataUrl,
} from './familyIconSearch.ts'

test('findIconName maps apple alias', () => {
  const name = findIconName('apple')
  assert.ok(name)
  assert.match(String(name), /apple/)
})

test('iconToDataUrl returns svg data url', () => {
  const name = findIconName('dog')
  assert.ok(name)
  const url = iconToDataUrl(name!, 'dog')
  assert.ok(url?.startsWith('data:image/svg+xml'))
})

test('generateIconImagesForLevel fills from words', () => {
  const result = generateIconImagesForLevel({
    target_words: ['apple', 'dog', 'bus'],
    scene: { setting: '公园' },
    beats: [],
  })
  assert.ok(result.images.length >= 2)
  assert.ok(result.images.every((u) => u.startsWith('data:image')))
})
