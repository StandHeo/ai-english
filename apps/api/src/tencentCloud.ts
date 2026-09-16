import { createHash, createHmac } from 'node:crypto'

export type TencentCloudCall = {
  secretId: string
  secretKey: string
  service: string
  host: string
  action: string
  version: string
  region: string
  payload: unknown
}

export type TencentCloudResult = {
  httpStatus: number
  errorCode?: string
  errorMessage?: string
  data: { Response?: { Error?: { Code?: string; Message?: string } } }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

let injectedFetch: FetchLike | undefined

/** Tests inject a mock; production leaves this unset so `fetch` is used. */
export function setTencentCloudFetch(fn: FetchLike | undefined): void {
  injectedFetch = fn
}

function sha256HexUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmacBuf(key: Buffer | string, msg: string): Buffer {
  return createHmac('sha256', key).update(msg, 'utf8').digest()
}

export async function callTencentCloud(req: TencentCloudCall): Promise<TencentCloudResult> {
  const payload = JSON.stringify(req.payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const hashedPayload = sha256HexUtf8(payload)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${req.host}\nx-tc-action:${req.action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n')
  const credentialScope = `${date}/${req.service}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256HexUtf8(canonicalRequest)].join(
    '\n',
  )
  const secretDate = hmacBuf(`TC3${req.secretKey}`, date)
  const secretService = hmacBuf(secretDate, req.service)
  const secretSigning = hmacBuf(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${req.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const doFetch = injectedFetch ?? fetch
  const res = await doFetch(`https://${req.host}/`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: req.host,
      'X-TC-Action': req.action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': req.version,
      'X-TC-Region': req.region,
    },
    body: payload,
  })
  const data = (await res.json().catch(() => ({}))) as TencentCloudResult['data']
  const errorCode = data.Response?.Error?.Code || (res.ok ? undefined : `http_${res.status}`)
  return {
    httpStatus: res.status,
    errorCode,
    errorMessage: data.Response?.Error?.Message,
    data,
  }
}
