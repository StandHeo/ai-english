import assert from 'node:assert/strict'
import {
  clearCeremonyTtsLine,
  primaryWord,
  resolveCeremonyStickerSrc,
} from '../src/pages/clearCeremony.ts'
import type { LevelScript } from '../src/types.ts'

const base = {
  id: 't',
  approved: true,
  theme: 'fruits',
  title: 'T',
  target_words: ['apple'],
  scene: { setting: 'x', image: 'assets/scenes/orchard.png', character: 'bunny' },
  beats: [{ type: 'introduce' as const, npc_say: 'Hi', show: 'assets/items/apple.png' }],
  reward: { sticker: 's', stickerImage: 'assets/items/apple.png', stars: 1 },
} satisfies LevelScript

assert.equal(primaryWord(base), 'apple')
assert.match(clearCeremonyTtsLine(base, 0), /^Yay! Apple!$/)
assert.match(clearCeremonyTtsLine(base, 1), /^Wow! Apple!$/)

const noWord = { ...base, target_words: [] }
assert.equal(clearCeremonyTtsLine(noWord, 0), 'Yay!')

const noImg = {
  ...base,
  reward: { sticker: 's', stickerImage: '', stars: 1 },
  target_words: ['mountain bike'],
}
assert.equal(resolveCeremonyStickerSrc(noImg), 'assets/items/mountain-bike.png')

console.log('SMOKE_OK clearCeremony')
