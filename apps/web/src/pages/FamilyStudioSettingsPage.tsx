import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getStoredApiBase,
  isNativeApp,
  setStoredApiBase,
} from '../api/base'
import {
  familyLlmLabel,
  imageCloudLabel,
  type FamilyImageCloudProvider,
  type FamilyLlmProvider,
} from '../family/providers'
import {
  clearAgnesKey,
  clearDeepseekKey,
  clearTongyiKey,
  getAgnesKey,
  getAutoTongyiImages,
  getDeepseekKey,
  getImageCloudProvider,
  getLlmProvider,
  getMinLevelKeywords,
  getTongyiKey,
  setAgnesKey,
  setAutoTongyiImages,
  setDeepseekKey,
  setImageCloudProvider,
  setLlmProvider,
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

const LLM_OPTIONS: { id: FamilyLlmProvider; hint: string }[] = [
  { id: 'deepseek', hint: '现有路径，JSON 较稳' },
  { id: 'agnes', hint: 'agnes-2.5-flash，试用对比；免费档约 20 次/分钟' },
]

const IMAGE_CLOUD_OPTIONS: { id: FamilyImageCloudProvider; hint: string }[] = [
  { id: 'tongyi', hint: '万相，按张计费' },
  { id: 'agnes', hint: 'agnes-image-2.1-flash；免费档约 20 次/分钟，多图会排队' },
]

export function FamilyStudioSettingsPage() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [tongyiKey, setTongyiKeyInput] = useState('')
  const [agnesKey, setAgnesKeyInput] = useState('')
  const [llm, setLlm] = useState<FamilyLlmProvider>('deepseek')
  const [imageCloud, setImageCloud] = useState<FamilyImageCloudProvider>('tongyi')
  const [autoTongyi, setAutoTongyi] = useState(false)
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
    setAgnesKeyInput(getAgnesKey())
    setLlm(getLlmProvider())
    setImageCloud(getImageCloudProvider())
    setAutoTongyi(getAutoTongyiImages())
    setMinKeywords(getMinLevelKeywords())
    setApiBaseInput(getStoredApiBase())
    setWhisperModel(getDiaryWhisperModelId())
  }, [])

  function saveProviders() {
    setLlmProvider(llm)
    setImageCloudProvider(imageCloud)
    setDeepseekKey(apiKey)
    setTongyiKey(tongyiKey)
    setAgnesKey(agnesKey)
    setStatus(
      `已保存：关卡 ${familyLlmLabel(llm)}；云端配图 ${imageCloudLabel(imageCloud)}`,
    )
  }

  function saveMinKeywords() {
    setMinLevelKeywords(minKeywords)
    const n = getMinLevelKeywords()
    setMinKeywords(n)
    setStatus(`已保存：至少 ${n} 个关键词，配图最多 ${n} 张（含 1 张场景背景）`)
  }

  function saveImageSettings() {
    setTongyiKey(tongyiKey)
    setAgnesKey(agnesKey)
    setImageCloudProvider(imageCloud)
    setAutoTongyiImages(autoTongyi)
    const cloudName = imageCloudLabel(imageCloud)
    setStatus(
      autoTongyi
        ? `已保存：自动云端配图开（${cloudName}）；1 场景背景 + 关键词道具图`
        : `已保存：自动云端配图关；可手动「云端配图」（${cloudName}）或相册`,
    )
  }

  function saveApiBase() {
    setStoredApiBase(apiBaseInput)
    setApiBaseInput(getStoredApiBase())
    setStatus(
      getStoredApiBase()
        ? `已保存 API 地址：${getStoredApiBase()}`
        : '已清空 API 地址（App 有云 Key 时可直连；浏览器走同源代理）',
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
        <p className="muted">模型、Key、配图与语音</p>
      </header>

      <section>
        {isNativeApp() && (
          <>
            <h2>电脑 API 地址（可选）</h2>
            <p className="muted">
              生成关卡和云端配图：App 里填了对应云 Key 后会直连 HTTPS，不必填局域网。仅当要用电脑
              .env 里的 Key、或电脑浏览器联调时，再填例如 http://192.168.2.104:8787。
            </p>
            <input
              type="url"
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
              placeholder="http://192.168.x.x:8787（可选）"
              autoComplete="off"
            />
            <div className="row">
              <button type="button" onClick={saveApiBase}>
                保存地址
              </button>
            </div>
          </>
        )}

        <h2>关卡生成模型</h2>
        <p className="muted">同一段日记可切换后重新生成，对比短词和能不能过校验。</p>
        <div className="model-switch" role="radiogroup" aria-label="关卡生成模型">
          {LLM_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={llm === m.id}
              className={`model-option ${llm === m.id ? 'active' : ''}`}
              onClick={() => {
                setLlm(m.id)
                setLlmProvider(m.id)
              }}
            >
              <strong>{familyLlmLabel(m.id)}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>

        <h2>DeepSeek API Key</h2>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-…（选 DeepSeek 时需要）"
          autoComplete="off"
        />
        <div className="row">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              clearDeepseekKey()
              setApiKey('')
              setStatus('已清除 DeepSeek Key')
            }}
          >
            清除 DeepSeek Key
          </button>
        </div>

        <h2>Agnes API Key</h2>
        <p className="muted">关卡选 Agnes、或配图选 Agnes 图时使用同一把 Key。</p>
        <input
          type="password"
          value={agnesKey}
          onChange={(e) => setAgnesKeyInput(e.target.value)}
          placeholder="Agnes Key"
          autoComplete="off"
        />
        <div className="row">
          <button type="button" onClick={saveProviders}>
            保存模型与 Key
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              clearAgnesKey()
              setAgnesKeyInput('')
              setStatus('已清除 Agnes Key')
            }}
          >
            清除 Agnes Key
          </button>
        </div>

        <h2>关卡最少关键词数 / 配图张数</h2>
        <p className="muted">
          生成关卡时统计英文关键词（目标词 + 选项 id 去重），不足则不会保存关卡。同一数值也是配图槽位上限（含
          1 张场景背景），默认 9，可设 3–12。
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
          仅云端配图（通义或 Agnes）与相册。开启自动后，生成关卡会出 1 张场景背景 + 各关键词道具图。
        </p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoTongyi}
            onChange={(e) => setAutoTongyi(e.target.checked)}
          />
          <span>生成关卡后自动云端配图</span>
        </label>
        <p className="muted">云端配图用哪一家</p>
        <div className="model-switch" role="radiogroup" aria-label="云端配图提供方">
          {IMAGE_CLOUD_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={imageCloud === m.id}
              className={`model-option ${imageCloud === m.id ? 'active' : ''}`}
              onClick={() => {
                setImageCloud(m.id)
                setImageCloudProvider(m.id)
              }}
            >
              <strong>{imageCloudLabel(m.id)}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
        <input
          type="password"
          value={tongyiKey}
          onChange={(e) => setTongyiKeyInput(e.target.value)}
          placeholder="通义 / 百炼 API Key（选万相时）"
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
            清除通义 Key
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
