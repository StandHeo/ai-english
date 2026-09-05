import type { Beat, LevelScript, TalkNode } from '../types'

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function shuffleBeat(beat: Beat): Beat {
  return {
    ...beat,
    ...(beat.options ? { options: shuffled(beat.options) } : {}),
    ...(beat.fallback
      ? { fallback: { ...beat.fallback, options: shuffled(beat.fallback.options) } }
      : {}),
  }
}

/**
 * 正确答案位置随机化：把各拍（及 Beep 兜底）的选项顺序打乱。
 * 内容源（官方 JSON / LLM 生成）几乎总是把 correct 放第一个，
 * 孩子玩两遍就能背位置，所以只在进入游玩时重排，不回写存储。
 */
export function shuffleLevelOptions(level: LevelScript): LevelScript {
  const beep_talk = level.beep_talk
    ? {
        ...level.beep_talk,
        nodes: Object.fromEntries(
          Object.entries(level.beep_talk.nodes).map(([id, node]: [string, TalkNode]) => [
            id,
            node.fallback
              ? { ...node, fallback: { ...node.fallback, options: shuffled(node.fallback.options) } }
              : node,
          ]),
        ),
      }
    : undefined
  return {
    ...level,
    beats: level.beats.map(shuffleBeat),
    ...(beep_talk ? { beep_talk } : {}),
  }
}
