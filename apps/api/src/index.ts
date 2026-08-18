import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { matchExpect } from './match.js'
import { recognizeSpeech } from './asr.js'
import { synthesizeSpeech } from './tts.js'
import { generateFamilyLevel } from './familyGenerate.js'
import {
  generateFamilyImages,
  slotsFromLevel,
} from './tongyiImage.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000 } })
const port = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    asr: process.env.ASR_PROVIDER || 'mock',
    tts: process.env.TTS_PROVIDER || 'browser-hint',
    familyLlm: process.env.FAMILY_LLM_PROVIDER || 'deepseek',
    familyImage: process.env.FAMILY_IMAGE_PROVIDER || 'tongyi',
  })
})

app.post('/api/asr', upload.single('audio'), async (req, res) => {
  try {
    const expect = String(req.body.expect || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
    const forcedText = typeof req.body.text === 'string' ? req.body.text : undefined
    const asr = await recognizeSpeech({
      audio: req.file?.buffer,
      mimeType: req.file?.mimetype,
      forcedText,
      expectHint: expect,
    })
    const matched = matchExpect(asr.text, expect)
    res.json({
      transcript: asr.text,
      matched,
      expect,
      source: asr.source,
      hasAudio: asr.hasAudio,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'asr_failed' })
  }
})

app.post('/api/match', (req, res) => {
  const transcript = String(req.body.transcript || '')
  const expect = Array.isArray(req.body.expect) ? req.body.expect.map(String) : []
  res.json({ matched: matchExpect(transcript, expect), transcript, expect })
})

app.post('/api/tts', async (req, res) => {
  try {
    const text = String(req.body.text || '').trim()
    if (!text) {
      res.status(400).json({ error: 'text_required' })
      return
    }
    const result = await synthesizeSpeech(text)
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'tts_failed' })
  }
})

app.post('/api/family/generate-level', async (req, res) => {
  try {
    const story = String(req.body.story || '').trim()
    const date = String(req.body.date || '').trim() || new Date().toISOString().slice(0, 10)
    const headerKey = String(req.header('x-deepseek-key') || req.header('x-agnes-key') || '').trim()
    const bodyKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : ''
    const apiKey = headerKey || bodyKey || undefined
    const minKeywords = req.body.minKeywords
    const llm = typeof req.body.llm === 'string' ? req.body.llm : undefined

    if (!story) {
      res.status(400).json({ error: 'story_required' })
      return
    }

    console.log(
      '[family/generate-level] incoming',
      JSON.stringify({
        date,
        minKeywords,
        storyChars: story.length,
        storyPreview: story.slice(0, 400),
        hasKey: Boolean(apiKey),
      }),
    )

    const payload = await generateFamilyLevel({ story, date, apiKey, minKeywords, llm })
    console.log(
      '[family/generate-level] result',
      JSON.stringify({
        keywordCount: payload.keywords?.length,
        keywords: payload.keywords,
        minKeywords: payload.debug?.minKeywords,
        title: payload.level?.title,
        target_words: payload.level?.target_words,
      }),
    )
    res.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate_failed'
    if (message.startsWith('keywords_insufficient:')) {
      const [, count, min] = message.split(':')
      res.status(422).json({
        error: 'keywords_insufficient',
        count: Number(count) || 0,
        minKeywords: Number(min) || 9,
        message:
          '关键词不足，请再追加几句今日场景描述后重新生成',
      })
      return
    }
    if (message === 'deepseek_timeout' || message === 'llm_timeout') {
      res.status(504).json({
        error: 'llm_timeout',
        message: '模型响应超时，请稍后再试或把最少关键词调低',
      })
      return
    }
    const status =
      message === 'api_key_required' || message === 'story_required'
        ? 400
        : message.startsWith('invalid_level')
          ? 422
          : 500
    console.error('[family/generate-level]', message)
    res.status(status).json({ error: message })
  }
})

app.post('/api/family/generate-images', async (req, res) => {
  try {
    const date = String(req.body.date || '').trim() || new Date().toISOString().slice(0, 10)
    const headerKey = String(
      req.header('x-tongyi-key') || req.header('x-dashscope-key') || req.header('x-agnes-key') || '',
    ).trim()
    const bodyKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : ''
    const apiKey = headerKey || bodyKey || undefined
    const forceMock = Boolean(req.body.forceMock)
    const maxSlots = req.body.maxSlots ?? req.body.minKeywords
    const imageProvider =
      typeof req.body.imageProvider === 'string' ? req.body.imageProvider : undefined

    let slots = Array.isArray(req.body.slots) ? req.body.slots : null
    if (!slots?.length && req.body.level && typeof req.body.level === 'object') {
      slots = slotsFromLevel(req.body.level as Record<string, unknown>, maxSlots)
    }
    if (!Array.isArray(slots) || !slots.length) {
      res.status(400).json({ error: 'slots_or_level_required' })
      return
    }

    const normalized = slots
      .map((s: unknown) => {
        if (!s || typeof s !== 'object') return null
        const o = s as { subject?: unknown; role?: unknown }
        const subject = String(o.subject || '').trim()
        if (!subject) return null
        const role = o.role === 'scene' || o.role === 'item' ? o.role : undefined
        return { subject, role }
      })
      .filter(Boolean) as { subject: string; role?: 'scene' | 'item' }[]

    if (!normalized.length) {
      res.status(400).json({ error: 'slots_or_level_required' })
      return
    }

    console.log(
      '[family/generate-images] incoming',
      JSON.stringify({
        date,
        maxSlots,
        slotSubjects: normalized.map((s) => s.subject),
        hasKey: Boolean(apiKey),
      }),
    )

    const payload = await generateFamilyImages({
      date,
      slots: normalized,
      apiKey,
      forceMock,
      maxSlots,
      imageProvider,
    })
    console.log(
      '[family/generate-images] result',
      JSON.stringify({
        provider: payload.provider,
        imageCount: payload.images.length,
        warnings: payload.warnings,
        debug: payload.debug,
      }),
    )
    res.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate_images_failed'
    const status =
      message === 'image_provider_unavailable' || message === 'slots_or_level_required'
        ? 400
        : 500
    console.error('[family/generate-images]', message)
    res.status(status).json({ error: message })
  }
})

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`)
})
