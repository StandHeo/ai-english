#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const levelsDir = path.join(root, 'levels')
const packsIndex = JSON.parse(fs.readFileSync(path.join(levelsDir, 'packs.json'), 'utf8'))

let errors = 0

function fail(msg) {
  console.error(`✗ ${msg}`)
  errors += 1
}

function ok(msg) {
  console.log(`✓ ${msg}`)
}

function validateLevel(id) {
  const file = path.join(levelsDir, `${id}.json`)
  if (!fs.existsSync(file)) {
    fail(`缺少关卡文件 ${id}.json`)
    return
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
  if (level.scene?.video_max_seconds != null) {
    const sec = level.scene.video_max_seconds
    if (typeof sec !== 'number' || sec < 1 || sec > 30) {
      fail(`${id}: scene.video_max_seconds 应在 1–30`)
    }
  }
  const assetRefs = [
    level.scene?.image,
    level.scene?.video,
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

if (!Array.isArray(packsIndex.packs) || packsIndex.packs.length === 0) {
  fail('packs.json 缺少 packs 列表')
}

for (const packId of packsIndex.packs) {
  const packFile = path.join(levelsDir, 'packs', `${packId}.json`)
  if (!fs.existsSync(packFile)) {
    fail(`缺少 pack 文件 packs/${packId}.json`)
    continue
  }
  const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'))
  if (pack.id !== packId) fail(`${packId}: pack.id 不匹配`)
  if (pack.mapImage && !fs.existsSync(path.join(root, pack.mapImage))) {
    fail(`${packId}: 缺少地图 ${pack.mapImage}`)
  }
  if (pack.homeImage && !fs.existsSync(path.join(root, pack.homeImage))) {
    fail(`${packId}: 缺少首页图 ${pack.homeImage}`)
  }
  ok(`pack ${packId} 索引通过`)
  for (const id of pack.levels) validateLevel(id)
}

if (errors > 0) {
  console.error(`\n校验失败：${errors} 个问题`)
  process.exit(1)
}
console.log('\n全部内容包校验通过')
