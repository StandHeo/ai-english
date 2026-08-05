import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { matchExpect } from './match.js'
import { recognizeSpeech } from './asr.js'
import { synthesizeSpeech } from './tts.js'

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
  })
})

app.post('/api/asr', upload.single('audio'), async (req, res) => {
  try {
    const expect = String(req.body.expect || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
    const forcedText = typeof req.body.text === 'string' ? req.body.text : undefined
    const transcript = await recognizeSpeech({
      audio: req.file?.buffer,
      mimeType: req.file?.mimetype,
      forcedText,
      expectHint: expect,
    })
    const matched = matchExpect(transcript, expect)
    res.json({ transcript, matched, expect })
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

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`)
})
