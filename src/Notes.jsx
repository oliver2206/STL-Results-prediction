import { useEffect, useMemo, useState } from 'react'
import './Notes.css'

// Notes are saved in localStorage on every keystroke, so they are still here
// after a refresh, a closed tab, or a browser restart. Nothing is ever
// removed unless you press Delete on a note yourself.
const NOTES_KEY = 'stl-notes'

function loadNotes() {
  try {
    const raw = window.localStorage.getItem(NOTES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((n) => n && typeof n.id === 'string')
      : []
  } catch {
    return []
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function formatStamp(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Notes() {
  const [notes, setNotes] = useState(loadNotes)
  const [selectedId, setSelectedId] = useState(() => loadNotes()[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  // Save whenever notes change.
  useEffect(() => {
    try {
      window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    } catch {
      // storage full or disabled — ignore
    }
  }, [notes])

  // Keep other open tabs of this app in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === NOTES_KEY) setNotes(loadNotes())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...notes]
      .filter(
        (n) =>
          !q ||
          (n.title || '').toLowerCase().includes(q) ||
          (n.body || '').toLowerCase().includes(q),
      )
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
  }, [notes, search])

  const selected = notes.find((n) => n.id === selectedId) ?? null

  function addNote() {
    const now = Date.now()
    const note = { id: newId(), title: '', body: '', pinned: false, createdAt: now, updatedAt: now }
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setSearch('')
    setConfirmDeleteId(null)
  }

  function updateNote(id, patch) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
    )
  }

  function togglePin(id) {
    // Pinning shouldn't bump the "last edited" time.
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)))
  }

  function deleteNote(id) {
    const remaining = notes.filter((n) => n.id !== id)
    setNotes(remaining)
    setConfirmDeleteId(null)
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null)
  }

  return (
    <div className="notes">
      <div className="notes-toolbar">
        <input
          type="text"
          className="notes-search"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search notes"
        />
        <button type="button" className="notes-add-btn" onClick={addNote}>
          ＋ New note
        </button>
      </div>

      <p className="notes-count">
        {notes.length} note{notes.length === 1 ? '' : 's'} · saved automatically on this device
      </p>

      {notes.length === 0 ? (
        <p className="empty-state">
          No notes yet. Tap <strong>New note</strong> to write one — it stays saved even
          after you refresh.
        </p>
      ) : (
        <div className="notes-layout">
          <ul className="notes-list" aria-label="Your notes">
            {sorted.length === 0 && <li className="notes-none">No notes match "{search}".</li>}
            {sorted.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notes-item ${n.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedId(n.id)
                    setConfirmDeleteId(null)
                  }}
                >
                  <span className="notes-item-title">
                    {n.pinned && <span aria-label="Pinned">📌 </span>}
                    {n.title.trim() || 'Untitled note'}
                  </span>
                  <span className="notes-item-preview">
                    {(n.body || '').trim().slice(0, 70) || 'No text yet'}
                  </span>
                  <span className="notes-item-time">{formatStamp(n.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <section className="notes-editor">
              <input
                type="text"
                className="notes-title-input"
                placeholder="Title"
                value={selected.title}
                onChange={(e) => updateNote(selected.id, { title: e.target.value })}
                aria-label="Note title"
              />
              <textarea
                className="notes-body-input"
                placeholder="Write your note here…"
                value={selected.body}
                onChange={(e) => updateNote(selected.id, { body: e.target.value })}
                aria-label="Note text"
              />
              <div className="notes-editor-foot">
                <span className="notes-stamp">Edited {formatStamp(selected.updatedAt)}</span>
                <div className="notes-actions">
                  <button
                    type="button"
                    className="notes-btn"
                    onClick={() => togglePin(selected.id)}
                  >
                    {selected.pinned ? 'Unpin' : '📌 Pin'}
                  </button>
                  {confirmDeleteId === selected.id ? (
                    <>
                      <button
                        type="button"
                        className="notes-btn is-danger"
                        onClick={() => deleteNote(selected.id)}
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        className="notes-btn"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="notes-btn is-danger"
                      onClick={() => setConfirmDeleteId(selected.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <p className="empty-state">Pick a note on the left to read or edit it.</p>
          )}
        </div>
      )}
    </div>
  )
}
