import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { matchExpect } from './match.js'
import { recognizeSpeech } from './asr.js'
import { synthesizeSpeech } from './tts.js'
import { generateFamilyLevel } from './familyGenerate.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000 } })
const port = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    asr: process.env.ASR_PROVIDER || 'mock',
    tts: process.env.TTS_PROVIDER || 'browser-hint',
    familyLlm: process.env.FAMILY_LLM_PROVIDER || 'deepseek',
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
    const headerKey = String(req.header('x-deepseek-key') || '').trim()
    const bodyKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : ''
    const apiKey = headerKey || bodyKey || undefined

    if (!story) {
      res.status(400).json({ error: 'story_required' })
      return
    }

    const payload = await generateFamilyLevel({ story, date, apiKey })
    res.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate_failed'
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

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`)
})
