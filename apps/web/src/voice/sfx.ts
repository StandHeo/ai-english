/** Lightweight Web Audio feedback — no asset files. */

let sharedCtx: AudioContext | null = null

/** Successes since last celebrate BGM (spacing). */
let successesSinceCelebrate = 0
let lastCelebrateAtMs = 0

/** Min successes between celebrate clips; chance when eligible. */
const CELEBRATE_MIN_GAP = 2
const CELEBRATE_CHANCE = 0.4
const CELEBRATE_COOLDOWN_MS = 8_000

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
  g.gain.exponentialRampToValueAtTime(peak, opts.start + 0.025)
  g.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start(opts.start)
  osc.stop(opts.start + opts.dur + 0.03)
}

/** Longer ascending celebrate phrase — reward for correct answer (~1.4s). */
export async function playSuccessSfx(): Promise<void> {
  const audio = ctx()
  if (!audio) return
  const t0 = audio.currentTime + 0.02
  // Opening chime
  tone(audio, { freq: 523.25, start: t0, dur: 0.16, type: 'triangle', gain: 0.15 })
  tone(audio, { freq: 659.25, start: t0 + 0.12, dur: 0.18, type: 'triangle', gain: 0.17 })
  tone(audio, { freq: 783.99, start: t0 + 0.26, dur: 0.22, type: 'sine', gain: 0.19 })
  // Hold + sparkle so it doesn’t vanish instantly
  tone(audio, { freq: 1046.5, start: t0 + 0.48, dur: 0.36, type: 'triangle', gain: 0.17 })
  tone(audio, { freq: 523.25, start: t0 + 0.48, dur: 0.4, type: 'sine', gain: 0.07 })
  tone(audio, { freq: 1318.51, start: t0 + 0.78, dur: 0.22, type: 'sine', gain: 0.14 })
  tone(audio, { freq: 1567.98, start: t0 + 0.98, dur: 0.45, type: 'triangle', gain: 0.16 })
  tone(audio, { freq: 783.99, start: t0 + 0.98, dur: 0.5, type: 'sine', gain: 0.06 })
  maybeScheduleCelebrateBgm()
  await wait(1400)
}

/** Short descending “doo-doo-doo” — neutral fail, not entertaining speech. */
export async function playFailSfx(): Promise<void> {
  const audio = ctx()
  if (!audio) return
  const t0 = audio.currentTime + 0.02
  tone(audio, { freq: 220, start: t0, dur: 0.11, type: 'square', gain: 0.07 })
  tone(audio, { freq: 185, start: t0 + 0.14, dur: 0.11, type: 'square', gain: 0.065 })
  tone(audio, { freq: 147, start: t0 + 0.28, dur: 0.16, type: 'square', gain: 0.06, slideTo: 120 })
  await wait(480)
}

/**
 * 选对时偶尔叠更长庆祝曲：至少隔 CELEBRATE_MIN_GAP 次成功，
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

/** Soft ~3s fanfare under the success TTS — festive, not loud. */
export async function playCelebrateBgm(): Promise<void> {
  const audio = ctx()
  if (!audio) return
  const t0 = audio.currentTime + 0.2
  const g = 0.085
  const notes: Array<{ f: number; at: number; dur: number; gain?: number }> = [
    { f: 523.25, at: 0, dur: 0.2 },
    { f: 659.25, at: 0.18, dur: 0.2 },
    { f: 783.99, at: 0.36, dur: 0.2 },
    { f: 1046.5, at: 0.54, dur: 0.36, gain: 0.11 },
    { f: 783.99, at: 0.96, dur: 0.18 },
    { f: 1046.5, at: 1.14, dur: 0.18 },
    { f: 1174.66, at: 1.34, dur: 0.22 },
    { f: 1318.51, at: 1.56, dur: 0.28, gain: 0.1 },
    { f: 1046.5, at: 1.9, dur: 0.2 },
    { f: 1567.98, at: 2.12, dur: 0.55, gain: 0.11 },
    { f: 783.99, at: 2.12, dur: 0.6, gain: 0.05 },
  ]
  for (const n of notes) {
    tone(audio, {
      freq: n.f,
      start: t0 + n.at,
      dur: n.dur,
      type: 'triangle',
      gain: n.gain ?? g,
    })
    if (n.dur >= 0.28) {
      tone(audio, {
        freq: n.f * 0.5,
        start: t0 + n.at,
        dur: n.dur + 0.1,
        type: 'sine',
        gain: (n.gain ?? g) * 0.45,
      })
    }
  }
  await wait(2900)
}

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms))
}
