import { useEffect, useMemo, useState } from 'react'
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
  logoutParent,
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
  const [captchaOn, setCaptchaOn] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [accountMsg, setAccountMsg] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const plusActive = Boolean(me?.plus)

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
    void fetchAuthConfig().then(async (cfg) => {
      if (cancelled) return
      setCaptchaOn(cfg.captcha)
      if (cfg.captcha) await loadCaptcha()
    })
    return () => {
      cancelled = true
    }
  }, [gated, me])

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
    setAccountMsg(
      res.ok
        ? res.data.mock
          ? '验证码已写入本机 API 日志（mock 默认 123456）'
          : '验证码已发送到邮箱'
        : res.error === 'email_rate_limited'
          ? '发送太频繁，请稍后再试'
          : res.error === 'auth_ip_rate_limited' || res.error === 'sms_ip_rate_limited'
            ? '该网络发送过于频繁，请稍后再试'
            : res.error === 'invalid_email'
              ? '请填写有效邮箱'
              : res.error === 'email_ses_not_configured' || res.error === 'email_smtp_not_configured'
                ? '邮件服务未配置。个人实名腾讯云 SES 需走 API（不能 SMTP），请联系管理员'
                : res.error?.startsWith('email_ses_failed:') || res.error?.startsWith('email_smtp_failed:')
                  ? '验证码邮件发送失败，请稍后重试'
                  : res.error === 'captcha_required'
                    ? '请先完成图形验证'
                    : res.error === 'captcha_invalid'
                      ? '图形验证码错误，请重试'
                      : `发送失败：${res.error || res.status}`,
    )
  }

  async function onVerifyCode() {
    setAccountBusy(true)
    setAccountMsg('')
    const res = await verifyParentEmail(loginEmail, loginCode)
    setAccountBusy(false)
    if (!res.ok) {
      setAccountMsg(res.error === 'invalid_code' ? '验证码错误或已过期' : `登录失败：${res.error || res.status}`)
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
        <h2>家长账号与 Plus</h2>
        <p className="muted">
          Plus 只解锁家庭日记 / 每日关卡工作室，不含第三方模型调用费。日记生成需家长在本机自备供应商
          Key。
        </p>
        {me ? (
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
                  <img src={captchaImage} alt="图形验证码" width={140} height={48} />
                ) : (
                  <span className="muted">验证码加载中…</span>
                )}
                <button type="button" className="linkish" disabled={accountBusy} onClick={() => void loadCaptcha()}>
                  换一张
                </button>
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
            <div className="row-actions">
              <button type="button" disabled={accountBusy} onClick={() => void onSendCode()}>
                发送验证码
              </button>
            </div>
            <label>
              验证码
              <input
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                inputMode="numeric"
                placeholder="6 位验证码"
              />
            </label>
            <button type="button" disabled={accountBusy} onClick={() => void onVerifyCode()}>
              登录
            </button>
            <p className="muted">验证码发到该邮箱。生产环境走腾讯云 SES API（个人实名账号不能用 SMTP）。</p>
          </div>
        )}
        <div className="plus-plans">
          {(plans?.plans || [
            { id: 'month' as const, priceFen: 1800, days: 30 },
            { id: 'year' as const, priceFen: 14800, days: 365 },
          ]).map((p) => (
            <div key={p.id} className="plus-plan-card">
              <strong>{p.id === 'year' ? '包年' : '包月'}</strong>
              <span>
                {formatFen(p.priceFen)} / {p.id === 'year' ? '年' : '月'}
              </span>
              {plans?.provider === 'wechat' && me ? (
                <button type="button" disabled={accountBusy} onClick={() => void onBuy(p.id)}>
                  开通
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {plans?.provider !== 'wechat' && (
          <p className="muted">在线支付尚未开放。开通请联系管理员按邮箱开通 Plus，请勿在儿童路径操作。</p>
        )}
        {accountMsg && <p className="muted">{accountMsg}</p>}
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
