#!/usr/bin/env node
/**
 * Android 瘦身补丁（cap sync 后执行）：
 * 1. 仅打包 arm64-v8a（去掉模拟器 x86 / 32 位库）
 * 2. 从 diary-whisper assets 删除非 tiny 的 ggml 模型（Base/Small 改为 App 内按需下载）
 *
 * android/ 不入库，由 build:android 自动调用。
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, '..')
const appGradle = join(webRoot, 'android/app/build.gradle')
const whisperAssets = join(
  webRoot,
  'plugins/diary-whisper/android/src/main/assets/diary-whisper',
)

const KEEP_MODELS = new Set(['ggml-tiny-q5_1.bin', 'ggml-tiny.bin', 'ggml-tiny-int8.bin'])

function patchAbiFilters() {
  if (!existsSync(appGradle)) {
    console.warn('[patch-android-slim] 未找到 android/app/build.gradle，跳过 abiFilters')
    return
  }
  let text = readFileSync(appGradle, 'utf8')
  if (/abiFilters\s+['"]arm64-v8a['"]/.test(text)) {
    console.log('[patch-android-slim] abiFilters arm64-v8a 已存在')
    return
  }
  if (!/defaultConfig\s*\{/.test(text)) {
    console.error('[patch-android-slim] defaultConfig 块未找到')
    process.exit(1)
  }
  const ndkBlock = `
        ndk {
            abiFilters 'arm64-v8a'
        }`
  text = text.replace(/defaultConfig\s*\{/, (m) => `${m}${ndkBlock}`)
  writeFileSync(appGradle, text)
  console.log('[patch-android-slim] 已写入 ndk.abiFilters arm64-v8a')
}

function pruneWhisperAssets() {
  if (!existsSync(whisperAssets)) {
    console.warn('[patch-android-slim] diary-whisper assets 目录不存在，跳过模型裁剪')
    return
  }
  for (const name of readdirSync(whisperAssets)) {
    if (!name.endsWith('.bin')) continue
    if (KEEP_MODELS.has(name)) continue
    const path = join(whisperAssets, name)
    unlinkSync(path)
    console.log(`[patch-android-slim] 已移出 APK 资源：${name}`)
  }
}

patchAbiFilters()
pruneWhisperAssets()
console.log('[patch-android-slim] 完成')
