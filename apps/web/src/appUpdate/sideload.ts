import { App } from '@capacitor/app'
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
import { PRODUCTION_API_BASE } from '../api/base'

/** 静态清单，不走业务 API。与已安装包的 versionCode 比较。 */
export const APP_VERSION_MANIFEST_URL = `${PRODUCTION_API_BASE}/app/version.json`

export const DEFAULT_APK_URL = `${PRODUCTION_API_BASE}/app/tudoudou-aienglish.apk`

export const VERSION_FETCH_TIMEOUT_MS = 8000

export const UPDATE_AVAILABLE_LABEL = '有新版本'
export const UPDATE_ACTION_LABEL = '立即升级'
export const UPDATE_LATER_LABEL = '稍后'
export const UPDATE_INSTALL_HINT = '下载后点安装'

export type AppVersionManifest = {
  versionCode: number
  versionName: string
  apkUrl: string
  notes?: string
}

export type InstallMode = 'installer' | 'browser' | 'permission'

type ApkInstallPlugin = {
  downloadAndInstall(options: { url: string }): Promise<{ mode?: string }>
}

const ApkInstall = registerPlugin<ApkInstallPlugin>('ApkInstall')

const MAX_VERSION_CODE = 2_147_483_647

export function versionCodeFromBuild(build: string | number | null | undefined): number {
  const raw = typeof build === 'number' ? String(build) : String(build ?? '').trim()
  if (!/^\d+$/.test(raw)) return 0
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > MAX_VERSION_CODE) return 0
  return n
}

export function parseAppVersionManifest(data: unknown): AppVersionManifest | null {
  let value = data
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const versionCode = versionCodeFromBuild(
    typeof row.versionCode === 'number' || typeof row.versionCode === 'string'
      ? row.versionCode
      : null,
  )
  const versionName = typeof row.versionName === 'string' ? row.versionName.trim() : ''
  const apkUrl = typeof row.apkUrl === 'string' ? row.apkUrl.trim() : ''
  if (versionCode <= 0 || !versionName || !isHttpUrl(apkUrl)) return null
  const notes = typeof row.notes === 'string' ? row.notes.trim() : ''
  return notes
    ? { versionCode, versionName, apkUrl, notes }
    : { versionCode, versionName, apkUrl }
}

export function hasNewerVersion(localVersionCode: number, remoteVersionCode: number): boolean {
  if (!Number.isInteger(localVersionCode) || !Number.isInteger(remoteVersionCode)) return false
  if (localVersionCode < 0 || remoteVersionCode <= 0) return false
  return remoteVersionCode > localVersionCode
}

/** 仅当远端 versionCode 更大时返回清单；失败或相同版本返回 null（不打扰）。 */
export function offerIfNewer(
  localVersionCode: number,
  manifest: AppVersionManifest | null,
): AppVersionManifest | null {
  if (!manifest) return null
  if (!hasNewerVersion(localVersionCode, manifest.versionCode)) return null
  return manifest
}

export function installResultHint(mode: InstallMode): string {
  if (mode === 'permission') {
    return '请允许本应用安装未知应用，返回后再点立即升级。'
  }
  if (mode === 'browser') {
    return '已打开下载，下载后点安装。'
  }
  return '已打开系统安装。若没有弹出，请下载后点安装。'
}

export function isInstallMode(mode: string | undefined): mode is InstallMode {
  return mode === 'installer' || mode === 'browser' || mode === 'permission'
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url)
}

async function readManifest(url: string, timeoutMs: number): Promise<unknown> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers: { Accept: 'application/json' },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'json',
    })
    if (res.status < 200 || res.status >= 300) throw new Error(`http_${res.status}`)
    return res.data
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`http_${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchAppVersionManifest(options?: {
  url?: string
  timeoutMs?: number
  fetchImpl?: (url: string, timeoutMs: number) => Promise<unknown>
}): Promise<AppVersionManifest | null> {
  const url = options?.url ?? APP_VERSION_MANIFEST_URL
  const timeoutMs = options?.timeoutMs ?? VERSION_FETCH_TIMEOUT_MS
  try {
    const data = options?.fetchImpl
      ? await options.fetchImpl(url, timeoutMs)
      : await readManifest(url, timeoutMs)
    return parseAppVersionManifest(data)
  } catch {
    return null
  }
}

/** 读不到本机 versionCode 时返回 null，避免误报更新。 */
export async function readLocalVersionCode(): Promise<number | null> {
  if (Capacitor.getPlatform() !== 'android') return null
  try {
    const info = await App.getInfo()
    const code = versionCodeFromBuild(info.build)
    return code > 0 ? code : null
  } catch {
    return null
  }
}

/** Android 家长中心调用。非 Android、超时、清单损坏、版本不更高时返回 null。 */
export async function checkForSideloadUpdate(): Promise<AppVersionManifest | null> {
  if (Capacitor.getPlatform() !== 'android') return null
  try {
    const local = await readLocalVersionCode()
    if (local == null) return null
    const manifest = await fetchAppVersionManifest()
    return offerIfNewer(local, manifest)
  } catch {
    return null
  }
}

export async function downloadAndInstallApk(apkUrl: string): Promise<{ mode: InstallMode }> {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('android_only')
  }
  if (!isHttpUrl(apkUrl)) throw new Error('invalid_url')
  const res = await ApkInstall.downloadAndInstall({ url: apkUrl })
  if (!isInstallMode(res?.mode)) return { mode: 'installer' }
  return { mode: res.mode }
}
