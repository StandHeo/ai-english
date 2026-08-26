import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelScript } from '../types'
import { apiJson, getApiBase, isNativeApp } from '../api/base'
import { DiaryVoicePlayer } from '../family/DiaryVoicePlayer'
import { generateFamilyImagesDirect, slotsFromLevel } from '../family/generateImagesClient'
import { generateFamilyLevelDirect, llmBusyLabel } from '../family/generateLevelClient'
import {
  familyLlmLabel,
  imageCloudLabel,
  nativeFamilyCloudReady,
} from '../family/providers'
import {
  appendTextMessage,
  appendVoiceMessage,
  applyGeneratedImages,
  deleteMessage,
  ensureMessagesMigrated,
  getAutoTongyiImages,
  getDay,
  getImageCloudApiKey,
  getImageCloudProvider,
  getImageSlotMax,
  getLlmApiKey,
  getLlmProvider,
  getMinLevelKeywords,
  mergeStoryFromMessages,
  removeDayImage,
  saveGeneratedLevel,
  setDayImages,
  todayKey,
  updateMessageText,
  type FamilyDiaryMessage,
} from '../family/store'
import { missingSlotsForImages } from '../family/imageSlots'
import { getDiaryAsrStatus, transcribeDiaryAudio } from '../voice/diaryAsr'
import {
  diaryWhisperModelLabel,
  getDiaryWhisperModelId,
} from '../voice/diaryWhisperModel'
import {
  DIARY_MAX_RECORD_MS,
  formatClock,
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
    if (result.error === 'too_long' || result.hitLimit) {
      setStatus(
        `已录满 ${formatClock(DIARY_MAX_RECORD_MS)}，已自动结束并保存，正在转写…`,
      )
    }

    savingVoiceRef.current = true
    const modelId = getDiaryWhisperModelId()
    setBusy(true)
    setTranscribing(true)
    if (result.error !== 'too_long' && !result.hitLimit) {
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

  const { recording, toggle, maxMs, elapsedMs, remainingMs, nearLimit } = useDiaryRecorder({
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
      setStatus(`正在录音… 最长 ${formatClock(maxMs)}，说完点「结束录音」`)
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

  async function requestImages(
    level: LevelScript,
    mode: 'fill_empty' | 'replace',
    opts?: { statusPrefix?: string; onlyEmpty?: boolean },
  ): Promise<boolean> {
    const maxSlots = getImageSlotMax()
    const existing = getDay(date)?.images || []
    const cloud = getImageCloudProvider()
    const cloudName = imageCloudLabel(cloud)
    let slotsPayload: { subject: string; role?: 'scene' | 'item' }[] | undefined
    if (opts?.onlyEmpty || mode === 'fill_empty') {
      slotsPayload = missingSlotsForImages(
        level as unknown as Record<string, unknown>,
        existing,
        maxSlots,
      )
      if (!slotsPayload.length) {
        setStatus(`已有图已覆盖全部槽位；删掉不需要的图后再用${cloudName}补全`)
        return false
      }
    }

    const cloudKey = getImageCloudApiKey()
    const useDirect = isNativeApp() && Boolean(cloudKey)
    if (isNativeApp() && !nativeFamilyCloudReady(Boolean(cloudKey), getApiBase())) {
      setStatus(`关卡已保留；请到设置填写${cloudName} Key，或可选填电脑 API 用 .env`)
      return false
    }

    const slots =
      slotsPayload ||
      slotsFromLevel(level as unknown as Record<string, unknown>, maxSlots)
    setImaging(true)
    setStatus(
      cloud === 'agnes'
        ? `${opts?.statusPrefix || ''}正在${cloudName}配图（免费档约 20 次/分钟，可能稍慢）…`.trim()
        : `${opts?.statusPrefix || ''}正在${cloudName}配图…`.trim(),
    )
    try {
      let list: string[] = []
      let warnings: unknown[] = []
      if (useDirect) {
        const payload = await generateFamilyImagesDirect({
          slots,
          apiKey: cloudKey,
          provider: cloud,
          maxSlots,
        })
        list = payload.images
        warnings = payload.warnings
        console.log(
          '[family-images] direct',
          JSON.stringify({
            provider: payload.provider,
            imageCount: list.length,
            warnings: payload.warnings,
          }),
        )
      } else {
        const res = await apiJson('/api/family/generate-images', {
          method: 'POST',
          headers: {
            ...(cloudKey && cloud === 'tongyi' ? { 'x-tongyi-key': cloudKey } : {}),
            ...(cloudKey && cloud === 'agnes' ? { 'x-agnes-key': cloudKey } : {}),
          },
          body: {
            date,
            maxSlots,
            minKeywords: maxSlots,
            imageProvider: cloud,
            ...(slotsPayload ? { slots: slotsPayload } : { level }),
            apiKey: cloudKey || undefined,
          },
          timeoutMs: 300_000,
        })
        console.log(
          '[family-images] proxy',
          JSON.stringify({
            ok: res.ok,
            status: res.status,
            error: res.data.error || res.error,
            imageCount: Array.isArray(res.data.images) ? res.data.images.length : 0,
            provider: res.data.provider,
          }),
        )
        if (!res.ok) {
          const err = String(res.data.error || res.error || res.status)
          setStatus(
            err === 'image_provider_unavailable' || err === 'missing_api_base'
              ? `关卡已保留；${cloudName}配图需要 Key`
              : `关卡已保留；${cloudName}配图失败：${err}`,
          )
          return false
        }
        list = Array.isArray(res.data.images) ? (res.data.images as string[]) : []
        warnings = Array.isArray(res.data.warnings) ? res.data.warnings : []
      }
      if (!list.length) {
        setStatus(`关卡已保留；${cloudName}未返回图片，可用相册补图`)
        return false
      }
      const day = applyGeneratedImages(date, list, mode === 'replace' ? 'replace' : 'fill_empty')
      if (day) {
        setImages(day.images)
        const warn = warnings.length ? `（部分槽位用了占位：${warnings.length}）` : ''
        setStatus(
          mode === 'replace'
            ? `已${cloudName}配图 ${day.images.length} 张${warn}`
            : `已保留已有图，${cloudName}补全至 ${day.images.length} 张${warn}`,
        )
        return true
      }
      setStatus('关卡已保留；写入配图失败')
      return false
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log('[family-images] error', msg)
      setStatus(
        useDirect
          ? `关卡已保留；${cloudName}直连失败（${msg}）。请检查手机网络与 Key`
          : `关卡已保留；${cloudName}网络错误（${msg}）`,
      )
      return false
    } finally {
      setImaging(false)
    }
  }

  async function autoFillImagesAfterGenerate(level: LevelScript) {
    if (!getAutoTongyiImages()) {
      setStatus('生成成功！可开「自动云端配图」，或手动点「云端配图」/相册')
      return
    }
    setBusy(false)
    await requestImages(level, 'fill_empty', { onlyEmpty: true })
  }

  async function generate(force = false) {
    const story = storyFromState(messages)
    if (!story.trim()) {
      setStatus('请先发几条今日故事（打字或语音）')
      return
    }
    const llm = getLlmProvider()
    const key = getLlmApiKey()
    const useDirect = isNativeApp() && Boolean(key)
    if (isNativeApp() && !nativeFamilyCloudReady(Boolean(key), getApiBase())) {
      setStatus(`请到「设置」填写 ${familyLlmLabel(llm)} 的 API Key（App 可直连，不必填电脑地址）`)
      return
    }
    setBusy(true)
    setStatus(llmBusyLabel(llm))
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
      let level: LevelScript
      let photoHints: string[] = []
      let iconColors: { word: string; fg: string; bg: string }[] = []
      let keywords: string[] | undefined

      if (useDirect) {
        const payload = await generateFamilyLevelDirect({
          story,
          date,
          apiKey: key,
          llm,
          minKeywords,
        })
        console.log(
          '[family-llm] direct',
          JSON.stringify({
            provider: payload.provider,
            model: payload.model,
            keywords: payload.keywords,
            title: payload.level.title,
          }),
        )
        level = payload.level as LevelScript
        photoHints = payload.photoHints
        iconColors = payload.iconColors
        keywords = payload.keywords
      } else {
        const res = await apiJson('/api/family/generate-level', {
          method: 'POST',
          headers: {
            ...(key && llm === 'deepseek' ? { 'x-deepseek-key': key } : {}),
            ...(key && llm === 'agnes' ? { 'x-agnes-key': key } : {}),
          },
          body: {
            story,
            date,
            apiKey: key || undefined,
            minKeywords,
            llm,
          },
          timeoutMs: 240_000,
        })
        const data = res.data
        console.log(
          '[family-llm] proxy',
          JSON.stringify({
            ok: res.ok,
            status: res.status,
            error: data.error || res.error,
            keywords: data.keywords,
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
          if (/timeout|deepseek_timeout|llm_timeout/i.test(err)) {
            setStatus(
              `生成超时：${familyLlmLabel(llm)} 响应较慢。请检查手机/电脑网络后重试；也可把「最少关键词」调低。`,
            )
            return
          }
          setStatus(
            err === 'api_key_required' || err === 'missing_api_base'
              ? `请先到「设置」填写 ${familyLlmLabel(llm)} API Key`
              : `生成失败：${err}`,
          )
          return
        }
        level = data.level as LevelScript
        photoHints = (data.photoHints as string[]) || []
        iconColors = Array.isArray(data.iconColors)
          ? (data.iconColors as { word: string; fg: string; bg: string }[])
          : []
        keywords = Array.isArray(data.keywords) ? (data.keywords as string[]) : undefined
      }

      const saved = saveGeneratedLevel(date, level, photoHints, {
        force,
        iconColors,
      })
      if (!saved.ok) {
        setStatus('需要确认覆盖已通关内容')
        return
      }
      setHints(photoHints)
      setHasLevel(true)
      setImages([])
      setCompleted(false)
      if (keywords?.length) {
        setStatus(`生成成功（${familyLlmLabel(llm)}，关键词 ${keywords.length} 个）`)
      } else {
        setStatus(`生成成功（${familyLlmLabel(llm)}）`)
      }
      await autoFillImagesAfterGenerate(level)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith('keywords_insufficient:')) {
        const [, count, min] = msg.split(':')
        setStatus(
          `关键词不足（${count}/${min}）。请再追加几句今日场景描述，然后重新点「生成关卡」。`,
        )
        return
      }
      if (msg.startsWith('invalid_level')) {
        setStatus(`生成失败：模型返回的关卡不合格（${msg}）。可换一家模型再试。`)
        return
      }
      if (/timeout|llm_timeout/i.test(msg)) {
        setStatus(
          `生成超时：${familyLlmLabel(llm)} 较慢。请检查网络，或把最少关键词调低。`,
        )
        return
      }
      if (msg === 'api_key_required') {
        setStatus(`请到「设置」填写 ${familyLlmLabel(llm)} API Key`)
        return
      }
      setStatus(
        useDirect
          ? `直连 ${familyLlmLabel(llm)} 失败（${msg}）。请检查手机网络与 Key`
          : `网络错误（${msg}）：电脑浏览器请确认 apps/api 已启动`,
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
    // 保留未删除的已有图（相册/云端），只对空槽位调云端
    await requestImages(day.level, 'fill_empty', { onlyEmpty: true })
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
          <div
            className={`recording-banner ${nearLimit ? 'near-limit' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="recording-dot" aria-hidden />
            <div className="recording-copy">
              <strong>
                正在录音 {formatClock(elapsedMs)}
                <span className="recording-max"> / {formatClock(maxMs)}</span>
              </strong>
              <span>
                {nearLimit
                  ? `还剩 ${formatClock(remainingMs)}，将自动结束并保存`
                  : '说完后点下方「结束录音」'}
              </span>
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
              自动/手动「云端配图」：1 张场景背景（优先 scene.setting）+ 各关键词道具图；也可用相册补图
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
                {imaging ? '配图中…' : '云端配图'}
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
