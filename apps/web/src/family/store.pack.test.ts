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
  appendTextMessage,
  dayHasMiniPack,
  dayHasPlayableContent,
  getPackLevelCount,
  getDay,
  markMiniLevelCompleted,
  materializeMiniLevelForPlay,
  saveGeneratedPack,
  searchFamilyDays,
  setMiniLevelImages,
  setMiniLevelItemPrompt,
  setMiniLevelScenePrompt,
  setMiniLevelSlotImage,
  setMinLevelKeywords,
  type FamilyDayRecord,
} from './store.ts'
import { buildKidsPrompt, slotRoleLabel, slotsForMiniLevel } from './imageSlots.ts'

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

test('searchFamilyDays matches diary text, main word, scene and hint', () => {
  localStorage.clear()
  saveGeneratedPack('2099-03-04', {
    title: 'Slide Pack',
    levels: [sampleLevel('family-20990304-slide', 'slide')],
    force: true,
  })
  saveGeneratedPack('2099-03-05', {
    title: 'Park Pack',
    levels: [sampleLevel('family-20990305-park', 'park')],
    force: true,
  })
  // 日记文本命中
  appendTextMessage('2099-03-04', '今天去了小区的滑梯')

  const byDiary = searchFamilyDays('滑梯')
  assert.equal(byDiary.length, 1)
  assert.equal(byDiary[0]?.date, '2099-03-04')
  assert.ok(byDiary[0]?.fields.includes('日记'))

  // 主词命中
  const byWord = searchFamilyDays('park')
  assert.equal(byWord.length, 1)
  assert.equal(byWord[0]?.date, '2099-03-05')
  assert.ok(byWord[0]?.fields.includes('主词'))

  // 场景词命中
  const byScene = searchFamilyDays('slide place')
  assert.ok(byScene.some((h) => h.date === '2099-03-04'))

  // 无命中返回空
  assert.deepEqual(searchFamilyDays('zzz-no-such'), [])
  // 空查询返回空
  assert.deepEqual(searchFamilyDays('  '), [])
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

test('setMiniLevelItemPrompt overrides item subject in slots and persists', () => {
  const date = '2099-02-06'
  saveGeneratedPack(date, {
    title: 'T',
    levels: [sampleLevel('family-20990206-dad', 'dad')],
    force: true,
  })
  const level = getDay(date)!.miniLevels![0]
  // 默认：主词 dad + 干扰 bus/cake
  const base = slotsForMiniLevel(
    level.level as unknown as Record<string, unknown>,
    'A warm home living room with dad sitting on a sofa',
    5,
  )
  // sampleLevel 只有 bus/cake 两个干扰项 → 1 背景 + 主词 + 2 干扰 = 4 槽
  assert.equal(base.length, 4)
  assert.equal(base[1]?.subject, 'dad')
  assert.equal(base[2]?.subject, 'bus')

  // 覆盖第 2 个道具槽（bus → school bus）
  const updated = setMiniLevelItemPrompt(date, 'family-20990206-dad', 2, 'school bus')
  assert.equal(updated?.miniLevels?.[0]?.itemPrompts?.[1], 'school bus')
  const overridden = slotsForMiniLevel(
    (updated || getDay(date)!).miniLevels![0].level as unknown as Record<string, unknown>,
    'A warm home living room with dad sitting on a sofa',
    5,
    (updated || getDay(date)!).miniLevels![0].itemPrompts,
  )
  assert.equal(overridden[2]?.subject, 'school bus')
  // 未覆盖的槽不受影响
  assert.equal(overridden[1]?.subject, 'dad')

  // 清空覆盖恢复默认
  const restored = setMiniLevelItemPrompt(date, 'family-20990206-dad', 2, '')
  assert.equal(restored?.miniLevels?.[0]?.itemPrompts?.[1], undefined)
})

test('buildKidsPrompt composes final prompt and slotRoleLabel names slots', () => {
  const slots = slotsForMiniLevel(
    sampleLevel('x', 'dad') as unknown as Record<string, unknown>,
    'A warm home living room',
    5,
  )
  const scenePrompt = buildKidsPrompt(slots[0]!)
  const itemPrompt = buildKidsPrompt(slots[2]!)
  assert.match(scenePrompt, /背景/)
  assert.match(scenePrompt, /A warm home living room/)
  assert.match(itemPrompt, /只画一个主体/)
  assert.match(itemPrompt, /bus/)
  assert.equal(slotRoleLabel(slots, 0), '背景图')
  assert.equal(slotRoleLabel(slots, 1), '主词图')
  assert.equal(slotRoleLabel(slots, 2), '干扰图')
})

test('setMiniLevelSlotImage replaces only the target slot', async () => {
  const date = '2099-02-07'
  saveGeneratedPack(date, {
    title: 'T',
    levels: [sampleLevel('family-20990207-park', 'park')],
    force: true,
  })
  // 先放三张占位（http 引用不走 IDB，node 可测）
  await setMiniLevelImages(date, 'family-20990207-park', {
    imageBg: 'https://example.com/bg.png',
    itemImages: ['https://example.com/a.png', 'https://example.com/b.png'],
  })
  // 单槽替换第 2 个道具
  const day = await setMiniLevelSlotImage(
    date,
    'family-20990207-park',
    2,
    'https://example.com/b2.png',
  )
  const mini = day!.miniLevels![0]
  assert.equal(mini.imageBg, 'https://example.com/bg.png')
  assert.equal(mini.itemImages?.[0], 'https://example.com/a.png')
  assert.equal(mini.itemImages?.[1], 'https://example.com/b2.png')
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
