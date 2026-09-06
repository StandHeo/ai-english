import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { LevelScript } from '../types'
import type { FamilyDayRecord } from '../family/store'
import { apiJson, getApiBase, isNativeApp } from '../api/base'
import { DiaryVoicePlayer } from '../family/DiaryVoicePlayer'
import { generateFamilyImagesDirect, mapPool, FAMILY_IMAGE_LEVEL_CONCURRENCY } from '../family/generateImagesClient'
import { generateFamilyPackDirect, llmBusyLabel, translateSceneToEnglish } from '../family/generateLevelClient'
import {
  familyLlmLabel,
  imageCloudLabel,
  nativeFamilyCloudReady,
} from '../family/providers'
import {
  buildKidsPrompt,
  miniLevelMissingImageSlots,
  sceneNeedsTranslation,
  slotRoleLabel,
  slotsForMiniLevel,
} from '../family/imageSlots'

function isValidDateKey(raw: string | null): raw is string {
  return Boolean(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= todayKey())
}
import {
  appendTextMessage,
  appendVoiceMessage,
  cacheMiniLevelScenePromptEn,
  dayHasMiniPack,
  dayHasPlayableContent,
  deleteMessage,
  effectiveScenePrompt,
  ensureMessagesMigrated,
  getAutoTongyiImages,
  getDay,
  getImageCloudApiKey,
  getImageCloudProvider,
  getImageSlotMax,
  getLlmApiKey,
  getLlmProvider,
  getPackLevelCount,
  hydrateFamilyDayImages,
  mergeStoryFromMessages,
  removeDayImage,
  resetMiniLevelScenePrompt,
  saveGeneratedPack,
  setDayImages,
  setMiniLevelImages,
  setMiniLevelItemPrompt,
  setMiniLevelScenePrompt,
  setMiniLevelSlotImage,
  todayKey,
  updateMessageText,
  type FamilyDiaryMessage,
  type FamilyMiniLevel,
} from '../family/store'
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

type ImageSlotLike = { subject: string; role?: 'scene' | 'item' }

/** 一组槽位 → 一组图（App 直连云或走电脑 API），供整关/单张配图共用 */
async function fetchSlotImages(
  slots: ImageSlotLike[],
  opts: {
    date: string
    cloud: string
    cloudKey: string
    useDirect: boolean
  },
): Promise<string[]> {
  if (opts.useDirect) {
    const payload = await generateFamilyImagesDirect({
      slots,
      apiKey: opts.cloudKey,
      provider: opts.cloud as 'tongyi' | 'agnes',
      maxSlots: Math.max(slots.length, 3),
    })
    return payload.images
  }
  const res = await apiJson('/api/family/generate-images', {
    method: 'POST',
    headers: {
      ...(opts.cloudKey && opts.cloud === 'tongyi' ? { 'x-tongyi-key': opts.cloudKey } : {}),
      ...(opts.cloudKey && opts.cloud === 'agnes' ? { 'x-agnes-key': opts.cloudKey } : {}),
    },
    body: {
      date: opts.date,
      maxSlots: Math.max(slots.length, 3),
      imageProvider: opts.cloud,
      slots,
      apiKey: opts.cloudKey || undefined,
    },
    timeoutMs: 300_000,
  })
  if (!res.ok) throw new Error(res.error || String(res.status))
  return Array.isArray(res.data.images) ? (res.data.images as string[]) : []
}

export function FamilyStudioPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // 支持编辑过去日期：/family/studio?date=YYYY-MM-DD；缺省今天
  const date = isValidDateKey(searchParams.get('date'))
    ? searchParams.get('date')!
    : todayKey()
  const isToday = date === todayKey()
  const [messages, setMessages] = useState<FamilyDiaryMessage[]>([])
  const [draft, setDraft] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [imaging, setImaging] = useState(false)
  const [hasLevel, setHasLevel] = useState(false)
  const [miniLevels, setMiniLevels] = useState<FamilyMiniLevel[]>([])
  const [packTitle, setPackTitle] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [completed, setCompleted] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [asrHint, setAsrHint] = useState('')
  const [asrReady, setAsrReady] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [redrawSlot, setRedrawSlot] = useState<{ levelId: string; slotIndex: number } | null>(null)
  const [levelFilter, setLevelFilter] = useState('')
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
    setHasLevel(dayHasPlayableContent(day))
    setMiniLevels(day.miniLevels || [])
    setPackTitle(day.pack?.title || '')
    setImages(day.images || [])
    setCompleted(Boolean(day.completed))
    if (dayHasMiniPack(day)) {
      void hydrateFamilyDayImages(day).then((hydrated) => {
        setMiniLevels(hydrated.miniLevels || [])
      })
    }
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

  useEffect(() => {
    if (!previewSrc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewSrc(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewSrc])

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

  async function requestMiniLevelImages(
    levels: FamilyMiniLevel[],
    opts?: { onlyMissingBg?: boolean; statusPrefix?: string },
  ): Promise<boolean> {
    const cloud = getImageCloudProvider()
    const cloudName = imageCloudLabel(cloud)
    const cloudKey = getImageCloudApiKey()
    const useDirect = isNativeApp() && Boolean(cloudKey)
    if (isNativeApp() && !nativeFamilyCloudReady(Boolean(cloudKey), getApiBase())) {
      setStatus(`关卡已保留；请到设置填写${cloudName} Key`)
      return false
    }
    const targets = levels.filter((m) => {
      if (!opts?.onlyMissingBg) return true
      return (
        miniLevelMissingImageSlots(
          m.level as unknown as Record<string, unknown>,
          effectiveScenePrompt(m),
          m.imageBg,
          m.itemImages,
        ).length > 0
      )
    })
    if (!targets.length) {
      setStatus(opts?.onlyMissingBg ? '各关背景与选项图已齐' : '没有需要配图的关卡')
      return true
    }

    // 中文场景词先翻成英文再配图（缓存到 scenePromptEn；失败回退中文）
    const llmKey = getLlmApiKey()
    if (llmKey) {
      const needTl = targets.filter(
        (m) => !m.scenePromptEn || m.scenePromptEn === effectiveScenePrompt(m),
      )
      if (needTl.length) {
        setStatus(`场景词翻译成英文中（${needTl.length} 关）…`)
        for (const m of needTl) {
          const src = effectiveScenePrompt(m)
          const en = await translateSceneToEnglish({ text: src, apiKey: llmKey, llm: getLlmProvider() }).catch(
            () => null,
          )
          if (en && en !== src) {
            cacheMiniLevelScenePromptEn(date, m.id, en)
            m.scenePromptEn = en
          }
        }
      }
    }

    const prefix = (opts?.statusPrefix || '').trim()
    const conc = Math.min(FAMILY_IMAGE_LEVEL_CONCURRENCY, targets.length)
    setImaging(true)
    setStatus(
      `${prefix}${cloudName}并行配图：共 ${targets.length} 关（同时 ${conc} 关，含选项图）…`.trim(),
    )
    try {
      let done = 0
      let failCount = 0
      // 并行完成后写 store 串行，避免 load/save 竞态丢图
      let persistTail: Promise<void> = Promise.resolve()
      const persistImages = (mini: FamilyMiniLevel, list: string[]) => {
        const run = async () => {
          const day = await setMiniLevelImages(date, mini.id, {
            imageBg: list[0] || mini.imageBg,
            itemImages: list.slice(1).filter(Boolean),
          })
          if (day) setMiniLevels(day.miniLevels || [])
        }
        const p = persistTail.then(run, run)
        persistTail = p.then(
          () => undefined,
          () => undefined,
        )
        return p
      }

      const fetchSlots = async (slots: ImageSlotLike[]) =>
        fetchSlotImages(slots, { date, cloud, cloudKey, useDirect })

      await mapPool(targets, conc, async (mini) => {
        const word = mini.level.target_words?.[0] || 'item'
        // 优先英文场景词（配图模型对英文更稳）；无缓存则用原文
        const scenePrompt = mini.scenePromptEn?.trim() || effectiveScenePrompt(mini)
        const slots = slotsForMiniLevel(
          mini.level as unknown as Record<string, unknown>,
          scenePrompt,
          5,
          mini.itemPrompts,
        )
        try {
          let list: string[]
          if (opts?.onlyMissingBg) {
            const existing = [mini.imageBg || '', ...(mini.itemImages || [])]
            while (existing.length < slots.length) existing.push('')
            const needIdx: number[] = []
            const needSlots = slots.filter((_, i) => {
              if (existing[i]) return false
              needIdx.push(i)
              return true
            })
            if (!needSlots.length) {
              done += 1
              return
            }
            const generated = await fetchSlots(needSlots)
            list = [...existing]
            needIdx.forEach((idx, j) => {
              if (generated[j]) list[idx] = generated[j]!
            })
          } else {
            list = await fetchSlots(slots)
          }
          await persistImages(mini, list)
          done += 1
          setStatus(
            `${prefix}${cloudName}配图 ${done}/${targets.length}：${word}（${slots.length} 张）`.trim(),
          )
        } catch (err) {
          failCount += 1
          done += 1
          const em = err instanceof Error ? err.message : String(err)
          const netAbort = /connection abort|SocketException|llm_timeout|ETIMEDOUT|abort/i.test(em)
          setStatus(
            netAbort
              ? `${prefix}${cloudName}配图 ${done}/${targets.length}：${word} 网络中断（继续并行，勿切 App）`.trim()
              : `${prefix}${cloudName}配图 ${done}/${targets.length}：${word} 出错（继续并行）`.trim(),
          )
        }
      })

      await persistTail
      if (failCount > 0) {
        setStatus(
          `配图结束（${cloudName}）：成功 ${targets.length - failCount}/${targets.length}，失败 ${failCount}。配图时勿切 App；Clash 请开 TUN 并把本 App 纳入代理`,
        )
        return failCount < targets.length
      }
      setStatus(`配图完成（${cloudName}，并行 ${targets.length} 关，含选项图）`)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/quota|exceeded/i.test(msg)) {
        setStatus(
          `关卡已保留；本机存储已满，配图已改为 IndexedDB 仍失败。请清理旧日记图后重试（${msg.slice(0, 80)}）`,
        )
      } else if (/connection abort|SocketException|llm_timeout|ETIMEDOUT|abort/i.test(msg)) {
        setStatus(
          `关卡已保留；${cloudName}网络中断（${msg.slice(0, 80)}）。Clash 请开 TUN 并勿切 App，可重试配图`,
        )
      } else {
        setStatus(`关卡已保留；${cloudName}配图出错（${msg}）`)
      }
      return false
    } finally {
      setImaging(false)
    }
  }

  async function autoFillImagesAfterGenerate(levels: FamilyMiniLevel[]) {
    if (!getAutoTongyiImages()) {
      setStatus('生成成功！可开「自动云端配图」，或按关编辑场景词后点「云端配图」')
      return
    }
    setBusy(false)
    await requestMiniLevelImages(levels, { onlyMissingBg: true })
  }

  async function generate(force = false) {
    const story = storyFromState(messages) || getDay(date)?.story || ''
    if (!story.trim()) {
      setStatus(isToday ? '请先发几条今日故事（打字或语音）' : `这一天（${date}）没有日记故事，无法重新生成；可回到今天补记`)
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
        if (existing?.completed && dayHasPlayableContent(existing)) {
          const ok = window.confirm(
            isToday
              ? '今天关卡孩子已经通关。确定覆盖并重置通关状态吗？'
              : `这一天（${date}）的关卡${existing.completed ? '已通关' : '已存在'}。确定覆盖并重置通关状态吗？`,
          )
          if (!ok) {
            setStatus('已取消覆盖')
            return
          }
          force = true
        }
      }
      const levelCount = getPackLevelCount()
      let levels: LevelScript[] = []
      let title = 'My Day'
      let photoHints: string[] = []
      let mainWords: string[] = []

      if (useDirect) {
        const payload = await generateFamilyPackDirect({
          story,
          date,
          apiKey: key,
          llm,
          levelCount,
        })
        console.log(
          '[family-llm] direct pack',
          JSON.stringify({
            provider: payload.provider,
            model: payload.model,
            mainWords: payload.mainWords,
            title: payload.title,
          }),
        )
        levels = payload.levels
        title = payload.title
        photoHints = payload.photoHints
        mainWords = payload.mainWords
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
            levelCount,
            minKeywords: levelCount,
            llm,
            mode: 'pack',
          },
          timeoutMs: 240_000,
        })
        const data = res.data
        console.log(
          '[family-llm] proxy pack',
          JSON.stringify({
            ok: res.ok,
            status: res.status,
            error: data.error || res.error,
            mainWords: data.mainWords,
          }),
        )
        if (!res.ok) {
          if (data.error === 'pack_levels_insufficient') {
            setStatus(
              `迷你关卡包关数不足。请再追加几句今日故事，或把设置里「今日关数」调低后重试。`,
            )
            return
          }
          const err = String(data.error || res.error || res.status)
          if (/timeout|deepseek_timeout|llm_timeout|Socket closed|SocketTimeout/i.test(err)) {
            setStatus(
              `生成超时：${familyLlmLabel(llm)} 在约 4 分钟内无响应。请确认外网后重试，或把「今日关数」调低。`,
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
        title = String((data.pack as { title?: string })?.title || data.title || 'My Day')
        levels = Array.isArray(data.levels) ? (data.levels as LevelScript[]) : []
        photoHints = (data.photoHints as string[]) || []
        mainWords = Array.isArray(data.mainWords) ? (data.mainWords as string[]) : []
      }

      const saved = saveGeneratedPack(date, {
        title,
        levels,
        photoHints,
        force,
      })
      if (!saved.ok) {
        setStatus('需要确认覆盖已通关内容')
        return
      }
      setHints(photoHints)
      setHasLevel(true)
      setMiniLevels(saved.day.miniLevels || [])
      setPackTitle(saved.day.pack?.title || title)
      setImages([])
      setCompleted(false)
      setStatus(
        `生成成功（${familyLlmLabel(llm)}，${levels.length} 关：${mainWords.join(', ') || '…'}）`,
      )
      await autoFillImagesAfterGenerate(saved.day.miniLevels || [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.startsWith('pack_levels_insufficient:')) {
        setStatus('迷你关卡包关数不足。请再追加几句今日故事后重试。')
        return
      }
      if (msg.startsWith('invalid_level')) {
        setStatus(`生成失败：模型返回的关卡不合格（${msg}）。可换一家模型再试。`)
        return
      }
      if (/timeout|llm_timeout|Socket closed|SocketTimeout/i.test(msg)) {
        setStatus(
          `生成超时：${familyLlmLabel(llm)} 在约 4 分钟内无响应。请确认外网后重试，或把今日关数调低。`,
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
    if (!dayHasMiniPack(day)) {
      setStatus('请先生成迷你关卡包')
      return
    }
    // 一次跑完全部关（不跳过已有图，便于改场景词后重画）
    await requestMiniLevelImages(day!.miniLevels || [])
  }

  async function regenerateMissingImages() {
    const day = getDay(date)
    if (!dayHasMiniPack(day)) {
      setStatus('请先生成迷你关卡包')
      return
    }
    await requestMiniLevelImages(day!.miniLevels || [], { onlyMissingBg: true })
  }

  async function refreshMiniLevels(day: FamilyDayRecord | null, statusText: string) {
    if (!day) return
    const hydrated = await hydrateFamilyDayImages(day)
    setMiniLevels(hydrated.miniLevels || [])
    setStatus(statusText)
  }

  function saveScenePrompt(levelId: string, value: string) {
    const day = setMiniLevelScenePrompt(date, levelId, value)
    if (day) {
      void refreshMiniLevels(day, '已保存场景词')
    } else {
      setStatus('场景词不能为空')
    }
  }

  function resetScenePrompt(levelId: string) {
    // 先让 textarea 失焦提交未保存的编辑（onBlur 保存是同步写盘），
    // 再执行重置，避免两次写入竞态；同时键盘先收起，减少 WebView resize 抖动
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body) active.blur()
    const day = resetMiniLevelScenePrompt(date, levelId)
    if (day) {
      void refreshMiniLevels(day, '已重置为关卡默认场景')
    }
  }


  /** 手动把某一关的（中文）场景词翻译成英文并缓存；失败回退原文 */
  async function translateOneScene(levelId: string) {
    const mini = getDay(date)?.miniLevels?.find((m) => m.id === levelId)
    if (!mini) return
    const src = effectiveScenePrompt(mini)
    const llmKey = getLlmApiKey()
    if (!llmKey) {
      setStatus('请先到「设置」填写 LLM API Key 才能翻译')
      return
    }
    setBusy(true)
    setStatus(`场景词翻译成英文中：${src.slice(0, 24)}…`)
    try {
      const en = await translateSceneToEnglish({
        text: src,
        apiKey: llmKey,
        llm: getLlmProvider(),
      }).catch(() => null)
      if (en && en !== src) {
        const day = cacheMiniLevelScenePromptEn(date, levelId, en)
        if (day) setMiniLevels(day.miniLevels || [])
        setStatus(`已翻译：${en}`)
      } else {
        setStatus(en ? '场景词已是英文，无需翻译' : '翻译失败，请稍后重试')
      }
    } finally {
      setBusy(false)
    }
  }

  /** 一键翻译所有含中文场景词的关卡 */
  async function translateAllScenes() {
    const day = getDay(date)
    if (!dayHasMiniPack(day)) {
      setStatus('请先生成迷你关卡包')
      return
    }
    const needTl = (day!.miniLevels || []).filter((m) =>
      sceneNeedsTranslation(effectiveScenePrompt(m)),
    )
    if (!needTl.length) {
      setStatus('所有场景词都已是英文，无需翻译')
      return
    }
    const llmKey = getLlmApiKey()
    if (!llmKey) {
      setStatus('请先到「设置」填写 LLM API Key 才能翻译')
      return
    }
    setBusy(true)
    let done = 0
    let okCount = 0
    for (const m of needTl) {
      const src = effectiveScenePrompt(m)
      setStatus(`场景词翻译成英文中（${done + 1}/${needTl.length}）：${src.slice(0, 20)}…`)
      const en = await translateSceneToEnglish({
        text: src,
        apiKey: llmKey,
        llm: getLlmProvider(),
      }).catch(() => null)
      if (en && en !== src) {
        const updated = cacheMiniLevelScenePromptEn(date, m.id, en)
        if (updated) setMiniLevels(updated.miniLevels || [])
        okCount += 1
      }
      done += 1
    }
    setBusy(false)
    setStatus(`翻译完成：${okCount}/${needTl.length} 关（配图时优先用英文场景词）`)
  }

  async function imageOneLevel(levelId: string) {
    const day = getDay(date)
    const mini = day?.miniLevels?.find((m) => m.id === levelId)
    if (!mini) return
    await requestMiniLevelImages([mini])
  }

  /** 单张重画：只重新生成该槽，不动其它图 */
  async function redrawOneSlot(mini: FamilyMiniLevel, slotIndex: number) {
    const day = getDay(date)
    const cur = day?.miniLevels?.find((m) => m.id === mini.id)
    if (!cur) return
    const cloud = getImageCloudProvider()
    const cloudName = imageCloudLabel(cloud)
    const cloudKey = getImageCloudApiKey()
    const useDirect = isNativeApp() && Boolean(cloudKey)
    if (isNativeApp() && !nativeFamilyCloudReady(Boolean(cloudKey), getApiBase())) {
      setStatus(`请到设置填写${cloudName} Key`)
      return
    }
    const sceneFinal = cur.scenePromptEn?.trim() || effectiveScenePrompt(cur)
    const slots = slotsForMiniLevel(
      cur.level as unknown as Record<string, unknown>,
      sceneFinal,
      5,
      cur.itemPrompts,
    )
    const slot = slots[slotIndex]
    if (!slot) return
    setRedrawSlot({ levelId: cur.id, slotIndex })
    setStatus(`${cloudName}重画第 ${slotIndex + 1} 张（${slot.subject}）…`)
    try {
      const images = await fetchSlotImages([slot], {
        date,
        cloud,
        cloudKey,
        useDirect,
      })
      const img = images[0]
      if (!img) throw new Error('生成结果为空')
      const updated = await setMiniLevelSlotImage(date, cur.id, slotIndex, img)
      if (updated) {
        const hydrated = await hydrateFamilyDayImages(updated)
        setMiniLevels(hydrated.miniLevels || [])
        setStatus(`已重画第 ${slotIndex + 1} 张（${slot.subject}）`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(`${cloudName}重画失败（${msg.slice(0, 80)}），可再试一次`)
    } finally {
      setRedrawSlot(null)
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!isToday && (
              <button
                type="button"
                className="ghost"
                onClick={() => setSearchParams({})}
              >
                回到今天
              </button>
            )}
            <button
              type="button"
              className="ghost settings-link"
              onClick={() => navigate(`/family/studio/settings${isToday ? '' : `?date=${date}`}`)}
            >
              设置
            </button>
          </div>
        </div>
        {!isToday && (
          <p className="muted" style={{ marginTop: -4 }}>
            正在编辑往日关卡：重新生成会覆盖这一天的关卡并重置通关状态
          </p>
        )}
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
          {busy ? '生成中…' : imaging ? '配图中…' : hasLevel ? '按日记重新生成' : '生成关卡'}
        </button>
        {hasLevel && (
          <p className="muted generate-meta">
            {isToday ? '今日' : `${date} `}已有迷你关卡包{packTitle ? `「${packTitle}」` : ''}
            {miniLevels.length ? ` · ${miniLevels.length} 关` : ''}
            {completed ? '（已全部通关）' : ''}
          </p>
        )}

        {hasLevel && miniLevels.length > 0 && (
          <div className="photo-block">
            <h2>迷你关卡包 · 配图</h2>
            <p className="muted">
              每关一词一景。可中英文编辑场景主题后再「云端配图」；道具词尽量保留英文主词，以免点图对不上。
            </p>
            {miniLevels.length > 3 && (
              <input
                type="search"
                className="family-search-box"
                placeholder="按主词 / 标题 / 场景词过滤本包关卡…"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                aria-label="过滤本包关卡"
                style={{ width: '100%', marginBottom: 10 }}
              />
            )}
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
            <div className="row photo-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || imaging || recording || transcribing}
                onClick={() => void regenerateImages()}
              >
                {imaging ? '配图中…' : '全部配图'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy || imaging || recording || transcribing}
                onClick={() => void regenerateMissingImages()}
              >
                只补缺图
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy || imaging || recording || transcribing}
                onClick={() => void translateAllScenes()}
              >
                场景词译英文
              </button>
              <button type="button" className="ghost" onClick={() => navigate(`/family/${date}`)}>
                预览关列表
              </button>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              点「全部配图」会按关排队生成（慢属正常），不用一关关点。
            </p>
            <ul className="mini-level-edit" style={{ listStyle: 'none', padding: 0 }}>
              {miniLevels
                .filter((m) => {
                  const q = levelFilter.trim().toLowerCase()
                  if (!q) return true
                  const word = (m.level.target_words?.[0] || '').toLowerCase()
                  const hay = [
                    word,
                    m.level.title || '',
                    effectiveScenePrompt(m),
                    m.scenePromptEn || '',
                  ]
                    .join(' ')
                    .toLowerCase()
                  return hay.includes(q)
                })
                .map((m, i) => {
                  const word = m.level.target_words?.[0] || m.id
                  return (
                  <li
                    key={m.id}
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      border: '1px solid #e8dcc8',
                      borderRadius: 12,
                    }}
                  >
                    <strong>
                      {i + 1}. {m.level.title || word}
                    </strong>
                    <span className="muted" style={{ display: 'block', marginBottom: 6 }}>
                      主词 {word}
                      {m.completed ? ' · 已通关' : ''}
                    </span>
                    <label className="muted" style={{ display: 'block', fontSize: 13 }}>
                      场景主题（可中文，配图时自动译成英文）
                    </label>
                    {m.scenePromptEn?.trim() && (
                      <span
                        className="muted"
                        style={{ display: 'block', fontSize: 12, marginBottom: 4 }}
                      >
                        已译英文：{m.scenePromptEn}
                      </span>
                    )}
                    <textarea
                      defaultValue={effectiveScenePrompt(m)}
                      key={`${m.id}-${effectiveScenePrompt(m)}`}
                      rows={3}
                      onFocus={(e) => e.currentTarget.dataset.editing = '1'}
                      onChange={(e) => {
                        // 输入中标记，避免重渲染时被 defaultValue 重置
                        e.currentTarget.dataset.editing = '1'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.dataset.editing = '0'
                        const next = e.target.value.trim()
                        if (next && next !== effectiveScenePrompt(m)) {
                          saveScenePrompt(m.id, next)
                        }
                      }}
                      style={{
                        width: '100%',
                        marginBottom: 8,
                        minHeight: 72,
                        fontSize: 16,
                        lineHeight: 1.4,
                        padding: '10px 12px',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                    <div className="row">
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy || imaging}
                        onClick={() => resetScenePrompt(m.id)}
                      >
                        恢复默认场景
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy || imaging}
                        onClick={() => void translateOneScene(m.id)}
                      >
                        翻译成英文
                      </button>
                      <button
                        type="button"
                        disabled={busy || imaging}
                        onClick={() => void imageOneLevel(m.id)}
                      >
                        配图本关
                      </button>
                    </div>
                    {(() => {
                      const slots = slotsForMiniLevel(
                        m.level as unknown as Record<string, unknown>,
                        effectiveScenePrompt(m),
                        5,
                        m.itemPrompts,
                      )
                      const slotImages = [m.imageBg || '', ...(m.itemImages || [])]
                      return (
                        <div className="slot-grid" style={{ marginTop: 8 }}>
                          {slots.map((slot, si) => {
                            const finalPrompt = buildKidsPrompt(slot)
                            const subject = slot.subject
                            const img = slotImages[si] || ''
                            const redrawing = redrawSlot?.levelId === m.id && redrawSlot.slotIndex === si
                            return (
                              <div key={si} className="slot-card">
                                <div className="slot-head">
                                  <span className="slot-role">{slotRoleLabel(slots, si)}</span>
                                  {redrawing && <span className="slot-redrawing">重画中…</span>}
                                </div>
                                {img ? (
                                  <button
                                    type="button"
                                    className="photo-thumb photo-thumb-btn"
                                    onClick={() => setPreviewSrc(img)}
                                    aria-label={`${slotRoleLabel(slots, si)}放大查看`}
                                  >
                                    <img src={img} alt="" />
                                  </button>
                                ) : (
                                  <div className="photo-thumb slot-empty" aria-hidden>
                                    缺图
                                  </div>
                                )}
                                <details className="slot-prompt-box">
                                  <summary>画图提示词</summary>
                                  <p className="slot-prompt-full">{finalPrompt}</p>
                                  <label className="muted" style={{ fontSize: 12 }}>
                                    主体（可改：如把 cake 换成 birthday cake）
                                  </label>
                                  <input
                                    type="text"
                                    defaultValue={subject}
                                    key={`${m.id}-${si}-${subject}`}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim()
                                      if (si > 0 && v !== subject) {
                                        const day = setMiniLevelItemPrompt(date, m.id, si, v)
                                        if (day) void refreshMiniLevels(day, '已保存主体词，可点重画更新这张图')
                                      }
                                    }}
                                    disabled={si === 0}
                                    style={{ width: '100%', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' }}
                                  />
                                  {si === 0 && (
                                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                                      背景主体在上方「场景主题」里编辑
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    className="ghost"
                                    disabled={busy || imaging || redrawing}
                                    onClick={() => void redrawOneSlot(m, si)}
                                    style={{ marginTop: 6, width: '100%' }}
                                  >
                                    {img ? '重画这张' : '补画这张'}
                                  </button>
                                </details>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </li>
                )
              })}
            </ul>
            <div className="row photo-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="primary"
                disabled={busy || imaging || recording || transcribing}
                onClick={() => void regenerateImages()}
              >
                {imaging ? '配图中…' : '全部配图'}
              </button>
            </div>
          </div>
        )}

        {hasLevel && miniLevels.length === 0 && (
          <div className="photo-block">
            <h2>关卡配图（旧单关）</h2>
            <p className="muted">这天仍是旧版一天一关数据。重新「生成关卡」可升级为迷你 pack。</p>
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
            </div>
            {images.length > 0 && (
              <div className="photo-thumbs">
                {images.map((src, i) => (
                  <div key={`${i}-${src.slice(0, 24)}`} className="photo-thumb">
                    <button
                      type="button"
                      className="photo-thumb-btn photo-thumb-fill"
                      onClick={() => setPreviewSrc(src)}
                      aria-label={`第 ${i + 1} 张放大查看`}
                    >
                      <img src={src} alt={`已选 ${i + 1}`} />
                    </button>
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

      {previewSrc && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setPreviewSrc(null)}
        >
          <button
            type="button"
            className="image-lightbox-close"
            aria-label="关闭预览"
            onClick={() => setPreviewSrc(null)}
          >
            ×
          </button>
          <img
            src={previewSrc}
            alt="放大预览"
            className="image-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
