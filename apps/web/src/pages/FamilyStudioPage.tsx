import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelScript } from '../types'
import { apiJson, isNativeApp, missingNativeApiBase } from '../api/base'
import { DiaryVoicePlayer } from '../family/DiaryVoicePlayer'
import {
  appendTextMessage,
  appendVoiceMessage,
  applyGeneratedImages,
  deleteMessage,
  ensureMessagesMigrated,
  getAutoIconImages,
  getAutoTongyiImages,
  getDay,
  getDeepseekKey,
  getImageSlotMax,
  getMinLevelKeywords,
  getTongyiKey,
  mergeStoryFromMessages,
  removeDayImage,
  saveGeneratedLevel,
  setDayImages,
  todayKey,
  updateMessageText,
  type FamilyDiaryMessage,
} from '../family/store'
import { generateIconImagesForLevel, missingSlotsForImages } from '../icons/familyIconSearch'
import { getDiaryAsrStatus, transcribeDiaryAudio } from '../voice/diaryAsr'
import {
  diaryWhisperModelLabel,
  getDiaryWhisperModelId,
} from '../voice/diaryWhisperModel'
import {
  DIARY_MAX_RECORD_MS,
  useDiaryRecorder,
  type DiaryRecordCapture,
} from '../voice/useDiaryRecorder'
import { blobToWav16kBase64 } from '../voice/wavEncode'
import './family-studio.css'

export function FamilyStudioPage() {
  const navigate = useNavigate()
  const date = todayKey()
  const [messages, setMessages] = useState<FamilyDiaryMessage[]>([])
  const [draft, setDraft] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [imaging, setImaging] = useState(false)
  const [hasLevel, setHasLevel] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [completed, setCompleted] = useState(false)
  const [asrHint, setAsrHint] = useState('')
  const [asrReady, setAsrReady] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const savingVoiceRef = useRef(false)

  async function persistVoiceCapture(result: DiaryRecordCapture) {
    if (savingVoiceRef.current) return
    if (result.error === 'insecure') {
      setStatus('需要 https 才能录音，请用打字，或 npm run dev:phone')
      return
    }
    if (result.error === 'denied') {
      setStatus('请允许麦克风权限')
      return
    }
    if (result.error === 'empty' || !result.blob) {
      setStatus('没有录到声音，请再试或改用打字')
      return
    }
    if (result.error === 'too_long') {
      setStatus(`已到 ${Math.round(DIARY_MAX_RECORD_MS / 1000)} 秒上限，正在保存…`)
    }

    savingVoiceRef.current = true
    const modelId = getDiaryWhisperModelId()
    setBusy(true)
    setTranscribing(true)
    if (result.error !== 'too_long') {
      setStatus(`正在转写（${diaryWhisperModelLabel(modelId)}）…`)
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    try {
      let text = ''
      try {
        const wavBase64 = await blobToWav16kBase64(result.blob)
        const asr = await transcribeDiaryAudio(wavBase64, 'zh', modelId)
        if (asr.ok) {
          text = asr.text
          setAsrReady(true)
          setAsrHint('')
          setStatus(
            `语音已转写（${diaryWhisperModelLabel(asr.modelId)}），可点「改字」微调`,
          )
        } else {
          setStatus(`${asr.message}（已保留录音，请点气泡改字）`)
        }
      } catch {
        setStatus('转写准备失败，已保留录音，请手改文字')
      }
      const day = await appendVoiceMessage(date, { text, blob: result.blob })
      setMessages(day.messages)
    } catch {
      setStatus('保存语音失败（存储空间可能不足，可删旧图或旧语音后重试）')
    } finally {
      setTranscribing(false)
      setBusy(false)
      savingVoiceRef.current = false
    }
  }

  const { recording, toggle, maxMs } = useDiaryRecorder({
    onAutoStop: (cap) => {
      void persistVoiceCapture(cap)
    },
  })

  function reloadDay() {
    const day = ensureMessagesMigrated(date)
    setMessages(day.messages)
    setHints(day.photoHints || [])
    setHasLevel(Boolean(day.level))
    setImages(day.images || [])
    setCompleted(Boolean(day.completed))
  }

  useEffect(() => {
    reloadDay()
    const modelId = getDiaryWhisperModelId()
    void getDiaryAsrStatus(modelId).then((s) => {
      setAsrReady(s.available && s.modelReady)
      if (!s.available) {
        setAsrHint('浏览器请用打字发日记；安装 App 后可用语音转写。')
      } else if (!s.modelReady) {
        setAsrHint(`语音模型 ${diaryWhisperModelLabel(modelId)} 准备中或未装齐，可先打字。`)
      } else {
        setAsrHint('')
      }
    })
  }, [date])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  function storyFromState(list: FamilyDiaryMessage[]) {
    return mergeStoryFromMessages(list)
  }

  function sendText() {
    if (!draft.trim()) return
    const day = appendTextMessage(date, draft)
    setMessages(day.messages)
    setDraft('')
    setStatus('已发送')
  }

  async function onVoiceToggle() {
    if (busy || transcribing || savingVoiceRef.current) return
    const result = await toggle()
    if (result === 'started') {
      setStatus(`正在录音… 最长约 ${Math.round(maxMs / 1000)} 秒，再点「结束录音」`)
      return
    }
    await persistVoiceCapture(result)
  }

  function startEdit(m: FamilyDiaryMessage) {
    setEditingId(m.id)
    setEditText(m.text)
  }

  function saveEdit() {
    if (!editingId) return
    const day = updateMessageText(date, editingId, editText)
    if (day) setMessages(day.messages)
    setEditingId(null)
    setEditText('')
    setStatus('已更新文字')
  }

  function removeMessage(m: FamilyDiaryMessage) {
    const label = m.audioId || m.audioDataUrl ? '这条语音日记' : '这条文字'
    if (!window.confirm(`删除${label}？`)) return
    const day = deleteMessage(date, m.id)
    if (day) {
      setMessages(day.messages)
      if (editingId === m.id) {
        setEditingId(null)
        setEditText('')
      }
      setStatus('已删除')
    }
  }

  function removeImage(index: number) {
    if (!window.confirm('删除这张照片？')) return
    const day = removeDayImage(date, index)
    if (day) {
      setImages(day.images)
      setStatus('已删除照片')
    }
  }

  function applyIconImages(
    level: LevelScript,
    mode: 'fill_empty' | 'replace',
  ): { ok: boolean; missed: string[]; count: number } {
    const colors = getDay(date)?.iconColors
    const maxSlots = getImageSlotMax()
    const result = generateIconImagesForLevel(level, colors, maxSlots)
    console.log(
      '[family/icon] slots',
      JSON.stringify({
        maxSlots,
        subjects: result.slots.map((s) => s.subject),
        matched: result.matched,
        missed: result.missed,
      }),
    )
    if (!result.images.length) {
      setStatus(
        result.missed.length
          ? `未匹配到图标（${result.missed.slice(0, 3).join('、')}）`
          : '未匹配到图标',
      )
      return { ok: false, missed: result.missed, count: 0 }
    }
    const day = applyGeneratedImages(date, result.images, mode)
    if (!day) {
      setStatus('写入图标失败')
      return { ok: false, missed: result.missed, count: 0 }
    }
    setImages(day.images)
    const miss =
      result.missed.length > 0 ? `；未匹配：${result.missed.slice(0, 3).join('、')}` : ''
    setStatus(
      mode === 'replace'
        ? `已用图标配图 ${day.images.length} 张${miss}`
        : `已用本地图标配图 ${day.images.length} 张${miss}`,
    )
    return { ok: true, missed: result.missed, count: day.images.length }
  }

  async function requestImages(
    level: LevelScript,
    mode: 'fill_empty' | 'replace',
    opts?: { statusPrefix?: string; onlyEmpty?: boolean },
  ): Promise<boolean> {
    if (missingNativeApiBase()) {
      setStatus('请先到「设置」填写电脑 API 地址后再配图')
      return false
    }

    const maxSlots = getImageSlotMax()
    const existing = getDay(date)?.images || []
    let slotsPayload: { subject: string; role?: 'scene' | 'item' }[] | undefined
    if (opts?.onlyEmpty || mode === 'fill_empty') {
      slotsPayload = missingSlotsForImages(level, existing, maxSlots)
      if (!slotsPayload.length) {
        setStatus('已有图已覆盖全部槽位；删掉不需要的图后再通义补全')
        return false
      }
    }

    const tongyiKey = getTongyiKey()
    const requestBody = {
      date,
      maxSlots,
      minKeywords: maxSlots,
      ...(slotsPayload ? { slots: slotsPayload } : { level }),
      apiKey: tongyiKey || undefined,
    }
    console.log(
      '[tongyi] request',
      JSON.stringify({
        date: requestBody.date,
        maxSlots: requestBody.maxSlots,
        slots: slotsPayload?.map((s) => s.subject) ?? '(from level)',
        hasKey: Boolean(tongyiKey),
      }),
    )
    setImaging(true)
    setStatus(`${opts?.statusPrefix || ''}正在通义配图…`.trim())
    try {
      const res = await apiJson('/api/family/generate-images', {
        method: 'POST',
        headers: {
          ...(tongyiKey ? { 'x-tongyi-key': tongyiKey } : {}),
        },
        body: requestBody,
        timeoutMs: 300_000,
      })
      const data = res.data
      console.log(
        '[tongyi] response',
        JSON.stringify({
          ok: res.ok,
          status: res.status,
          error: data.error || res.error,
          imageCount: Array.isArray(data.images) ? data.images.length : 0,
          warnings: data.warnings,
          provider: data.provider,
          debug: data.debug,
        }),
      )
      if (!res.ok) {
        const err = String(data.error || res.error || res.status)
        setStatus(
          err === 'image_provider_unavailable' || err === 'missing_api_base'
            ? '关卡已保留；通义配图需要 Key 或可用的电脑 API 地址'
            : `关卡已保留；通义配图失败：${err}`,
        )
        return false
      }
      const list = Array.isArray(data.images) ? (data.images as string[]) : []
      if (!list.length) {
        setStatus('关卡已保留；通义未返回图片，可继续用图标或相册')
        return false
      }
      const day = applyGeneratedImages(date, list, mode === 'replace' ? 'replace' : 'fill_empty')
      if (day) {
        setImages(day.images)
        const warn =
          Array.isArray(data.warnings) && data.warnings.length
            ? `（部分槽位用了占位：${data.warnings.length}）`
            : ''
        setStatus(
          mode === 'replace'
            ? `已通义配图 ${day.images.length} 张${warn}`
            : `已保留已有图，通义补全至 ${day.images.length} 张${warn}`,
        )
        return true
      }
      setStatus('关卡已保留；写入配图失败')
      return false
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log('[tongyi] error', msg)
      setStatus(
        isNativeApp()
          ? `关卡已保留；通义连不上 API（${msg}）。请确认电脑 apps/api、同 Wi‑Fi、设置里局域网地址`
          : `关卡已保留；通义网络错误（${msg}）`,
      )
      return false
    } finally {
      setImaging(false)
    }
  }

  async function autoFillImagesAfterGenerate(level: LevelScript) {
    const wantIcon = getAutoIconImages()
    const wantTongyi = getAutoTongyiImages()
    if (!wantIcon && !wantTongyi) {
      setStatus('生成成功！请到设置至少开启一种自动配图，或手动点「图标配图」/相册/通义')
      return
    }

    const maxSlots = getImageSlotMax()
    let needTongyi = wantTongyi
    if (wantIcon) {
      const iconResult = applyIconImages(level, 'fill_empty')
      const remaining = missingSlotsForImages(level, getDay(date)?.images || [], maxSlots).length
      if (wantTongyi) {
        needTongyi = remaining > 0
        if (!needTongyi && iconResult.ok) {
          setStatus((s) => `${s}（图标已齐，无需通义）`)
        }
      } else {
        needTongyi = false
        if (!iconResult.ok) {
          setStatus((s) => `${s}；可开通义自动或手动通义补全`)
        }
      }
    }

    if (needTongyi) {
      setBusy(false)
      const prefix = wantIcon ? '图标未全覆盖，' : ''
      await requestImages(level, 'fill_empty', { statusPrefix: prefix, onlyEmpty: true })
    }
  }

  async function generate(force = false) {
    const story = storyFromState(messages)
    if (!story.trim()) {
      setStatus('请先发几条今日故事（打字或语音）')
      return
    }
    if (missingNativeApiBase()) {
      setStatus('请先到「设置」填写电脑 API 地址（如 http://192.168.x.x:8787）')
      return
    }
    const key = getDeepseekKey()
    setBusy(true)
    setStatus('正在生成关卡（DeepSeek 可能需要 1–3 分钟，请稍候）…')
    try {
      if (!force) {
        const existing = getDay(date)
        if (existing?.completed && existing.level) {
          const ok = window.confirm('今天这关孩子已经通关。确定覆盖并重置通关状态吗？')
          if (!ok) {
            setStatus('已取消覆盖')
            return
          }
          force = true
        }
      }
      const minKeywords = getMinLevelKeywords()
      const generateBody = {
        story,
        date,
        apiKey: key || undefined,
        minKeywords,
      }
      console.log(
        '[deepseek] request',
        JSON.stringify({
          date,
          minKeywords,
          storyChars: story.length,
          storyPreview: story.slice(0, 500),
          hasKey: Boolean(key),
        }),
      )
      const res = await apiJson('/api/family/generate-level', {
        method: 'POST',
        headers: {
          ...(key ? { 'x-deepseek-key': key } : {}),
        },
        body: generateBody,
        // 允许 DeepSeek 慢响应 + 一次服务端重试
        timeoutMs: 240_000,
      })
      const data = res.data
      const debug =
        data.debug && typeof data.debug === 'object'
          ? (data.debug as Record<string, unknown>)
          : undefined
      console.log(
        '[deepseek] response',
        JSON.stringify({
          ok: res.ok,
          status: res.status,
          error: data.error || res.error,
          keywords: data.keywords,
          keywordCount: Array.isArray(data.keywords)
            ? data.keywords.length
            : data.count,
          minKeywords: data.minKeywords ?? debug?.minKeywords ?? minKeywords,
          photoHints: data.photoHints,
          debug,
          levelPreview: data.level
            ? {
                title: (data.level as LevelScript).title,
                target_words: (data.level as LevelScript).target_words,
                beatCount: Array.isArray((data.level as LevelScript).beats)
                  ? (data.level as LevelScript).beats!.length
                  : 0,
              }
            : undefined,
        }),
      )
      if (!res.ok) {
        if (data.error === 'keywords_insufficient') {
          const count = Number(data.count) || 0
          const min = Number(data.minKeywords) || minKeywords
          setStatus(
            `关键词不足（${count}/${min}）。请再追加几句今日场景描述，然后重新点「生成关卡」。`,
          )
          return
        }
        const err = String(data.error || res.error || res.status)
        if (/timeout|deepseek_timeout/i.test(err)) {
          setStatus(
            '生成超时：DeepSeek 响应较慢。请检查电脑网络后重试；也可到设置把「最少关键词」暂时调低（如 5）。',
          )
          return
        }
        setStatus(
          err === 'api_key_required' || err === 'missing_api_base'
            ? '请先到「设置」填写 DeepSeek API Key（或 API .env 的 DEEPSEEK_API_KEY）'
            : `生成失败：${err}`,
        )
        return
      }
      const level = data.level as LevelScript
      const photoHints = (data.photoHints as string[]) || []
      const iconColors = Array.isArray(data.iconColors) ? data.iconColors : []
      const saved = saveGeneratedLevel(date, level, photoHints, {
        force,
        iconColors: iconColors as { word: string; fg: string; bg: string }[],
      })
      if (!saved.ok) {
        setStatus('需要确认覆盖已通关内容')
        return
      }
      setHints(photoHints)
      setHasLevel(true)
      setImages([])
      setCompleted(false)
      const kwCount = Array.isArray(data.keywords) ? data.keywords.length : undefined
      if (kwCount) {
        setStatus(`生成成功（关键词 ${kwCount} 个）`)
      }
      await autoFillImagesAfterGenerate(level)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(
        isNativeApp()
          ? `连不上 API（${msg}）：请确认电脑已启动 apps/api，手机同 Wi‑Fi，设置里是电脑局域网 IP`
          : `网络错误（${msg}）：请确认 API 已启动（apps/api 端口 8787）`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function regenerateImages() {
    const day = getDay(date)
    if (!day?.level) {
      setStatus('请先生成关卡')
      return
    }
    // 保留未删除的已有图（图标/相册），只对空槽位调通义
    await requestImages(day.level, 'fill_empty', { onlyEmpty: true })
  }

  function fillWithIcons() {
    const day = getDay(date)
    if (!day?.level) {
      setStatus('请先生成关卡')
      return
    }
    let mode: 'fill_empty' | 'replace' = 'fill_empty'
    if (day.images.length > 0) {
      const replace = window.confirm('当前已有图片。确定用图标整表替换吗？\n点「取消」则只填充空位。')
      mode = replace ? 'replace' : 'fill_empty'
    }
    setImaging(true)
    try {
      applyIconImages(day.level, mode)
    } finally {
      setImaging(false)
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return
    const maxSlots = getImageSlotMax()
    const existing = getDay(date)?.images || []
    const room = Math.max(0, maxSlots - existing.length)
    if (!room) {
      setStatus(`已满 ${maxSlots} 张（与设置里最少关键词数一致），请先删掉再选`)
      return
    }
    const reads = await Promise.all(
      Array.from(files)
        .slice(0, room)
        .map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result))
              reader.onerror = () => reject(reader.error)
              reader.readAsDataURL(file)
            }),
        ),
    )
    const day = setDayImages(date, [...existing, ...reads].slice(0, maxSlots))
    if (day) {
      setImages(day.images)
      setStatus(`已挂上 ${day.images.length} 张照片（上限 ${maxSlots}）`)
    } else {
      setStatus('请先生成关卡再选图')
    }
  }

  return (
    <div className="family-studio chat-mode">
      <header>
        <button type="button" className="linkish" onClick={() => navigate('/parent')}>
          ← 家长中心
        </button>
        <div className="header-row">
          <div>
            <h1>家庭日记</h1>
            <p className="muted">{date}</p>
          </div>
          <button
            type="button"
            className="ghost settings-link"
            onClick={() => navigate('/family/studio/settings')}
          >
            设置
          </button>
        </div>
      </header>

      {asrHint && <p className={`asr-banner ${asrReady ? 'ok' : ''}`}>{asrHint}</p>}

      <div className="chat-shell">
        {recording && (
          <div className="recording-banner" role="status" aria-live="polite">
            <span className="recording-dot" aria-hidden />
            <div className="recording-copy">
              <strong>正在录音</strong>
              <span>说完后点下方「结束录音」（最长约 {Math.round(maxMs / 1000)} 秒）</span>
            </div>
          </div>
        )}
        {transcribing && !recording && (
          <div className="transcribe-banner" role="status" aria-live="polite">
            <span className="transcribe-spinner" aria-hidden />
            <div className="recording-copy">
              <strong>正在转写成文字</strong>
              <span>
                使用 {diaryWhisperModelLabel(getDiaryWhisperModelId())}
                ，请稍候（Small 可能要十几秒）
              </span>
            </div>
          </div>
        )}
        <div className="chat-list" ref={listRef}>
          {messages.length === 0 && (
            <p className="chat-empty muted">今天还没有消息。打字或点语音说说孩子今天做了什么。</p>
          )}
          {messages.map((m) => (
            <article
              key={m.id}
              className={`bubble ${m.audioId || m.audioDataUrl ? 'voice' : 'text'}`}
            >
              {(m.audioId || m.audioDataUrl) && (
                <DiaryVoicePlayer
                  audioId={m.audioId}
                  audioDataUrl={m.audioDataUrl}
                  className="bubble-audio"
                />
              )}
              {editingId === m.id ? (
                <div className="edit-box">
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                  <div className="row">
                    <button type="button" onClick={saveEdit}>
                      保存
                    </button>
                    <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="bubble-text">{m.text || (m.audioId || m.audioDataUrl ? '（待填写文字）' : '')}</p>
                  <div className="bubble-actions">
                    <button type="button" className="bubble-edit" onClick={() => startEdit(m)}>
                      改字
                    </button>
                    <button
                      type="button"
                      className="bubble-delete"
                      onClick={() => removeMessage(m)}
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>

        <div className={`composer ${recording ? 'is-recording' : ''} ${transcribing ? 'is-transcribing' : ''}`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="输入今日故事…"
            disabled={recording || busy || transcribing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendText()
              }
            }}
          />
          <div className="composer-actions">
            <button
              type="button"
              className="primary send"
              disabled={busy || recording || transcribing}
              onClick={sendText}
            >
              发送
            </button>
            <button
              type="button"
              className={`voice-btn ${recording ? 'hot' : ''} ${transcribing ? 'busy' : ''}`}
              disabled={busy || transcribing}
              onClick={() => void onVoiceToggle()}
              aria-pressed={recording}
              aria-busy={transcribing}
            >
              {recording ? '结束录音' : transcribing ? '转写中…' : '语音输入'}
            </button>
          </div>
        </div>
      </div>

      <section className="generate-panel">
        <button
          type="button"
          className="primary generate-btn"
          disabled={busy || imaging || recording || transcribing}
          onClick={() => void generate(false)}
        >
          {busy ? '生成中…' : imaging ? '配图中…' : '生成关卡'}
        </button>
        {hasLevel && (
          <p className="muted generate-meta">
            今日已有关卡{completed ? '（已通关）' : ''}
          </p>
        )}

        {hasLevel && (
          <div className="photo-block">
            <h2>关卡配图</h2>
            <p className="muted">
              可用本地「图标配图」（离线免费）、相册；「通义配图」会保留已有图，只补空位
            </p>
            {hints.length > 0 && (
              <>
                <p className="muted">相册搜图提示：</p>
                <ul>
                  {hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void onPickFiles(e.target.files)}
            />
            <div className="row photo-actions">
              <button type="button" disabled={busy || imaging} onClick={() => fillWithIcons()}>
                图标配图
              </button>
              <button type="button" disabled={busy || imaging} onClick={() => fileRef.current?.click()}>
                从相册选图
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy || imaging || recording || transcribing}
                onClick={() => void regenerateImages()}
              >
                {imaging ? '配图中…' : '通义配图'}
              </button>
            </div>
            {images.length > 0 && (
              <div className="photo-thumbs">
                {images.map((src, i) => (
                  <div key={`${i}-${src.slice(0, 24)}`} className="photo-thumb">
                    <img src={src} alt={`已选 ${i + 1}`} />
                    <button
                      type="button"
                      className="photo-thumb-del"
                      aria-label={`删除第 ${i + 1} 张`}
                      onClick={() => removeImage(i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {status && <p className="status">{status}</p>}

      <div className="footer-actions">
        <button type="button" onClick={() => navigate('/family')}>
          打开家庭日历
        </button>
        <button type="button" className="ghost" onClick={() => navigate('/')}>
          回首页
        </button>
      </div>
    </div>
  )
}
