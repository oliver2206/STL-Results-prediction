import { useEffect, useState } from 'react'
import './Targets.css'

// Monthly week-by-week target numbers (reminders). Pick a month, then type
// numbers like 14-21 under the week you want to target. Saved in localStorage
// per province, so they are still here after a refresh. Nothing is removed
// unless you press ✕ on a number yourself.
const TARGETS_KEY = 'stl-targets'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Same week buckets used elsewhere in the app.
const WEEKS = [
  { n: 1, range: '1–7' },
  { n: 2, range: '8–14' },
  { n: 3, range: '15–21' },
  { n: 4, range: '22–28' },
  { n: 5, range: '29–31' },
]

function loadAll() {
  try {
    const raw = window.localStorage.getItem(TARGETS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// "14 21", "14/21", "21-14" -> "14-21" style cleanup (keeps the order typed).
function cleanNumber(value) {
  const parts = value.split(/[^0-9]+/).filter(Boolean)
  return parts.map((p) => String(parseInt(p, 10)).padStart(2, '0')).join('-')
}

export default function Targets({ province = 'default' }) {
  const [all, setAll] = useState(loadAll)
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth())
  const [drafts, setDrafts] = useState({}) // weekNumber -> input text
  const [confirmKey, setConfirmKey] = useState(null) // "week:number" waiting for delete confirmation

  useEffect(() => {
    try {
      window.localStorage.setItem(TARGETS_KEY, JSON.stringify(all))
    } catch {
      // storage full or disabled — ignore
    }
  }, [all])

  const keyFor = (m, w) => `${province}:${m}:${w}`
  const getList = (m, w) => (Array.isArray(all[keyFor(m, w)]) ? all[keyFor(m, w)] : [])

  function addNumber(w) {
    const num = cleanNumber(drafts[w] || '')
    if (!num) return
    const list = getList(monthIdx, w)
    if (!list.includes(num)) {
      setAll((prev) => ({ ...prev, [keyFor(monthIdx, w)]: [...list, num] }))
    }
    setDrafts((d) => ({ ...d, [w]: '' }))
  }

  function removeNumber(w, num) {
    setConfirmKey(null)
    setAll((prev) => ({
      ...prev,
      [keyFor(monthIdx, w)]: getList(monthIdx, w).filter((n) => n !== num),
    }))
  }

  const monthCount = (m) => WEEKS.reduce((sum, wk) => sum + getList(m, wk.n).length, 0)

  return (
    <div className="targets">
      <p className="targets-intro">
        Pick a month, then add the numbers you want to target in each week (e.g.{' '}
        <strong>14-21</strong>). They stay saved on this device until you delete them (you will be asked to confirm).
      </p>

      <div className="targets-months" role="tablist" aria-label="Choose a month">
        {MONTHS.map((name, i) => {
          const count = monthCount(i)
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={monthIdx === i}
              className={`targets-month ${monthIdx === i ? 'is-active' : ''}`}
              onClick={() => {
                setMonthIdx(i)
                setConfirmKey(null)
              }}
            >
              {name.slice(0, 3)}
              {count > 0 && <span className="targets-badge">{count}</span>}
            </button>
          )
        })}
      </div>

      <h3 className="targets-heading">{MONTHS[monthIdx]} targets</h3>

      <div className="targets-weeks">
        {WEEKS.map((wk) => {
          const list = getList(monthIdx, wk.n)
          return (
            <section className="targets-week" key={wk.n}>
              <header className="targets-week-head">
                <span className="targets-week-name">Week {wk.n}</span>
                <span className="targets-week-range">Days {wk.range}</span>
              </header>

              <div className="targets-chips">
                {list.length === 0 && <span className="targets-empty">No target yet</span>}
                {list.map((num) => {
                  const ck = `${wk.n}:${num}`
                  return confirmKey === ck ? (
                    <span className="targets-chip is-confirm" key={num}>
                      Delete {num}?
                      <button
                        type="button"
                        className="targets-chip-yes"
                        onClick={() => removeNumber(wk.n, num)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className="targets-chip-x"
                        onClick={() => setConfirmKey(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="targets-chip" key={num}>
                      {num}
                      <button
                        type="button"
                        className="targets-chip-x"
                        aria-label={`Remove ${num}`}
                        onClick={() => setConfirmKey(ck)}
                      >
                        ✕
                      </button>
                    </span>
                  )
                })}
              </div>

              <div className="targets-add">
                <input
                  type="text"
                  inputMode="numeric"
                  className="targets-input"
                  placeholder="e.g. 14-21"
                  value={drafts[wk.n] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [wk.n]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addNumber(wk.n)
                  }}
                  aria-label={`Add a target number for week ${wk.n} of ${MONTHS[monthIdx]}`}
                />
                <button type="button" className="targets-add-btn" onClick={() => addNumber(wk.n)}>
                  Add
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
