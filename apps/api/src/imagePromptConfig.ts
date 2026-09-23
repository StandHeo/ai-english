import type { DatabaseSync } from 'node:sqlite'
import {
  defaultImagePromptConfig,
  readPromptTemplateFields,
  type ImagePromptConfig,
  type PromptFieldError,
} from './imagePromptDefaults.js'

type ConfigRow = {
  version: number
  safety_prefix: string
  scene_template: string
  item_template: string
  distractor_template: string
  negative_prompt: string
  updated_at: string
}

function rowToConfig(row: ConfigRow): ImagePromptConfig | null {
  const parsed = readPromptTemplateFields({
    safetyPrefix: row.safety_prefix,
    sceneTemplate: row.scene_template,
    itemTemplate: row.item_template,
    distractorTemplate: row.distractor_template,
    negativePrompt: row.negative_prompt,
  })
  const version = Number(row.version)
  if (!parsed.ok || !Number.isInteger(version) || version < 1) return null
  const updatedAt = String(row.updated_at || '').trim()
  return {
    version,
    ...parsed.fields,
    ...(updatedAt ? { updatedAt } : {}),
  }
}

/** 没有落库行、或行损坏时返回内置默认（不含 updatedAt）。 */
export function readImagePromptConfig(db: DatabaseSync): ImagePromptConfig {
  const row = db
    .prepare(
      `SELECT version, safety_prefix, scene_template, item_template, distractor_template, negative_prompt, updated_at
       FROM image_prompt_config WHERE id = 1`,
    )
    .get() as ConfigRow | undefined
  if (!row) return defaultImagePromptConfig()
  return rowToConfig(row) ?? defaultImagePromptConfig()
}

export function writeImagePromptConfig(
  db: DatabaseSync,
  body: unknown,
): { ok: true; config: ImagePromptConfig } | { ok: false; error: PromptFieldError } {
  const fields = readPromptTemplateFields(body)
  if (!fields.ok) return fields
  const now = new Date().toISOString()
  const seedVersion = defaultImagePromptConfig().version + 1
  db.prepare(
    `INSERT INTO image_prompt_config (
       id, version, safety_prefix, scene_template, item_template, distractor_template, negative_prompt, updated_at
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       version = image_prompt_config.version + 1,
       safety_prefix = excluded.safety_prefix,
       scene_template = excluded.scene_template,
       item_template = excluded.item_template,
       distractor_template = excluded.distractor_template,
       negative_prompt = excluded.negative_prompt,
       updated_at = excluded.updated_at`,
  ).run(
    seedVersion,
    fields.fields.safetyPrefix,
    fields.fields.sceneTemplate,
    fields.fields.itemTemplate,
    fields.fields.distractorTemplate,
    fields.fields.negativePrompt,
    now,
  )
  const saved = readImagePromptConfig(db)
  return { ok: true, config: saved }
}
