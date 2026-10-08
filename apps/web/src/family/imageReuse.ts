import type { ImageSlot } from './imageSlots'
import { slotWordKey } from './imageSlots'

export type ImageReuseCache = {
  get(key: string): string | undefined
  set(key: string, url: string): void
  getOrLoad(key: string, load: () => Promise<string>): Promise<string>
}

export function createImageReuseCache(): ImageReuseCache {
  const values = new Map<string, string>()
  const inflight = new Map<string, Promise<string>>()
  return {
    get(key) {
      return values.get(key)
    },
    set(key, url) {
      if (key && url) values.set(key, url)
    },
    async getOrLoad(key, load) {
      const hit = values.get(key)
      if (hit) return hit
      const pending = inflight.get(key)
      if (pending) return pending
      const p = load().then(
        (url) => {
          if (url) values.set(key, url)
          inflight.delete(key)
          return url
        },
        (err) => {
          inflight.delete(key)
          throw err
        },
      )
      inflight.set(key, p)
      return p
    },
  }
}

export function seedItemImagesFromSlots(
  cache: ImageReuseCache,
  slots: ImageSlot[],
  images: Array<string | undefined>,
): void {
  slots.forEach((slot, i) => {
    if (slot.role === 'scene') return
    const url = images[i]
    if (url) cache.set(slotWordKey(slot), url)
  })
}

export type PlannedSlotFill = {
  images: string[]
  fetchIndexes: number[]
  fetchSlots: ImageSlot[]
}

/**
 * 道具/干扰按规范化键复用；场景默认不跨关复用。
 * existing 已有图会保留；其余道具先查 cache，未命中列入 fetch。
 */
export function planSlotImageFills(
  slots: ImageSlot[],
  existing: Array<string | undefined>,
  cache: ImageReuseCache,
  opts?: { onlyMissing?: boolean },
): PlannedSlotFill {
  const images = slots.map((_, i) => existing[i] || '')
  const fetchIndexes: number[] = []
  const fetchSlots: ImageSlot[] = []
  slots.forEach((slot, i) => {
    if (opts?.onlyMissing && images[i]) return
    if (slot.role !== 'scene') {
      const key = slotWordKey(slot)
      const reused = key ? cache.get(key) : undefined
      if (reused) {
        images[i] = reused
        return
      }
    }
    fetchIndexes.push(i)
    fetchSlots.push(slot)
  })
  return { images, fetchIndexes, fetchSlots }
}

export function rememberFetchedItemImages(
  cache: ImageReuseCache,
  slots: ImageSlot[],
  images: string[],
): void {
  seedItemImagesFromSlots(cache, slots, images)
}

export async function fillLevelSlotImages(
  slots: ImageSlot[],
  existing: Array<string | undefined>,
  cache: ImageReuseCache,
  fetchSlots: (slots: ImageSlot[]) => Promise<string[]>,
  opts?: { onlyMissing?: boolean },
): Promise<string[]> {
  const images = slots.map((_, i) => existing[i] || '')
  const sceneIdx: number[] = []
  const sceneSlots: ImageSlot[] = []
  const itemJobs: Promise<void>[] = []

  slots.forEach((slot, i) => {
    if (opts?.onlyMissing && images[i]) return
    if (slot.role === 'scene') {
      sceneIdx.push(i)
      sceneSlots.push(slot)
      return
    }
    const key = slotWordKey(slot)
    if (!key) return
    itemJobs.push(
      cache
        .getOrLoad(key, async () => {
          const got = await fetchSlots([slot])
          const url = got[0] || ''
          if (!url) throw new Error(`slot_empty:${key}`)
          return url
        })
        .then((url) => {
          images[i] = url
        }),
    )
  })

  await Promise.all([
    sceneSlots.length
      ? fetchSlots(sceneSlots).then((got) => {
          sceneIdx.forEach((idx, j) => {
            const url = got[j] || ''
            if (!url) throw new Error(`slot_empty:scene`)
            images[idx] = url
          })
        })
      : Promise.resolve(),
    ...itemJobs,
  ])
  return images
}
