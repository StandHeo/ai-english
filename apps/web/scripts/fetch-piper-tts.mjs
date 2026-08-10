#!/usr/bin/env node
/**
 * 准备 Piper TTS（Sherpa-ONNX）资源：
 * - 下载 sherpa-onnx Android AAR → plugins/piper-tts/android/libs/
 * - 下载 Amy + Danny 模型 → assets/piper-tts/
 *
 * 用法：node scripts/fetch-piper-tts.mjs
 * 支持 HTTP(S)_PROXY / ALL_PROXY（curl 会自动读取）。
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
/** AAR 完整约 47MB；小于此视为损坏需重下 */
const AAR_MIN_BYTES = 40_000_000

const MODELS = [
  {
    id: 'amy',
    archive: 'vits-piper-en_US-amy-low-int8.tar.bz2',
    dir: 'vits-piper-en_US-amy-low-int8',
    onnx: 'en_US-amy-low.onnx',
  },
  {
    id: 'danny',
    archive: 'vits-piper-en_US-danny-low.tar.bz2',
    dir: 'vits-piper-en_US-danny-low',
    onnx: 'en_US-danny-low.onnx',
  },
]

mkdirSync(libsDir, { recursive: true })
mkdirSync(assetsDir, { recursive: true })

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  return r.status === 0
}

function download(url, dest, minBytes) {
  if (existsSync(dest) && statSync(dest).size > minBytes) {
    console.log(`已存在：${dest} (${statSync(dest).size} bytes)`)
    return true
  }
  if (existsSync(dest)) {
    console.log(`文件过小或损坏，重新下载：${dest}`)
    rmSync(dest, { force: true })
  }
  console.log(`下载 ${url}`)
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
    console.log(
      `走代理：${process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY}`,
    )
  }
  return (
    run('curl', [
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
    ]) &&
    existsSync(dest) &&
    statSync(dest).size > minBytes
  )
}

function ensureModel(model) {
  const onnxPath = join(assetsDir, model.dir, model.onnx)
  const tokensPath = join(assetsDir, model.dir, 'tokens.txt')
  const dataDir = join(assetsDir, model.dir, 'espeak-ng-data')
  if (existsSync(onnxPath) && existsSync(tokensPath) && existsSync(dataDir)) {
    console.log(`模型已存在：${model.id} → ${join(assetsDir, model.dir)}`)
    return true
  }
  const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${model.archive}`
  const archivePath = join(assetsDir, model.archive)
  if (!download(url, archivePath, 1_000_000)) {
    console.error(`下载 Piper 模型失败：${model.id}`)
    return false
  }
  console.log(`解压 ${archivePath}`)
  const ok = run('tar', ['-xjf', archivePath, '-C', assetsDir])
  rmSync(archivePath, { force: true })
  if (!ok || !existsSync(onnxPath)) {
    console.error(`解压模型失败：${model.id}`)
    return false
  }
  console.log(`模型就绪：${model.id} → ${join(assetsDir, model.dir)}`)
  return true
}

const aarPath = join(libsDir, AAR_NAME)
if (!download(AAR_URL, aarPath, AAR_MIN_BYTES)) {
  console.error('下载 sherpa-onnx AAR 失败')
  process.exit(1)
}
console.log(`AAR 就绪：${aarPath} (${statSync(aarPath).size} bytes)`)

let failed = 0
for (const model of MODELS) {
  if (!ensureModel(model)) failed += 1
}
if (failed) {
  console.error(`有 ${failed} 个模型失败`)
  process.exit(1)
}

console.log('Piper TTS 资源准备完成（amy + danny + sherpa-onnx AAR）')
console.log('署名：Piper voices — 请核对各 MODEL_CARD / CC-BY-SA-4.0 等许可')
