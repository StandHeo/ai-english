import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getApiBase,
  getStoredApiBase,
  isNativeApp,
  PRODUCTION_API_BASE,
  setStoredApiBase,
  switchToOfficialApiBase,
} from '../api/base'
import {
  DEFAULT_FAMILY_LLM,
  DEFAULT_IMAGE_CLOUD,
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
import {
  buildFamilyBackupZip,
  peekFamilyBackup,
  readFileAsUint8Array,
  restoreFamilyBackup,
  shareOrDownloadBackup,
} from '../family/backup'
import { prepareDiaryWhisperModel, downloadDiaryWhisperModel, listDiaryWhisperModels } from '../voice/diaryAsr'
import {
  DIARY_WHISPER_MODELS,
  diaryWhisperModelLabel,
  getDiaryWhisperModelId,
  setDiaryWhisperModelId,
  type DiaryWhisperModelId,
} from '../voice/diaryWhisperModel'
import './family-studio.css'

const LLM_OPTIONS: { id: FamilyLlmProvider; hint: string }[] = [
  { id: 'agnes', hint: 'agnes-2.5-flash，试用对比；免费档约 20 次/分钟' },
  { id: 'deepseek', hint: '现有路径，JSON 较稳' },
]

const IMAGE_CLOUD_OPTIONS: { id: FamilyImageCloudProvider; hint: string }[] = [
  { id: 'agnes', hint: 'agnes-image-2.1-flash；免费档约 20 次/分钟，多图会排队' },
  { id: 'tongyi', hint: '万相，按张计费' },
]

function apiKeyGuideUrl(provider: FamilyLlmProvider): string {
  const base = (getApiBase() || PRODUCTION_API_BASE).replace(/\/$/, '')
  return `${base}/agnes-api-key.html#${provider}`
}

export function FamilyStudioSettingsPage() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [tongyiKey, setTongyiKeyInput] = useState('')
  const [agnesKey, setAgnesKeyInput] = useState('')
  const [llm, setLlm] = useState<FamilyLlmProvider>(DEFAULT_FAMILY_LLM)
  const [imageCloud, setImageCloud] = useState<FamilyImageCloudProvider>(DEFAULT_IMAGE_CLOUD)
  const [autoTongyi, setAutoTongyi] = useState(false)
  const [minKeywords, setMinKeywords] = useState(9)
  const [apiBaseInput, setApiBaseInput] = useState(() => getStoredApiBase())
  const [whisperModel, setWhisperModel] = useState<DiaryWhisperModelId>(() =>
    getDiaryWhisperModelId(),
  )
  const [whisperReady, setWhisperReady] = useState<Record<string, boolean>>({})
  const [whisperNeedsDownload, setWhisperNeedsDownload] = useState<Record<string, boolean>>({})
  const [downloadPct, setDownloadPct] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [includeKeysInBackup, setIncludeKeysInBackup] = useState(false)
  const [backupPct, setBackupPct] = useState<number | null>(null)
  const backupFileRef = useRef<HTMLInputElement>(null)

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
    if (!isNativeApp()) return
    void listDiaryWhisperModels()
      .then((res) => {
        const ready: Record<string, boolean> = {}
        const need: Record<string, boolean> = {}
        for (const m of res.models) {
          ready[m.id] = Boolean(m.ready)
          need[m.id] = Boolean(m.needsDownload)
        }
        setWhisperReady(ready)
        setWhisperNeedsDownload(need)
      })
      .catch(() => {
        /* ignore */
      })
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
    const next = apiBaseInput.trim()
    if (!next) {
      useOfficialApi()
      return
    }
    setStoredApiBase(next)
    setApiBaseInput(getStoredApiBase())
    setStatus(`已保存 API 地址：${getStoredApiBase()}`)
  }

  function useOfficialApi() {
    switchToOfficialApiBase()
    setApiBaseInput('')
    setStatus(`已切换到官方服务器 ${PRODUCTION_API_BASE}`)
  }

  function openApiKeyGuide(provider: FamilyLlmProvider) {
    window.open(apiKeyGuideUrl(provider), '_blank', 'noopener,noreferrer')
  }

  function clearCurrentLlmKey() {
    if (llm === 'agnes') {
      clearAgnesKey()
      setAgnesKeyInput('')
      setStatus('已清除 Agnes Key')
      return
    }
    clearDeepseekKey()
    setApiKey('')
    setStatus('已清除 DeepSeek Key')
  }

  async function onExportBackup() {
    if (busy) return
    setBusy(true)
    setBackupPct(0)
    setStatus('正在打包完整备份（含录音与配图）…')
    try {
      const { blob, filename, manifest } = await buildFamilyBackupZip({
        includeKeys: includeKeysInBackup,
        onProgress: (p) => {
          const pct =
            p.total > 0 ? Math.max(0, Math.min(100, Math.round((p.current / p.total) * 100))) : 0
          setBackupPct(pct)
          setStatus(`正在打包备份… ${pct}%`)
        },
      })
      const mode = await shareOrDownloadBackup(blob, filename)
      const miss = manifest.missing.length
      setStatus(
        `${mode === 'share' ? '请在系统分享面板中选择「保存到文件」或网盘/微信' : '已开始下载'}：${filename}` +
          `（${manifest.counts.days} 天，录音 ${manifest.counts.audio}，配图 ${manifest.counts.images}` +
          (miss ? `，缺媒体 ${miss}` : '') +
          '）。',
      )
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      const msg = err instanceof Error ? err.message : String(err)
      if (name === 'AbortError' || /cancel|取消|dismiss/i.test(msg)) {
        setStatus('已取消分享')
      } else {
        setStatus(err instanceof Error ? err.message : '导出失败')
      }
    } finally {
      setBusy(false)
      setBackupPct(null)
    }
  }

  async function onRestoreBackupFile(file: File | null) {
    if (!file || busy) return
    setBusy(true)
    setBackupPct(0)
    setStatus('正在读取备份…')
    try {
      const bytes = await readFileAsUint8Array(file)
      const peek = await peekFamilyBackup(bytes)
      const ok = window.confirm(
        `将用备份覆盖本机全部家庭日记数据（不可撤销）。\n\n` +
          `导出时间：${peek.manifest.exportedAt || '未知'}\n` +
          `天数：${peek.dayCount}\n` +
          `录音约 ${peek.manifest.counts.audio}，配图约 ${peek.manifest.counts.images}\n` +
          `含密钥：${peek.manifest.includeKeys ? '是' : '否'}\n\n` +
          `确认恢复？`,
      )
      if (!ok) {
        setStatus('已取消恢复')
        return
      }
      const result = await restoreFamilyBackup(bytes, {
        onProgress: (p) => {
          const pct =
            p.total > 0 ? Math.max(0, Math.min(100, Math.round((p.current / p.total) * 100))) : 0
          setBackupPct(pct)
          setStatus(`正在恢复备份… ${pct}%`)
        },
      })
      setApiKey(getDeepseekKey())
      setTongyiKeyInput(getTongyiKey())
      setAgnesKeyInput(getAgnesKey())
      setLlm(getLlmProvider())
      setImageCloud(getImageCloudProvider())
      setAutoTongyi(getAutoTongyiImages())
      setMinKeywords(getMinLevelKeywords())
      setStatus(`已恢复：${result.dayCount} 天日记与媒体已写入本机`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setBusy(false)
      setBackupPct(null)
      if (backupFileRef.current) backupFileRef.current.value = ''
    }
  }

  async function onWhisperModelChange(next: DiaryWhisperModelId) {
    if (next === whisperModel || busy) return
    setWhisperModel(next)
    setDiaryWhisperModelId(next)
    setBusy(true)
    setDownloadPct(null)
    setStatus(`正在切换到 ${diaryWhisperModelLabel(next)}…`)
    try {
      if (!isNativeApp()) {
        setStatus(`已选择 ${diaryWhisperModelLabel(next)}（浏览器无法端侧转写）`)
        return
      }
      let s = await prepareDiaryWhisperModel(next)
      if (!s.modelReady && s.needsDownload) {
        const mb = s.downloadBytes ? Math.round(s.downloadBytes / (1024 * 1024)) : '?'
        setStatus(`正在下载 ${diaryWhisperModelLabel(next)}（约 ${mb}MB）…`)
        s = await downloadDiaryWhisperModel(next, (p) => {
          if (p.modelId !== next) return
          const pct = Math.max(0, Math.min(100, Math.round((p.fraction || 0) * 100)))
          setDownloadPct(pct)
          if (p.phase === 'progress' || p.phase === 'start') {
            setStatus(`正在下载 ${diaryWhisperModelLabel(next)}… ${pct}%`)
          }
        })
      }
      setWhisperReady((prev) => ({ ...prev, [next]: Boolean(s.modelReady) }))
      setWhisperNeedsDownload((prev) => ({ ...prev, [next]: Boolean(s.needsDownload && !s.modelReady) }))
      if (!s.modelReady) {
        setStatus(s.detail || '模型未就绪')
      } else {
        setStatus(`已切换到 ${diaryWhisperModelLabel(next)}`)
      }
    } finally {
      setBusy(false)
      setDownloadPct(null)
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
            <h2>服务器地址</h2>
            <p className="muted">
              正式 App 默认连 {PRODUCTION_API_BASE}（家长登录 / Plus）。只有同一 Wi‑Fi
              调试电脑 API 时才改成局域网，例如 http://192.168.x.x:8787。
            </p>
            <p className="muted">当前：{getApiBase() || '本机开发代理'}</p>
            <input
              type="url"
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
              placeholder="留空即官方服务器"
              autoComplete="off"
            />
            <div className="row api-base-actions">
              <button type="button" onClick={saveApiBase}>
                保存地址
              </button>
              <button type="button" className="ghost" onClick={useOfficialApi}>
                使用官方服务器
              </button>
            </div>
          </>
        )}

        <h2>关卡生成模型</h2>
        <p className="muted">同一段日记可切换后重新生成，对比短词和能不能过校验。</p>
        <div className="model-switch" role="radiogroup" aria-label="关卡生成模型">
          {LLM_OPTIONS.map((m) => (
            <div key={m.id} className="model-option-row">
              <button
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
              <button
                type="button"
                className="ghost model-guide-link"
                onClick={() => openApiKeyGuide(m.id)}
              >
                获取指引
              </button>
            </div>
          ))}
        </div>

        <h2>API Key（{familyLlmLabel(llm)}）</h2>
        <p className="muted">
          {llm === 'agnes'
            ? '关卡选 Agnes、或配图选 Agnes 图时使用同一把 Key。'
            : '选 DeepSeek 生成关卡时需要。'}
        </p>
        {llm === 'agnes' ? (
          <input
            type="password"
            value={agnesKey}
            onChange={(e) => setAgnesKeyInput(e.target.value)}
            placeholder="Agnes Key"
            autoComplete="off"
          />
        ) : (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…（选 DeepSeek 时需要）"
            autoComplete="off"
          />
        )}
        <div className="row">
          <button type="button" onClick={saveProviders}>
            保存模型与 Key
          </button>
          <button type="button" className="ghost" onClick={clearCurrentLlmKey}>
            清除 {llm === 'agnes' ? 'Agnes' : 'DeepSeek'} Key
          </button>
        </div>

        <h2>今日迷你关卡数（3–5）</h2>
        <p className="muted">
          生成「一天一个迷你 pack」时的关数目标；实际会夹紧到 3–5 关。每关约一个英文主词 + 专属场景背景（像水果关）。
          设置里仍可填 3–12，大于 5 时按 5 关生成。
        </p>
        <input
          type="number"
          min={3}
          max={12}
          value={minKeywords}
          onChange={(e) => setMinKeywords(Number(e.target.value) || 4)}
        />
        <div className="row">
          <button type="button" onClick={saveMinKeywords}>
            保存今日关数
          </button>
        </div>

        <h2>配图方式</h2>
        <p className="muted">
          仅云端配图（通义或 Agnes）。开启自动后，生成迷你 pack 会为每关出背景图（+ 主词道具图）。
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
        {imageCloud === 'agnes' && llm === 'agnes' && (
          <p className="muted">使用上方 Agnes API Key（关卡与配图共用）。</p>
        )}
        {imageCloud === 'agnes' && llm !== 'agnes' && (
          <>
            <p className="muted">关卡与配图共用同一把 Agnes Key。</p>
            <input
              type="password"
              value={agnesKey}
              onChange={(e) => setAgnesKeyInput(e.target.value)}
              placeholder="Agnes Key"
              autoComplete="off"
            />
          </>
        )}
        {imageCloud === 'tongyi' && (
          <input
            type="password"
            value={tongyiKey}
            onChange={(e) => setTongyiKeyInput(e.target.value)}
            placeholder="通义 / 百炼 API Key（选万相时）"
            autoComplete="off"
          />
        )}
        <div className="row">
          <button type="button" onClick={saveImageSettings}>
            保存配图设置
          </button>
          {imageCloud === 'agnes' && llm !== 'agnes' && (
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
          )}
          {imageCloud === 'tongyi' && (
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
          )}
        </div>

        <h2>数据备份</h2>
        <p className="muted">
          导出完整备份（日记、每日关卡、录音与配图）到文件，换机或重装后可恢复。默认不含 API
          Key。大文件请用文件管理器或网盘保存；微信可能有大小限制。
        </p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeKeysInBackup}
            disabled={busy}
            onChange={(e) => setIncludeKeysInBackup(e.target.checked)}
          />
          <span>备份中包含 API Key（勿分享给他人）</span>
        </label>
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void onExportBackup()}>
            导出完整备份
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => backupFileRef.current?.click()}
          >
            从备份恢复
          </button>
        </div>
        <input
          ref={backupFileRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => void onRestoreBackupFile(e.target.files?.[0] ?? null)}
        />
        {backupPct != null && (
          <p className="muted" role="status">
            备份进度 {backupPct}%
          </p>
        )}

        <h2>语音转写模型</h2>
        <p className="muted">
          仅 App 生效。APK 默认只带 Tiny；选 Base / Small 时会自动下载模型包（需联网）。
        </p>
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
              <strong>
                {m.label}
                {whisperReady[m.id]
                  ? ' · 已就绪'
                  : whisperNeedsDownload[m.id]
                    ? ' · 需下载'
                    : ''}
              </strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
        {downloadPct != null && (
          <p className="muted" role="status">
            下载进度 {downloadPct}%
          </p>
        )}
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
