/** IndexedDB blobs for family level images — keeps localStorage under quota. */

const DB_NAME = 'ai-english-family-images-v1'
const STORE = 'images'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

export async function putImageBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('putImageBlob failed'))
      tx.objectStore(STORE).put(blob, id)
    })
  } finally {
    db.close()
  }
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const v = req.result
        resolve(v instanceof Blob ? v : null)
      }
      req.onerror = () => reject(req.error || new Error('getImageBlob failed'))
    })
  } finally {
    db.close()
  }
}

export async function deleteImageBlob(id: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('deleteImageBlob failed'))
      tx.objectStore(STORE).delete(id)
    })
  } finally {
    db.close()
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function isInlineImageRef(v: string | undefined | null): boolean {
  if (!v) return false
  return /^data:image\//i.test(v) || v.length > 2048
}

export function newImageId(prefix = 'img'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Persist a data URL or http URL into IDB; returns the id. */
export async function storeImageDataUrl(dataUrl: string, prefix = 'img'): Promise<string> {
  const id = newImageId(prefix)
  const blob = await dataUrlToBlob(dataUrl)
  await putImageBlob(id, blob)
  return id
}

export async function resolveImageRef(
  idOrDataUrl: string | undefined,
): Promise<string | undefined> {
  if (!idOrDataUrl) return undefined
  if (/^data:image\//i.test(idOrDataUrl) || /^https?:\/\//i.test(idOrDataUrl) || idOrDataUrl.startsWith('blob:')) {
    return idOrDataUrl
  }
  const blob = await getImageBlob(idOrDataUrl)
  if (!blob) return undefined
  return blobToObjectUrl(blob)
}
