import { useEffect, useState } from 'react'
import PhotoAttach from './PhotoAttach.jsx'
import { deletePhoto } from './photoStore.js'
import './ProfileBets.css'

// Per-person bet ledger. Saved in localStorage (one object keyed by the
// person's name) so entries survive a refresh — nothing is removed unless you
// press the delete button on that entry.
const BETS_KEY = 'stl-profile-bets'
// Proof photos picked in the form but not yet attached to a saved bet.
const pendingKey = (name) => `stl-bets-pending-${name}`

function loadPending(name) {
  try {
    const raw = window.localStorage.getItem(pendingKey(name))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePending(name, ids) {
  try {
    window.localStorage.setItem(pendingKey(name), JSON.stringify(ids))
  } catch {
    // ignore
  }
}

function loadAll() {
  try {
    const raw = window.localStorage.getItem(BETS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveAll(all) {
  try {
    window.localStorage.setItem(BETS_KEY, JSON.stringify(all))
  } catch {
    // storage full or disabled — ignore
  }
}

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ProfileBets({ name }) {
  const [entries, setEntries] = useState(() => loadAll()[name] ?? [])
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO)
  const [amount, setAmount] = useState('')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [last, setLast] = useState('')
  const [note, setNote] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [pending, setPendingState] = useState(() => loadPending(name))

  function setPending(ids) {
    setPendingState(ids)
    savePending(name, ids)
  }

  // Write only this person's slice, merged into whatever is stored now, so
  // other people's entries are never overwritten.
  function commit(next) {
    setEntries(next)
    const all = loadAll()
    all[name] = next
    saveAll(all)
  }

  // Pick up changes made in another open tab.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === BETS_KEY) setEntries(loadAll()[name] ?? [])
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [name])

  const unpaidTotal = entries.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0)
  const paidTotal = entries.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0)
  const unpaidCount = entries.filter((e) => !e.paid).length

  function addEntry(ev) {
    ev.preventDefault()
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      amount: amt,
      first: first.trim(),
      second: second.trim(),
      last: last.trim(),
      note: note.trim(),
      paid: false,
      photos: pending,
    }
    commit([entry, ...entries])
    setPending([])
    setAmount('')
    setFirst('')
    setSecond('')
    setLast('')
    setNote('')
  }

  function patch(id, change) {
    commit(entries.map((e) => (e.id === id ? { ...e, ...change } : e)))
  }

  // Photos are added after async saves, so merge into the freshest stored list.
  function addPhotos(entryId, ids) {
    const fresh = loadAll()[name] ?? []
    commit(fresh.map((x) => (x.id === entryId ? { ...x, photos: [...(x.photos ?? []), ...ids] } : x)))
  }

  function removePhoto(entryId, photoId) {
    deletePhoto(photoId).catch(() => {})
    const fresh = loadAll()[name] ?? []
    commit(
      fresh.map((x) =>
        x.id === entryId ? { ...x, photos: (x.photos ?? []).filter((p) => p !== photoId) } : x,
      ),
    )
  }

  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <div className="bets">
      <button
        type="button"
        className={`bets-toggle ${unpaidTotal > 0 ? 'has-unpaid' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>📒 Bets &amp; notes</span>
        <span className="bets-toggle-sum">
          {entries.length === 0
            ? 'none yet'
            : unpaidTotal > 0
              ? `${peso(unpaidTotal)} unpaid`
              : 'all paid'}
          {' '}
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="bets-body">
          <form className="bets-form" onSubmit={addEntry}>
            <label className="bets-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="bets-field">
              <span>Amount (₱)</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <div className="bets-balls bets-field-wide">
              {[
                ['1st ball', first, setFirst],
                ['2nd ball', second, setSecond],
                ['Last ball', last, setLast],
              ].map(([label, value, setter]) => (
                <label className="bets-field" key={label}>
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
            <label className="bets-field bets-field-wide">
              <span>Note</span>
              <input
                type="text"
                placeholder="e.g. didn't pay on this day, will pay Friday"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="bets-field-wide bets-proof">
              <span className="bets-proof-label">Proof the bet is unpaid (photo)</span>
              <PhotoAttach
                label="📷 Upload proof"
                photoIds={pending}
                onAdd={(ids) => setPending([...loadPending(name), ...ids])}
                onRemove={(pid) => {
                  deletePhoto(pid).catch(() => {})
                  setPending(loadPending(name).filter((x) => x !== pid))
                }}
              />
            </div>
            <button type="submit" className="bets-add">＋ Add bet</button>
          </form>

          {entries.length > 0 && (
            <p className="bets-summary">
              <strong className="is-unpaid">{peso(unpaidTotal)}</strong> unpaid ({unpaidCount})
              {' · '}
              <strong className="is-paid">{peso(paidTotal)}</strong> paid
            </p>
          )}

          <ul className="bets-list">
            {sorted.map((e) => (
              <li key={e.id} className={`bets-row ${e.paid ? 'is-paid' : 'is-unpaid'}`}>
                <div className="bets-row-top">
                  <span className="bets-row-date">{e.date}</span>
                  <span className="bets-row-amount">{peso(e.amount)}</span>
                  {e.number && <span className="bets-row-number">{e.number}</span>}
                  {(e.first || e.second || e.last) && (
                    <span className="bets-row-balls">
                      {[['1st', e.first], ['2nd', e.second], ['Last', e.last]]
                        .filter(([, v]) => v)
                        .map(([label, v]) => (
                          <span className="bets-ball" key={label}>
                            <small>{label}</small>
                            {v}
                          </span>
                        ))}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`bets-status ${e.paid ? 'is-paid' : 'is-unpaid'}`}
                    onClick={() => patch(e.id, { paid: !e.paid })}
                    title="Tap to switch paid / unpaid"
                  >
                    {e.paid ? '✓ Paid' : '✗ Unpaid'}
                  </button>
                </div>
                <input
                  type="text"
                  className="bets-row-note"
                  placeholder="Add a note (why not paid, when to collect…)"
                  value={e.note}
                  onChange={(ev) => patch(e.id, { note: ev.target.value })}
                  aria-label="Note for this bet"
                />
                <PhotoAttach
                  photoIds={e.photos ?? []}
                  onAdd={(ids) => addPhotos(e.id, ids)}
                  onRemove={(pid) => removePhoto(e.id, pid)}
                />
                <div className="bets-row-foot">
                  {confirmId === e.id ? (
                    <>
                      <button
                        type="button"
                        className="bets-del is-confirm"
                        onClick={() => {
                          ;(e.photos ?? []).forEach((pid) => deletePhoto(pid).catch(() => {}))
                          commit(entries.filter((x) => x.id !== e.id))
                          setConfirmId(null)
                        }}
                      >
                        Yes, delete
                      </button>
                      <button type="button" className="bets-del" onClick={() => setConfirmId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="bets-del" onClick={() => setConfirmId(e.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
