#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const levelsDir = path.join(root, 'levels')
const pack = JSON.parse(fs.readFileSync(path.join(levelsDir, 'pack.json'), 'utf8'))

let errors = 0

function fail(msg) {
  console.error(`✗ ${msg}`)
  errors += 1
}

function ok(msg) {
  console.log(`✓ ${msg}`)
}

for (const id of pack.levels) {
  const file = path.join(levelsDir, `${id}.json`)
  if (!fs.existsSync(file)) {
    fail(`缺少关卡文件 ${id}.json`)
    continue
  }
  const level = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (level.id !== id) fail(`${id}: id 字段不匹配`)
  if (typeof level.approved !== 'boolean') fail(`${id}: 缺少 approved`)
  if (!Array.isArray(level.beats) || level.beats.length < 3 || level.beats.length > 6) {
    fail(`${id}: beats 数量应在 3–6`)
  }
  level.beats.forEach((beat, i) => {
    if (!beat.type || !beat.npc_say) fail(`${id} beat[${i}]: 缺少 type/npc_say`)
    if (beat.type === 'ask') {
      if (!Array.isArray(beat.expect) || beat.expect.length === 0) {
        fail(`${id} beat[${i}]: ask 拍 expect 不能为空`)
      }
      if (!beat.fallback?.options?.length) {
        fail(`${id} beat[${i}]: ask 拍需要 fallback.options`)
      }
    }
  })
  if (!level.reward?.sticker) fail(`${id}: 缺少 reward.sticker`)
  const assetRefs = [
    level.scene?.image,
    level.reward?.stickerImage,
    ...(level.beats || []).flatMap((beat) => [
      beat.show,
      ...(beat.fallback?.options || []).map((o) => o.image),
    ]),
  ].filter(Boolean)
  for (const ref of assetRefs) {
    if (!fs.existsSync(path.join(root, ref))) fail(`${id}: 缺少资源 ${ref}`)
  }
  ok(`${id} 校验通过`)
}

if (errors > 0) {
  console.error(`\n校验失败：${errors} 个问题`)
  process.exit(1)
}
console.log('\n全部关卡校验通过')
