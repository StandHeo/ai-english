export type PictureOption = {
  id: string
  image: string
  correct: boolean
}

export type Beat = {
  type: 'introduce' | 'ask' | 'find'
  show?: string
  npc_say: string
  hint_say?: string
  success_say?: string
  expect?: string[]
  fallback?: {
    type: 'picture_choice'
    options: PictureOption[]
  }
  /** find 拍选项；也可复用 fallback.options */
  options?: PictureOption[]
}

/** 关卡尾声 Beep 约束对话的一个节点 */
export type TalkNode = {
  robot_say: string
  expect: string[]
  hint_say?: string
  success_say?: string
  /** 成功后下一节点 id；null 表示对话结束 */
  next: string | null
  /** 兜底成功后下一节点；缺省则同 next */
  on_fail_next?: string | null
  show?: string
  fallback?: {
    type: 'picture_choice'
    options: PictureOption[]
  }
}

/** 可选关卡尾声：独立机器人 Beep 的短对话图 */
export type BeepTalk = {
  start: string
  nodes: Record<string, TalkNode>
}

export type LevelScript = {
  id: string
  approved: boolean
  theme: string
  title: string
  target_words: string[]
  scene: {
    setting: string
    image: string
    character: string
    video?: string
    video_max_seconds?: number
  }
  beats: Beat[]
  /** 有则末拍成功后进入 Beep；无则拍完即结算 */
  beep_talk?: BeepTalk
  reward: {
    sticker: string
    stickerImage: string
    stars: number
  }
}

export type ContentPack = {
  id: string
  title: string
  theme: string
  character: string
  mapImage: string
  homeImage?: string
  levels: string[]
}

export type PackProgress = {
  completed: string[]
  unlocked: string[]
  stickers: string[]
}

export type ProgressState = {
  version: 2
  packs: Record<string, PackProgress>
  stars: number
  dailyLimitMinutes: number | null
  playSecondsByDate: Record<string, number>
}
