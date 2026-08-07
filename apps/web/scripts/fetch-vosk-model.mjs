#!/usr/bin/env node
/**
 * 下载官方英文小模型并打成 Android/Capacitor 可用的 .tar（非 .tar.gz）。
 * 用法：node scripts/fetch-vosk-model.mjs [--force]
 */
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'models')
const outTar = join(outDir, 'en-us-small.tar')
const cacheDir = join(root, '.vosk-cache')
const workDir = join(root, '.vosk-tmp')
const modelName = 'vosk-model-small-en-us-0.15'
const expectedZipBytes = 41_205_931
const zipPath = join(cacheDir, `${modelName}.zip`)
const zipUrls = [
  `https://hf-mirror.com/grimso/vosk-models/resolve/main/${modelName}.zip`,
  `https://huggingface.co/grimso/vosk-models/resolve/main/${modelName}.zip`,
  `https://alphacephei.com/vosk/models/${modelName}.zip`,
]

if (existsSync(outTar) && !process.argv.includes('--force')) {
  console.log(`已存在 ${outTar}，跳过（加 --force 可重下）`)
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
mkdirSync(cacheDir, { recursive: true })
if (process.argv.includes('--force')) {
  rmSync(zipPath, { force: true })
  rmSync(outTar, { force: true })
}

function zipReady() {
  return existsSync(zipPath) && statSync(zipPath).size >= expectedZipBytes * 0.98
}

function curlDownload(url) {
  const size = existsSync(zipPath) ? statSync(zipPath).size : 0
  console.log(`下载 ${url}（已有 ${size} bytes，支持断点续传）…`)
  const result = spawnSync(
    'curl',
    [
      '-L',
      '-C',
      '-',
      '--connect-timeout',
      '30',
      '--retry',
      '8',
      '--retry-all-errors',
      '--retry-delay',
      '3',
      '--max-time',
      '1200',
      '-o',
      zipPath,
      url,
    ],
    { stdio: 'inherit' },
  )
  if (!existsSync(zipPath)) return false
  const next = statSync(zipPath).size
  console.log(`当前大小 ${next} / ${expectedZipBytes}`)
  return next >= expectedZipBytes * 0.98 || result.status === 0
}

if (!zipReady()) {
  let ok = false
  for (const zipUrl of zipUrls) {
    curlDownload(zipUrl)
    if (zipReady()) {
      ok = true
      break
    }
    console.warn('此镜像未完成，尝试下一个…')
  }
  if (!ok) {
    console.error(
      '模型 zip 未下完。可稍后再次运行 npm run fetch-vosk-model（会断点续传）。',
    )
    process.exit(1)
  }
}

rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

console.log('解压 …')
execFileSync('unzip', ['-q', '-o', zipPath, '-d', workDir], { stdio: 'inherit' })

const modelDir = join(workDir, modelName)
if (!existsSync(modelDir)) {
  console.error(`未找到解压目录 ${modelDir}`)
  process.exit(1)
}

console.log(`打包 ${outTar} …`)
execFileSync('tar', ['--format=ustar', '-cf', outTar, '-C', modelDir, '.'], {
  stdio: 'inherit',
})

rmSync(workDir, { recursive: true, force: true })
console.log('完成。接着：npm run build && npx cap sync android')
