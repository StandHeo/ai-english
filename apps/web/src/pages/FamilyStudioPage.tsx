import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelScript } from '../types'
import { apiUrl, isNativeApp, missingNativeApiBase } from '../api/base'
import {
  appendTextMessage,
  appendVoiceMessage,
  applyGeneratedImages,
  deleteMessage,
  ensureMessagesMigrated,
  getAutoTongyiImages,
  getDay,
  getDeepseekKey,
  getTongyiKey,
  mergeStoryFromMessages,
  removeDayImage,
  saveGeneratedLevel,
  setDayImages,
  todayKey,
  updateMessageText,
  type FamilyDiaryMessage,
} from '../family/store'
import { getDiaryAsrStatus, transcribeDiaryAudio } from '../voice/diaryAsr'
import {
  diaryWhisperModelLabel,
  getDiaryWhisperModelId,
} from '../voice/diaryWhisperModel'
import { useDiaryRecorder } from '../voice/useDiaryRecorder'
import { blobToDataUrl, blobToWav16kBase64 } from '../voice/wavEncode'
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
  const { recording, toggle } = useDiaryRecorder()

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
    if (busy || transcribing) return
    const result = await toggle()
    if (result === 'started') {
      setStatus('正在录音… 再点「结束录音」')
      return
    }
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
      setStatus('录音偏长，已截断保存；建议说短一点')
    }

    const modelId = getDiaryWhisperModelId()
    setBusy(true)
    setTranscribing(true)
    setStatus(`正在转写（${diaryWhisperModelLabel(modelId)}）…`)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    try {
      const audioDataUrl = await blobToDataUrl(result.blob)
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
      const day = appendVoiceMessage(date, { text, audioDataUrl })
      setMessages(day.messages)
    } catch {
      setStatus('保存语音失败')
    } finally {
      setTranscribing(false)
      setBusy(false)
    }
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
    const label = m.audioDataUrl ? '这条语音日记' : '这条文字'
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

  async function requestImages(level: LevelScript, mode: 'fill_empty' | 'replace') {
    if (missingNativeApiBase()) {
      setStatus('请先到「设置」填写电脑 API 地址后再配图')
      return
    }
    const tongyiKey = getTongyiKey()
    setImaging(true)
    setStatus('正在配图…')
    try {
      const res = await fetch(apiUrl('/api/family/generate-images'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tongyiKey ? { 'x-tongyi-key': tongyiKey } : {}),
        },
        body: JSON.stringify({
          date,
          level,
          apiKey: tongyiKey || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus(
          data.error === 'image_provider_unavailable'
            ? '关卡已生成；配图需要通义 Key（设置里填写，或 API .env 的 DASHSCOPE_API_KEY）'
            : `关卡已生成；配图失败：${data.error || res.status}`,
        )
        return
      }
      const list = Array.isArray(data.images) ? (data.images as string[]) : []
      if (!list.length) {
        setStatus('关卡已生成；配图未返回图片，可用相册选图')
        return
      }
      const day = applyGeneratedImages(date, list, mode)
      if (day) {
        setImages(day.images)
        const warn =
          Array.isArray(data.warnings) && data.warnings.length
            ? `（部分槽位用了占位：${data.warnings.length}）`
            : ''
        setStatus(
          mode === 'replace'
            ? `已重新配图 ${day.images.length} 张${warn}`
            : `生成成功，已自动配图 ${day.images.length} 张${warn}`,
        )
      } else {
        setStatus('关卡已生成；写入配图失败')
      }
    } catch {
      setStatus(
        isNativeApp()
          ? '关卡已生成；配图连不上 API，请确认电脑 apps/api 与局域网地址'
          : '关卡已生成；配图网络错误，请确认 API 已启动',
      )
    } finally {
      setImaging(false)
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
    setStatus('正在生成关卡…')
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
      const res = await fetch(apiUrl('/api/family/generate-level'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'x-deepseek-key': key } : {}),
        },
        body: JSON.stringify({ story, date, apiKey: key || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus(
          data.error === 'api_key_required'
            ? '请先到「设置」填写 DeepSeek API Key（或 API .env 的 DEEPSEEK_API_KEY）'
            : `生成失败：${data.error || res.status}`,
        )
        return
      }
      const level = data.level as LevelScript
      const photoHints = (data.photoHints as string[]) || []
      const saved = saveGeneratedLevel(date, level, photoHints, { force })
      if (!saved.ok) {
        setStatus('需要确认覆盖已通关内容')
        return
      }
      setHints(photoHints)
      setHasLevel(true)
      setImages([])
      setCompleted(false)
      if (getAutoTongyiImages()) {
        setBusy(false)
        await requestImages(level, 'fill_empty')
      } else {
        setStatus('生成成功！可选相册图，或去「家庭日历」玩；设置里可开自动配图')
      }
    } catch {
      setStatus(
        isNativeApp()
          ? '连不上 API：请确认电脑已启动 apps/api，手机同 Wi‑Fi，且设置里 API 地址是电脑局域网 IP（不是 localhost）'
          : '网络错误：请确认 API 已启动（apps/api 端口 8787）',
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
    if (day.images.length > 0) {
      const ok = window.confirm('重新配图会替换当前图片（含相册图）。确定继续？')
      if (!ok) {
        setStatus('已取消重新配图')
        return
      }
    }
    await requestImages(day.level, 'replace')
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return
    const reads = await Promise.all(
      Array.from(files)
        .slice(0, 4)
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
    const day = setDayImages(date, reads)
    if (day) {
      setImages(day.images)
      setStatus(`已挂上 ${day.images.length} 张照片`)
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
              <span>说完后点下方「结束录音」</span>
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
            <article key={m.id} className={`bubble ${m.audioDataUrl ? 'voice' : 'text'}`}>
              {m.audioDataUrl && (
                <audio controls preload="metadata" src={m.audioDataUrl} className="bubble-audio" />
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
                  <p className="bubble-text">{m.text || (m.audioDataUrl ? '（待填写文字）' : '')}</p>
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
              可从相册选图，或点「重新配图」用通义万相（设置里可开自动配图）
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
              <button type="button" disabled={busy || imaging} onClick={() => fileRef.current?.click()}>
                从相册选图
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy || imaging || recording || transcribing}
                onClick={() => void regenerateImages()}
              >
                {imaging ? '配图中…' : '重新配图'}
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
