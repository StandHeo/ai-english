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
  getApiBase,
  isOfficialApiBase,
  PRODUCTION_API_BASE,
  switchToOfficialApiBase,
} from '../api/base'
import {
  createBillingOrder,
  deleteParentAccount,
  fetchAuthConfig,
  fetchBillingPlans,
  fetchMe,
  fetchSmsCaptcha,
  formatFen,
  logoutParent,
  PLUS_ADMIN_WECHAT_HINT,
  sendParentEmail,
  verifyParentEmail,
  type BillingPlans,
  type MeResponse,
} from '../api/membership'
import { parentSendErrorMessage, parentVerifyErrorMessage } from '../api/parentAuthMessage'
import {
  UPDATE_ACTION_LABEL,
  UPDATE_AVAILABLE_LABEL,
  UPDATE_INSTALL_HINT,
  UPDATE_LATER_LABEL,
  checkForSideloadUpdate,
  downloadAndInstallApk,
  installResultHint,
  type AppVersionManifest,
} from '../appUpdate/sideload'
import './parent.css'

const SEND_COOLDOWN_SEC = 60

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
  const [accountTone, setAccountTone] = useState<'ok' | 'err' | ''>('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [sendWait, setSendWait] = useState(0)
  const [apiHint, setApiHint] = useState('')
  const [plusDetailsOpen, setPlusDetailsOpen] = useState(false)
  const [accountManageOpen, setAccountManageOpen] = useState(false)
  const [updateOffer, setUpdateOffer] = useState<AppVersionManifest | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateHint, setUpdateHint] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)
  const plusActive = Boolean(me?.plus)
  const planList = plans?.plans || [
    { id: 'month' as const, priceFen: 1800, days: 30 },
    { id: 'year' as const, priceFen: 14800, days: 365 },
  ]
  const monthPlan = planList.find((p) => p.id === 'month')
  const yearPlan = planList.find((p) => p.id === 'year')
  const manualPay = plans?.provider !== 'wechat'

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
    void (async () => {
      setApiHint(isOfficialApiBase() ? '' : getApiBase())
      const cfg = await fetchAuthConfig()
      if (cancelled) return
      setApiHint(isOfficialApiBase() ? '' : getApiBase())
      setCaptchaOn(cfg.captcha)
      if (cfg.captcha) await loadCaptcha()
    })()
    return () => {
      cancelled = true
    }
  }, [gated, me])

  useEffect(() => {
    if (sendWait <= 0) return
    const t = window.setTimeout(() => setSendWait((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [sendWait])

  useEffect(() => {
    if (!gated) return
    let cancelled = false
    void checkForSideloadUpdate().then((offer) => {
      if (!cancelled) setUpdateOffer(offer)
    })
    return () => {
      cancelled = true
    }
  }, [gated])

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

  function showAccount(text: string, tone: 'ok' | 'err' | '' = '') {
    setAccountMsg(text)
    setAccountTone(tone)
  }

  async function onSendCode() {
    if (sendWait > 0) return
    setAccountBusy(true)
    showAccount('', '')
    const res = await sendParentEmail(
      loginEmail,
      captchaOn || captchaId ? { captchaId, captchaAnswer } : undefined,
    )
    setApiHint(isOfficialApiBase() ? '' : getApiBase())
    if (res.error === 'captcha_required' || res.error === 'captcha_invalid') {
      setCaptchaOn(true)
      await loadCaptcha()
    } else if (res.ok && captchaOn) {
      void loadCaptcha()
    }
    setAccountBusy(false)
    if (res.ok) {
      setSendWait(SEND_COOLDOWN_SEC)
      showAccount('验证码已发送到邮箱', 'ok')
      requestAnimationFrame(() => codeInputRef.current?.focus())
      return
    }
    showAccount(parentSendErrorMessage(res.error), 'err')
  }

  async function onVerifyCode() {
    setAccountBusy(true)
    showAccount('', '')
    const res = await verifyParentEmail(loginEmail, loginCode)
    setAccountBusy(false)
    if (!res.ok) {
      showAccount(parentVerifyErrorMessage(res.error), 'err')
      return
    }
    const next = await fetchMe()
    setMe(next)
    showAccount('已登录', 'ok')
  }

  async function onLogout() {
    await logoutParent()
    setMe(null)
    showAccount('已退出', 'ok')
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
    showAccount(res.ok ? '账号已注销' : '注销失败，请稍后重试', res.ok ? 'ok' : 'err')
  }

  async function onBuy(plan: 'month' | 'year') {
    if (plans?.provider !== 'wechat') return
    setAccountBusy(true)
    const res = await createBillingOrder(plan)
    setAccountBusy(false)
    if (!res.ok) {
      showAccount(res.error === 'unauthorized' ? '请先登录' : '下单失败，请稍后重试', 'err')
      return
    }
    const pay = res.data.pay as { unavailable?: boolean; prepay?: { codeUrl?: string } } | undefined
    if (pay?.unavailable) {
      showAccount('微信支付商户尚未配置完成', 'err')
      return
    }
    if (pay?.prepay?.codeUrl) {
      showAccount(`请用微信扫码支付：${pay.prepay.codeUrl}`, 'ok')
      return
    }
    showAccount('已创建订单，请在微信中完成支付', 'ok')
  }

  async function onUpgrade() {
    if (!updateOffer || updateBusy) return
    setUpdateBusy(true)
    setUpdateHint('')
    try {
      const result = await downloadAndInstallApk(updateOffer.apkUrl)
      setUpdateHint(installResultHint(result.mode))
    } catch {
      setUpdateHint('暂时无法开始下载，请稍后再试。')
    } finally {
      setUpdateBusy(false)
    }
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

      {updateOffer && !updateDismissed ? (
        <section className="parent-update" aria-label={UPDATE_AVAILABLE_LABEL}>
          <h2>{UPDATE_AVAILABLE_LABEL}</h2>
          <p>
            {updateOffer.versionName}
            {updateOffer.notes ? ` · ${updateOffer.notes}` : ''}
          </p>
          <p className="muted">{UPDATE_INSTALL_HINT}</p>
          {updateHint ? <p className="muted">{updateHint}</p> : null}
          <div className="row-actions">
            <button type="button" disabled={updateBusy} onClick={() => void onUpgrade()}>
              {updateBusy ? '正在下载…' : UPDATE_ACTION_LABEL}
            </button>
            <button type="button" className="linkish" onClick={() => setUpdateDismissed(true)}>
              {UPDATE_LATER_LABEL}
            </button>
          </div>
        </section>
      ) : null}

      <section className="parent-plus">
        <h2>账号与 Plus</h2>
        <div className="plus-status-bar">
          {me ? (
            <>
              <p className="plus-account-line">{me.email || me.phone || '已登录'}</p>
              <p className={`plus-badge ${plusActive ? 'on' : 'off'}`}>
                {plusActive
                  ? `Plus 有效${me.expiresAt ? ` · ${me.expiresAt.slice(0, 10)} 到期` : ''}`
                  : '尚未开通 Plus'}
              </p>
            </>
          ) : (
            <p className="plus-badge off">未登录 · 生成新关需要 Plus</p>
          )}
          {accountMsg ? <p className={`plus-feedback ${accountTone}`}>{accountMsg}</p> : null}
        </div>

        {me ? (
          <div className="plus-account-actions">
            {!plusActive && manualPay && (
              <p className="plus-activate-hint">开通请加{PLUS_ADMIN_WECHAT_HINT}</p>
            )}
            {!plusActive && !manualPay && (
              <div className="plus-plans">
                {planList.map((p) => (
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
            )}
            <div className="plus-account-manage">
              <button
                type="button"
                className="plus-details-toggle"
                aria-expanded={accountManageOpen}
                onClick={() => setAccountManageOpen((v) => !v)}
              >
                {accountManageOpen ? '▾' : '▸'} 账户管理
              </button>
              {accountManageOpen && (
                <div className="plus-account-manage-body">
                  <button
                    type="button"
                    className="plus-account-link"
                    onClick={() => void onLogout()}
                  >
                    退出登录
                  </button>
                  <button
                    type="button"
                    className="plus-account-link danger"
                    onClick={() => void onDeleteAccount()}
                  >
                    注销账号
                  </button>
                </div>
              )}
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
                <button
                  type="button"
                  className="plus-captcha-img"
                  disabled={accountBusy}
                  onClick={() => void loadCaptcha()}
                  aria-label="换一张图形验证码"
                >
                  {captchaImage ? (
                    <img src={captchaImage} alt="图形验证码" width={120} height={44} />
                  ) : (
                    <span>点此刷新</span>
                  )}
                </button>
                <input
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="图形验证码"
                  placeholder="图中数字"
                />
              </div>
            )}
            <button
              type="button"
              className="plus-primary"
              disabled={accountBusy || sendWait > 0}
              onClick={() => void onSendCode()}
            >
              {sendWait > 0 ? `${sendWait} 秒后可重发` : '发送验证码'}
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
            <button
              type="button"
              className="plus-primary"
              disabled={accountBusy}
              onClick={() => void onVerifyCode()}
            >
              登录
            </button>
            {apiHint ? (
              <p className="plus-server">
                当前连接的服务器 {apiHint}{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    switchToOfficialApiBase()
                    setApiHint('')
                    showAccount(`已切换到官方服务器 ${PRODUCTION_API_BASE}`, 'ok')
                    void fetchAuthConfig().then(async (cfg) => {
                      setCaptchaOn(cfg.captcha)
                      if (cfg.captcha) await loadCaptcha()
                    })
                  }}
                >
                  改用官方
                </button>
              </p>
            ) : null}
          </div>
        )}

        <div className="plus-details">
          <button
            type="button"
            className="plus-details-toggle"
            aria-expanded={plusDetailsOpen}
            onClick={() => setPlusDetailsOpen((v) => !v)}
          >
            {plusDetailsOpen ? '▾' : '▸'} 权益说明与开通方式
          </button>
          {plusDetailsOpen && (
            <div className="plus-details-body">
              <p>免费：官方主题包都能玩；做好的日记关卡，日历里接着玩。</p>
              <p>Plus：语音或文字记下今天，生成新的英语关卡，还有更好的模型配置向导。</p>
              <p>模型费另算，用自己的 Key。</p>
              {manualPay ? (
                <p className="plus-pay-note">
                  在线支付尚未开放。开通请加{PLUS_ADMIN_WECHAT_HINT}。
                </p>
              ) : null}
              <p className="plus-price-ref">
                参考价：
                {monthPlan ? `包月 ${formatFen(monthPlan.priceFen)}` : '包月 ¥18'}
                {' · '}
                {yearPlan ? `包年 ${formatFen(yearPlan.priceFen)}` : '包年 ¥148'}
              </p>
            </div>
          )}
        </div>
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
              {plusActive ? '语音或文字记今天，生成英语关' : 'Plus：语音或文字生成新关'}
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
