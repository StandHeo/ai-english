import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  APP_VERSION_MANIFEST_URL,
  DEFAULT_APK_URL,
  UPDATE_ACTION_LABEL,
  UPDATE_AVAILABLE_LABEL,
  UPDATE_INSTALL_HINT,
  UPDATE_LATER_LABEL,
  fetchAppVersionManifest,
  hasNewerVersion,
  installResultHint,
  offerIfNewer,
  parseAppVersionManifest,
  versionCodeFromBuild,
} from './sideload.ts'

const pageSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'ParentPage.tsx'),
  'utf8',
)

const sample = {
  versionCode: 2,
  versionName: '1.1',
  apkUrl: DEFAULT_APK_URL,
  notes: '修复朗读',
}

describe('sideload version compare', () => {
  it('reads Capacitor build string as versionCode', () => {
    assert.equal(versionCodeFromBuild('1'), 1)
    assert.equal(versionCodeFromBuild(1), 1)
    assert.equal(versionCodeFromBuild(''), 0)
    assert.equal(versionCodeFromBuild('1.2'), 0)
  })

  it('shows an update only when remote versionCode is greater', () => {
    assert.equal(hasNewerVersion(1, 2), true)
    assert.equal(hasNewerVersion(1, 1), false)
    assert.equal(hasNewerVersion(2, 1), false)
    const newer = parseAppVersionManifest(sample)
    assert.deepEqual(offerIfNewer(1, newer), newer)
    assert.equal(offerIfNewer(2, newer), null)
    assert.equal(offerIfNewer(1, null), null)
  })

  it('parses the static manifest and ignores broken payloads', () => {
    assert.equal(APP_VERSION_MANIFEST_URL, 'http://118.24.164.40/app/version.json')
    const parsed = parseAppVersionManifest(JSON.stringify(sample))
    assert.equal(parsed?.versionCode, 2)
    assert.equal(parsed?.notes, '修复朗读')
    assert.equal(parseAppVersionManifest({ versionCode: 2, versionName: '1.1' }), null)
    assert.equal(
      parseAppVersionManifest({
        versionCode: 0,
        versionName: '0',
        apkUrl: DEFAULT_APK_URL,
      }),
      null,
    )
    const noNotes = parseAppVersionManifest({
      versionCode: '3',
      versionName: '1.2',
      apkUrl: DEFAULT_APK_URL,
    })
    assert.equal(noNotes?.versionCode, 3)
    assert.equal(noNotes?.notes, undefined)
  })

  it('keeps parent-center copy and stays quiet when fetch fails', async () => {
    assert.equal(UPDATE_AVAILABLE_LABEL, '有新版本')
    assert.equal(UPDATE_ACTION_LABEL, '立即升级')
    assert.equal(UPDATE_LATER_LABEL, '稍后')
    assert.equal(UPDATE_INSTALL_HINT, '下载后点安装')
    assert.match(installResultHint('browser'), /下载后点安装/)
    assert.match(installResultHint('installer'), /下载后点安装/)
    assert.match(pageSrc, /UPDATE_AVAILABLE_LABEL/)
    assert.match(pageSrc, /UPDATE_ACTION_LABEL/)
    assert.match(pageSrc, /UPDATE_INSTALL_HINT/)
    assert.match(pageSrc, /checkForSideloadUpdate/)
    assert.equal(
      await fetchAppVersionManifest({
        fetchImpl: async () => {
          throw new Error('timeout')
        },
      }),
      null,
    )
    assert.equal(
      await fetchAppVersionManifest({
        fetchImpl: async () => ({ versionCode: 1 }),
      }),
      null,
    )
  })
})
