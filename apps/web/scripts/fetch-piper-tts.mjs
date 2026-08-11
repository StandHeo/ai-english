#!/usr/bin/env node
/**
 * 准备 Piper TTS（Sherpa-ONNX）资源：
 * - Android：AAR → plugins/piper-tts/android/libs/；模型 → android assets
 * - iOS：sherpa-onnx + onnxruntime XCFramework → ios/Frameworks/；模型 → ios/Resources
 *
 * 用法：
 *   node scripts/fetch-piper-tts.mjs
 *   node scripts/fetch-piper-tts.mjs --android-only
 *   node scripts/fetch-piper-tts.mjs --ios-only
 *
 * 支持 HTTP(S)_PROXY / ALL_PROXY（curl 会自动读取）。
 */
import { existsSync, mkdirSync, rmSync, statSync, cpSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pluginRoot = join(root, 'plugins/piper-tts')
const libsDir = join(pluginRoot, 'android/libs')
const androidAssetsDir = join(pluginRoot, 'android/src/main/assets/piper-tts')
const iosFrameworksDir = join(pluginRoot, 'ios/Frameworks')
const iosResourcesDir = join(pluginRoot, 'ios/Resources/piper-tts')

const androidOnly = process.argv.includes('--android-only')
const iosOnly = process.argv.includes('--ios-only')
const withIos = process.argv.includes('--with-ios') || iosOnly
const wantAndroid = !iosOnly
const wantIosFrameworks = withIos
const wantIosModels = withIos || wantAndroid // 模型可同步到 iOS Resources，体积随模型走

const SHERPA_VER = '1.13.4'
const AAR_NAME = `sherpa-onnx-${SHERPA_VER}.aar`
const AAR_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VER}/${AAR_NAME}`
const AAR_MIN_BYTES = 40_000_000

const IOS_TAR = `sherpa-onnx-v${SHERPA_VER}-ios.tar.bz2`
const IOS_TAR_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VER}/${IOS_TAR}`
const IOS_TAR_MIN_BYTES = 30_000_000

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

if (wantAndroid) {
  mkdirSync(libsDir, { recursive: true })
  mkdirSync(androidAssetsDir, { recursive: true })
}
if (wantIosModels || wantIosFrameworks) {
  mkdirSync(iosResourcesDir, { recursive: true })
}
if (wantIosFrameworks) {
  mkdirSync(iosFrameworksDir, { recursive: true })
}

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

function modelReadyIn(dir, model) {
  const onnxPath = join(dir, model.dir, model.onnx)
  const tokensPath = join(dir, model.dir, 'tokens.txt')
  const dataDir = join(dir, model.dir, 'espeak-ng-data')
  return existsSync(onnxPath) && existsSync(tokensPath) && existsSync(dataDir)
}

function ensureModel(destDir, model) {
  if (modelReadyIn(destDir, model)) {
    console.log(`模型已存在：${model.id} → ${join(destDir, model.dir)}`)
    return true
  }
  const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${model.archive}`
  const archivePath = join(destDir, model.archive)
  if (!download(url, archivePath, 1_000_000)) {
    console.error(`下载 Piper 模型失败：${model.id}`)
    return false
  }
  console.log(`解压 ${archivePath}`)
  const ok = run('tar', ['-xjf', archivePath, '-C', destDir])
  rmSync(archivePath, { force: true })
  if (!ok || !existsSync(join(destDir, model.dir, model.onnx))) {
    console.error(`解压模型失败：${model.id}`)
    return false
  }
  console.log(`模型就绪：${model.id} → ${join(destDir, model.dir)}`)
  return true
}

function syncModelsBetween(fromDir, toDir) {
  for (const model of MODELS) {
    if (!modelReadyIn(fromDir, model)) continue
    if (modelReadyIn(toDir, model)) continue
    const src = join(fromDir, model.dir)
    const dest = join(toDir, model.dir)
    console.log(`同步模型 ${model.id}：${src} → ${dest}`)
    mkdirSync(toDir, { recursive: true })
    cpSync(src, dest, { recursive: true })
  }
}

function ensureIosFrameworks() {
  const sherpa = join(iosFrameworksDir, 'sherpa-onnx.xcframework')
  const ort = join(iosFrameworksDir, 'onnxruntime.xcframework')
  const sherpaLib = join(sherpa, 'ios-arm64/libsherpa-onnx.a')
  if (existsSync(sherpaLib) && existsSync(join(ort, 'ios-arm64'))) {
    console.log(`iOS 框架已存在：${sherpa}`)
    return true
  }
  const work = join(tmpdir(), `sherpa-ios-${SHERPA_VER}`)
  mkdirSync(work, { recursive: true })
  const tarPath = join(work, IOS_TAR)
  if (!download(IOS_TAR_URL, tarPath, IOS_TAR_MIN_BYTES)) {
    console.error('下载 sherpa-onnx iOS tar 失败')
    return false
  }
  console.log(`解压 iOS 框架 ${tarPath}`)
  if (!run('tar', ['-xjf', tarPath, '-C', work])) {
    console.error('解压 iOS tar 失败')
    return false
  }
  const extractedSherpa = join(work, 'build-ios/sherpa-onnx.xcframework')
  const extractedOrt = join(work, 'build-ios/ios-onnxruntime/1.27.0/onnxruntime.xcframework')
  if (!existsSync(extractedSherpa) || !existsSync(extractedOrt)) {
    console.error('iOS tar 中未找到 sherpa-onnx / onnxruntime xcframework')
    return false
  }
  rmSync(sherpa, { recursive: true, force: true })
  rmSync(ort, { recursive: true, force: true })
  cpSync(extractedSherpa, sherpa, { recursive: true })
  cpSync(extractedOrt, ort, { recursive: true })
  console.log(`iOS 框架就绪：${iosFrameworksDir}`)
  return true
}

if (wantAndroid) {
  const aarPath = join(libsDir, AAR_NAME)
  if (!download(AAR_URL, aarPath, AAR_MIN_BYTES)) {
    console.error('下载 sherpa-onnx AAR 失败')
    process.exit(1)
  }
  console.log(`AAR 就绪：${aarPath} (${statSync(aarPath).size} bytes)`)
}

if (wantIosFrameworks) {
  if (!ensureIosFrameworks()) process.exit(1)
}

let failed = 0
const primaryAssets = wantAndroid ? androidAssetsDir : iosResourcesDir
for (const model of MODELS) {
  if (!ensureModel(primaryAssets, model)) failed += 1
}
if (failed) {
  console.error(`有 ${failed} 个模型失败`)
  process.exit(1)
}

if (wantAndroid && (wantIosModels || wantIosFrameworks)) {
  syncModelsBetween(androidAssetsDir, iosResourcesDir)
}
if (!wantAndroid && wantIosModels) {
  // models already in iosResourcesDir
}

console.log(
  `Piper TTS 资源准备完成（amy + danny${wantAndroid ? ' + Android AAR' : ''}${wantIosFrameworks ? ' + iOS XCFramework' : ''}）`,
)
console.log('署名：Piper voices — 请核对各 MODEL_CARD / CC-BY-SA-4.0 等许可')
