import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadProgress, PACK_IDS, saveProgress } from './store.ts'

const BIKE = PACK_IDS.BIKE

describe('bike pack migration', () => {
  it('unlocks bike-09 when bike-08 review already completed', () => {
    if (typeof localStorage === 'undefined') return
    localStorage.clear()
    saveProgress({
      version: 2,
      packs: {
        [BIKE]: {
          completed: ['bike-08-review'],
          unlocked: ['bike-01-bike', 'bike-08-review'],
          stickers: [],
        },
      },
      stars: 0,
      dailyLimitMinutes: 30,
      playSecondsByDate: {},
    })
    const state = loadProgress()
    assert.ok(state.packs[BIKE].unlocked.includes('bike-09-pump-track'))
  })
})
