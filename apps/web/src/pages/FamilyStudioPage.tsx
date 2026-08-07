import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelScript } from '../types'
import {
  appendTextMessage,
  appendVoiceMessage,
  clearDeepseekKey,
  ensureMessagesMigrated,
  getDay,
  getDeepseekKey,
  mergeStoryFromMessages,
  saveGeneratedLevel,
  setDayImages,
  setDeepseekKey,
  todayKey,
  updateMessageText,
  type FamilyDiaryMessage,
} from '../family/store'
import { getDiaryAsrStatus, transcribeDiaryAudio } from '../voice/diaryAsr'
import { useDiaryRecorder } from '../voice/useDiaryRecorder'
import { blobToDataUrl, blobToWav16kBase64 } from '../voice/wavEncode'
import './family-studio.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export function FamilyStudioPage() {
  const navigate = useNavigate()
  const date = todayKey()
  const [messages, setMessages] = useState<FamilyDiaryMessage[]>([])
  const [draft, setDraft] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasLevel, setHasLevel] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [completed, setCompleted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [asrHint, setAsrHint] = useState('')
  const [asrReady, setAsrReady] = useState(false)
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
    setApiKey(getDeepseekKey())
    void getDiaryAsrStatus().then((s) => {
      setAsrReady(s.available && s.modelReady)
      if (!s.available) {
        setAsrHint(s.detail || '浏览器请用打字；语音日记需安装 App（端侧 Whisper）。')
      } else if (!s.modelReady) {
        setAsrHint(s.detail || '端侧模型尚未就绪，可先打字；装好模型后可语音转写。')
      } else {
        setAsrHint('端侧 Whisper 已就绪（日记专用，与关卡 Vosk 分离）。')
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
    if (busy) return
    const result = await toggle()
    if (result === 'started') {
      setStatus('正在录音… 再点一次结束（最长约 45 秒）')
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

    setBusy(true)
    setStatus('正在保存语音…')
    try {
      const audioDataUrl = await blobToDataUrl(result.blob)
      let text = ''
      try {
        const wavBase64 = await blobToWav16kBase64(result.blob)
        const asr = await transcribeDiaryAudio(wavBase64, 'zh')
        if (asr.ok) {
          text = asr.text
          setStatus('语音已发送并转写')
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

  function saveKey() {
    setDeepseekKey(apiKey)
    setStatus(apiKey.trim() ? '已保存 DeepSeek Key' : 'Key 已清空')
  }

  async function generate(force = false) {
    const story = storyFromState(messages)
    if (!story.trim()) {
      setStatus('请先发几条今日故事（打字或语音）')
      return
    }
    const key = apiKey.trim() || getDeepseekKey()
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
      const res = await fetch(`${API_BASE}/api/family/generate-level`, {
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
            ? '请先在「生成与设置」填写 DeepSeek API Key（或 API .env 的 DEEPSEEK_API_KEY）'
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
      setSettingsOpen(true)
      setStatus('生成成功！可选相册图，或直接让孩子去「家庭日历」玩')
    } catch {
      setStatus('网络错误：请确认 API 已启动')
    } finally {
      setBusy(false)
    }
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
        <h1>家庭日记</h1>
        <p className="muted">{date}</p>
      </header>

      {asrHint && <p className={`asr-banner ${asrReady ? 'ok' : ''}`}>{asrHint}</p>}

      <div className="chat-shell">
        <div className="chat-list" ref={listRef}>
          {messages.length === 0 && (
            <p className="chat-empty muted">今天还没有消息。打字或点麦克风说说孩子今天做了什么。</p>
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
                  <button type="button" className="bubble-edit" onClick={() => startEdit(m)}>
                    改字
                  </button>
                </>
              )}
            </article>
          ))}
        </div>

        <div className="composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="输入今日故事…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendText()
              }
            }}
          />
          <div className="composer-actions">
            <button type="button" className="primary send" disabled={busy} onClick={sendText}>
              发送
            </button>
            <button
              type="button"
              className={`mic-mini ${recording ? 'hot' : ''}`}
              disabled={busy}
              onClick={() => void onVoiceToggle()}
            >
              {recording ? '结束录音' : '语音'}
            </button>
          </div>
        </div>
      </div>

      <section className="settings-fold">
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          {settingsOpen ? '▾' : '▸'} 生成与设置
          {hasLevel ? (completed ? ' · 已有关卡（已通关）' : ' · 已有关卡') : ''}
        </button>
        {settingsOpen && (
          <div className="fold-body">
            <h2>DeepSeek API Key</h2>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
            />
            <div className="row">
              <button type="button" onClick={saveKey}>
                保存 Key
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  clearDeepseekKey()
                  setApiKey('')
                  setStatus('已清除 Key')
                }}
              >
                清除
              </button>
            </div>

            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void generate(false)}
            >
              {busy ? '生成中…' : '生成关卡'}
            </button>

            {hints.length > 0 && (
              <>
                <h2>相册搜图提示</h2>
                <p className="muted">在系统相册搜索这些词，选几张回来挂上（可跳过）</p>
                <ul>
                  {hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => void onPickFiles(e.target.files)}
                />
                <button type="button" onClick={() => fileRef.current?.click()}>
                  从相册选图
                </button>
                {images.length > 0 && <p className="ok">已选 {images.length} 张</p>}
              </>
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
