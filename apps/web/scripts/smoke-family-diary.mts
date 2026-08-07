const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v))
  },
  removeItem: (k: string) => {
    store.delete(k)
  },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}

async function main() {
  const m = await import('../src/family/store.ts')
  const date = m.todayKey()
  m.appendTextMessage(date, '今天去公园')
  m.appendTextMessage(date, '玩了滑梯')
  const day = m.ensureMessagesMigrated(date)
  if (day.messages.length !== 2) throw new Error('msg count')
  if (!day.story.includes('公园') || !day.story.includes('滑梯')) throw new Error('merge')

  store.clear()
  const raw = {
    version: 1,
    days: {
      '2020-01-01': {
        date: '2020-01-01',
        story: '旧草稿一天',
        level: null,
        photoHints: [],
        images: [],
        completed: false,
        updatedAt: 1,
      },
    },
    deepseekApiKey: '',
  }
  localStorage.setItem('ai-english-family-v1', JSON.stringify(raw))
  const migrated = m.ensureMessagesMigrated('2020-01-01')
  if (migrated.messages.length !== 1 || migrated.messages[0].text !== '旧草稿一天') {
    throw new Error('migrate')
  }

  m.appendVoiceMessage(date, { text: '语音一句', audioDataUrl: 'data:audio/webm;base64,AAA' })
  const voiceDays = m.listDaysWithVoice()
  if (!voiceDays.includes(date)) throw new Error('voice list')
  console.log('SMOKE_OK', { msgs: day.messages.length, voiceDays })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
