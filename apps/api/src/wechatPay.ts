import { createDecipheriv, createCipheriv, createSign, createVerify, randomBytes } from 'node:crypto'

export function wechatPayConfigured(): boolean {
  return Boolean(
    process.env.WECHAT_PAY_MCHID?.trim() &&
      process.env.WECHAT_PAY_APPID?.trim() &&
      process.env.WECHAT_PAY_SERIAL_NO?.trim() &&
      process.env.WECHAT_PAY_PRIVATE_KEY?.trim() &&
      process.env.WECHAT_PAY_API_V3_KEY?.trim() &&
      process.env.WECHAT_PAY_NOTIFY_URL?.trim(),
  )
}

export function wechatPlatformPublicKey(): string {
  return (process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || '').trim()
}

export function wechatApiV3Key(): string {
  return (process.env.WECHAT_PAY_API_V3_KEY || '').trim()
}

export function wechatNotifyMessage(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}\n`
}

export function verifyWechatNotifySignature(opts: {
  timestamp: string
  nonce: string
  body: string
  signature: string
  publicKeyPem: string
}): boolean {
  if (!opts.publicKeyPem || !opts.signature) return false
  try {
    const verifier = createVerify('RSA-SHA256')
    verifier.update(wechatNotifyMessage(opts.timestamp, opts.nonce, opts.body))
    verifier.end()
    return verifier.verify(opts.publicKeyPem, Buffer.from(opts.signature, 'base64'))
  } catch {
    return false
  }
}

export function signWechatNotify(opts: {
  timestamp: string
  nonce: string
  body: string
  privateKeyPem: string
}): string {
  const signer = createSign('RSA-SHA256')
  signer.update(wechatNotifyMessage(opts.timestamp, opts.nonce, opts.body))
  signer.end()
  return signer.sign(opts.privateKeyPem).toString('base64')
}

/** WeChat APIv3 AES-256-GCM: ciphertext || 16-byte tag, base64. */
export function decryptWechatResource(opts: {
  ciphertext: string
  associatedData: string
  nonce: string
  apiV3Key: string
}): string {
  const buf = Buffer.from(opts.ciphertext, 'base64')
  const tag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(opts.apiV3Key, 'utf8'), Buffer.from(opts.nonce, 'utf8'))
  decipher.setAuthTag(tag)
  decipher.setAAD(Buffer.from(opts.associatedData, 'utf8'))
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function encryptWechatResource(opts: {
  plaintext: string
  associatedData: string
  nonce: string
  apiV3Key: string
}): string {
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(opts.apiV3Key, 'utf8'), Buffer.from(opts.nonce, 'utf8'))
  cipher.setAAD(Buffer.from(opts.associatedData, 'utf8'))
  const enc = Buffer.concat([cipher.update(opts.plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([enc, tag]).toString('base64')
}

export type WechatPrepay = {
  appId: string
  mchid: string
  prepayId: string
  timeStamp: string
  nonceStr: string
  package: string
  sign: string
  codeUrl?: string
}

function merchantPrivateKey(): string {
  const raw = (process.env.WECHAT_PAY_PRIVATE_KEY || '').trim()
  return raw.replace(/\\n/g, '\n')
}

function signMerchant(message: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(message)
  signer.end()
  return signer.sign(merchantPrivateKey()).toString('base64')
}

export async function createWechatPrepay(input: {
  outTradeNo: string
  amountFen: number
  description: string
}): Promise<WechatPrepay> {
  if (!wechatPayConfigured()) {
    throw new Error('wechat_not_configured')
  }
  const mchid = process.env.WECHAT_PAY_MCHID!.trim()
  const appId = process.env.WECHAT_PAY_APPID!.trim()
  const serial = process.env.WECHAT_PAY_SERIAL_NO!.trim()
  const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL!.trim()
  const body = JSON.stringify({
    appid: appId,
    mchid,
    description: input.description,
    out_trade_no: input.outTradeNo,
    notify_url: notifyUrl,
    amount: { total: input.amountFen, currency: 'CNY' },
  })
  const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/native'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomBytes(16).toString('hex')
  const path = '/v3/pay/transactions/native'
  const message = `POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = signMerchant(message)
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serial}"`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'tudoudou-ai-english',
    },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as { code_url?: string; prepay_id?: string; code?: string; message?: string }
  if (!res.ok) {
    throw new Error(`wechat_order_failed:${data.code || res.status}`)
  }
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomBytes(16).toString('hex')
  const prepayId = data.prepay_id || ''
  const pkg = 'Sign=WXPay'
  const paySign = prepayId
    ? signMerchant(`${appId}\n${timeStamp}\n${nonceStr}\nprepay_id=${prepayId}\n`)
    : ''
  return {
    appId,
    mchid,
    prepayId,
    timeStamp,
    nonceStr,
    package: pkg,
    sign: paySign,
    codeUrl: data.code_url,
  }
}
