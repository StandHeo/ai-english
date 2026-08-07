#!/usr/bin/env node
/**
 * 准备家庭日记端侧 Whisper 资源：
 * - 下载 ggml-tiny-q5_1.bin
 * - 若本机已有 Android NDK，则交叉编译 arm64 whisper-cli
 *
 * 用法：
 *   node scripts/fetch-diary-whisper.mjs
 *   node scripts/fetch-diary-whisper.mjs --model-only
 */
import { existsSync, mkdirSync, chmodSync, copyFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const destDir = join(
  root,
  'plugins/diary-whisper/android/src/main/assets/diary-whisper',
)
const modelName = 'ggml-tiny-q5_1.bin'
const modelPath = join(destDir, modelName)
const cliPath = join(destDir, 'whisper-cli')
const modelOnly = process.argv.includes('--model-only')

const modelUrls = [
  `https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${modelName}`,
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`,
]

mkdirSync(destDir, { recursive: true })

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  return r.status === 0
}

function downloadModel() {
  if (existsSync(modelPath) && statSync(modelPath).size > 1_000_000) {
    console.log(`模型已存在：${modelPath}`)
    return true
  }
  for (const url of modelUrls) {
    console.log(`下载模型 ${url}`)
    const ok = run('curl', [
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
      modelPath,
      url,
    ])
    if (ok && existsSync(modelPath) && statSync(modelPath).size > 1_000_000) {
      console.log(`模型就绪：${modelPath} (${statSync(modelPath).size} bytes)`)
      return true
    }
  }
  console.error('模型下载失败')
  return false
}

function findNdk() {
  const sdk =
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    join(homedir(), 'Library/Android/sdk')
  const ndkRoot = join(sdk, 'ndk')
  if (!existsSync(ndkRoot)) return null
  const versions = spawnSync('ls', [ndkRoot], { encoding: 'utf8' })
    .stdout?.trim()
    .split('\n')
    .filter(Boolean)
  if (!versions?.length) return null
  return join(ndkRoot, versions.sort().at(-1))
}

function buildCli() {
  if (existsSync(cliPath) && statSync(cliPath).size > 100_000) {
    console.log(`whisper-cli 已存在：${cliPath}`)
    return true
  }
  const ndk = findNdk()
  if (!ndk) {
    console.error('未找到 Android NDK，无法编译 whisper-cli。')
    console.error('请在 Android Studio SDK Manager 安装 NDK，或设置 ANDROID_SDK_ROOT。')
    return false
  }
  const cmake =
    join(
      process.env.ANDROID_SDK_ROOT ||
        process.env.ANDROID_HOME ||
        join(homedir(), 'Library/Android/sdk'),
      'cmake/3.22.1/bin/cmake',
    )
  const cmakeBin = existsSync(cmake) ? cmake : 'cmake'
  const work = join(root, '../../.whisper-build/whisper.cpp')
  const repoRoot = join(root, '../../.whisper-build')
  mkdirSync(repoRoot, { recursive: true })
  if (!existsSync(join(work, '.git'))) {
    console.log('克隆 whisper.cpp …')
    if (
      !run('git', [
        'clone',
        '--depth',
        '1',
        '--branch',
        'v1.7.6',
        'https://github.com/ggml-org/whisper.cpp.git',
        work,
      ])
    ) {
      return false
    }
  }
  const buildDir = join(work, 'build-android')
  console.log(`用 NDK 交叉编译 arm64-v8a whisper-cli：${ndk}`)
  if (
    !run(cmakeBin, [
      '-B',
      buildDir,
      `-DCMAKE_TOOLCHAIN_FILE=${join(ndk, 'build/cmake/android.toolchain.cmake')}`,
      '-DANDROID_ABI=arm64-v8a',
      '-DANDROID_PLATFORM=android-26',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DBUILD_SHARED_LIBS=OFF',
      '-DGGML_OPENMP=OFF',
    ], { cwd: work })
  ) {
    return false
  }
  if (!run(cmakeBin, ['--build', buildDir, '-j', '8', '--target', 'whisper-cli'], { cwd: work })) {
    return false
  }
  const built = join(buildDir, 'bin/whisper-cli')
  if (!existsSync(built)) {
    console.error('未找到编译产物 whisper-cli')
    return false
  }
  copyFileSync(built, cliPath)
  chmodSync(cliPath, 0o755)
  console.log(`已写入 ${cliPath}`)

  const jniDir = join(
    root,
    'plugins/diary-whisper/android/src/main/jniLibs/arm64-v8a',
  )
  mkdirSync(jniDir, { recursive: true })
  const jniCli = join(jniDir, 'libwhisper_cli.so')
  copyFileSync(built, jniCli)
  chmodSync(jniCli, 0o755)
  console.log(`已写入 ${jniCli}（供 Android 10+ 可执行）`)
  return true
}

if (!downloadModel()) process.exit(1)
if (!modelOnly && !buildCli()) process.exit(1)
console.log('完成。接着：cd apps/web && npm run build && npx cap sync android')
