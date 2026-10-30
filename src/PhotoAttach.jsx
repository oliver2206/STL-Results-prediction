import './ProfileBets.css'
import { useEffect, useRef, useState } from 'react'
import { compressImage, getPhoto, newPhotoId, putPhoto, requestPersistentStorage } from './photoStore.js'

function usePhotoUrl(id) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let alive = true
    let created = null
    getPhoto(id)
      .then((blob) => {
        if (!alive || !blob) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [id])
  return url
}

function Thumb({ id, onOpen }) {
  const url = usePhotoUrl(id)
  return (
    <button type="button" className="photo-thumb" onClick={() => onOpen(id)} aria-label="Open photo">
      {url ? <img src={url} alt="Attached" /> : <span className="photo-thumb-wait">…</span>}
    </button>
  )
}

function Viewer({ id, onClose, onDelete, guarded }) {
  const url = usePhotoUrl(id)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="photo-viewer" onClick={onClose}>
      <div className="photo-viewer-box" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt="Attached full size" /> : <p>Loading…</p>}
        <div className="photo-viewer-bar">
          <button type="button" className="photo-btn" onClick={onClose}>Close</button>
          {guarded ? (
            // a passcode is asked for before anything is deleted, so no extra "Yes/Cancel" step
            <button type="button" className="photo-btn is-danger" onClick={() => onDelete(id)}>
              🔒 Delete photo
            </button>
          ) : confirm ? (
            <>
              <button type="button" className="photo-btn is-danger" onClick={() => onDelete(id)}>
                Yes, delete photo
              </button>
              <button type="button" className="photo-btn" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="photo-btn is-danger" onClick={() => setConfirm(true)}>
              Delete photo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// photoIds: ids stored on the parent entry. onAdd(ids) / onRemove(id) let the
// parent save the list; the picture data itself lives in IndexedDB.
// guardDelete(run) is optional: when given, deleting a photo from the viewer
// calls guardDelete with the real delete as `run` (e.g. to ask for a passcode
// first) instead of deleting straight away.
export default function PhotoAttach({ photoIds, onAdd, onRemove, guardDelete, label = '📷 Add photo' }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)

  async function handleFiles(e) {
    const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith('image/'))
    e.target.value = ''
    if (files.length === 0) return
    setBusy(true)
    setError('')
    requestPersistentStorage()
    try {
      const ids = []
      for (const file of files) {
        const blob = await compressImage(file)
        const id = newPhotoId()
        await putPhoto(id, blob)
        ids.push(id)
      }
      onAdd(ids)
    } catch {
      setError('Could not save the photo — storage may be full or blocked.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="photos">
      <div className="photo-row">
        {photoIds.map((id) => (
          <Thumb key={id} id={id} onOpen={setOpenId} />
        ))}
        <button
          type="button"
          className="photo-add"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Saving…' : label}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFiles}
        />
      </div>
      {error && <p className="photo-error">{error}</p>}
      {openId && (
        <Viewer
          id={openId}
          onClose={() => setOpenId(null)}
          guarded={Boolean(guardDelete)}
          onDelete={(id) => {
            const run = () => {
              onRemove(id)
              setOpenId(null)
            }
            if (guardDelete) guardDelete(run)
            else run()
          }}
        />
      )}
    </div>
  )
}
