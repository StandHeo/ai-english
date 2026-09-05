import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VOICE_JUDGE_SYSTEM_PROMPT,
  buildJudgeUserContent,
  parseJudgeContent,
  judgeTranscript,
} from './voiceJudge.ts'

test('judge prompt tells the model about kid speech and offline ASR noise', () => {
  assert.match(VOICE_JUDGE_SYSTEM_PROMPT, /4-6 岁/)
  assert.match(VOICE_JUDGE_SYSTEM_PROMPT, /离线小型识别模型/)
  assert.match(VOICE_JUDGE_SYSTEM_PROMPT, /发音近似替换/)
  assert.match(VOICE_JUDGE_SYSTEM_PROMPT, /漏音/)
  assert.match(VOICE_JUDGE_SYSTEM_PROMPT, /park→/)
  // 必须要求只输出 JSON
  assert.match(VOICE_JUDGE_SYSTEM_PROMPT, /只输出 JSON/)
})

test('buildJudgeUserContent lists expect words and transcript', () => {
  const content = buildJudgeUserContent('i say palk', ['park', 'a park'])
  assert.match(content, /park \| a park/)
  assert.match(content, /palk/)
})

test('parseJudgeContent accepts clean json and fenced json', () => {
  assert.deepEqual(parseJudgeContent('{"matched": true, "word": "park"}'), {
    matched: true,
    word: 'park',
  })
  assert.deepEqual(parseJudgeContent('Sure! {"matched": false, "word": null} done'), {
    matched: false,
    word: undefined,
  })
  assert.equal(parseJudgeContent('no json here'), null)
  assert.equal(parseJudgeContent('{"matched": "yes"}'), null)
})

test('judgeTranscript degrades to not-judged without api key', async () => {
  const prev = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  delete process.env.FAMILY_LLM_API_KEY
  delete process.env.AGNES_API_KEY
  try {
    const r = await judgeTranscript('palk', ['park'])
    assert.equal(r.judged, false)
    assert.equal(r.matched, false)
  } finally {
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev
  }
})
