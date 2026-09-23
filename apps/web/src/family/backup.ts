/**
 * Full family diary backup: store.json + audio/ + images/ inside a zip.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { clearAllAudioClips, dataUrlToBlob, getAudioClip, putAudioClip } from './audioDb'
import { clearAllImageBlobs, getImageBlob, putImageBlob } from './imageDb'
import { loadFamilyStore, saveFamilyStore } from './store'

export const FAMILY_BACKUP_FORMAT_VERSION = 1
export const FAMILY_BACKUP_KIND = 'tudoudou-family-backup'

export type FamilyBackupManifest = {
  formatVersion: number
  kind: typeof FAMILY_BACKUP_KIND
  exportedAt: string
  includeKeys: boolean
  counts: { days: number; audio: number; images: number }
  missing: { kind: 'audio' | 'image'; id: string }[]
}

export type BackupProgress = {
  phase: 'collect' | 'pack' | 'unpack' | 'write'
  current: number
  total: number
  detail?: string
}

export type ExportBackupOptions = {
  includeKeys?: boolean
  onProgress?: (p: BackupProgress) => void
}

export type ImportBackupResult = {
  manifest: FamilyBackupManifest
  dayCount: number
}

type FamilyStoreSnapshot = ReturnType<typeof loadFamilyStore>

export function collectAudioIds(store: FamilyStoreSnapshot): string[] {
  const ids = new Set<string>()
  for (const day of Object.values(store.days)) {
    for (const m of day.messages) {
      if (m.audioId) ids.add(m.audioId)
      else if (m.audioDataUrl) ids.add(m.id)
    }
  }
  return [...ids]
}

export function collectImageIds(store: FamilyStoreSnapshot): string[] {
  const ids = new Set<string>()
  for (const day of Object.values(store.days)) {
    for (const ml of day.miniLevels || []) {
      if (ml.imageBgId) ids.add(ml.imageBgId)
      for (const id of ml.itemImageIds || []) {
        if (id) ids.add(id)
      }
    }
  }
  return [...ids]
}

export function stripApiKeys(store: FamilyStoreSnapshot): FamilyStoreSnapshot {
  return {
    ...store,
    deepseekApiKey: '',
    tongyiApiKey: '',
    agnesApiKey: '',
  }
}

export function parseAndValidateManifest(raw: unknown): FamilyBackupManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('备份无效：缺少 manifest')
  }
  const m = raw as Record<string, unknown>
  if (m.kind !== FAMILY_BACKUP_KIND) {
    throw new Error('备份无效：不是土豆豆家庭日记备份')
  }
  const ver = Number(m.formatVersion)
  if (!Number.isFinite(ver) || ver !== FAMILY_BACKUP_FORMAT_VERSION) {
    throw new Error(`备份版本不支持（需要 v${FAMILY_BACKUP_FORMAT_VERSION}）`)
  }
  return {
    formatVersion: ver,
    kind: FAMILY_BACKUP_KIND,
    exportedAt: typeof m.exportedAt === 'string' ? m.exportedAt : '',
    includeKeys: Boolean(m.includeKeys),
    counts: {
      days: Number((m.counts as { days?: number } | undefined)?.days) || 0,
      audio: Number((m.counts as { audio?: number } | undefined)?.audio) || 0,
      images: Number((m.counts as { images?: number } | undefined)?.images) || 0,
    },
    missing: Array.isArray(m.missing)
      ? (m.missing as FamilyBackupManifest['missing']).filter(
          (x) => x && (x.kind === 'audio' || x.kind === 'image') && typeof x.id === 'string',
        )
      : [],
  }
}

async function blobToU8(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

function u8ToBlob(u8: Uint8Array, type?: string): Blob {
  const copy = new Uint8Array(u8.byteLength)
  copy.set(u8)
  return type ? new Blob([copy], { type }) : new Blob([copy])
}

function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export async function buildFamilyBackupZip(
  options: ExportBackupOptions = {},
): Promise<{ blob: Blob; filename: string; manifest: FamilyBackupManifest }> {
  const includeKeys = Boolean(options.includeKeys)
  const onProgress = options.onProgress
  const storeRaw = loadFamilyStore()
  const store = includeKeys ? storeRaw : stripApiKeys(storeRaw)
  const audioIds = collectAudioIds(storeRaw)
  const imageIds = collectImageIds(storeRaw)
  const missing: FamilyBackupManifest['missing'] = []
  const files: Record<string, Uint8Array> = {}

  const total = audioIds.length + imageIds.length + 2
  let current = 0
  const tick = (detail?: string) => {
    current += 1
    onProgress?.({ phase: 'collect', current, total, detail })
  }

  for (const id of audioIds) {
    try {
      let blob = await getAudioClip(id)
      if (!blob) {
        const dayMsg = Object.values(storeRaw.days)
          .flatMap((d) => d.messages)
          .find((m) => m.id === id || m.audioId === id)
        if (dayMsg?.audioDataUrl) {
          blob = await dataUrlToBlob(dayMsg.audioDataUrl)
        }
      }
      if (!blob) {
        missing.push({ kind: 'audio', id })
      } else {
        files[`audio/${id}`] = await blobToU8(blob)
      }
    } catch {
      missing.push({ kind: 'audio', id })
    }
    tick(`audio ${id}`)
  }

  for (const id of imageIds) {
    try {
      const blob = await getImageBlob(id)
      if (!blob) {
        missing.push({ kind: 'image', id })
      } else {
        files[`images/${id}`] = await blobToU8(blob)
      }
    } catch {
      missing.push({ kind: 'image', id })
    }
    tick(`image ${id}`)
  }

  const manifest: FamilyBackupManifest = {
    formatVersion: FAMILY_BACKUP_FORMAT_VERSION,
    kind: FAMILY_BACKUP_KIND,
    exportedAt: new Date().toISOString(),
    includeKeys,
    counts: {
      days: Object.keys(store.days).length,
      audio: audioIds.length - missing.filter((x) => x.kind === 'audio').length,
      images: imageIds.length - missing.filter((x) => x.kind === 'image').length,
    },
    missing,
  }

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  tick('manifest')
  files['store.json'] = strToU8(JSON.stringify(store))
  tick('store')

  onProgress?.({ phase: 'pack', current: total, total, detail: 'zip' })
  const zipped = zipSync(files, { level: 1 })
  const blob = u8ToBlob(zipped, 'application/zip')
  const filename = `tudoudou-family-backup-${todayStamp()}.zip`
  return { blob, filename, manifest }
}

export async function peekFamilyBackup(
  zipBytes: Uint8Array,
): Promise<{ manifest: FamilyBackupManifest; dayCount: number }> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBytes)
  } catch {
    throw new Error('无法解压：文件可能不是有效的 zip 备份')
  }
  const manU8 = files['manifest.json']
  const storeU8 = files['store.json']
  if (!manU8 || !storeU8) {
    throw new Error('备份无效：缺少 manifest.json 或 store.json')
  }
  let manRaw: unknown
  let storeRaw: unknown
  try {
    manRaw = JSON.parse(strFromU8(manU8))
    storeRaw = JSON.parse(strFromU8(storeU8))
  } catch {
    throw new Error('备份无效：JSON 解析失败')
  }
  const manifest = parseAndValidateManifest(manRaw)
  if (!storeRaw || typeof storeRaw !== 'object') {
    throw new Error('备份无效：store.json 格式错误')
  }
  const days = (storeRaw as { days?: unknown }).days
  const dayCount =
    days && typeof days === 'object' ? Object.keys(days as object).length : 0
  return { manifest, dayCount }
}

export async function restoreFamilyBackup(
  zipBytes: Uint8Array,
  options: { onProgress?: (p: BackupProgress) => void } = {},
): Promise<ImportBackupResult> {
  const onProgress = options.onProgress
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zipBytes)
  } catch {
    throw new Error('无法解压：文件可能不是有效的 zip 备份')
  }

  onProgress?.({ phase: 'unpack', current: 0, total: 1, detail: 'read' })
  const manU8 = files['manifest.json']
  const storeU8 = files['store.json']
  if (!manU8 || !storeU8) {
    throw new Error('备份无效：缺少 manifest.json 或 store.json')
  }

  let manRaw: unknown
  let storeRaw: unknown
  try {
    manRaw = JSON.parse(strFromU8(manU8))
    storeRaw = JSON.parse(strFromU8(storeU8))
  } catch {
    throw new Error('备份无效：JSON 解析失败')
  }
  const manifest = parseAndValidateManifest(manRaw)
  if (!storeRaw || typeof storeRaw !== 'object') {
    throw new Error('备份无效：store.json 格式错误')
  }

  const audioEntries = Object.keys(files).filter((k) => k.startsWith('audio/') && k !== 'audio/')
  const imageEntries = Object.keys(files).filter((k) => k.startsWith('images/') && k !== 'images/')
  const total = audioEntries.length + imageEntries.length + 2
  let current = 0
  const tick = (detail?: string) => {
    current += 1
    onProgress?.({ phase: 'write', current, total, detail })
  }

  await clearAllAudioClips()
  await clearAllImageBlobs()
  tick('clear')

  for (const path of audioEntries) {
    const id = path.slice('audio/'.length)
    if (!id) continue
    try {
      const u8 = files[path]
      const blob = u8ToBlob(u8)
      await putAudioClip(id, blob)
    } catch {
      /* skip broken entry */
    }
    tick(path)
  }

  for (const path of imageEntries) {
    const id = path.slice('images/'.length)
    if (!id) continue
    try {
      const u8 = files[path]
      const blob = u8ToBlob(u8, 'image/jpeg')
      await putImageBlob(id, blob)
    } catch {
      /* skip */
    }
    tick(path)
  }

  saveFamilyStore(storeRaw as FamilyStoreSnapshot)
  tick('store')

  const days = (storeRaw as { days?: unknown }).days
  const dayCount =
    days && typeof days === 'object' ? Object.keys(days as object).length : 0
  return { manifest, dayCount }
}

export async function shareOrDownloadBackup(blob: Blob, filename: string): Promise<'share' | 'download'> {
  const file = new File([blob], filename, { type: 'application/zip' })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }
  try {
    if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({
        files: [file],
        title: '家庭日记备份',
        text: '土豆豆家庭日记完整备份（含录音）',
      })
      return 'share'
    }
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    if (name === 'AbortError') throw err
    /* fall through to download */
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
  return 'download'
}

export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer()
  return new Uint8Array(buf)
}
