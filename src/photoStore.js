// Photos are kept in IndexedDB (not localStorage) so full-size pictures fit.
// They stay in this browser after a refresh, a closed tab or a restart —
// a photo is only removed when you delete it yourself.
const DB_NAME = 'stl-photos'
const STORE = 'photos'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => {
      db.close()
      resolve(req?.result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export const putPhoto = (id, blob) => run('readwrite', (s) => s.put(blob, id))
export const getPhoto = (id) => run('readonly', (s) => s.get(id))
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id))

// Ask the browser not to clear this site's storage when space runs low.
export function requestPersistentStorage() {
  try {
    navigator.storage?.persist?.()
  } catch {
    // not supported — ignore
  }
}

// Shrinks big phone photos (usually 3-8 MB) to ~1280px JPEG so many fit.
export async function compressImage(file, maxSize = 1280, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file
  }
}

export const newPhotoId = () =>
  `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
