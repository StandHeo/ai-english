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

const idb = new Map<string, Blob>()

class FakeReq<T> {
  result: T
  error: Error | null = null
  onsuccess: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  constructor(result: T) {
    this.result = result
    queueMicrotask(() => this.onsuccess?.(new Event('success')))
  }
}

class FakeTx {
  oncomplete: (() => void) | null = null
  onerror: (() => void) | null = null
  error: Error | null = null
  constructor(private mode: string) {}
  objectStore() {
    return {
      put: (blob: Blob, id: string) => {
        idb.set(id, blob)
        queueMicrotask(() => this.oncomplete?.())
        return new FakeReq(undefined)
      },
      get: (id: string) => new FakeReq(idb.get(id) ?? null),
      delete: (id: string) => {
        idb.delete(id)
        queueMicrotask(() => this.oncomplete?.())
        return new FakeReq(undefined)
      },
    }
  }
}

class FakeDb {
  objectStoreNames = { contains: () => true }
  transaction(_store: string, mode: string) {
    return new FakeTx(mode)
  }
  close() {}
}

;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = {
  open: () => {
    const req = {
      result: new FakeDb() as unknown as IDBDatabase,
      error: null as Error | null,
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => void) | null,
    }
    queueMicrotask(() => req.onsuccess?.(new Event('success')))
    return req as unknown as IDBOpenDBRequest
  },
} as IDBFactory

async function main() {
  const m = await import('../src/family/store.ts')
  const date = m.todayKey()
  m.appendTextMessage(date, '今天去公园')
  m.appendTextMessage(date, '玩了滑梯')
  const day = m.ensureMessagesMigrated(date)
  if (day.messages.length !== 2) throw new Error('msg count')
  if (!day.story.includes('公园') || !day.story.includes('滑梯')) throw new Error('merge')

  store.clear()
  idb.clear()
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

  await m.appendVoiceMessage(date, {
    text: '语音一句',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
  })
  const voiceDays = m.listDaysWithVoice()
  if (!voiceDays.includes(date)) throw new Error('voice list')
  const saved = m.getDay(date)!
  const voice = saved.messages.find((x) => x.audioId)
  if (!voice?.audioId) throw new Error('audioId missing')
  if (voice.audioDataUrl) throw new Error('should not embed data url')
  if (!idb.has(voice.audioId)) throw new Error('clip missing in idb')
  console.log('SMOKE_OK', { msgs: day.messages.length, voiceDays, audioId: voice.audioId })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
