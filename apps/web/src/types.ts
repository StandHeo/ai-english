export type PictureOption = {
  id: string
  image: string
  correct: boolean
}

export type Beat = {
  type: 'introduce' | 'ask'
  show?: string
  npc_say: string
  hint_say?: string
  expect?: string[]
  fallback?: {
    type: 'picture_choice'
    options: PictureOption[]
  }
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
