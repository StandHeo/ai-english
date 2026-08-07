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
  getAutoIconImages,
  getAutoTongyiImages,
  getDeepseekKey,
  getMinLevelKeywords,
  getTongyiKey,
  setAutoIconImages,
  setAutoTongyiImages,
  setDeepseekKey,
  setMinLevelKeywords,
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
  const [autoTongyi, setAutoTongyi] = useState(false)
  const [autoIcon, setAutoIcon] = useState(false)
  const [minKeywords, setMinKeywords] = useState(9)
  const [apiBaseInput, setApiBaseInput] = useState(() => getStoredApiBase())
  const [whisperModel, setWhisperModel] = useState<DiaryWhisperModelId>(() =>
    getDiaryWhisperModelId(),
  )
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setApiKey(getDeepseekKey())
    setTongyiKeyInput(getTongyiKey())
    setAutoTongyi(getAutoTongyiImages())
    setAutoIcon(getAutoIconImages())
    setMinKeywords(getMinLevelKeywords())
    setApiBaseInput(getStoredApiBase())
    setWhisperModel(getDiaryWhisperModelId())
  }, [])

  function saveKey() {
    setDeepseekKey(apiKey)
    setStatus(apiKey.trim() ? '已保存 DeepSeek Key' : 'Key 已清空')
  }

  function saveMinKeywords() {
    setMinLevelKeywords(minKeywords)
    const n = getMinLevelKeywords()
    setMinKeywords(n)
    setStatus(`已保存：至少 ${n} 个关键词，配图也最多 ${n} 张`)
  }

  function saveImageSettings() {
    if (!autoIcon && !autoTongyi) {
      setStatus('请至少勾选一种自动配图：图标或通义')
      return
    }
    setTongyiKey(tongyiKey)
    setAutoTongyiImages(autoTongyi)
    setAutoIconImages(autoIcon)
    const bits = [
      tongyiKey.trim() ? '已保存通义 Key' : '通义 Key 已清空（可用 API .env）',
      autoIcon ? '自动图标：开' : '自动图标：关',
      autoTongyi ? '自动通义：开' : '自动通义：关',
    ]
    if (autoIcon && autoTongyi) {
      bits.push('两者皆开：先图标，未匹配再通义补全')
    }
    setStatus(bits.join('；'))
  }

  function onToggleAutoIcon(on: boolean) {
    if (!on && !autoTongyi) {
      setStatus('请至少保留一种自动配图')
      return
    }
    setAutoIcon(on)
  }

  function onToggleAutoTongyi(on: boolean) {
    if (!on && !autoIcon) {
      setStatus('请至少保留一种自动配图')
      return
    }
    setAutoTongyi(on)
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

        <h2>关卡最少关键词数 / 配图张数</h2>
        <p className="muted">
          生成关卡时统计英文关键词（目标词 + 选项 id 去重），不足则不会保存关卡。同一数值也是配图槽位上限（图标 /
          通义 / 相册），默认 9，可设 3–12。
        </p>
        <input
          type="number"
          min={3}
          max={12}
          value={minKeywords}
          onChange={(e) => setMinKeywords(Number(e.target.value) || 9)}
        />
        <div className="row">
          <button type="button" onClick={saveMinKeywords}>
            保存关键词数
          </button>
        </div>

        <h2>配图方式</h2>
        <p className="muted">
          至少勾选一种。可都开：先本地图标，找不到匹配再调用通义补全。图标离线免费；通义需
          Key、按张计费。
        </p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoIcon}
            onChange={(e) => onToggleAutoIcon(e.target.checked)}
          />
          <span>生成关卡后自动图标配图</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoTongyi}
            onChange={(e) => onToggleAutoTongyi(e.target.checked)}
          />
          <span>生成关卡后自动通义配图</span>
        </label>
        <input
          type="password"
          value={tongyiKey}
          onChange={(e) => setTongyiKeyInput(e.target.value)}
          placeholder="通义 / 百炼 API Key（可选）"
          autoComplete="off"
        />
        <div className="row">
          <button type="button" onClick={saveImageSettings}>
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
