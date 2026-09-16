import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl, listPackIds, loadPack } from '../content/loader'
import { listDaysWithLevels } from '../family/store'
import {
  getPackProgress,
  getTodayPlaySeconds,
  loadProgress,
  PACK_LABELS_ZH,
  updateSettings,
} from '../progress/store'
import {
  defaultVoicePrefs,
  loadVoicePrefs,
  saveVoicePrefs,
  TTS_ENGINE_OPTIONS,
  VOICE_PERSONA_OPTIONS,
  type TtsEngine,
  type VoicePersona,
  type VoicePrefs,
} from '../voice/prefs'
import { Capacitor } from '@capacitor/core'
import { requestTts } from '../voice/client'
import { ensurePiperReady } from '../voice/piperTts'
import type { ContentPack, ProgressState } from '../types'
import {
  createBillingOrder,
  deleteParentAccount,
  fetchAuthConfig,
  fetchBillingPlans,
  fetchMe,
  fetchSmsCaptcha,
  formatFen,
  isMembershipConnectFailure,
  logoutParent,
  parentEmailSendMessage,
  sendParentEmail,
  verifyParentEmail,
  type BillingPlans,
  type MeResponse,
} from '../api/membership'
import './parent.css'

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

export function ParentPage({ progress, onProgress }: Props) {
  const navigate = useNavigate()
  const [gated, setGated] = useState(false)
  const [packs, setPacks] = useState<ContentPack[]>([])
  const [a] = useState(() => 2 + Math.floor(Math.random() * 5))
  const [b] = useState(() => 2 + Math.floor(Math.random() * 5))
  const [answer, setAnswer] = useState('')
  const [limit, setLimit] = useState(
    progress.dailyLimitMinutes == null ? '' : String(progress.dailyLimitMinutes),
  )
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(() => loadVoicePrefs())
  const [voiceSaved, setVoiceSaved] = useState('')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [plans, setPlans] = useState<BillingPlans | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const [captchaOn, setCaptchaOn] = useState(true)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [accountMsg, setAccountMsg] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [resendUntil, setResendUntil] = useState(0)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const codeInputRef = useRef<HTMLInputElement>(null)
  const plusActive = Boolean(me?.plus)
  const resendLeft = Math.max(0, Math.ceil((resendUntil - nowTick) / 1000))

  useEffect(() => {
    listPackIds()
      .then((ids) => Promise.all(ids.map(loadPack)))
      .then(setPacks)
      .catch(() => setPacks([]))
  }, [])

  useEffect(() => {
    if (!gated) return
    void fetchMe().then(setMe)
    void fetchBillingPlans().then(setPlans)
  }, [gated])

  async function loadCaptcha() {
    const challenge = await fetchSmsCaptcha()
    setCaptchaId(challenge?.id || '')
    setCaptchaImage(challenge?.image || '')
    setCaptchaAnswer('')
  }

  useEffect(() => {
    if (!gated || me) return
    let cancelled = false
    void loadCaptcha()
    void fetchAuthConfig().then((cfg) => {
      if (cancelled) return
      if (!cfg.ok) return
      setCaptchaOn(cfg.captcha)
    })
    return () => {
      cancelled = true
    }
  }, [gated, me])

  useEffect(() => {
    if (resendUntil <= Date.now()) return
    const id = window.setInterval(() => setNowTick(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [resendUntil])

  useEffect(() => {
    if (!gated || !Capacitor.isNativePlatform()) return
    if (loadVoicePrefs().ttsEngine !== 'piper') return
    void ensurePiperReady().catch(() => {
      // 试听前预热；失败则 requestTts 降级系统 TTS
    })
  }, [gated])

  const todayMin = useMemo(
    () => Math.round(getTodayPlaySeconds(progress) / 60),
    [progress],
  )

  const recentDays = useMemo(() => listDaysWithLevels().slice(0, 5), [gated])

  function onGate(e: FormEvent) {
    e.preventDefault()
    if (Number(answer) === a + b) setGated(true)
  }

  function saveLimit() {
    const minutes = limit.trim() === '' ? null : Number(limit)
    const next = updateSettings(loadProgress(), {
      dailyLimitMinutes: minutes != null && !Number.isNaN(minutes) ? minutes : null,
    })
    onProgress(next)
  }

  function patchVoice(partial: Partial<VoicePrefs>) {
    const next = { ...voicePrefs, ...partial }
    setVoicePrefs(next)
    saveVoicePrefs(next)
    setVoiceSaved('已保存，关卡里马上生效')
  }

  async function onSendCode() {
    setAccountBusy(true)
    setAccountMsg('')
    const res = await sendParentEmail(
      loginEmail,
      captchaOn || captchaId ? { captchaId, captchaAnswer } : undefined,
    )
    if (res.error === 'captcha_required' || res.error === 'captcha_invalid') {
      setCaptchaOn(true)
      await loadCaptcha()
    } else if (res.ok && captchaOn) {
      await loadCaptcha()
    }
    setAccountBusy(false)
    setAccountMsg(parentEmailSendMessage(res))
    if (res.ok) {
      setResendUntil(Date.now() + 60_000)
      setNowTick(Date.now())
      codeInputRef.current?.focus()
    }
  }

  async function onVerifyCode() {
    setAccountBusy(true)
    setAccountMsg('')
    const res = await verifyParentEmail(loginEmail, loginCode)
    setAccountBusy(false)
    if (!res.ok) {
      setAccountMsg(
        res.error === 'invalid_code'
          ? '验证码错误或已过期'
          : isMembershipConnectFailure(res.error || '')
            ? '连不上会员服务，请检查网络后重试'
            : '登录失败，请稍后重试',
      )
      return
    }
    const next = await fetchMe()
    setMe(next)
    setAccountMsg('已登录')
  }

  async function onLogout() {
    await logoutParent()
    setMe(null)
    setAccountMsg('已退出')
  }

  async function onDeleteAccount() {
    if (
      !window.confirm(
        '确定注销账号？会员资格无法恢复。本机日记与供应商 Key 仍留在这台设备，不会当作云端备份删除。',
      )
    ) {
      return
    }
    const res = await deleteParentAccount()
    setMe(null)
    setAccountMsg(res.ok ? '账号已注销' : `注销失败：${res.error}`)
  }

  async function onBuy(plan: 'month' | 'year') {
    if (plans?.provider !== 'wechat') return
    setAccountBusy(true)
    const res = await createBillingOrder(plan)
    setAccountBusy(false)
    if (!res.ok) {
      setAccountMsg(res.error === 'unauthorized' ? '请先登录' : `下单失败：${res.error}`)
      return
    }
    const pay = res.data.pay as { unavailable?: boolean; prepay?: { codeUrl?: string } } | undefined
    if (pay?.unavailable) {
      setAccountMsg('微信支付商户尚未配置完成')
      return
    }
    if (pay?.prepay?.codeUrl) {
      setAccountMsg(`请用微信扫码支付：${pay.prepay.codeUrl}`)
      return
    }
    setAccountMsg('已创建订单，请在微信中完成支付')
  }

  async function previewVoice() {
    saveVoicePrefs(voicePrefs)
    setVoiceSaved('试听中…')
    await requestTts("Hi! Let's play. Say apple!")
    setVoiceSaved('已保存，关卡里马上生效')
  }

  if (!gated) {
    return (
      <div className="parent-screen parent-gate">
        <img className="parent-hero-img" src={assetUrl('assets/characters/bunny.png')} alt="" />
        <h1>家长入口</h1>
        <p>请先完成简单验证</p>
        <form onSubmit={onGate}>
          <label>
            {a} + {b} = ?
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} inputMode="numeric" />
          </label>
          <button type="submit">进入</button>
        </form>
        <button type="button" className="linkish" onClick={() => navigate('/')}>
          返回
        </button>
      </div>
    )
  }

  return (
    <div className="parent-screen">
      <header className="parent-header">
        <img className="parent-avatar" src={assetUrl('assets/characters/bunny.png')} alt="" />
        <div>
          <h1>家长中心</h1>
          <p className="muted">今日已玩约 {todayMin} 分钟 · 星星 {progress.stars}</p>
        </div>
      </header>

      <section className="parent-plus">
        <h2>家长账号</h2>
        {me ? (
          <>
            <div className="plus-status">
              <p>
                已登录 {me.email || me.phone || ''} · {plusActive ? 'Plus 有效' : '尚未开通 Plus'}
                {me.expiresAt ? ` · 到期 ${me.expiresAt.slice(0, 10)}` : ''}
              </p>
              <div className="row-actions">
                <button type="button" className="linkish" onClick={() => void onLogout()}>
                  退出登录
                </button>
                <button type="button" className="linkish" onClick={() => void onDeleteAccount()}>
                  注销账号
                </button>
              </div>
            </div>
            <details className="plus-fold">
              <summary>Plus</summary>
              <p className="muted">
                Plus 只解锁家庭日记 / 每日关卡工作室，不含第三方模型调用费。日记生成需本机自备供应商
                Key。
              </p>
              {plans?.provider === 'wechat' ? (
                <div className="plus-plans">
                  {(plans.plans || []).map((p) => (
                    <div key={p.id} className="plus-plan-card">
                      <strong>{p.id === 'year' ? '包年' : '包月'}</strong>
                      <span>
                        {formatFen(p.priceFen)} / {p.id === 'year' ? '年' : '月'}
                      </span>
                      <button type="button" disabled={accountBusy} onClick={() => void onBuy(p.id)}>
                        开通
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">在线支付尚未开放。开通请联系管理员。</p>
              )}
            </details>
          </>
        ) : (
          <div className="plus-login">
            <label>
              邮箱
              <input
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="家长邮箱"
              />
            </label>
            {captchaOn && (
              <div className="plus-captcha">
                {captchaImage ? (
                  <button
                    type="button"
                    className="plus-captcha-image"
                    disabled={accountBusy}
                    onClick={() => void loadCaptcha()}
                    aria-label="刷新图形验证码"
                  >
                    <img src={captchaImage} alt="图形验证码" width={140} height={48} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="plus-captcha-placeholder"
                    disabled={accountBusy}
                    onClick={() => void loadCaptcha()}
                  >
                    点此刷新图形验证码
                  </button>
                )}
                <label>
                  图形验证码
                  <input
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="图片中的数字"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              className="plus-send"
              disabled={accountBusy || resendLeft > 0}
              onClick={() => void onSendCode()}
            >
              {resendLeft > 0 ? `重新发送（${resendLeft}）` : '发送验证码'}
            </button>
            <label>
              验证码
              <input
                ref={codeInputRef}
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 位验证码"
              />
            </label>
            <button type="button" className="plus-login-submit" disabled={accountBusy} onClick={() => void onVerifyCode()}>
              登录
            </button>
          </div>
        )}
        {accountMsg && (
          <p className={`account-msg${/已发到邮箱|已登录|已退出|已注销/.test(accountMsg) ? ' ok' : ''}`}>
            {accountMsg}
          </p>
        )}
      </section>

      <div className="parent-card-grid">
        <button
          type="button"
          className={`parent-feature-card${plusActive ? '' : ' locked'}`}
          onClick={() => navigate('/family/studio')}
        >
          <img src={assetUrl('assets/scenes/friend-park.png')} alt="" />
          <span className="card-label">
            <strong>家庭日记</strong>
            <small>
              {plusActive ? '聊今天 · 生成英语小关' : '需 Plus 才能生成新关'}
            </small>
          </span>
        </button>
        <button
          type="button"
          className="parent-feature-card"
          onClick={() => navigate('/family')}
        >
          <img src={assetUrl('assets/scenes/orchard.png')} alt="" />
          <span className="card-label">
            <strong>家庭日历</strong>
            <small>查看与玩每日关卡</small>
          </span>
        </button>
      </div>

      {recentDays.length > 0 && (
        <section className="parent-recent">
          <h2>最近日记关卡</h2>
          <ul className="family-day-cards">
            {recentDays.map((d) => (
              <li key={d.date}>
                <button type="button" onClick={() => navigate(`/family/${d.date}/play`)}>
                  <img
                    src={
                      d.images[0] ||
                      d.level?.scene?.image ||
                      assetUrl('assets/scenes/map.png')
                    }
                    alt=""
                  />
                  <span>
                    {d.date}
                    {d.completed ? ' · 已通关' : ' · 未通关'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="parent-voice">
        <div className="section-head">
          <img src={assetUrl('assets/scenes/beep-hall.png')} alt="" className="section-thumb" />
          <div>
            <h2>英语朗读声音</h2>
            <p className="muted">
              Amy=女声线，Danny=男声线；小男孩是 Danny 拉高音调（库内无真童声）
            </p>
          </div>
        </div>
        <div className="voice-engine">
          <p className="voice-engine-label">朗读引擎（仅 App）</p>
          <div className="voice-grid voice-grid-engine">
            {TTS_ENGINE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`voice-chip ${voicePrefs.ttsEngine === opt.id ? 'active' : ''}`}
                onClick={() => {
                  patchVoice({ ttsEngine: opt.id as TtsEngine })
                  if (opt.id === 'piper' && Capacitor.isNativePlatform()) {
                    void ensurePiperReady().catch(() => undefined)
                  }
                }}
              >
                {opt.label}
                <small>{opt.hint}</small>
              </button>
            ))}
          </div>
          {!Capacitor.isNativePlatform() && (
            <p className="muted">浏览器联调始终用系统朗读；此选项在安装 App 后生效。</p>
          )}
          {Capacitor.getPlatform() === 'ios' && (
            <p className="muted">
              iOS 需先用 Mac 执行 npm run build:ios（拉 Piper 模型）。未就绪时会自动降级系统 TTS。
            </p>
          )}
        </div>
        <div className="voice-grid">
          {VOICE_PERSONA_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`voice-chip ${voicePrefs.persona === opt.id ? 'active' : ''}`}
              onClick={() => patchVoice({ persona: opt.id as VoicePersona })}
            >
              {opt.label}
              <small>{opt.hint}</small>
            </button>
          ))}
        </div>
        <div className="voice-sliders">
          <label>
            语速微调（{voicePrefs.rateBoost >= 0 ? '+' : ''}
            {voicePrefs.rateBoost.toFixed(2)}）
            <input
              type="range"
              min={-0.25}
              max={0.25}
              step={0.05}
              value={voicePrefs.rateBoost}
              onChange={(e) => patchVoice({ rateBoost: Number(e.target.value) })}
            />
          </label>
          <label>
            音调微调（{voicePrefs.pitchBoost >= 0 ? '+' : ''}
            {voicePrefs.pitchBoost.toFixed(2)}）
            <input
              type="range"
              min={-0.35}
              max={0.35}
              step={0.05}
              value={voicePrefs.pitchBoost}
              onChange={(e) => patchVoice({ pitchBoost: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="row-actions">
          <button type="button" onClick={() => void previewVoice()}>
            试听
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              const d = defaultVoicePrefs()
              setVoicePrefs(d)
              saveVoicePrefs(d)
              setVoiceSaved('已恢复默认（小女孩）')
            }}
          >
            恢复默认
          </button>
        </div>
        {voiceSaved && <p className="muted">{voiceSaved}</p>}
      </section>

      <section className="parent-packs">
        <h2>主题进度</h2>
        <div className="pack-progress-grid">
          {packs.map((pack) => {
            const pp = getPackProgress(progress, pack.id)
            return (
              <button
                key={pack.id}
                type="button"
                className="pack-progress-card"
                onClick={() => navigate(`/map/${pack.id}`)}
              >
                <img src={assetUrl(pack.homeImage || pack.mapImage)} alt="" />
                <span>
                  <strong>{PACK_LABELS_ZH[pack.id] || pack.title}</strong>
                  <small>
                    通关 {pp.completed.length} · 贴纸 {pp.stickers.length}
                  </small>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2>每日时长上限（分钟）</h2>
        <p className="muted">留空表示不限制</p>
        <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
        <button type="button" onClick={saveLimit}>
          保存
        </button>
      </section>

      <button type="button" className="home-back" onClick={() => navigate('/')}>
        返回首页
      </button>
    </div>
  )
}
