import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getStoredApiBase,
  isNativeApp,
  setStoredApiBase,
} from '../api/base'
import {
  clearDeepseekKey,
  clearTongyiKey,
  getAutoTongyiImages,
  getDeepseekKey,
  getTongyiKey,
  setAutoTongyiImages,
  setDeepseekKey,
  setTongyiKey,
} from '../family/store'
import { prepareDiaryWhisperModel } from '../voice/diaryAsr'
import {
  DIARY_WHISPER_MODELS,
  diaryWhisperModelLabel,
  getDiaryWhisperModelId,
  setDiaryWhisperModelId,
  type DiaryWhisperModelId,
} from '../voice/diaryWhisperModel'
import './family-studio.css'

export function FamilyStudioSettingsPage() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [tongyiKey, setTongyiKeyInput] = useState('')
  const [autoImages, setAutoImages] = useState(false)
  const [apiBaseInput, setApiBaseInput] = useState(() => getStoredApiBase())
  const [whisperModel, setWhisperModel] = useState<DiaryWhisperModelId>(() =>
    getDiaryWhisperModelId(),
  )
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setApiKey(getDeepseekKey())
    setTongyiKeyInput(getTongyiKey())
    setAutoImages(getAutoTongyiImages())
    setApiBaseInput(getStoredApiBase())
    setWhisperModel(getDiaryWhisperModelId())
  }, [])

  function saveKey() {
    setDeepseekKey(apiKey)
    setStatus(apiKey.trim() ? '已保存 DeepSeek Key' : 'Key 已清空')
  }

  function saveTongyi() {
    setTongyiKey(tongyiKey)
    setAutoTongyiImages(autoImages)
    setStatus(
      [
        tongyiKey.trim() ? '已保存通义 Key' : '通义 Key 已清空（可用 API .env）',
        autoImages ? '自动配图：开' : '自动配图：关',
      ].join('；'),
    )
  }

  function saveApiBase() {
    setStoredApiBase(apiBaseInput)
    setApiBaseInput(getStoredApiBase())
    setStatus(
      getStoredApiBase()
        ? `已保存 API 地址：${getStoredApiBase()}`
        : '已清空 API 地址（浏览器走同源代理）',
    )
  }

  async function onWhisperModelChange(next: DiaryWhisperModelId) {
    if (next === whisperModel || busy) return
    setWhisperModel(next)
    setDiaryWhisperModelId(next)
    setBusy(true)
    setStatus(`正在切换到 ${diaryWhisperModelLabel(next)}…`)
    try {
      if (!isNativeApp()) {
        setStatus(`已选择 ${diaryWhisperModelLabel(next)}（浏览器无法端侧转写）`)
        return
      }
      const s = await prepareDiaryWhisperModel(next)
      if (!s.modelReady) {
        setStatus(s.detail || '模型未就绪')
      } else {
        setStatus(`已切换到 ${diaryWhisperModelLabel(next)}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="family-studio settings-page">
      <header>
        <button type="button" className="linkish" onClick={() => navigate('/family/studio')}>
          ← 家庭日记
        </button>
        <h1>日记设置</h1>
        <p className="muted">API、Key、配图与语音模型</p>
      </header>

      <section>
        {isNativeApp() && (
          <>
            <h2>电脑 API 地址</h2>
            <p className="muted">
              App 页面是 HTTPS，已允许访问局域网 HTTP。填电脑地址，例如
              http://192.168.2.104:8787（同 Wi‑Fi，且电脑已跑 apps/api）。
            </p>
            <input
              type="url"
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
              placeholder="http://192.168.x.x:8787"
              autoComplete="off"
            />
            <div className="row">
              <button type="button" onClick={saveApiBase}>
                保存地址
              </button>
            </div>
          </>
        )}

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

        <h2>自动配图（通义万相）</h2>
        <p className="muted">
          默认关闭。开启后，「生成关卡」成功会再调通义文生图（最多 4 张，按张计费）。也可只用 API
          机器上的 DASHSCOPE_API_KEY / TONGYI_API_KEY。
        </p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoImages}
            onChange={(e) => setAutoImages(e.target.checked)}
          />
          <span>生成关卡后自动配图</span>
        </label>
        <input
          type="password"
          value={tongyiKey}
          onChange={(e) => setTongyiKeyInput(e.target.value)}
          placeholder="通义 / 百炼 API Key（可选）"
          autoComplete="off"
        />
        <div className="row">
          <button type="button" onClick={saveTongyi}>
            保存配图设置
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              clearTongyiKey()
              setTongyiKeyInput('')
              setStatus('已清除通义 Key')
            }}
          >
            清除 Key
          </button>
        </div>

        <h2>语音转写模型</h2>
        <p className="muted">仅 App 生效。可切换 Tiny / Base / Small 对比识别效果。</p>
        <div className="model-switch" role="radiogroup" aria-label="语音转写模型">
          {DIARY_WHISPER_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={whisperModel === m.id}
              className={`model-option ${whisperModel === m.id ? 'active' : ''}`}
              disabled={busy}
              onClick={() => void onWhisperModelChange(m.id)}
            >
              <strong>{m.label}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {status && <p className="status">{status}</p>}

      <div className="footer-actions">
        <button type="button" className="primary" onClick={() => navigate('/family/studio')}>
          返回日记
        </button>
      </div>
    </div>
  )
}
