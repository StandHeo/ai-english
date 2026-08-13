/** IndexedDB clips for diary voice — keeps localStorage under quota. */

const DB_NAME = 'ai-english-family-audio-v1'
const STORE = 'clips'
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

export async function putAudioClip(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('putAudioClip failed'))
      tx.objectStore(STORE).put(blob, id)
    })
  } finally {
    db.close()
  }
}

export async function getAudioClip(id: string): Promise<Blob | null> {
  const db = await openDb()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const v = req.result
        resolve(v instanceof Blob ? v : null)
      }
      req.onerror = () => reject(req.error || new Error('getAudioClip failed'))
    })
  } finally {
    db.close()
  }
}

export async function deleteAudioClip(id: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('deleteAudioClip failed'))
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
