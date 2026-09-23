import test from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  FAMILY_BACKUP_FORMAT_VERSION,
  FAMILY_BACKUP_KIND,
  collectAudioIds,
  collectImageIds,
  parseAndValidateManifest,
  peekFamilyBackup,
  stripApiKeys,
} from './backup.ts'

const sampleStore = {
  version: 1 as const,
  days: {
    '2026-09-01': {
      date: '2026-09-01',
      story: 'hi',
      messages: [
        { id: 'm1', createdAt: 1, text: 'hello', audioId: 'a1' },
        { id: 'm2', createdAt: 2, text: 'no audio' },
      ],
      level: null,
      photoHints: [],
      iconColors: [],
      images: [],
      miniLevels: [
        {
          id: 'lv1',
          level: { id: 'lv1' } as never,
          imageBgId: 'img_bg',
          itemImageIds: ['img_item'],
        },
      ],
      completed: false,
      updatedAt: 1,
    },
  },
  deepseekApiKey: 'sk-secret',
  tongyiApiKey: 'ty-secret',
  agnesApiKey: 'ag-secret',
  llmProvider: 'agnes' as const,
  imageCloudProvider: 'agnes' as const,
  autoTongyiImages: false,
  minLevelKeywords: 4,
}

test('stripApiKeys clears three keys', () => {
  const next = stripApiKeys(sampleStore)
  assert.equal(next.deepseekApiKey, '')
  assert.equal(next.tongyiApiKey, '')
  assert.equal(next.agnesApiKey, '')
  assert.equal(sampleStore.deepseekApiKey, 'sk-secret')
})

test('collectAudioIds and collectImageIds', () => {
  assert.deepEqual(collectAudioIds(sampleStore).sort(), ['a1'])
  assert.deepEqual(collectImageIds(sampleStore).sort(), ['img_bg', 'img_item'])
})

test('parseAndValidateManifest accepts v1', () => {
  const m = parseAndValidateManifest({
    formatVersion: FAMILY_BACKUP_FORMAT_VERSION,
    kind: FAMILY_BACKUP_KIND,
    exportedAt: '2026-09-23T00:00:00.000Z',
    includeKeys: false,
    counts: { days: 1, audio: 0, images: 0 },
    missing: [{ kind: 'audio', id: 'missing-a' }],
  })
  assert.equal(m.formatVersion, 1)
  assert.equal(m.missing.length, 1)
})

test('parseAndValidateManifest rejects wrong format', () => {
  assert.throws(
    () =>
      parseAndValidateManifest({
        formatVersion: 99,
        kind: FAMILY_BACKUP_KIND,
      }),
    /版本不支持/,
  )
  assert.throws(
    () =>
      parseAndValidateManifest({
        formatVersion: 1,
        kind: 'other',
      }),
    /不是土豆豆/,
  )
})

test('peekFamilyBackup reads zip; missing media files still ok', async () => {
  const manifest = {
    formatVersion: FAMILY_BACKUP_FORMAT_VERSION,
    kind: FAMILY_BACKUP_KIND,
    exportedAt: '2026-09-23T00:00:00.000Z',
    includeKeys: false,
    counts: { days: 1, audio: 0, images: 0 },
    missing: [{ kind: 'audio', id: 'a1' }],
  }
  const store = stripApiKeys(sampleStore)
  const zipped = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'store.json': strToU8(JSON.stringify(store)),
    // intentionally no audio/a1 — missing media must not prevent peek
  })
  const peek = await peekFamilyBackup(zipped)
  assert.equal(peek.dayCount, 1)
  assert.equal(peek.manifest.missing[0]?.id, 'a1')
})

test('peekFamilyBackup rejects corrupt zip payload', async () => {
  await assert.rejects(() => peekFamilyBackup(strToU8('not-a-zip')), /无法解压/)
})

test('peekFamilyBackup rejects zip without store', async () => {
  const zipped = zipSync({
    'manifest.json': strToU8(
      JSON.stringify({
        formatVersion: 1,
        kind: FAMILY_BACKUP_KIND,
      }),
    ),
  })
  await assert.rejects(() => peekFamilyBackup(zipped), /缺少/)
})

test('roundtrip unzip keeps store keys empty when stripped', () => {
  const store = stripApiKeys(sampleStore)
  const zipped = zipSync({
    'store.json': strToU8(JSON.stringify(store)),
  })
  const files = unzipSync(zipped)
  const parsed = JSON.parse(strFromU8(files['store.json']!)) as typeof store
  assert.equal(parsed.agnesApiKey, '')
  assert.equal(parsed.days['2026-09-01']?.messages[0]?.audioId, 'a1')
})
