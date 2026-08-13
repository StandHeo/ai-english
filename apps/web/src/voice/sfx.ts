/** Lightweight Web Audio feedback — no asset files. */

let sharedCtx: AudioContext | null = null

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

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms))
}
