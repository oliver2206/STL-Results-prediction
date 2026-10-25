import { useEffect, useMemo, useState } from 'react'
import PhotoAttach from './PhotoAttach.jsx'
import PasscodeDialog from './PasscodeDialog.jsx'
import { hasPasscode } from './passcode.js'
import { deletePhoto } from './photoStore.js'
import './Gallery.css'

// Daily proof-of-bet gallery. Each upload is one day (and optionally one draw)
// with its first / second / last ball and one or more photos. Details are kept
// in localStorage, the pictures in IndexedDB, so everything stays after a
// refresh. Nothing can be deleted (a whole day's upload or a single photo)
// without entering the gallery passcode first.
const GALLERY_KEY = 'stl-gallery'
const PENDING_KEY = 'stl-gallery-pending'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DRAWS = [
  { id: '', label: 'Any draw', order: 0 },
  { id: 'morning', label: 'Morning · 10:30 AM', order: 1 },
  { id: 'afternoon', label: 'Afternoon · 3:00 PM', order: 2 },
  { id: 'evening', label: 'Evening · 7:00 PM', order: 3 },
]
const drawInfo = (id) => DRAWS.find((d) => d.id === id) ?? DRAWS[0]

function loadList(key) {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveList(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // storage full or disabled — ignore
  }
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export default function Gallery() {
  const [items, setItems] = useState(() => loadList(GALLERY_KEY))
  const [pending, setPendingState] = useState(() => loadList(PENDING_KEY))
  const [date, setDate] = useState(todayISO)
  const [draw, setDraw] = useState('')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [last, setLast] = useState('')
  const [note, setNote] = useState('')
  const [monthFilter, setMonthFilter] = useState('all')
  // passcode dialog: { mode, title, message, confirmLabel, danger, run }
  const [dialog, setDialog] = useState(null)
  const [protectedNow, setProtectedNow] = useState(hasPasscode)
  const [flash, setFlash] = useState('')
  const [formError, setFormError] = useState('')

  function setPending(ids) {
    setPendingState(ids)
    saveList(PENDING_KEY, ids)
  }

  // Always merge into the freshest stored list (photo saves are async).
  function commit(next) {
    setItems(next)
    saveList(GALLERY_KEY, next)
  }

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === GALLERY_KEY) setItems(loadList(GALLERY_KEY))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function addItem(ev) {
    ev.preventDefault()
    if (pending.length === 0 && !first && !second && !last && !note.trim()) {
      setFormError('Add at least a photo, a ball number or a note.')
      return
    }
    setFormError('')
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      draw,
      first,
      second,
      last,
      note: note.trim(),
      photos: pending,
    }
    commit([entry, ...loadList(GALLERY_KEY)])
    setPending([])
    setFirst('')
    setSecond('')
    setLast('')
    setNote('')
  }

  function addPhotos(id, ids) {
    commit(
      loadList(GALLERY_KEY).map((x) =>
        x.id === id ? { ...x, photos: [...(x.photos ?? []), ...ids] } : x,
      ),
    )
  }

  function removePhoto(id, photoId) {
    deletePhoto(photoId).catch(() => {})
    commit(
      loadList(GALLERY_KEY).map((x) =>
        x.id === id ? { ...x, photos: (x.photos ?? []).filter((p) => p !== photoId) } : x,
      ),
    )
  }

  function deleteItem(item) {
    ;(item.photos ?? []).forEach((pid) => deletePhoto(pid).catch(() => {}))
    commit(loadList(GALLERY_KEY).filter((x) => x.id !== item.id))
  }

  // Every delete goes through here. `run` only executes after the right passcode.
  // With no passcode yet, the person must create one first and then repeat the delete.
  function askPasscode(message, run) {
    if (!hasPasscode()) {
      setDialog({
        mode: 'setup',
        title: 'Create a passcode first',
        message: 'Deleting needs a passcode. Create one now, then tap delete again.',
        after: 'Passcode created. Tap delete again and enter it to continue.',
      })
      return
    }
    setDialog({ mode: 'verify', title: 'Enter passcode to delete', message, confirmLabel: 'Delete', danger: true, run })
  }

  function openPasscodeSetup() {
    setDialog(
      hasPasscode()
        ? { mode: 'change', title: 'Change passcode', after: 'Passcode changed.' }
        : { mode: 'setup', title: 'Create a passcode', message: 'Once set, nothing in the gallery can be deleted without it.', after: 'Passcode created. Deleting is now locked.' },
    )
  }

  function dialogSuccess() {
    const d = dialog
    setDialog(null)
    setProtectedNow(hasPasscode())
    if (d?.run) {
      d.run()
    } else if (d?.after) {
      setFlash(d.after)
      setTimeout(() => setFlash(''), 4000)
    }
  }

  const monthKeys = useMemo(
    () => [...new Set(items.map((i) => i.date.slice(0, 7)))].sort().reverse(),
    [items],
  )

  // month -> day -> entries, newest first
  const grouped = useMemo(() => {
    const visible = items.filter((i) => monthFilter === 'all' || i.date.startsWith(monthFilter))
    const months = new Map()
    for (const it of visible) {
      const mk = it.date.slice(0, 7)
      if (!months.has(mk)) months.set(mk, new Map())
      const days = months.get(mk)
      if (!days.has(it.date)) days.set(it.date, [])
      days.get(it.date).push(it)
    }
    return [...months.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([mk, days]) => ({
        mk,
        label: `${MONTHS[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}`,
        days: [...days.entries()]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([d, list]) => ({
            date: d,
            list: [...list].sort((a, b) => drawInfo(a.draw).order - drawInfo(b.draw).order),
          })),
      }))
  }, [items, monthFilter])

  const ballFields = [
    ['1st ball', first, setFirst],
    ['2nd ball', second, setSecond],
    ['Last ball', last, setLast],
  ]

  return (
    <div className="gallery">
      <p className="predict-disclaimer cycle-intro">
        Upload your proof of bet each day — pick the date, add the first, second and last
        ball, and attach the photos. Everything stays saved after a refresh, and nothing can
        be deleted without your passcode.
      </p>

      <div className={`gal-lock ${protectedNow ? 'is-on' : 'is-off'}`}>
        <span>
          {protectedNow ? '🔒 Delete is passcode-protected' : '⚠️ No passcode yet — set one so nothing can be deleted'}
        </span>
        <button type="button" className="gal-lock-btn" onClick={openPasscodeSetup}>
          {protectedNow ? 'Change passcode' : 'Set passcode'}
        </button>
      </div>
      {flash && <p className="gal-flash">{flash}</p>}

      <form className="gal-form" onSubmit={addItem}>
        <div className="gal-grid">
          <label className="gal-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="gal-field">
            <span>Draw</span>
            <select value={draw} onChange={(e) => setDraw(e.target.value)}>
              {DRAWS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="gal-balls">
          {ballFields.map(([label, value, setter]) => (
            <label className="gal-field" key={label}>
              <span>{label}</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                placeholder="—"
                value={value}
                onChange={(e) => setter(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </label>
          ))}
        </div>

        <label className="gal-field">
          <span>Note</span>
          <input
            type="text"
            placeholder="optional — e.g. who bet, amount, unpaid"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="gal-field">
          <span>Proof photos</span>
          <PhotoAttach
            label="📷 Upload proof"
            photoIds={pending}
            onAdd={(ids) => setPending([...loadList(PENDING_KEY), ...ids])}
            onRemove={(pid) => {
              deletePhoto(pid).catch(() => {})
              setPending(loadList(PENDING_KEY).filter((x) => x !== pid))
            }}
          />
        </div>

        {formError && <p className="gal-error">{formError}</p>}
        <button type="submit" className="gal-save">＋ Save to gallery</button>
      </form>

      {items.length > 0 && (
        <div className="gal-filter">
          <label htmlFor="gal-month">Show</label>
          <select
            id="gal-month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="all">All months</option>
            {monthKeys.map((mk) => (
              <option key={mk} value={mk}>
                {MONTHS[Number(mk.slice(5)) - 1]} {mk.slice(0, 4)}
              </option>
            ))}
          </select>
          <span className="gal-count">
            {items.length} upload{items.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-state">No proof uploaded yet. Add your first one above.</p>
      ) : (
        grouped.map((month) => (
          <section className="gal-month" key={month.mk}>
            <h3 className="gal-month-title">{month.label}</h3>
            {month.days.map((day) => (
              <div className="gal-day" key={day.date}>
                <h4 className="gal-day-title">{dayLabel(day.date)}</h4>
                {day.list.map((it) => (
                  <article className="gal-card" key={it.id}>
                    <div className="gal-card-head">
                      {it.draw && <span className="gal-draw">{drawInfo(it.draw).label}</span>}
                      <span className="gal-ball-row">
                        {[['1st', it.first], ['2nd', it.second], ['Last', it.last]].map(([l, v]) => (
                          <span className={`gal-ball ${v ? '' : 'is-empty'}`} key={l}>
                            <small>{l}</small>
                            {v || '—'}
                          </span>
                        ))}
                      </span>
                    </div>
                    {it.note && <p className="gal-note">{it.note}</p>}
                    <PhotoAttach
                      photoIds={it.photos ?? []}
                      onAdd={(ids) => addPhotos(it.id, ids)}
                      onRemove={(pid) => removePhoto(it.id, pid)}
                      guardDelete={(run) =>
                        askPasscode(`Delete this photo from ${dayLabel(it.date)}? This cannot be undone.`, run)
                      }
                    />
                    <div className="gal-card-foot">
                      <button
                        type="button"
                        className="gal-del"
                        onClick={() =>
                          askPasscode(
                            `Delete the whole upload for ${dayLabel(it.date)}${it.draw ? ` (${drawInfo(it.draw).label})` : ''} and all its photos? This cannot be undone.`,
                            () => deleteItem(it),
                          )
                        }
                      >
                        🔒 Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </section>
        ))
      )}

      {dialog && (
        <PasscodeDialog
          mode={dialog.mode}
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          onSuccess={dialogSuccess}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
