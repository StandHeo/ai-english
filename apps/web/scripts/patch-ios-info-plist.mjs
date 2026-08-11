#!/usr/bin/env node
/**
 * iOS 工程补丁：
 * 1. Info.plist 麦克风权限（否则 WKWebView 里 mediaDevices 为 undefined）
 * 2. 将 deployment target 提升到 16.4（diary-whisper 的 whisper.xcframework 要求）
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

const KEY = 'NSMicrophoneUsageDescription'
const VALUE = '用于关卡英语口语练习与家庭日记语音'
const MIN_IOS = '16.4'

function patchPlist() {
  if (!existsSync(plistPath)) {
    console.warn(`[patch-ios] 未找到 ${plistPath}，跳过 plist（先 npx cap add ios / sync）`)
    return
  }
  let xml = readFileSync(plistPath, 'utf8')
  if (xml.includes(`<key>${KEY}</key>`)) {
    console.log(`[patch-ios] 已有 ${KEY}`)
    return
  }
  const insert = `\t<key>${KEY}</key>\n\t<string>${VALUE}</string>\n`
  if (!xml.includes('</dict>\n</plist>') && !xml.includes('</dict>\r\n</plist>')) {
    const idx = xml.lastIndexOf('</dict>')
    if (idx < 0) {
      console.error('[patch-ios] Info.plist 格式异常')
      process.exit(1)
    }
    xml = xml.slice(0, idx) + insert + xml.slice(idx)
  } else {
    xml = xml.replace(/<\/dict>\s*<\/plist>/, `${insert}</dict>\n</plist>`)
  }
  writeFileSync(plistPath, xml)
  console.log(`[patch-ios] 已写入 ${KEY}`)
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
