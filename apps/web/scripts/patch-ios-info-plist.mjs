#!/usr/bin/env node
/**
 * iOS Info.plist 补麦克风权限文案。
 * ios/ 不入库，cap sync 后必须再跑一次，否则 WKWebView 里 mediaDevices 为 undefined。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const plistPath = join(__dirname, '../ios/App/App/Info.plist')

const KEY = 'NSMicrophoneUsageDescription'
const VALUE = '用于关卡英语口语练习'

if (!existsSync(plistPath)) {
  console.warn(`[patch-ios-info-plist] 未找到 ${plistPath}，跳过（先 npx cap add ios / sync）`)
  process.exit(0)
}

let xml = readFileSync(plistPath, 'utf8')
if (xml.includes(`<key>${KEY}</key>`)) {
  console.log(`[patch-ios-info-plist] 已有 ${KEY}`)
  process.exit(0)
}

const insert = `	<key>${KEY}</key>
	<string>${VALUE}</string>
`
if (!xml.includes('</dict>\n</plist>') && !xml.includes('</dict>\r\n</plist>')) {
  // 找最后一个 </dict>
  const idx = xml.lastIndexOf('</dict>')
  if (idx < 0) {
    console.error('[patch-ios-info-plist] Info.plist 格式异常')
    process.exit(1)
  }
  xml = xml.slice(0, idx) + insert + xml.slice(idx)
} else {
  xml = xml.replace(/<\/dict>\s*<\/plist>/, `${insert}</dict>\n</plist>`)
}

writeFileSync(plistPath, xml)
console.log(`[patch-ios-info-plist] 已写入 ${KEY}=${VALUE}`)
