#!/usr/bin/env node
/**
 * 准备 Piper TTS（Sherpa-ONNX）资源：
 * - 下载 sherpa-onnx Android AAR → plugins/piper-tts/android/libs/
 * - 下载 vits-piper-en_US-amy-low-int8 模型 → assets/piper-tts/
 *
 * 用法：node scripts/fetch-piper-tts.mjs
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pluginRoot = join(root, 'plugins/piper-tts')
const libsDir = join(pluginRoot, 'android/libs')
const assetsDir = join(pluginRoot, 'android/src/main/assets/piper-tts')

const SHERPA_VER = '1.13.4'
const AAR_NAME = `sherpa-onnx-${SHERPA_VER}.aar`
const AAR_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VER}/${AAR_NAME}`
const MODEL_ARCHIVE = 'vits-piper-en_US-amy-low-int8.tar.bz2'
const MODEL_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${MODEL_ARCHIVE}`
const MODEL_DIR = 'vits-piper-en_US-amy-low-int8'

mkdirSync(libsDir, { recursive: true })
mkdirSync(assetsDir, { recursive: true })

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  return r.status === 0
}

function download(url, dest, minBytes) {
  if (existsSync(dest) && statSync(dest).size > minBytes) {
    console.log(`已存在：${dest}`)
    return true
  }
  console.log(`下载 ${url}`)
  return run('curl', [
    '-L',
    '--retry',
    '8',
    '--retry-all-errors',
    '--retry-delay',
    '3',
    '--connect-timeout',
    '30',
    '--max-time',
    '1200',
    '-C',
    '-',
    '-o',
    dest,
    url,
  ]) && existsSync(dest) && statSync(dest).size > minBytes
}

const aarPath = join(libsDir, AAR_NAME)
if (!download(AAR_URL, aarPath, 1_000_000)) {
  console.error('下载 sherpa-onnx AAR 失败')
  process.exit(1)
}
console.log(`AAR 就绪：${aarPath} (${statSync(aarPath).size} bytes)`)

const onnxPath = join(assetsDir, MODEL_DIR, 'en_US-amy-low.onnx')
const tokensPath = join(assetsDir, MODEL_DIR, 'tokens.txt')
const dataDir = join(assetsDir, MODEL_DIR, 'espeak-ng-data')
if (existsSync(onnxPath) && existsSync(tokensPath) && existsSync(dataDir)) {
  console.log(`模型已存在：${join(assetsDir, MODEL_DIR)}`)
} else {
  const archivePath = join(assetsDir, MODEL_ARCHIVE)
  if (!download(MODEL_URL, archivePath, 1_000_000)) {
    console.error('下载 Piper 模型失败')
    process.exit(1)
  }
  console.log(`解压 ${archivePath}`)
  const ok = run('tar', ['-xjf', archivePath, '-C', assetsDir])
  if (!ok || !existsSync(onnxPath)) {
    console.error('解压模型失败')
    process.exit(1)
  }
  rmSync(archivePath, { force: true })
  console.log(`模型就绪：${join(assetsDir, MODEL_DIR)}`)
}

console.log('Piper TTS 资源准备完成（amy-low-int8 + sherpa-onnx AAR）')
console.log('署名：Piper amy voice — CC-BY-SA-4.0 (Mycroft mimic3-voices)')
