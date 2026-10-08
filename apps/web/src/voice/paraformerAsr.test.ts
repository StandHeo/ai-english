import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { extractTranscriptText, transcribeWithParaformer } from './paraformerAsr.ts'

describe('extractTranscriptText', () => {
  test('joins transcripts[].text', () => {
    const text = extractTranscriptText({
      transcripts: [{ text: '你好' }, { text: '世界' }],
    })
    assert.equal(text, '你好\n世界')
  })

  test('falls back to root text', () => {
    assert.equal(extractTranscriptText({ text: 'hello' }), 'hello')
  })

  test('empty for junk', () => {
    assert.equal(extractTranscriptText(null), '')
    assert.equal(extractTranscriptText({}), '')
  })
})

describe('transcribeWithParaformer', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('missing api key', async () => {
    const r = await transcribeWithParaformer('AAAA', '')
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'missing_api_key')
  })

  test('happy path: policy → upload → submit → poll → result json', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method || 'GET'} ${url}`)

      if (url.includes('/api/v1/uploads')) {
        return new Response(
          JSON.stringify({
            data: {
              policy: 'p',
              signature: 's',
              upload_dir: 'dashscope-instant/demo',
              upload_host: 'https://oss.example.com/upload',
              oss_access_key_id: 'ak',
              x_oss_object_acl: 'private',
              x_oss_forbid_overwrite: 'true',
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('oss.example.com')) {
        return new Response('', { status: 200 })
      }
      if (url.includes('/audio/asr/transcription')) {
        return new Response(JSON.stringify({ output: { task_id: 'task-1' } }), { status: 200 })
      }
      if (url.includes('/api/v1/tasks/task-1')) {
        return new Response(
          JSON.stringify({
            output: {
              task_status: 'SUCCEEDED',
              results: [
                {
                  subtask_status: 'SUCCEEDED',
                  transcription_url: 'https://result.example.com/t.json',
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('result.example.com')) {
        return new Response(
          JSON.stringify({ transcripts: [{ text: '今天去公园玩了' }] }),
          { status: 200 },
        )
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    // minimal fake base64 (decoded length irrelevant for mocked upload)
    const r = await transcribeWithParaformer(btoa('wav-bytes'), 'sk-test')
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.text, '今天去公园玩了')
    assert.ok(calls.some((c) => c.includes('/uploads')))
    assert.ok(calls.some((c) => c.includes('/transcription')))
    assert.ok(calls.some((c) => c.includes('/tasks/task-1')))
  })
})
