import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelScript } from '../types'
import {
  appendStory,
  clearDeepseekKey,
  getDay,
  getDeepseekKey,
  saveGeneratedLevel,
  setDayImages,
  setDeepseekKey,
  todayKey,
  upsertStory,
} from '../family/store'
import { usePressToTalk } from '../voice/usePressToTalk'
import './family-studio.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export function FamilyStudioPage() {
  const navigate = useNavigate()
  const date = todayKey()
  const [story, setStory] = useState('')
  const [chunk, setChunk] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasLevel, setHasLevel] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [completed, setCompleted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { recording, toggleListen, cancelAutoStop } = usePressToTalk()

  useEffect(() => {
    const day = getDay(date)
    setStory(day?.story || '')
    setHints(day?.photoHints || [])
    setHasLevel(Boolean(day?.level))
    setImages(day?.images || [])
    setCompleted(Boolean(day?.completed))
    setApiKey(getDeepseekKey())
  }, [date])

  function persistStory(next: string) {
    setStory(next)
    upsertStory(date, next)
  }

  function addChunk() {
    if (!chunk.trim()) return
    const day = appendStory(date, chunk)
    setStory(day.story)
    setChunk('')
  }

  async function onVoiceAppend() {
    if (busy) return
    const result = await toggleListen(async (capture) => {
      cancelAutoStop()
      if (capture.transcript) {
        const day = appendStory(date, capture.transcript)
        setStory(day.story)
        setStatus('已追加语音文字')
      } else {
        setStatus('没听清，请再试或改用打字')
      }
    })
    if (result === 'started') {
      setStatus('正在听… 说完可再点一次结束')
      return
    }
    if (typeof result === 'object') {
      if (result.transcript) {
        const day = appendStory(date, result.transcript)
        setStory(day.story)
        setStatus('已追加语音文字')
      } else if (result.error === 'insecure') {
        setStatus('需要 https 才能语音，请用打字，或 npm run dev:phone')
      } else if (result.error === 'denied') {
        setStatus('请允许麦克风权限')
      }
    }
  }

  function saveKey() {
    setDeepseekKey(apiKey)
    setStatus(apiKey.trim() ? '已保存 DeepSeek Key' : 'Key 已清空')
  }

  async function generate(force = false) {
    if (!story.trim()) {
      setStatus('请先写下或录入今日故事')
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
            ? '请先填写 DeepSeek API Key（或在 API 的 .env 配置 DEEPSEEK_API_KEY）'
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
    <div className="family-studio">
      <header>
        <button type="button" className="linkish" onClick={() => navigate('/parent')}>
          ← 家长中心
        </button>
        <h1>做今日关卡</h1>
        <p className="muted">{date}</p>
      </header>

      <section>
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
      </section>

      <section>
        <h2>今日故事</h2>
        <p className="muted">边问边记：可打字追加，或点麦克风说话（需 https）</p>
        <textarea
          value={story}
          onChange={(e) => persistStory(e.target.value)}
          rows={6}
          placeholder="今天去了公园，和小朋友玩滑梯…"
        />
        <div className="append-row">
          <input
            value={chunk}
            onChange={(e) => setChunk(e.target.value)}
            placeholder="再追加一句…"
          />
          <button type="button" onClick={addChunk}>
            追加
          </button>
        </div>
        <button
          type="button"
          className={`mic-mini ${recording ? 'hot' : ''}`}
          onClick={() => void onVoiceAppend()}
        >
          {recording ? '听完再点' : '语音追加'}
        </button>
      </section>

      <section>
        <button type="button" className="primary" disabled={busy} onClick={() => void generate(false)}>
          {busy ? '生成中…' : '生成关卡'}
        </button>
        {hasLevel && (
          <p className="ok">
            已有今日关卡{completed ? '（已通关）' : ''} · 目标可在家庭日历游玩
          </p>
        )}
      </section>

      {hints.length > 0 && (
        <section>
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
        </section>
      )}

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
