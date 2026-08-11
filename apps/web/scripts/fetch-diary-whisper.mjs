#!/usr/bin/env node
/**
 * 准备家庭日记端侧 Whisper 资源：
 * - 下载 ggml-tiny / base / small 模型 → Android assets（并可同步到 iOS Resources）
 * - Android：若有 NDK 则交叉编译 arm64 whisper-cli
 * - iOS：下载 whisper.xcframework（仅 ios 切片）→ ios/Frameworks/
 *
 * 用法：
 *   node scripts/fetch-diary-whisper.mjs
 *   node scripts/fetch-diary-whisper.mjs --model-only
 *   node scripts/fetch-diary-whisper.mjs --ios-only
 *   node scripts/fetch-diary-whisper.mjs --android-only
 *   node scripts/fetch-diary-whisper.mjs --tiny-only
 */
import {
  existsSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
  statSync,
  cpSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const androidDestDir = join(
  root,
  'plugins/diary-whisper/android/src/main/assets/diary-whisper',
)
const iosResourcesDir = join(root, 'plugins/diary-whisper/ios/Resources/diary-whisper')
const iosFrameworksDir = join(root, 'plugins/diary-whisper/ios/Frameworks')
const cliPath = join(androidDestDir, 'whisper-cli')

const modelOnly = process.argv.includes('--model-only')
const tinyOnly = process.argv.includes('--tiny-only')
const baseOnly = process.argv.includes('--base-only')
const androidOnly = process.argv.includes('--android-only')
const iosOnly = process.argv.includes('--ios-only')
const withIos = process.argv.includes('--with-ios') || iosOnly
const wantAndroid = !iosOnly
const wantIosFramework = withIos
const wantIosModels = withIos || wantAndroid

const WHISPER_XCF_VER = '1.8.3'
const WHISPER_XCF_ZIP = `whisper-v${WHISPER_XCF_VER}-xcframework.zip`
const WHISPER_XCF_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/v${WHISPER_XCF_VER}/${WHISPER_XCF_ZIP}`
const WHISPER_XCF_MIN = 20_000_000

const models = [
  { id: 'tiny', name: 'ggml-tiny-q5_1.bin', minBytes: 1_000_000 },
  { id: 'base', name: 'ggml-base-q5_1.bin', minBytes: 10_000_000 },
  { id: 'small', name: 'ggml-small-q5_1.bin', minBytes: 50_000_000 },
].filter((m) => {
  if (tinyOnly) return m.id === 'tiny'
  if (baseOnly) return m.id === 'base'
  if (process.argv.includes('--small-only')) return m.id === 'small'
  return true
})

if (wantAndroid) mkdirSync(androidDestDir, { recursive: true })
if (wantIosModels) mkdirSync(iosResourcesDir, { recursive: true })
if (wantIosFramework) mkdirSync(iosFrameworksDir, { recursive: true })

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  return r.status === 0
}

function downloadOne(destDir, modelName, minBytes) {
  const modelPath = join(destDir, modelName)
  if (existsSync(modelPath) && statSync(modelPath).size > minBytes) {
    console.log(`模型已存在：${modelPath}`)
    return true
  }
  const urls = [
    `https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/${modelName}`,
    `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`,
  ]
  for (const url of urls) {
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
    if (ok && existsSync(modelPath) && statSync(modelPath).size > minBytes) {
      console.log(`模型就绪：${modelPath} (${statSync(modelPath).size} bytes)`)
      return true
    }
  }
  console.error(`模型下载失败：${modelName}`)
  return false
}

function downloadModels(destDir) {
  for (const m of models) {
    if (!downloadOne(destDir, m.name, m.minBytes)) return false
  }
  return true
}

function syncModels(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true })
  for (const m of models) {
    const src = join(fromDir, m.name)
    const dest = join(toDir, m.name)
    if (!existsSync(src)) continue
    if (existsSync(dest) && statSync(dest).size > m.minBytes) continue
    console.log(`同步模型：${src} → ${dest}`)
    copyFileSync(src, dest)
  }
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
  const cmake = join(
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
    !run(
      cmakeBin,
      [
        '-B',
        buildDir,
        `-DCMAKE_TOOLCHAIN_FILE=${join(ndk, 'build/cmake/android.toolchain.cmake')}`,
        '-DANDROID_ABI=arm64-v8a',
        '-DANDROID_PLATFORM=android-26',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DBUILD_SHARED_LIBS=OFF',
        '-DGGML_OPENMP=OFF',
      ],
      { cwd: work },
    )
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

  const jniDir = join(root, 'plugins/diary-whisper/android/src/main/jniLibs/arm64-v8a')
  mkdirSync(jniDir, { recursive: true })
  const jniCli = join(jniDir, 'libwhisper_cli.so')
  copyFileSync(built, jniCli)
  chmodSync(jniCli, 0o755)
  console.log(`已写入 ${jniCli}（供 Android 10+ 可执行）`)
  return true
}

function ensureIosFramework() {
  const dest = join(iosFrameworksDir, 'whisper.xcframework')
  const marker = join(dest, 'ios-arm64/whisper.framework/whisper')
  if (existsSync(marker)) {
    console.log(`iOS whisper.xcframework 已存在：${dest}`)
    return true
  }
  const work = join(tmpdir(), `whisper-xcf-${WHISPER_XCF_VER}`)
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, WHISPER_XCF_ZIP)
  if (!downloadZip(WHISPER_XCF_URL, zipPath, WHISPER_XCF_MIN)) {
    console.error('下载 whisper xcframework 失败')
    return false
  }
  console.log(`解压 ${zipPath}`)
  if (!run('unzip', ['-qo', zipPath, '-d', work])) {
    console.error('解压 whisper xcframework 失败')
    return false
  }
  const src = join(work, 'build-apple/whisper.xcframework')
  if (!existsSync(src)) {
    console.error('zip 内未找到 build-apple/whisper.xcframework')
    return false
  }
  // 仅保留 iOS 真机 + 模拟器切片，减小体积
  const keep = new Set(['ios-arm64', 'ios-arm64_x86_64-simulator'])
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  // 裁剪 xcframework 仅保留 iOS 切片
  const py = `
import plistlib, shutil, os
src = ${JSON.stringify(src)}
dst = ${JSON.stringify(dest)}
keep = ${JSON.stringify([...keep])}
with open(os.path.join(src, 'Info.plist'), 'rb') as f:
    info = plistlib.load(f)
libs = []
for lib in info['AvailableLibraries']:
    ident = lib['LibraryIdentifier']
    if ident in keep:
        libs.append(lib)
        shutil.copytree(os.path.join(src, ident), os.path.join(dst, ident), dirs_exist_ok=True)
info['AvailableLibraries'] = libs
with open(os.path.join(dst, 'Info.plist'), 'wb') as f:
    plistlib.dump(info, f)
print('kept', [l['LibraryIdentifier'] for l in libs])
`
  writeFileSync(join(work, 'prune_xcf.py'), py)
  if (!run('python3', [join(work, 'prune_xcf.py')])) {
    console.error('裁剪 whisper xcframework 失败，回退为完整拷贝')
    rmSync(dest, { recursive: true, force: true })
    cpSync(src, dest, { recursive: true })
  }
  if (!existsSync(marker) && !existsSync(join(dest, 'ios-arm64'))) {
    console.error('whisper.xcframework 未正确写入')
    return false
  }
  console.log(`iOS 框架就绪：${dest}`)
  return true
}

function downloadZip(url, dest, minBytes) {
  if (existsSync(dest) && statSync(dest).size > minBytes) {
    console.log(`已存在：${dest}`)
    return true
  }
  if (existsSync(dest)) rmSync(dest, { force: true })
  console.log(`下载 ${url}`)
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

const primaryDir = wantAndroid ? androidDestDir : iosResourcesDir
if (!downloadModels(primaryDir)) process.exit(1)

if (wantAndroid && wantIosModels) {
  syncModels(androidDestDir, iosResourcesDir)
}

if (wantIosFramework && !modelOnly) {
  if (!ensureIosFramework()) process.exit(1)
}

if (wantAndroid && !modelOnly) {
  if (!buildCli()) process.exit(1)
}

console.log(
  `完成。接着：cd apps/web && npm run build && npx cap sync ${wantIosFramework && !wantAndroid ? 'ios' : 'android'}`,
)
