#!/usr/bin/env node
/**
 * iOS 工程补丁：
 * 1. Info.plist 麦克风权限（否则 WKWebView 里 mediaDevices 为 undefined）
 * 2. Info.plist 相册读权限（家庭日记槽位选图）
 * 3. 将 deployment target 提升到 16.4（diary-whisper 的 whisper.xcframework 要求）
 *
 * ios/ 不入库，cap sync 后由 build:ios 自动再跑一次。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iosRoot = join(__dirname, '../ios')
const plistPath = join(iosRoot, 'App/App/Info.plist')
const podfilePath = join(iosRoot, 'App/Podfile')
const pbxprojPath = join(iosRoot, 'App/App.xcodeproj/project.pbxproj')

const MIN_IOS = '16.4'
const PLIST_KEYS = [
  {
    key: 'NSMicrophoneUsageDescription',
    value: '用于关卡英语口语练习与家庭日记语音',
  },
  {
    key: 'NSPhotoLibraryUsageDescription',
    value: '用于家庭日记关卡从相册选择背景和道具照片',
  },
]

function ensurePlistKey(xml, key, value) {
  if (xml.includes(`<key>${key}</key>`)) return { xml, added: false }
  const insert = `\t<key>${key}</key>\n\t<string>${value}</string>\n`
  if (!xml.includes('</dict>\n</plist>') && !xml.includes('</dict>\r\n</plist>')) {
    const idx = xml.lastIndexOf('</dict>')
    if (idx < 0) {
      console.error('[patch-ios] Info.plist 格式异常')
      process.exit(1)
    }
    return { xml: xml.slice(0, idx) + insert + xml.slice(idx), added: true }
  }
  return { xml: xml.replace(/<\/dict>\s*<\/plist>/, `${insert}</dict>\n</plist>`), added: true }
}

function patchPlist() {
  if (!existsSync(plistPath)) {
    console.warn(`[patch-ios] 未找到 ${plistPath}，跳过 plist（先 npx cap add ios / sync）`)
    return
  }
  let xml = readFileSync(plistPath, 'utf8')
  let changed = false
  for (const { key, value } of PLIST_KEYS) {
    const next = ensurePlistKey(xml, key, value)
    xml = next.xml
    if (next.added) {
      changed = true
      console.log(`[patch-ios] 已写入 ${key}`)
    } else {
      console.log(`[patch-ios] 已有 ${key}`)
    }
  }
  if (changed) writeFileSync(plistPath, xml)
}

function patchPodfile() {
  if (!existsSync(podfilePath)) return
  let text = readFileSync(podfilePath, 'utf8')
  const next = text.replace(
    /platform\s+:ios,\s*['"][\d.]+['"]/,
    `platform :ios, '${MIN_IOS}'`,
  )
  if (next !== text) {
    writeFileSync(podfilePath, next)
    console.log(`[patch-ios] Podfile platform → ${MIN_IOS}`)
  } else {
    console.log('[patch-ios] Podfile deployment 已满足或无 platform 行')
  }
}

function patchPbxproj() {
  if (!existsSync(pbxprojPath)) return
  let text = readFileSync(pbxprojPath, 'utf8')
  const next = text.replace(
    /IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g,
    `IPHONEOS_DEPLOYMENT_TARGET = ${MIN_IOS};`,
  )
  if (next !== text) {
    writeFileSync(pbxprojPath, next)
    console.log(`[patch-ios] Xcode IPHONEOS_DEPLOYMENT_TARGET → ${MIN_IOS}`)
  }
}

patchPlist()
patchPodfile()
patchPbxproj()
