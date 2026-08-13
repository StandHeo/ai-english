/** Lightweight Web Audio feedback — no asset files. */

let sharedCtx: AudioContext | null = null

/** Successes since last celebrate BGM (spacing). */
let successesSinceCelebrate = 0
let lastCelebrateAtMs = 0

/** Min successes between celebrate clips; chance when eligible. */
const CELEBRATE_MIN_GAP = 2
const CELEBRATE_CHANCE = 0.34
const CELEBRATE_COOLDOWN_MS = 10_000

function ctx(): AudioContext | null {
  try {
    if (!sharedCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      sharedCtx = new AC()
    }
    if (sharedCtx.state === 'suspended') void sharedCtx.resume()
    return sharedCtx
  } catch {
    return null
  }
}

function tone(
  audio: AudioContext,
  opts: {
    freq: number
    start: number
    dur: number
    type?: OscillatorType
    gain?: number
    slideTo?: number
  },
) {
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = opts.type || 'sine'
  osc.frequency.setValueAtTime(opts.freq, opts.start)
  if (opts.slideTo != null) {
    osc.frequency.linearRampToValueAtTime(opts.slideTo, opts.start + opts.dur)
  }
  const peak = opts.gain ?? 0.18
  g.gain.setValueAtTime(0.0001, opts.start)
  g.gain.exponentialRampToValueAtTime(peak, opts.start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start(opts.start)
  osc.stop(opts.start + opts.dur + 0.02)
}

/** Bright ascending chime — reward for correct answer. */
export async function playSuccessSfx(): Promise<void> {
  const audio = ctx()
  if (!audio) return
  const t0 = audio.currentTime + 0.02
  tone(audio, { freq: 523.25, start: t0, dur: 0.12, type: 'triangle', gain: 0.16 })
  tone(audio, { freq: 659.25, start: t0 + 0.1, dur: 0.14, type: 'triangle', gain: 0.18 })
  tone(audio, { freq: 783.99, start: t0 + 0.22, dur: 0.28, type: 'sine', gain: 0.2 })
  // 随机间隔叠一点庆祝短曲（不阻塞 TTS）
  maybeScheduleCelebrateBgm()
  await wait(450)
}

/** Short descending “doo-doo-doo” — neutral fail, not entertaining speech. */
export async function playFailSfx(): Promise<void> {
  const audio = ctx()
  if (!audio) return
  const t0 = audio.currentTime + 0.02
  // Three dull thuds going down
  tone(audio, { freq: 220, start: t0, dur: 0.11, type: 'square', gain: 0.07 })
  tone(audio, { freq: 185, start: t0 + 0.14, dur: 0.11, type: 'square', gain: 0.065 })
  tone(audio, { freq: 147, start: t0 + 0.28, dur: 0.16, type: 'square', gain: 0.06, slideTo: 120 })
  await wait(480)
}

/**
 * 选对时偶尔播一段轻庆祝曲：至少隔 CELEBRATE_MIN_GAP 次成功，
 * 且冷却 CELEBRATE_COOLDOWN_MS，再以 CELEBRATE_CHANCE 概率触发。
 */
function maybeScheduleCelebrateBgm(): void {
  successesSinceCelebrate += 1
  const now = Date.now()
  if (successesSinceCelebrate < CELEBRATE_MIN_GAP) return
  if (now - lastCelebrateAtMs < CELEBRATE_COOLDOWN_MS) return
  if (Math.random() > CELEBRATE_CHANCE) return
  successesSinceCelebrate = 0
  lastCelebrateAtMs = now
  void playCelebrateBgm()
}

/** Soft ~2s fanfare under the success TTS — festive, not loud. */
export async function playCelebrateBgm(): Promise<void> {
  const audio = ctx()
  if (!audio) return
  // Start after the chime so “叮” still reads as the primary hit
  const t0 = audio.currentTime + 0.35
  const g = 0.09
  // C major bounce: do-mi-sol-do + little tag
  const notes: Array<{ f: number; at: number; dur: number; gain?: number }> = [
    { f: 523.25, at: 0, dur: 0.16 },
    { f: 659.25, at: 0.14, dur: 0.16 },
    { f: 783.99, at: 0.28, dur: 0.16 },
    { f: 1046.5, at: 0.42, dur: 0.28, gain: 0.11 },
    { f: 783.99, at: 0.72, dur: 0.14 },
    { f: 1046.5, at: 0.88, dur: 0.14 },
    { f: 1174.66, at: 1.04, dur: 0.18 },
    { f: 1318.51, at: 1.22, dur: 0.42, gain: 0.1 },
  ]
  for (const n of notes) {
    tone(audio, {
      freq: n.f,
      start: t0 + n.at,
      dur: n.dur,
      type: 'triangle',
      gain: n.gain ?? g,
    })
    // Soft fifth pad under longer notes
    if (n.dur >= 0.25) {
      tone(audio, {
        freq: n.f * 0.5,
        start: t0 + n.at,
        dur: n.dur + 0.08,
        type: 'sine',
        gain: (n.gain ?? g) * 0.45,
      })
    }
  }
  await wait(1800)
}

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms))
}
