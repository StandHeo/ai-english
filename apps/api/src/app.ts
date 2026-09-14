import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import type { DatabaseSync } from 'node:sqlite'
import { matchExpect } from './match.js'
import { recognizeSpeech } from './asr.js'
import { synthesizeSpeech } from './tts.js'
import { judgeTranscript } from './voiceJudge.js'
import { generateFamilyLevel } from './familyGenerate.js'
import { generateFamilyPack } from './familyPackGenerate.js'
import { generateFamilyImages, slotsFromLevel } from './tongyiImage.js'
import { openDatabase } from './db.js'
import {
  applyPaidOrder,
  createSession,
  deleteSession,
  deleteUserAccount,
  findOrderByOutTradeNo,
  findSession,
  findUserById,
  getEntitlement,
  getOrCreateUser,
  grantPlus,
  insertOrder,
  isPlanId,
  mePayload,
  PLAN_AMOUNT_FEN,
  PLAN_DAYS,
} from './membership.js'
import { maskPhone, normalizePhone } from './phone.js'
import { issueSmsCode, smsProvider, tencentSmsConfigured, verifySmsCode } from './sms.js'
import { timingSafeEqualStr } from './cryptoUtil.js'
import {
  createWechatPrepay,
  decryptWechatResource,
  verifyWechatNotifySignature,
  wechatApiV3Key,
  wechatPayConfigured,
  wechatPlatformPublicKey,
} from './wechatPay.js'

type AuthedRequest = Request & { rawBody?: string; userId?: string }

export type CreatedApp = {
  app: express.Express
  db: DatabaseSync
  close: () => void
}

export function billingProvider(): 'manual' | 'wechat' {
  return process.env.BILLING_PROVIDER === 'wechat' ? 'wechat' : 'manual'
}

function bearerToken(req: Request): string | null {
  const h = String(req.header('authorization') || '')
  const m = /^Bearer\s+(\S+)/i.exec(h)
  return m ? m[1] : null
}

function adminAuthorized(req: Request): boolean {
  const expected = (process.env.ADMIN_TOKEN || '').trim()
  if (!expected) return false
  const header = String(req.header('x-admin-token') || '').trim()
  const token = bearerToken(req)
  return (header && timingSafeEqualStr(header, expected)) || (token ? timingSafeEqualStr(token, expected) : false)
}

function requireAuth(db: DatabaseSync) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = bearerToken(req)
    if (!token) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const session = findSession(db, token)
    if (!session) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    req.userId = session.user_id
    next()
  }
}

export function createApp(options: { databasePath?: string } = {}): CreatedApp {
  const db = openDatabase(options.databasePath)
  const app = express()
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000 } })

  app.use(cors())
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        ;(req as AuthedRequest).rawBody = buf.toString('utf8')
      },
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      asr: process.env.ASR_PROVIDER || 'mock',
      tts: process.env.TTS_PROVIDER || 'browser-hint',
      familyLlm: process.env.FAMILY_LLM_PROVIDER || 'deepseek',
      familyImage: process.env.FAMILY_IMAGE_PROVIDER || 'tongyi',
      sms: smsProvider(),
      billing: billingProvider(),
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
      const strictMatched = matchExpect(asr.text, expect)
      const judge = strictMatched ? null : await judgeTranscript(asr.text, expect)
      const matched = strictMatched || Boolean(judge?.judged && judge.matched)
      res.json({
        transcript: asr.text,
        matched,
        expect,
        source: asr.source,
        hasAudio: asr.hasAudio,
        judge: judge?.judged ? { matched: judge.matched, word: judge.word } : undefined,
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

  app.post('/api/voice-judge', async (req, res) => {
    try {
      const transcript = String(req.body.transcript || '')
      const expect = Array.isArray(req.body.expect) ? req.body.expect.map(String) : []
      const judge = await judgeTranscript(transcript, expect)
      res.json(judge)
    } catch (err) {
      console.error(err)
      res.status(500).json({ judged: false, matched: false })
    }
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
      const levelCount = req.body.levelCount ?? minKeywords
      const llm = typeof req.body.llm === 'string' ? req.body.llm : undefined
      const mode = String(req.body.mode || 'pack').trim().toLowerCase()

      if (!story) {
        res.status(400).json({ error: 'story_required' })
        return
      }

      console.log(
        '[family/generate-level] incoming',
        JSON.stringify({
          date,
          mode,
          levelCount,
          minKeywords,
          storyChars: story.length,
          storyPreview: story.slice(0, 400),
          hasKey: Boolean(apiKey),
        }),
      )

      if (mode !== 'legacy') {
        const payload = await generateFamilyPack({
          story,
          date,
          apiKey,
          levelCount,
          minKeywords,
          llm,
        })
        console.log(
          '[family/generate-level] pack result',
          JSON.stringify({
            title: payload.pack.title,
            levelCount: payload.levelCount,
            mainWords: payload.mainWords,
          }),
        )
        res.json(payload)
        return
      }

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
          message: '关键词不足，请再追加几句今日场景描述后重新生成',
        })
        return
      }
      if (message.startsWith('pack_levels_insufficient:')) {
        const [, count, min] = message.split(':')
        res.status(422).json({
          error: 'pack_levels_insufficient',
          count: Number(count) || 0,
          levelCount: Number(min) || 4,
          message: '迷你关卡包关数不足，请再补充今日故事后重试',
        })
        return
      }
      if (message === 'deepseek_timeout' || message === 'llm_timeout') {
        res.status(504).json({
          error: 'llm_timeout',
          message: '模型响应超时，请稍后再试或把今日关数调低',
        })
        return
      }
      const status =
        message === 'api_key_required' || message === 'story_required'
          ? 400
          : message.startsWith('invalid_level') || message.startsWith('pack_levels')
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
      const imageProvider = typeof req.body.imageProvider === 'string' ? req.body.imageProvider : undefined

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
        message === 'image_provider_unavailable' || message === 'slots_or_level_required' ? 400 : 500
      console.error('[family/generate-images]', message)
      res.status(status).json({ error: message })
    }
  })

  app.post('/api/auth/sms/send', async (req, res) => {
    const phone = normalizePhone(req.body?.phone)
    if (!phone) {
      res.status(400).json({ error: 'invalid_phone' })
      return
    }
    if (smsProvider() === 'tencent' && !tencentSmsConfigured()) {
      res.status(503).json({ error: 'sms_tencent_not_configured' })
      return
    }
    try {
      const issued = await issueSmsCode(db, phone)
      res.json({
        ok: true,
        mock: issued.mock,
        ...(issued.mock ? { devHint: 'mock code is MOCK_SMS_CODE (default 123456), also logged' } : {}),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'sms_send_failed'
      if (message === 'sms_rate_limited') {
        res.status(429).json({ error: 'sms_rate_limited' })
        return
      }
      if (message === 'sms_tencent_not_configured' || message.startsWith('sms_tencent_failed:')) {
        res.status(503).json({ error: message })
        return
      }
      console.error('[auth/sms/send]', message)
      res.status(500).json({ error: 'sms_send_failed' })
    }
  })

  app.post('/api/auth/sms/verify', (req, res) => {
    const phone = normalizePhone(req.body?.phone)
    const code = String(req.body?.code || '').trim()
    if (!phone || !code) {
      res.status(400).json({ error: 'invalid_phone_or_code' })
      return
    }
    if (!verifySmsCode(db, phone, code)) {
      res.status(401).json({ error: 'invalid_code' })
      return
    }
    const user = getOrCreateUser(db, phone)
    const token = createSession(db, user.id)
    const ent = getEntitlement(db, user.id)
    res.json({ token, ...mePayload(ent?.expires_at), phone: maskPhone(phone) })
  })

  const auth = requireAuth(db)

  app.post('/api/auth/logout', auth, (req: AuthedRequest, res) => {
    const token = bearerToken(req)
    if (token) deleteSession(db, token)
    res.json({ ok: true })
  })

  app.get('/api/me', auth, (req: AuthedRequest, res) => {
    const user = findUserById(db, req.userId || '')
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const ent = getEntitlement(db, user.id)
    res.json({
      ...mePayload(ent?.expires_at),
      phone: maskPhone(user.phone),
    })
  })

  app.post('/api/me/delete', auth, (req: AuthedRequest, res) => {
    const token = bearerToken(req)
    const userId = req.userId || ''
    if (token) deleteSession(db, token)
    deleteUserAccount(db, userId)
    res.json({ ok: true })
  })

  app.get('/api/billing/plans', (_req, res) => {
    res.json({
      provider: billingProvider(),
      plusExcludesModelFees: true,
      plans: [
        { id: 'month', priceFen: PLAN_AMOUNT_FEN.month, days: PLAN_DAYS.month },
        { id: 'year', priceFen: PLAN_AMOUNT_FEN.year, days: PLAN_DAYS.year },
      ],
    })
  })

  app.post('/api/billing/orders', auth, async (req: AuthedRequest, res) => {
    if (!isPlanId(req.body?.plan)) {
      res.status(400).json({ error: 'invalid_plan' })
      return
    }
    const plan = req.body.plan
    if (billingProvider() !== 'wechat') {
      res.status(400).json({
        error: 'billing_manual',
        message: '在线支付尚未开放，请联系开通',
      })
      return
    }
    const userId = req.userId || ''
    const order = insertOrder(db, { userId, provider: 'wechat', plan, status: 'pending' })
    let pay: Record<string, unknown> = {
      provider: 'wechat',
      unavailable: !wechatPayConfigured(),
      reason: wechatPayConfigured() ? undefined : 'wechat_not_configured',
    }
    if (wechatPayConfigured()) {
      try {
        const prepay = await createWechatPrepay({
          outTradeNo: order.out_trade_no,
          amountFen: order.amount_fen,
          description: plan === 'year' ? '土豆豆AI英语 Plus 包年' : '土豆豆AI英语 Plus 包月',
        })
        pay = { provider: 'wechat', prepay }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'wechat_order_failed'
        res.status(503).json({
          error: message,
          orderId: order.id,
          outTradeNo: order.out_trade_no,
          status: order.status,
        })
        return
      }
    }
    res.status(201).json({
      orderId: order.id,
      outTradeNo: order.out_trade_no,
      plan: order.plan,
      amountFen: order.amount_fen,
      status: order.status,
      pay,
    })
  })

  app.post('/api/billing/wechat/notify', (req: AuthedRequest, res) => {
    const timestamp = String(req.header('wechatpay-timestamp') || '')
    const nonce = String(req.header('wechatpay-nonce') || '')
    const signature = String(req.header('wechatpay-signature') || '')
    const body = req.rawBody ?? JSON.stringify(req.body ?? {})
    const publicKey = wechatPlatformPublicKey()
    const ok = verifyWechatNotifySignature({ timestamp, nonce, body, signature, publicKeyPem: publicKey })
    if (!ok) {
      res.status(401).json({ code: 'FAIL', message: 'signature_invalid' })
      return
    }
    try {
      const resource = (req.body as { resource?: { ciphertext?: string; associated_data?: string; nonce?: string } })
        ?.resource
      if (!resource?.ciphertext || !resource.nonce) {
        res.status(400).json({ code: 'FAIL', message: 'resource_missing' })
        return
      }
      const apiKey = wechatApiV3Key()
      if (!apiKey) {
        res.status(503).json({ code: 'FAIL', message: 'wechat_not_configured' })
        return
      }
      const plain = decryptWechatResource({
        ciphertext: resource.ciphertext,
        associatedData: resource.associated_data || '',
        nonce: resource.nonce,
        apiV3Key: apiKey,
      })
      const payload = JSON.parse(plain) as { out_trade_no?: string; trade_state?: string }
      if (payload.trade_state && payload.trade_state !== 'SUCCESS') {
        res.json({ code: 'SUCCESS', message: '成功' })
        return
      }
      const outTradeNo = String(payload.out_trade_no || '')
      const order = findOrderByOutTradeNo(db, outTradeNo)
      if (!order) {
        res.status(404).json({ code: 'FAIL', message: 'order_not_found' })
        return
      }
      applyPaidOrder(db, order)
      res.json({ code: 'SUCCESS', message: '成功' })
    } catch (err) {
      console.error('[billing/wechat/notify]', err)
      res.status(400).json({ code: 'FAIL', message: 'notify_failed' })
    }
  })

  app.post('/api/admin/plus', (req, res) => {
    const expected = (process.env.ADMIN_TOKEN || '').trim()
    if (!expected) {
      res.status(503).json({ error: 'admin_not_configured' })
      return
    }
    if (!adminAuthorized(req)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const phone = normalizePhone(req.body?.phone)
    if (!phone || !isPlanId(req.body?.plan)) {
      res.status(400).json({ error: 'invalid_phone_or_plan' })
      return
    }
    const granted = grantPlus(db, phone, req.body.plan, 'manual')
    res.json({
      ok: true,
      phone: maskPhone(phone),
      plan: req.body.plan,
      ...mePayload(granted.expiresAt),
      orderId: granted.order.id,
      provider: 'manual',
    })
  })

  return {
    app,
    db,
    close: () => {
      db.close()
    },
  }
}
