import test from 'node:test'
import assert from 'node:assert/strict'
import type { LevelScript } from '../types.ts'

const mem = new Map<string, string>()
;(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    mem.set(k, String(v))
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
}

import {
  dayHasMiniPack,
  dayHasPlayableContent,
  getPackLevelCount,
  markMiniLevelCompleted,
  materializeMiniLevelForPlay,
  saveGeneratedPack,
  setMiniLevelImages,
  setMiniLevelScenePrompt,
  setMinLevelKeywords,
  getDay,
  type FamilyDayRecord,
} from './store.ts'

const sampleLevel = (id: string, word: string): LevelScript => ({
  id,
  approved: true,
  theme: 'family',
  title: `${word} Day`,
  target_words: [word],
  scene: { setting: `A sunny ${word} place`, image: 'placeholder', character: 'bunny' },
  beats: [
    { type: 'introduce', npc_say: `Look, a ${word}!` },
    {
      type: 'ask',
      npc_say: `Say ${word}!`,
      expect: [word],
      hint_say: word,
      success_say: 'Yes!',
      fallback: {
        type: 'picture_choice',
        options: [
          { id: word, image: 'placeholder', correct: true },
          { id: 'bus', image: 'placeholder', correct: false },
        ],
      },
    },
    {
      type: 'find',
      npc_say: `Find the ${word}`,
      options: [
        { id: word, image: 'placeholder', correct: true },
        { id: 'cake', image: 'placeholder', correct: false },
      ],
    },
  ],
  reward: { sticker: `sticker-${word}`, stickerImage: 'placeholder', stars: 1 },
})

test('getPackLevelCount clamps settings to 3-5', () => {
  setMinLevelKeywords(9)
  assert.equal(getPackLevelCount(), 5)
  setMinLevelKeywords(3)
  assert.equal(getPackLevelCount(), 3)
  setMinLevelKeywords(4)
  assert.equal(getPackLevelCount(), 4)
})

test('saveGeneratedPack writes miniLevels and clears legacy level', () => {
  const date = '2099-01-02'
  const saved = saveGeneratedPack(date, {
    title: 'Park Pack',
    levels: [
      sampleLevel('family-20990102-park', 'park'),
      sampleLevel('family-20990102-slide', 'slide'),
      sampleLevel('family-20990102-ball', 'ball'),
    ],
    force: true,
  })
  assert.equal(saved.ok, true)
  if (!saved.ok) return
  assert.equal(saved.day.level, null)
  assert.equal(saved.day.miniLevels?.length, 3)
  assert.equal(saved.day.pack?.title, 'Park Pack')
  assert.equal(dayHasMiniPack(saved.day), true)
  assert.equal(dayHasPlayableContent(saved.day), true)
})

test('markMiniLevelCompleted aggregates day completed', () => {
  const date = '2099-01-03'
  saveGeneratedPack(date, {
    title: 'T',
    levels: [
      sampleLevel('family-20990103-a', 'park'),
      sampleLevel('family-20990103-b', 'slide'),
      sampleLevel('family-20990103-c', 'ball'),
    ],
    force: true,
  })
  let day = markMiniLevelCompleted(date, 'family-20990103-a')
  assert.equal(day?.completed, false)
  day = markMiniLevelCompleted(date, 'family-20990103-b')
  assert.equal(day?.completed, false)
  day = markMiniLevelCompleted(date, 'family-20990103-c')
  assert.equal(day?.completed, true)
})

test('setMiniLevelScenePrompt and materializeMiniLevelForPlay', async () => {
  const date = '2099-01-04'
  saveGeneratedPack(date, {
    title: 'T',
    levels: [sampleLevel('family-20990104-park', 'park')],
    force: true,
  })
  const updated = setMiniLevelScenePrompt(date, 'family-20990104-park', '小区游乐场')
  assert.equal(updated?.miniLevels?.[0]?.scenePrompt, '小区游乐场')
  // 非 data URL，不走 IndexedDB，便于 node 单测
  const dayAfter = await setMiniLevelImages(date, 'family-20990104-park', {
    imageBg: 'https://example.com/park.png',
    itemImages: ['https://example.com/park-item.png', 'https://example.com/bus.png'],
  })
  const day = dayAfter || getDay(date)!
  const play = materializeMiniLevelForPlay(day, 'family-20990104-park')
  assert.equal(play.scene.image, 'https://example.com/park.png')
  const askOpts = play.beats[1]?.fallback?.options || []
  const parkOpt = askOpts.find((o) => o.id === 'park')
  const busOpt = askOpts.find((o) => o.id === 'bus')
  assert.equal(parkOpt?.image, 'https://example.com/park-item.png')
  assert.equal(busOpt?.image, 'https://example.com/bus.png')
  assert.notEqual(busOpt?.image, play.scene.image)
})

test('legacy day without miniLevels still counts as playable', () => {
  const legacy: FamilyDayRecord = {
    date: '2099-01-05',
    story: 'hi',
    messages: [],
    level: sampleLevel('family-legacy', 'park'),
    photoHints: [],
    iconColors: [],
    images: [],
    completed: false,
    updatedAt: Date.now(),
  }
  assert.equal(dayHasPlayableContent(legacy), true)
  assert.equal(dayHasMiniPack(legacy), false)
})
