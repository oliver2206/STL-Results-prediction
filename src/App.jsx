import { useEffect, useMemo, useState } from 'react'
import { PROVINCES, DEFAULT_PROVINCE, drawResultsByProvince, myNumbersByProvince } from './data/provinces.js'
import './App.css'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const FAVORITES_KEY = 'stl-favorites'
const PROVINCE_KEY = 'stl-province'
// Per-province, per-month ON/OFF switches the person flips by hand in the
// "Manage Months" panel. Each data file already ships an `enabled` default
// per month (see the data files), but anything saved here overrides that
// default. Turning a month OFF keeps its numbers in the file — it just gets
// left out of every prediction/cycle/hot-cold/compare calculation.
const MONTH_TOGGLES_KEY = 'stl-month-toggles'

// Buckets used by the Random Pick "Months Away" strategy — how many
// calendar months ago a combo's most recent draw landed. 13 is a catch-all
// for "13 or more months ago" so nothing overdue ever falls off the list.
const MONTHS_AWAY_BUCKETS = [6, 7, 8, 9, 10, 11, 12, 13]

const SLOT_META = [
  { key: 'morning', label: 'Morning', time: '10:30 AM', accentVar: '--am' },
  { key: 'afternoon', label: 'Afternoon', time: '3:00 PM', accentVar: '--pm' },
  { key: 'evening', label: 'Evening', time: '7:00 PM', accentVar: '--eve' },
]

// Buckets a day-of-month into a "week of the month" label, so a predicted
// month can also point at roughly which week to watch (based on the day the
// combo last landed on). 1-7 = Week 1, 8-14 = Week 2, 15-21 = Week 3, 22-28 =
// Week 4, 29-31 = Week 5.
function weekOfMonthLabel(dateStr) {
  const day = Number(dateStr.split('-')[2])
  if (day <= 7) return { label: 'Week 1', range: '1–7' }
  if (day <= 14) return { label: 'Week 2', range: '8–14' }
  if (day <= 21) return { label: 'Week 3', range: '15–21' }
  if (day <= 28) return { label: 'Week 4', range: '22–28' }
  return { label: 'Week 5', range: '29–31' }
}

function formatDay(dateStr) {
  // dateStr: "YYYY-MM-DD" — parse manually to avoid timezone shifting the day
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    weekday: WEEKDAY[dt.getDay()],
    day: String(d).padStart(2, '0'),
  }
}

// Turns "7-11", "11-7", "7 11", "07-11" etc into the same key ("7-11"),
// so a search matches a draw no matter what order the numbers were typed in.
// A single number like "7" normalizes to just "7".
function normalizeNumber(value) {
  if (!value) return ''
  const parts = value
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10))
  if (parts.length === 0) return ''
  return [...parts].sort((a, b) => a - b).join('-')
}

function parseParts(value) {
  const normalized = normalizeNumber(value)
  if (!normalized) return []
  return normalized.split('-').map(Number)
}

// Given a month name ("August") and an offset in months, returns the
// resulting month name, wrapping around the Jan–Dec calendar.
function addMonths(monthName, offset) {
  const idx = MONTH_NAMES.indexOf(monthName)
  if (idx === -1) return monthName
  const wrapped = ((idx + offset) % 12 + 12) % 12
  return MONTH_NAMES[wrapped]
}

// Exact calendar-month distance between two "YYYY-MM-DD" dates (e.g.
// January -> July = 6), regardless of which day of the month either fell on.
function calendarMonthGap(dateA, dateB) {
  const [ay, am] = dateA.split('-').map(Number)
  const [by, bm] = dateB.split('-').map(Number)
  return (by * 12 + bm) - (ay * 12 + am)
}

// Fisher–Yates shuffle — used to draw random picks without replacement
// from a bucket's eligible pool.
function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadProvince() {
  try {
    const raw = window.localStorage.getItem(PROVINCE_KEY)
    return raw && drawResultsByProvince[raw] ? raw : DEFAULT_PROVINCE
  } catch {
    return DEFAULT_PROVINCE
  }
}

// Loads the person's manual ON/OFF overrides — an object shaped like
// { "ilocosSur:2026-07": false, ... }. Keys not present here just fall back
// to whatever the data file's own `enabled` flag says.
function loadMonthToggles() {
  try {
    const raw = window.localStorage.getItem(MONTH_TOGGLES_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Unique key per saved-number entry, so the same combo saved under two
// different months (or with a different label) is tracked separately.
function savedEntryKey(entry) {
  return `${normalizeNumber(entry.number)}|${entry.month}`
}

function Slot({ label, time, value, accentVar, isMatch, isFavorite, onToggleFavorite }) {
  const hasValue = value && value.trim().length > 0
  return (
    <div className={`slot ${isMatch ? 'is-match' : ''}`} style={{ '--accent': `var(${accentVar})` }}>
      <div className="slot-head">
        <span className="slot-label">{label}</span>
        <span className="slot-time">{time}</span>
        {hasValue && onToggleFavorite && (
          <button
            type="button"
            className={`pin-btn ${isFavorite ? 'is-pinned' : ''}`}
            onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Unpin ${value}` : `Pin ${value}`}
            title={isFavorite ? 'Unpin this number' : 'Pin this number'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
        )}
      </div>
      <div className={`slot-number ${hasValue ? '' : 'is-empty'}`}>
        {hasValue ? value : '—'}
      </div>
    </div>
  )
}

function tierStyle(bucket) {
  if (bucket >= 5) return { icon: '🔥', className: 'predict-tier-hot', chipClass: 'predict-chip-hot' }
  if (bucket >= 2) return { icon: '⭐', className: 'predict-tier-warm', chipClass: 'predict-chip-warm' }
  return { icon: '•', className: 'predict-tier-cool', chipClass: 'predict-chip-cool' }
}

export default function App() {
  const [province, setProvince] = useState(loadProvince)
  // The whole dataset — results, predictions, cycles, my numbers — swaps
  // together whenever the selected province changes.
  const drawResults = drawResultsByProvince[province] ?? drawResultsByProvince[DEFAULT_PROVINCE]
  const myNumbers = myNumbersByProvince[province] ?? myNumbersByProvince[DEFAULT_PROVINCE]

  const monthKeys = useMemo(
    () => Object.keys(drawResults).sort((a, b) => (a < b ? 1 : -1)),
    [drawResults],
  )
  // monthKeys is sorted newest-first, so the last entry is the earliest
  // month in the dataset and the first entry is the latest.
  const earliestMonthKey = monthKeys[monthKeys.length - 1] ?? '2022-01'
  const latestMonthKey = monthKeys[0] ?? '2022-01'
  const [activeMonth, setActiveMonth] = useState(monthKeys[0])

  // Manual per-month ON/OFF overrides, keyed "<province>:<monthKey>".
  const [monthToggles, setMonthToggles] = useState(loadMonthToggles)
  useEffect(() => {
    try {
      window.localStorage.setItem(MONTH_TOGGLES_KEY, JSON.stringify(monthToggles))
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [monthToggles])

  // Whether a month currently counts toward predictions/cycles/hot-cold/
  // compare. A manual override always wins; otherwise fall back to the
  // month's own `enabled` flag in the data file (defaults to true).
  function isMonthEnabled(key) {
    const overrideKey = `${province}:${key}`
    if (Object.prototype.hasOwnProperty.call(monthToggles, overrideKey)) {
      return monthToggles[overrideKey]
    }
    return drawResults[key]?.enabled !== false
  }

  function setMonthEnabled(key, enabled) {
    setMonthToggles((prev) => ({ ...prev, [`${province}:${key}`]: enabled }))
  }

  // The subset of months that currently count toward predictions/cycles/
  // hot-cold/compare. Turning a month OFF in "Manage Months" removes it
  // from here — its numbers stay in the file, they just stop being counted.
  const enabledMonthKeys = useMemo(
    () => monthKeys.filter((key) => isMonthEnabled(key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKeys, monthToggles, province, drawResults],
  )
  const [manageMonthsOpen, setManageMonthsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState(loadFavorites)
  const [compareMode, setCompareMode] = useState(false)
  const [compareMonthIdx, setCompareMonthIdx] = useState(null)
  const [predictMode, setPredictMode] = useState(false)
  const [predictMonthIdx, setPredictMonthIdx] = useState(null)
  const [predictYearsWindow, setPredictYearsWindow] = useState('all')
  const [predictAnchorYear, setPredictAnchorYear] = useState(null)
  const [myNumberMode, setMyNumberMode] = useState(false)
  const [myNumberQuery, setMyNumberQuery] = useState('')
  const [cycleMode, setCycleMode] = useState(false)
  // Custom "From \u2192 To" month/year range for the 6-Month Cycle search.
  // Defaults to the full span of data on hand (earliest month -> latest month).
  const [cycleFromMonth, setCycleFromMonth] = useState(
    parseInt(earliestMonthKey.slice(5, 7), 10) - 1,
  )
  const [cycleFromYear, setCycleFromYear] = useState(parseInt(earliestMonthKey.slice(0, 4), 10))
  const [cycleToMonth, setCycleToMonth] = useState(parseInt(latestMonthKey.slice(5, 7), 10) - 1)
  const [cycleToYear, setCycleToYear] = useState(parseInt(latestMonthKey.slice(0, 4), 10))
  // How many months apart a combo's two draws must land to count as a
  // "cycle" — user-selectable 1–12, defaults to the original 6.
  const [cycleMonths, setCycleMonths] = useState(6)
  const [hasSearchedCycle, setHasSearchedCycle] = useState(false)
  const [expandedCycleCombo, setExpandedCycleCombo] = useState(null)
  const [cycleView, setCycleView] = useState('number') // 'number' | 'grid' | 'predict'
  const [expandedSixMonthPredict, setExpandedSixMonthPredict] = useState(null) // "predict-monthIdx-normalized" | null
  const [expandedGridCombo, setExpandedGridCombo] = useState(null) // "pairIdx-normalized" | null

  // "Every Year" tab — for a custom year range (defaults to 2024–2026),
  // finds numbers that were drawn in the SAME calendar month in every
  // single year of that range (e.g. hit in January 2024, January 2025,
  // AND January 2026 = a January "every year" number).
  const [yearlyMode, setYearlyMode] = useState(false)
  const [yearlyFromYear, setYearlyFromYear] = useState(2024)
  const [yearlyToYear, setYearlyToYear] = useState(2026)
  const [expandedYearlyCombo, setExpandedYearlyCombo] = useState(null) // "monthIdx-normalized" | null

  // "Hot & Cold" tab — for one calendar month (e.g. January) and a custom
  // year range (defaults 2024–2026):
  //   HOT  = a number/combo drawn 3+ times in that month within the range.
  //   COLD = a number/combo that has NEVER been drawn in that month, in any
  //          year on record (checked across the whole dataset, not just the
  //          selected range).
  //   Everything in between is bucketed by how long it's been since that
  //   combo last hit (in that month) counting up to today: 6, 7, 8, 9, and
  //   10–12 months ago — a "warming up" scale for numbers that are overdue.
  const [hotColdMode, setHotColdMode] = useState(false)
  const [hotColdMonthIdx, setHotColdMonthIdx] = useState(new Date().getMonth())
  const [hotColdFromYear, setHotColdFromYear] = useState(2024)
  const [hotColdToYear, setHotColdToYear] = useState(2026)
  const [expandedHotColdCombo, setExpandedHotColdCombo] = useState(null) // "tier-normalized" | null
  const [expandedSixMonthEverCombo, setExpandedSixMonthEverCombo] = useState(null) // rowKey | null
  // How many months apart the "Every N Months" panel (top of Hot & Cold)
  // requires between two of a combo's draws — selectable 6-14, defaults 6.
  const [sixMonthEverGap, setSixMonthEverGap] = useState(6)
  // How many results to show in the "Every N Months" list — selectable
  // 1-10, defaults 10. Top-ranked combos (most gap matches, then most
  // total hits) are kept first.
  const [sixMonthEverHowMany, setSixMonthEverHowMany] = useState(10)

  // "Random Pick" tab — builds a filtered pool of combos from the picked
  // criteria, then draws one at random from that pool.
  //   strategy 'month'    -> combos hit at least N times in a chosen
  //                          calendar month, within a chosen year range.
  //   strategy 'everyYear' -> combos hit at least once in EVERY year of
  //                          the chosen range.
  //   strategy 'recentHot' -> combos hit at least N times in the last
  //                          6–12 months (rolling window from today).
  //   strategy 'range'    -> combos hit at least N times anywhere within
  //                          the chosen year range (no month filter).
  const [randomMode, setRandomMode] = useState(false)
  const [randomStrategy, setRandomStrategy] = useState('month')
  const [randomMonthIdx, setRandomMonthIdx] = useState(new Date().getMonth())
  const [randomMinTimes, setRandomMinTimes] = useState(2)
  // Optional extra filter for the "Month + Times" strategy — null means no
  // filter (the original behavior). A number means "also require the
  // combo's overall most recent draw to be at least this many calendar
  // months ago" — so it's not just a hit-count match, it's also not one
  // that just fired recently.
  const [randomMonthTimesAwayMin, setRandomMonthTimesAwayMin] = useState(null)
  const [randomFromYear, setRandomFromYear] = useState(2024)
  const [randomToYear, setRandomToYear] = useState(2026)
  // 'everyYear' target month — null means "any month" (must hit at least
  // once somewhere in the year, any month); a month index means "must hit
  // in THAT SAME calendar month every year" (e.g. pick August -> only
  // numbers drawn every single August in the range qualify).
  const [randomEveryYearMonthIdx, setRandomEveryYearMonthIdx] = useState(null)
  const [randomRecentWindow, setRandomRecentWindow] = useState(6)
  const [randomRecentMinTimes, setRandomRecentMinTimes] = useState(3)
  // Optional target month for "Recent Hot Streak" — null means "Any month"
  // (rolling window ending today, the original behavior). A month index
  // switches the check to "hit that specific month N+ times, counting
  // every year from randomRecentFromYear through the current year" (e.g.
  // pick August -> how many times has it hit in August since 2024).
  const [randomRecentTargetMonthIdx, setRandomRecentTargetMonthIdx] = useState(null)
  const [randomRecentFromYear, setRandomRecentFromYear] = useState(2024)
  const [randomRangeMinTimes, setRandomRangeMinTimes] = useState(1)
  // Optional target month for the "Year Range" strategy — null means "any
  // month" (the original, broadest behavior).
  const [randomRangeTargetMonthIdx, setRandomRangeTargetMonthIdx] = useState(null)
  const [randomPick, setRandomPick] = useState(null)
  const [randomHistory, setRandomHistory] = useState([])

  // 'monthsAway' strategy — separate buckets for how many calendar months
  // ago a combo's most recent draw landed (6 through 13+, see
  // MONTHS_AWAY_BUCKETS). Anything under 6 months ago is always rejected.
  // Each bucket has its own "how many to randomly pick" count, and its own
  // set of currently-picked combos (kept until re-rolled so the picks
  // don't reset on every render).
  const [randomMonthsAwayCounts, setRandomMonthsAwayCounts] = useState({
    6: 3, 7: 4, 8: 2, 9: 2, 10: 1, 11: 1, 12: 1, 13: 1,
  })
  const [randomMonthsAwayPicks, setRandomMonthsAwayPicks] = useState({})
  // Optional target month — null means "count backward from today" (the
  // original behavior). Set to a month index (e.g. August) to instead
  // count backward from that month's most recent occurrence, so "6 months
  // ago" means 6 months before that August, not before today.
  const [monthsAwayTargetMonthIdx, setMonthsAwayTargetMonthIdx] = useState(null)
  // Custom "From -> To" month/year range that scopes which draws are
  // considered at all — defaults to the full span of data on hand.
  const [monthsAwayFromMonth, setMonthsAwayFromMonth] = useState(
    parseInt(earliestMonthKey.slice(5, 7), 10) - 1,
  )
  const [monthsAwayFromYear, setMonthsAwayFromYear] = useState(parseInt(earliestMonthKey.slice(0, 4), 10))
  const [monthsAwayToMonth, setMonthsAwayToMonth] = useState(parseInt(latestMonthKey.slice(5, 7), 10) - 1)
  const [monthsAwayToYear, setMonthsAwayToYear] = useState(parseInt(latestMonthKey.slice(0, 4), 10))

  // "Date Calculator" tab — plain date-math utility, unrelated to draw
  // history: pick two dates and see the gap between them broken down into
  // total days AND a calendar months+days breakdown (e.g. Jan 22, 2026 ->
  // Aug 2, 2026 = 6 months, 11 days / 193 days total).
  const todayISO = new Date().toISOString().slice(0, 10)
  const [dateCalcMode, setDateCalcMode] = useState(false)
  const [dateCalcFrom, setDateCalcFrom] = useState(todayISO)
  const [dateCalcTo, setDateCalcTo] = useState(todayISO)


  // Reminder = whatever you've saved under the CURRENT calendar month.
  // Updates automatically as the month changes — no "new vs seen" tracking.
  const currentMonthName = MONTH_NAMES[new Date().getMonth()]
  const currentMonthReminders = useMemo(
    () => myNumbers.filter((entry) => entry.month === currentMonthName),
    [currentMonthName, myNumbers],
  )

  // Follow-up: for each number saved this month, when is it "due" again
  // 6 months out (e.g. saved in August -> follow up in February)?
  const followUpMonthName = addMonths(currentMonthName, 6)

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    } catch {
      // localStorage unavailable (private mode, etc.) — ignore silently
    }
  }, [favorites])

  useEffect(() => {
    try {
      window.localStorage.setItem(PROVINCE_KEY, province)
    } catch {
      // localStorage unavailable (private mode, etc.) — ignore silently
    }
  }, [province])

  // Switching provinces swaps the whole dataset, so anything pointing at a
  // specific month/year/expanded-row from the old province needs to reset —
  // otherwise it can point at a month key or combo that doesn't exist here.
  useEffect(() => {
    setActiveMonth(monthKeys[0])
    setCompareMonthIdx(null)
    setPredictMonthIdx(null)
    setPredictAnchorYear(null)
    setQuery('')
    setMyNumberQuery('')
    setHasSearchedCycle(false)
    setExpandedCycleCombo(null)
    setExpandedGridCombo(null)
    setExpandedSixMonthPredict(null)
    setExpandedYearlyCombo(null)
    setExpandedHotColdCombo(null)
    setExpandedYear(null)
    setExpandedMonth(null)
    setExpandedAllTimeMonth(null)
    setExpandedSavedMonth(null)
    setExpandedSavedCardMonth(null)
    setSavedStatsYear('all')
    setCycleFromMonth(parseInt(earliestMonthKey.slice(5, 7), 10) - 1)
    setCycleFromYear(parseInt(earliestMonthKey.slice(0, 4), 10))
    setCycleToMonth(parseInt(latestMonthKey.slice(5, 7), 10) - 1)
    setCycleToYear(parseInt(latestMonthKey.slice(0, 4), 10))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province])

  function toggleFavorite(normalized) {
    if (!normalized) return
    setFavorites((prev) =>
      prev.includes(normalized) ? prev.filter((f) => f !== normalized) : [...prev, normalized],
    )
  }

  const normalizedQuery = normalizeNumber(query)
  const queryParts = useMemo(() => parseParts(query), [query])
  const isSearching = normalizedQuery.length > 0
  const isSingleNumberSearch = queryParts.length === 1

  // Flat, searchable list built once: every draw across every month that is
  // currently switched ON. A month turned OFF in "Manage Months" is skipped
  // here entirely, so it never feeds predictions, cycles, hot/cold, or the
  // "My Number" stats — even though its raw numbers still exist in the file
  // and are still visible when you browse that month directly.
  const allDraws = useMemo(() => {
    const flat = []
    for (const key of enabledMonthKeys) {
      const { label, days } = drawResults[key]
      for (const row of days) {
        for (const slot of SLOT_META) {
          const value = row[slot.key]
          if (value && value.trim().length > 0) {
            const parts = parseParts(value)
            flat.push({
              monthKey: key,
              monthLabel: label,
              date: row.date,
              ...slot,
              value,
              normalized: normalizeNumber(value),
              parts,
            })
          }
        }
      }
    }
    return flat
  }, [enabledMonthKeys, drawResults])

  // Detects saved numbers that have historically repeated on a calendar
  // cycle somewhere between 3 and 12 months apart (e.g. hit in both March
  // and September = a 6-month cycle; hit in April and July = a 3-month
  // cycle), and predicts the next month that cycle points to. Every pair
  // of a number's hit-dates is checked, not just consecutive ones, since a
  // real cycle can skip an in-between draw. When more than one gap length
  // qualifies, the pair anchored on the most recent evidence wins.
  const MIN_CYCLE_MONTHS = 3
  const MAX_CYCLE_MONTHS = 12
  const monthlyPatterns = useMemo(() => {
    // Dedup myNumbers by normalized combo — a number saved under two
    // months should only be analyzed once.
    const seen = new Set()
    const results = []
    for (const entry of myNumbers) {
      const normalized = normalizeNumber(entry.number)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)

      const parts = normalized.split('-').map(Number)
      const isSingle = parts.length === 1
      const matches = isSingle
        ? allDraws.filter((d) => d.parts.includes(parts[0]))
        : allDraws.filter((d) => d.normalized === normalized)
      if (matches.length < 2) continue

      const sorted = [...matches].sort((a, b) => (a.date < b.date ? -1 : 1))

      // Scan every pair of hits (oldest -> newest) for a gap that falls
      // inside the 3–12 month window, keeping whichever qualifying pair
      // ends on the most recent date — that's the freshest signal to
      // project forward from.
      let best = null
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const gap = calendarMonthGap(sorted[i].date, sorted[j].date)
          if (gap < MIN_CYCLE_MONTHS || gap > MAX_CYCLE_MONTHS) continue
          if (!best || sorted[j].date > best.laterEntry.date) {
            best = { laterEntry: sorted[j], gap }
          }
        }
      }
      if (!best) continue

      const lastHit = best.laterEntry
      const lastHitMonthIdx = parseInt(lastHit.monthKey.slice(5, 7), 10) - 1
      const nextMonthName = MONTH_NAMES[(lastHitMonthIdx + best.gap) % 12]

      results.push({
        normalized,
        lastHitMonthName: MONTH_NAMES[lastHitMonthIdx],
        lastHitDate: lastHit.date,
        nextMonthName,
        predictedWeek: weekOfMonthLabel(lastHit.date),
        hitCount: matches.length,
        intervalMonths: best.gap,
      })
    }
    return results
  }, [allDraws, myNumbers])

  // "6 Months Cycle" tab — scans EVERY combo that has ever been drawn (not
  // just saved numbers) for one that keeps reappearing EXACTLY six calendar
  // months apart (e.g. drawn in January, then again in July — same as
  // Feb<->Aug, Mar<->Sep, etc). This checks the calendar month distance
  // only (day-of-month is irrelevant, and "11-07" / "07-11" are already the
  // same combo since normalizeNumber sorts them) — a gap of 5 months or 7
  // months does NOT count, only exactly 6.
  //
  // cycleFromMonth/cycleFromYear -> cycleToMonth/cycleToYear define a custom
  // From–To range (inclusive). Only draws whose month falls inside that
  // range are checked, and a combo qualifies if it has at least one exact
  // 6-month gap between two of its draws inside that range.
  const sixMonthCycleAll = useMemo(() => {
    if (!hasSearchedCycle) return []

    const byCombo = new Map()
    for (const d of allDraws) {
      const list = byCombo.get(d.normalized)
      if (list) list.push(d)
      else byCombo.set(d.normalized, [d])
    }

    const fromKey = `${cycleFromYear}-${String(cycleFromMonth + 1).padStart(2, '0')}`
    const toKey = `${cycleToYear}-${String(cycleToMonth + 1).padStart(2, '0')}`
    // Swap so "from" is always the earlier month-year, in case the person
    // picked them backwards.
    const [rangeStart, rangeEnd] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey]

    const results = []
    for (const [normalized, matches] of byCombo) {
      // Only this number's draws inside the chosen From–To range count —
      // that's what makes the cycle check happen "within" the picked span
      // instead of spanning the number's whole history.
      const pool = matches.filter((d) => d.monthKey >= rangeStart && d.monthKey <= rangeEnd)

      if (pool.length < 2) continue

      const sorted = [...pool].sort((a, b) => (a.date < b.date ? -1 : 1))

      let sixMonthGaps = 0
      for (let i = 1; i < sorted.length; i++) {
        if (calendarMonthGap(sorted[i - 1].date, sorted[i].date) === cycleMonths) sixMonthGaps++
      }
      // One clean exact-N-month gap inside the chosen range is the whole ask.
      if (sixMonthGaps < 1) continue

      // Project the "next possible" month from this number's last qualifying
      // draw inside the chosen range.
      const referenceHit = sorted[sorted.length - 1]
      const referenceMonthIdx = parseInt(referenceHit.monthKey.slice(5, 7), 10) - 1

      results.push({
        normalized,
        hitCount: pool.length,
        sixMonthGaps,
        lastHitMonthName: MONTH_NAMES[referenceMonthIdx],
        lastHitDate: referenceHit.date,
        nextMonthName: MONTH_NAMES[(referenceMonthIdx + cycleMonths) % 12],
        // Which week of the predicted month to watch — same week-of-month
        // the combo landed on last time (e.g. drawn 2026-06-26 -> Week 4 ->
        // predicts Week 4 of December too).
        predictedWeek: weekOfMonthLabel(referenceHit.date),
        // Newest-first, for the expanded draw list (matches the Search tab's order).
        draws: [...sorted].sort((a, b) => (a.date < b.date ? 1 : -1)),
      })
    }

    // Strongest cycles first: more N-month-spaced repeats, then more total hits.
    results.sort((a, b) => b.sixMonthGaps - a.sixMonthGaps || b.hitCount - a.hitCount)
    return results
  }, [
    allDraws,
    cycleFromMonth,
    cycleFromYear,
    cycleToMonth,
    cycleToYear,
    cycleMonths,
    hasSearchedCycle,
  ])

  // "Every Year" tab — separate from the 6-month cycle detector above.
  // For each calendar month (Jan–Dec) it checks the chosen year range
  // (e.g. 2024–2026) and flags any number that was drawn in THAT SAME
  // month in every single one of those years — a number that "shows up
  // every year". A month only reports results once every year in the
  // range actually has at least one logged draw for it (so a month with
  // no data yet in the latest year, like a future 2026 month, is marked
  // incomplete instead of silently under-counting).
  const yearlyRepeaters = useMemo(() => {
    const fromY = Math.min(yearlyFromYear, yearlyToYear)
    const toY = Math.max(yearlyFromYear, yearlyToYear)
    const yearsInRange = []
    for (let y = fromY; y <= toY; y++) yearsInRange.push(String(y))

    // byMonth[monthIdx] = Map(year -> Map(normalizedCombo -> [draws]))
    const byMonth = Array.from({ length: 12 }, () => new Map())
    for (const d of allDraws) {
      const year = d.monthKey.slice(0, 4)
      if (!yearsInRange.includes(year)) continue
      const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
      const yearMap = byMonth[monthIdx]
      let comboMap = yearMap.get(year)
      if (!comboMap) {
        comboMap = new Map()
        yearMap.set(year, comboMap)
      }
      const list = comboMap.get(d.normalized)
      if (list) list.push(d)
      else comboMap.set(d.normalized, [d])
    }

    const months = MONTH_NAMES.map((name, monthIdx) => {
      const yearMap = byMonth[monthIdx]
      const yearsWithData = yearsInRange.filter((y) => (yearMap.get(y)?.size ?? 0) > 0)
      const complete = yearsWithData.length === yearsInRange.length

      if (!complete) {
        return { name, monthIdx, combos: [], yearsWithData, complete }
      }

      // Intersect the combo sets across every year in range.
      let comboSet = new Set(yearMap.get(yearsInRange[0]).keys())
      for (const y of yearsInRange.slice(1)) {
        const yearCombos = yearMap.get(y)
        comboSet = new Set([...comboSet].filter((c) => yearCombos.has(c)))
      }

      const combos = [...comboSet].map((normalized) => {
        const draws = yearsInRange.flatMap((y) => yearMap.get(y).get(normalized) ?? [])
        return {
          normalized,
          draws: [...draws].sort((a, b) => (a.date < b.date ? 1 : -1)),
          yearHits: yearsInRange.map((y) => ({
            year: y,
            count: yearMap.get(y).get(normalized)?.length ?? 0,
          })),
        }
      })
      combos.sort((a, b) => b.draws.length - a.draws.length)

      return { name, monthIdx, combos, yearsWithData, complete }
    })

    return { months, yearsInRange }
  }, [allDraws, yearlyFromYear, yearlyToYear])

  // "Hot & Cold" tab data — see the state comment above for the rules.
  const HOT_THRESHOLD = 3
  const hotColdData = useMemo(() => {
    const fromY = Math.min(hotColdFromYear, hotColdToYear)
    const toY = Math.max(hotColdFromYear, hotColdToYear)

    // Today's real date, used as the "how long ago" reference point for
    // the warming-up tiers — not tied to the dataset, so it stays accurate
    // no matter how far the logged draws stretch into the future.
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Every combo ever drawn (any month) — the universe of numbers that
    // "exist" in this dataset, so Cold means "exists elsewhere, never here".
    const everyCombo = new Set(allDraws.map((d) => d.normalized))

    // All hits that ever landed specifically in this calendar month, across
    // every year on record — grouped by combo.
    const hitsThisMonthEver = new Map()
    for (const d of allDraws) {
      const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
      if (monthIdx !== hotColdMonthIdx) continue
      const list = hitsThisMonthEver.get(d.normalized)
      if (list) list.push(d)
      else hitsThisMonthEver.set(d.normalized, [d])
    }

    const hot = []
    const cold = []
    // tiers[0..3] = 6/7/8/9 months ago (exact), tiers[4] = 10–12 months ago
    const tiers = [
      { id: 6, label: '6 Months Ago', combos: [] },
      { id: 7, label: '7 Months Ago', combos: [] },
      { id: 8, label: '8 Months Ago', combos: [] },
      { id: 9, label: '9 Months Ago', combos: [] },
      { id: '10-12', label: '10–12 Months Ago', combos: [] },
    ]
    // Catch-alls for combos that hit this month but fall outside the named
    // tiers above — still shown, just grouped separately.
    const recent = [] // last hit < 6 months ago
    const dormant = [] // last hit > 12 months ago

    for (const normalized of everyCombo) {
      const hits = hitsThisMonthEver.get(normalized)

      if (!hits || hits.length === 0) {
        cold.push({ normalized })
        continue
      }

      const sorted = [...hits].sort((a, b) => (a.date < b.date ? 1 : -1))
      const lastHit = sorted[0]
      const inRangeCount = hits.filter(
        (h) => Number(h.monthKey.slice(0, 4)) >= fromY && Number(h.monthKey.slice(0, 4)) <= toY,
      ).length

      const entry = {
        normalized,
        totalHits: hits.length,
        inRangeCount,
        lastHitDate: lastHit.date,
        draws: [...hits].sort((a, b) => (a.date < b.date ? 1 : -1)),
      }

      if (inRangeCount >= HOT_THRESHOLD) {
        hot.push(entry)
        continue
      }

      const gap = calendarMonthGap(lastHit.date, todayStr)
      if (gap < 6) recent.push(entry)
      else if (gap <= 9) tiers[gap - 6].combos.push(entry)
      else if (gap <= 12) tiers[4].combos.push(entry)
      else dormant.push(entry)
    }

    hot.sort((a, b) => b.inRangeCount - a.inRangeCount || a.normalized.localeCompare(b.normalized))
    cold.sort((a, b) => a.normalized.localeCompare(b.normalized))
    recent.sort((a, b) => (a.lastHitDate < b.lastHitDate ? 1 : -1))
    dormant.sort((a, b) => (a.lastHitDate < b.lastHitDate ? -1 : 1))
    for (const tier of tiers) {
      tier.combos.sort((a, b) => (a.lastHitDate < b.lastHitDate ? -1 : 1))
    }

    return { hot, cold, tiers, recent, dormant, fromY, toY, todayStr }
  }, [allDraws, hotColdMonthIdx, hotColdFromYear, hotColdToYear])

  // "Every N Months" panel — sits at the top of the Hot & Cold tab. Fixed
  // window (January 2024 -> the current month, unlike the adjustable
  // MONTH CYCLE tab), scanning every combo ever drawn for at least one
  // exact N-calendar-month gap (N selectable 6-12, via sixMonthEverGap)
  // between two of its draws inside that window. For each match it
  // projects a next-hit prediction the same way the Month Cycle tab does:
  // next month = last hit's month + N, and the predicted week-of-month =
  // whichever week the last hit landed on.
  const SIX_MONTH_EVER_FROM_KEY = '2024-01'
  const everySixMonthsData = useMemo(() => {
    const now = new Date()
    const toKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const todayStr = now.toISOString().slice(0, 10)

    const byCombo = new Map()
    for (const d of allDraws) {
      if (d.monthKey < SIX_MONTH_EVER_FROM_KEY || d.monthKey > toKey) continue
      const list = byCombo.get(d.normalized)
      if (list) list.push(d)
      else byCombo.set(d.normalized, [d])
    }

    let rejectedRecent = 0
    const combos = []
    for (const [normalized, matches] of byCombo) {
      if (matches.length < 2) continue
      const sorted = [...matches].sort((a, b) => (a.date < b.date ? -1 : 1))

      let gapMatches = 0
      // A short gap between ANY two of this combo's draws (e.g. drawn in
      // January and again in March — only 2 months apart) means it's not
      // repeating on a clean, spaced-out cycle, so it's disqualified
      // entirely rather than just having that one gap ignored.
      let hasShortGap = false
      for (let i = 1; i < sorted.length; i++) {
        const gap = calendarMonthGap(sorted[i - 1].date, sorted[i].date)
        if (gap === sixMonthEverGap) gapMatches++
        if (gap > 0 && gap < 6) hasShortGap = true
      }
      if (gapMatches < 1 || hasShortGap) continue

      const referenceHit = sorted[sorted.length - 1]
      const referenceMonthIdx = parseInt(referenceHit.monthKey.slice(5, 7), 10) - 1

      // Reject numbers whose most recent draw was less than 6 months ago
      // — too soon to be "due" for a next window under this cycle.
      if (calendarMonthGap(referenceHit.date, todayStr) < 6) {
        rejectedRecent++
        continue
      }

      combos.push({
        normalized,
        hitCount: matches.length,
        sixMonthGaps: gapMatches,
        lastHitMonthName: MONTH_NAMES[referenceMonthIdx],
        lastHitDate: referenceHit.date,
        nextMonthName: MONTH_NAMES[(referenceMonthIdx + sixMonthEverGap) % 12],
        predictedWeek: weekOfMonthLabel(referenceHit.date),
        draws: [...sorted].sort((a, b) => (a.date < b.date ? 1 : -1)),
      })
    }

    combos.sort((a, b) => b.sixMonthGaps - a.sixMonthGaps || b.hitCount - a.hitCount)
    return {
      combos: combos.slice(0, sixMonthEverHowMany),
      totalMatches: combos.length,
      rejectedRecent,
      fromKey: SIX_MONTH_EVER_FROM_KEY,
      toKey,
    }
  }, [allDraws, sixMonthEverGap, sixMonthEverHowMany])

  // "Random Pick" tab — the candidate pool for whichever strategy is
  // selected. Every strategy produces the same shape: [{ normalized,
  // hitCount, draws }], sorted newest-hit-first, so the UI doesn't need to
  // know which strategy built the list.
  const randomPool = useMemo(() => {
    const fromY = Math.min(randomFromYear, randomToYear)
    const toY = Math.max(randomFromYear, randomToYear)

    const byCombo = new Map()
    for (const d of allDraws) {
      const list = byCombo.get(d.normalized)
      if (list) list.push(d)
      else byCombo.set(d.normalized, [d])
    }
    const finish = (normalized, hits) => ({
      normalized,
      hitCount: hits.length,
      draws: [...hits].sort((a, b) => (a.date < b.date ? 1 : -1)),
    })

    if (randomStrategy === 'month') {
      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)
      const results = []
      for (const [normalized, matches] of byCombo) {
        const inScope = matches.filter((d) => {
          const year = Number(d.monthKey.slice(0, 4))
          const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
          return year >= fromY && year <= toY && monthIdx === randomMonthIdx
        })
        if (inScope.length < randomMinTimes) continue
        if (randomMonthTimesAwayMin !== null) {
          const overallLast = [...matches].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
          if (calendarMonthGap(overallLast.date, todayStr) < randomMonthTimesAwayMin) continue
        }
        results.push(finish(normalized, inScope))
      }
      return results
    }

    if (randomStrategy === 'everyYear') {
      const yearsInRange = []
      for (let y = fromY; y <= toY; y++) yearsInRange.push(String(y))
      const results = []
      for (const [normalized, matches] of byCombo) {
        const inScope = matches.filter((d) => {
          if (!yearsInRange.includes(d.monthKey.slice(0, 4))) return false
          if (randomEveryYearMonthIdx === null) return true
          const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
          return monthIdx === randomEveryYearMonthIdx
        })
        const yearsHit = new Set(inScope.map((d) => d.monthKey.slice(0, 4)))
        if (yearsInRange.every((y) => yearsHit.has(y))) results.push(finish(normalized, inScope))
      }
      return results
    }

    if (randomStrategy === 'recentHot') {
      const now = new Date()
      const results = []

      if (randomRecentTargetMonthIdx !== null) {
        // Target-month mode: count hits in that specific calendar month,
        // from randomRecentFromYear through the current year (inclusive).
        const nowYear = now.getFullYear()
        for (const [normalized, matches] of byCombo) {
          const inScope = matches.filter((d) => {
            const year = Number(d.monthKey.slice(0, 4))
            const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
            return year >= randomRecentFromYear && year <= nowYear && monthIdx === randomRecentTargetMonthIdx
          })
          if (inScope.length >= randomRecentMinTimes) results.push(finish(normalized, inScope))
        }
        return results
      }

      // "Any month" mode — rolling window ending today.
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      for (const [normalized, matches] of byCombo) {
        const inScope = matches.filter((d) => calendarMonthGap(d.date, todayStr) <= randomRecentWindow)
        if (inScope.length >= randomRecentMinTimes) results.push(finish(normalized, inScope))
      }
      return results
    }

    // 'range' — anything hit at least N times within the plain year range,
    // optionally narrowed to one target calendar month.
    const results = []
    for (const [normalized, matches] of byCombo) {
      const inScope = matches.filter((d) => {
        const year = Number(d.monthKey.slice(0, 4))
        if (year < fromY || year > toY) return false
        if (randomRangeTargetMonthIdx === null) return true
        const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
        return monthIdx === randomRangeTargetMonthIdx
      })
      if (inScope.length >= randomRangeMinTimes) results.push(finish(normalized, inScope))
    }
    return results
  }, [
    allDraws,
    randomStrategy,
    randomMonthIdx,
    randomMinTimes,
    randomMonthTimesAwayMin,
    randomFromYear,
    randomToYear,
    randomEveryYearMonthIdx,
    randomRecentWindow,
    randomRecentMinTimes,
    randomRecentTargetMonthIdx,
    randomRecentFromYear,
    randomRangeMinTimes,
    randomRangeTargetMonthIdx,
  ])

  // 'monthsAway' strategy's candidate pool — every combo's most recent
  // draw within the chosen From→To range, bucketed by how many calendar
  // months ago that was (counted backward from today, or from the chosen
  // target month's most recent occurrence if one is set). Anything under
  // 6 months ago is rejected outright (too soon). 13 catches everything
  // 13+ months ago so long-overdue numbers aren't lost.
  const monthsAwayPool = useMemo(() => {
    const fromKey = `${monthsAwayFromYear}-${String(monthsAwayFromMonth + 1).padStart(2, '0')}`
    const toKey = `${monthsAwayToYear}-${String(monthsAwayToMonth + 1).padStart(2, '0')}`
    const rangeStart = fromKey <= toKey ? fromKey : toKey
    const rangeEnd = fromKey <= toKey ? toKey : fromKey

    let anchorStr
    if (monthsAwayTargetMonthIdx === null) {
      const now = new Date()
      anchorStr = now.toISOString().slice(0, 10)
    } else {
      // Most recent occurrence of the target month at or before the
      // range's end — e.g. target "August" with range ending 2026-05
      // anchors to August 2025, not August 2026.
      const [endYear, endMonthNum] = rangeEnd.split('-').map(Number)
      const endMonthIdx = endMonthNum - 1
      const anchorYear = monthsAwayTargetMonthIdx <= endMonthIdx ? endYear : endYear - 1
      anchorStr = `${anchorYear}-${String(monthsAwayTargetMonthIdx + 1).padStart(2, '0')}-01`
    }

    const byCombo = new Map()
    for (const d of allDraws) {
      if (d.monthKey < rangeStart || d.monthKey > rangeEnd) continue
      const list = byCombo.get(d.normalized)
      if (list) list.push(d)
      else byCombo.set(d.normalized, [d])
    }

    const buckets = {}
    for (const n of MONTHS_AWAY_BUCKETS) buckets[n] = []

    for (const [normalized, matches] of byCombo) {
      const sorted = [...matches].sort((a, b) => (a.date < b.date ? 1 : -1))
      const lastHit = sorted[0]
      const monthsAway = calendarMonthGap(lastHit.date, anchorStr)
      if (monthsAway < 6) continue // rejected — drawn too recently
      const bucketKey = monthsAway >= 13 ? 13 : monthsAway
      buckets[bucketKey].push({
        normalized,
        hitCount: matches.length,
        lastDate: lastHit.date,
        monthsAway,
        draws: sorted,
      })
    }

    for (const n of MONTHS_AWAY_BUCKETS) {
      buckets[n].sort((a, b) => b.hitCount - a.hitCount || (a.lastDate < b.lastDate ? -1 : 1))
    }

    return buckets
  }, [
    allDraws,
    monthsAwayTargetMonthIdx,
    monthsAwayFromMonth,
    monthsAwayFromYear,
    monthsAwayToMonth,
    monthsAwayToYear,
  ])

  // Re-rolls the random picks for a single "Months Away" bucket, drawing
  // up to that bucket's configured count without replacement.
  function rollMonthsAwayBucket(n) {
    const pool = monthsAwayPool[n] || []
    const count = randomMonthsAwayCounts[n] ?? 0
    const picked = shuffleArray(pool).slice(0, count)
    setRandomMonthsAwayPicks((prev) => ({ ...prev, [n]: picked }))
  }

  // Re-rolls every bucket at once.
  function rollMonthsAwayAll() {
    const next = {}
    for (const n of MONTHS_AWAY_BUCKETS) {
      const pool = monthsAwayPool[n] || []
      const count = randomMonthsAwayCounts[n] ?? 0
      next[n] = shuffleArray(pool).slice(0, count)
    }
    setRandomMonthsAwayPicks(next)
  }

  // Draws one random entry from the current pool, keeping the last 5 picks
  // (most recent first) so a re-roll doesn't lose the previous result.
  function rollRandomPick() {
    if (randomPool.length === 0) return
    const picked = randomPool[Math.floor(Math.random() * randomPool.length)]
    setRandomPick(picked)
    setRandomHistory((prev) => [picked, ...prev.filter((p) => p.normalized !== picked.normalized)].slice(0, 5))
  }

  // "Jan → Dec" grid — covers the whole calendar as 6 fixed month-pairs
  // exactly six months apart (Jan+Jul, Feb+Aug, Mar+Sep, Apr+Oct, May+Nov,
  // Jun+Dec). For each pair, a combo counts as a match if it was ever drawn
  // in EITHER month of the pair in ANY year — the two hits don't need to be
  // the same year, just the same pair of calendar months.
  const JAN_DEC_PAIRS = useMemo(
    () => [
      { a: 0, b: 6 },
      { a: 1, b: 7 },
      { a: 2, b: 8 },
      { a: 3, b: 9 },
      { a: 4, b: 10 },
      { a: 5, b: 11 },
    ],
    [],
  )

  const janDecGrid = useMemo(() => {
    return JAN_DEC_PAIRS.map((pair) => {
      const byCombo = new Map()
      for (const d of allDraws) {
        const monthIdx = parseInt(d.monthKey.slice(5, 7), 10) - 1
        if (monthIdx !== pair.a && monthIdx !== pair.b) continue
        const entry = byCombo.get(d.normalized) ?? { aHits: [], bHits: [] }
        if (monthIdx === pair.a) entry.aHits.push(d)
        else entry.bHits.push(d)
        byCombo.set(d.normalized, entry)
      }

      const matches = []
      for (const [normalized, entry] of byCombo) {
        if (entry.aHits.length === 0 || entry.bHits.length === 0) continue
        const aHits = [...entry.aHits].sort((x, y) => (x.date < y.date ? 1 : -1))
        const bHits = [...entry.bHits].sort((x, y) => (x.date < y.date ? 1 : -1))
        matches.push({
          normalized,
          aHits,
          bHits,
          totalHits: aHits.length + bHits.length,
        })
      }
      matches.sort((x, y) => y.totalHits - x.totalHits)

      return {
        aName: MONTH_NAMES[pair.a],
        bName: MONTH_NAMES[pair.b],
        matches,
      }
    })
  }, [allDraws, JAN_DEC_PAIRS])

  // "6-Month Cycle Predictions" — a stricter version of the By Number cycle
  // check above, fixed to Jan 2025 – Dec 2026: a combo only qualifies if it
  // shows up at least 3 times in that window with each consecutive hit
  // exactly 6 calendar months apart (e.g. Jan 2025 -> Jul 2025 -> Jan 2026).
  // Results are grouped by the calendar month it's next due in, so you can
  // read straight down Jan -> Dec for "what's predicted to hit this month".
  const SIX_MONTH_PREDICT_FROM = '2025-01'
  const SIX_MONTH_PREDICT_TO = '2026-12'
  const SIX_MONTH_PREDICT_MIN_HITS = 3
  const sixMonthPredictions = useMemo(() => {
    const byCombo = new Map()
    for (const d of allDraws) {
      if (d.monthKey < SIX_MONTH_PREDICT_FROM || d.monthKey > SIX_MONTH_PREDICT_TO) continue
      const list = byCombo.get(d.normalized)
      if (list) list.push(d)
      else byCombo.set(d.normalized, [d])
    }

    const byMonth = Array.from({ length: 12 }, () => [])
    for (const [normalized, hits] of byCombo) {
      if (hits.length < SIX_MONTH_PREDICT_MIN_HITS) continue
      const sorted = [...hits].sort((a, b) => (a.date < b.date ? -1 : 1))

      // Every consecutive hit must be exactly 6 calendar months apart — a
      // clean, unbroken chain, not just any two hits somewhere in range.
      let cleanChain = true
      for (let i = 1; i < sorted.length; i++) {
        if (calendarMonthGap(sorted[i - 1].date, sorted[i].date) !== 6) {
          cleanChain = false
          break
        }
      }
      if (!cleanChain) continue

      const lastHit = sorted[sorted.length - 1]
      const lastHitMonthIdx = parseInt(lastHit.monthKey.slice(5, 7), 10) - 1
      const predictedMonthIdx = (lastHitMonthIdx + 6) % 12
      const [lastYear, lastMonthNum] = lastHit.monthKey.split('-').map(Number)
      const predictedMonthNum = lastMonthNum + 6 > 12 ? lastMonthNum + 6 - 12 : lastMonthNum + 6
      const predictedYear = lastMonthNum + 6 > 12 ? lastYear + 1 : lastYear

      byMonth[predictedMonthIdx].push({
        normalized,
        hitCount: sorted.length,
        lastHitDate: lastHit.date,
        predictedYear,
        predictedMonthLabel: `${MONTH_NAMES[predictedMonthIdx]} ${predictedYear}`,
        predictedWeek: weekOfMonthLabel(lastHit.date),
        draws: [...sorted].sort((a, b) => (a.date < b.date ? 1 : -1)),
      })
    }

    for (const list of byMonth) {
      list.sort((a, b) => b.hitCount - a.hitCount || a.normalized.localeCompare(b.normalized))
    }

    return MONTH_NAMES.map((name, idx) => ({ name, idx, combos: byMonth[idx] }))
  }, [allDraws])

  // Friendly label for whichever From–To range is selected, used in the
  // intro text, empty state, and per-row stat line.
  const cycleWindowLabel = `${MONTH_NAMES[cycleFromMonth].slice(0, 3)} ${cycleFromYear} – ${MONTH_NAMES[cycleToMonth].slice(0, 3)} ${cycleToYear}`

  // Exact combo match ("7-11" only matches draws with exactly 7 and 11),
  // or single-number match ("7" matches any draw containing 7, either slot).
  const searchMatches = useMemo(() => {
    if (!isSearching) return []
    const matches = isSingleNumberSearch
      ? allDraws.filter((d) => d.parts.includes(queryParts[0]))
      : allDraws.filter((d) => d.normalized === normalizedQuery)
    return matches.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [allDraws, isSearching, isSingleNumberSearch, normalizedQuery, queryParts])

  // For single-number searches: tally which other numbers show up most
  // often alongside the searched number ("partner" numbers).
  const partnerSummary = useMemo(() => {
    if (!isSingleNumberSearch || searchMatches.length === 0) return []
    const target = queryParts[0]
    const counts = new Map()
    for (const m of searchMatches) {
      for (const p of m.parts) {
        if (p === target) continue
        counts.set(p, (counts.get(p) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 8)
  }, [isSingleNumberSearch, searchMatches, queryParts])

  // "Month calculator" for the search results: looks at every gap between
  // this search's own draws (in calendar months) and finds whichever gap
  // repeats most often — the number's own historical rhythm. From the most
  // recent hit, projects the next month (and week-of-month) that rhythm
  // points to. Needs at least 2 matches to have a gap to measure at all.
  const searchCyclePrediction = useMemo(() => {
    if (!isSearching || searchMatches.length < 2) return null

    const sorted = [...searchMatches].sort((a, b) => (a.date < b.date ? -1 : 1))
    const gapCounts = new Map()
    for (let i = 1; i < sorted.length; i++) {
      const gap = calendarMonthGap(sorted[i - 1].date, sorted[i].date)
      if (gap <= 0) continue
      gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1)
    }
    if (gapCounts.size === 0) return null

    // Most frequent gap wins; ties broken by the tighter (smaller) gap.
    let bestGap = null
    let bestCount = 0
    for (const [gap, count] of gapCounts) {
      if (count > bestCount || (count === bestCount && (bestGap === null || gap < bestGap))) {
        bestGap = gap
        bestCount = count
      }
    }

    const lastHit = sorted[sorted.length - 1]
    const lastHitMonthIdx = parseInt(lastHit.monthKey.slice(5, 7), 10) - 1

    return {
      gapMonths: bestGap,
      occurrences: bestCount,
      lastHitMonthName: MONTH_NAMES[lastHitMonthIdx],
      lastHitDate: lastHit.date,
      nextMonthName: MONTH_NAMES[(lastHitMonthIdx + bestGap) % 12],
      predictedWeek: weekOfMonthLabel(lastHit.date),
    }
  }, [isSearching, searchMatches])

  const month = drawResults[activeMonth]
  const days = useMemo(
    () => [...(month?.days ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [month],
  )

  // Group month keys by calendar month name (e.g. "June") across every
  // year present in the data, so "June 2025 vs June 2026" etc. is possible.
  // Used for Compare Years, which is a raw side-by-side view — it shows
  // every month regardless of its ON/OFF switch.
  function groupByMonthName(keys) {
    const byIdx = new Map()
    for (const key of keys) {
      const [year, mm] = key.split('-')
      const idx = parseInt(mm, 10) - 1
      if (!byIdx.has(idx)) byIdx.set(idx, [])
      byIdx.get(idx).push({ key, year })
    }
    const groups = []
    for (const [idx, entries] of byIdx.entries()) {
      groups.push({
        idx,
        name: MONTH_NAMES[idx],
        entries: entries.sort((a, b) => a.year.localeCompare(b.year)),
      })
    }
    return groups.sort((a, b) => a.idx - b.idx)
  }

  const monthNameGroups = useMemo(() => groupByMonthName(monthKeys), [monthKeys])

  // Same grouping, but only counting months that are currently switched ON —
  // this is what the Predictions tab uses, so a month you've turned OFF
  // never gets counted toward a prediction.
  const enabledMonthNameGroups = useMemo(
    () => groupByMonthName(enabledMonthKeys),
    [enabledMonthKeys],
  )

  // Comparison needs at least 2 different years of the same month.
  const compareGroups = useMemo(
    () => monthNameGroups.filter((g) => g.entries.length >= 2),
    [monthNameGroups],
  )

  const activeCompareGroup =
    compareGroups.find((g) => g.idx === compareMonthIdx) ?? compareGroups[0] ?? null

  // For the selected month name, build one column per year plus the set of
  // numbers that repeat in that same month across 2+ different years.
  const compareData = useMemo(() => {
    if (!activeCompareGroup) return null
    const yearColumns = activeCompareGroup.entries.map(({ key, year }) => {
      const rows = [...(drawResults[key]?.days ?? [])].sort((a, b) =>
        a.date < b.date ? -1 : 1,
      )
      const numbersThisYear = new Set()
      for (const row of rows) {
        for (const slot of SLOT_META) {
          for (const p of parseParts(row[slot.key])) numbersThisYear.add(p)
        }
      }
      return {
        year,
        key,
        label: drawResults[key].label,
        rows,
        numbersThisYear,
        enabled: isMonthEnabled(key),
      }
    })

    // OFF columns stay visible (so you can flip them back on) but don't
    // count toward the "repeated across years" numbers below — same rule
    // "Manage Months" uses everywhere else in the app.
    const yearsByNumber = new Map()
    for (const col of yearColumns) {
      if (!col.enabled) continue
      for (const num of col.numbersThisYear) {
        if (!yearsByNumber.has(num)) yearsByNumber.set(num, new Set())
        yearsByNumber.get(num).add(col.year)
      }
    }
    const repeatingNumbers = new Set(
      [...yearsByNumber.entries()].filter(([, years]) => years.size >= 2).map(([n]) => n),
    )
    const repeatSummary = [...yearsByNumber.entries()]
      .filter(([, years]) => years.size >= 2)
      .sort((a, b) => b[1].size - a[1].size || a[0] - b[0])

    return { yearColumns, repeatingNumbers, repeatSummary }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompareGroup, monthToggles, province])

  // Predictions work off a single month name too — no minimum year count —
  // by tallying how many times each single number showed up in that month
  // name across every year of data available.
  const activePredictGroup =
    enabledMonthNameGroups.find((g) => g.idx === predictMonthIdx) ?? enabledMonthNameGroups[0] ?? null

  // "Last N years" narrows to the N most recent years of that month name.
  // Falls back to every year available if there aren't that many yet.
  const predictWindowOptions = useMemo(() => {
    const total = activePredictGroup?.entries.length ?? 0
    const opts = [{ id: 'all', label: 'All years' }]
    for (const w of [1, 2, 3, 4, 5]) {
      if (total > w) opts.push({ id: w, label: `Last ${w} yr${w === 1 ? '' : 's'}` })
    }
    return opts
  }, [activePredictGroup])

  // The year to count "last N years" backward from. Defaults to the most
  // recent year available for this month, but the person can pick any
  // year 2020–2030 as the anchor (e.g. "last 4 years" ending at 2026).
  const defaultAnchorYear = activePredictGroup?.entries[activePredictGroup.entries.length - 1]?.year ?? null
  const effectiveAnchorYear =
    predictAnchorYear && activePredictGroup?.entries.some((e) => e.year === predictAnchorYear)
      ? predictAnchorYear
      : defaultAnchorYear

  const predictEntries = useMemo(() => {
    if (!activePredictGroup) return []
    if (predictYearsWindow === 'all') return activePredictGroup.entries
    const w = predictYearsWindow
    const anchorIdx = activePredictGroup.entries.findIndex((e) => e.year === effectiveAnchorYear)
    if (anchorIdx === -1) {
      return activePredictGroup.entries.length > w
        ? activePredictGroup.entries.slice(-w)
        : activePredictGroup.entries
    }
    const start = Math.max(0, anchorIdx - w + 1)
    return activePredictGroup.entries.slice(start, anchorIdx + 1)
  }, [activePredictGroup, predictYearsWindow, effectiveAnchorYear])

  const predictionData = useMemo(() => {
    if (!activePredictGroup || predictEntries.length === 0) return null
    const numberCounts = new Map()
    const comboCounts = new Map() // "2-8" -> { count, years: Set }
    let totalDraws = 0
    for (const { key, year } of predictEntries) {
      const rows = drawResults[key]?.days ?? []
      for (const row of rows) {
        for (const slot of SLOT_META) {
          const value = row[slot.key]
          if (!value || !value.trim()) continue
          totalDraws += 1
          const normalized = normalizeNumber(value)
          if (!comboCounts.has(normalized)) comboCounts.set(normalized, { count: 0, years: new Set() })
          const entry = comboCounts.get(normalized)
          entry.count += 1
          entry.years.add(year)
          for (const p of parseParts(value)) {
            numberCounts.set(p, (numberCounts.get(p) ?? 0) + 1)
          }
        }
      }
    }

    // Break single numbers into tiers "Appeared 10x" down to "Appeared 1x".
    // Anything that hit more than 10 times gets folded into the 10x-or-more tier.
    const TOP_TIER = 10
    const numberByBucket = new Map()
    for (const [num, count] of numberCounts.entries()) {
      const bucket = Math.min(count, TOP_TIER)
      if (!numberByBucket.has(bucket)) numberByBucket.set(bucket, [])
      numberByBucket.get(bucket).push([num, count])
    }
    const numberTiers = []
    for (let bucket = TOP_TIER; bucket >= 1; bucket -= 1) {
      const items = numberByBucket.get(bucket)
      if (!items || items.length === 0) continue
      items.sort((a, b) => b[1] - a[1] || a[0] - b[0])
      numberTiers.push({
        bucket,
        capped: items.some(([, count]) => count > TOP_TIER),
        items,
      })
    }

    // Same idea for exact pairs (e.g. 02-08).
    const comboByBucket = new Map()
    for (const [combo, { count, years }] of comboCounts.entries()) {
      const bucket = Math.min(count, TOP_TIER)
      if (!comboByBucket.has(bucket)) comboByBucket.set(bucket, [])
      comboByBucket.get(bucket).push([combo, count, years])
    }
    const comboTiers = []
    for (let bucket = TOP_TIER; bucket >= 1; bucket -= 1) {
      const items = comboByBucket.get(bucket)
      if (!items || items.length === 0) continue
      items.sort((a, b) => b[1] - a[1] || (a[0] > b[0] ? 1 : -1))
      comboTiers.push({
        bucket,
        capped: items.some(([, count]) => count > TOP_TIER),
        items,
      })
    }

    const years = predictEntries.map((e) => e.year)
    return { numberTiers, comboTiers, totalDraws, years }
  }, [activePredictGroup, predictEntries])

  // "My Number" — pick any number/combo and see, year by year (Jan–Dec each
  // year), how many times it has appeared across all logged draws.
  const myNumberNormalized = normalizeNumber(myNumberQuery)
  const myNumberParts = useMemo(() => parseParts(myNumberQuery), [myNumberQuery])
  const isMyNumberSingle = myNumberParts.length === 1
  const hasMyNumberQuery = myNumberNormalized.length > 0

  const allYears = useMemo(
    () => [...new Set(monthKeys.map((k) => k.slice(0, 4)))].sort(),
    [monthKeys],
  )


  // Calendar months+days breakdown between two "YYYY-MM-DD" dates, in
  // addition to the flat total-days count. Handles either date order by
  // normalizing so "from" is always the earlier one.
  const dateCalcResult = useMemo(() => {
    if (!dateCalcFrom || !dateCalcTo) return null
    const [fy, fm, fd] = dateCalcFrom.split('-').map(Number)
    const [ty, tm, td] = dateCalcTo.split('-').map(Number)
    if (!fy || !fm || !fd || !ty || !tm || !td) return null

    let start = new Date(fy, fm - 1, fd)
    let end = new Date(ty, tm - 1, td)
    const isReversed = start > end
    if (isReversed) [start, end] = [end, start]

    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24))

    // Calendar breakdown: walk months forward from start, borrowing days
    // from the calendar (not a fixed 30) the same way a wall calendar would.
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    let days = end.getDate() - start.getDate()
    if (days < 0) {
      months -= 1
      const daysInPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate()
      days += daysInPrevMonth
    }
    const years = Math.floor(months / 12)
    const remMonths = months % 12
    const weeks = Math.floor(totalDays / 7)
    const remDaysAfterWeeks = totalDays % 7

    return {
      isReversed,
      totalDays,
      years,
      months: remMonths,
      days,
      totalMonths: months,
      weeks,
      remDaysAfterWeeks,
      startLabel: `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`,
      endLabel: `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`,
    }
  }, [dateCalcFrom, dateCalcTo])

  const myNumberData = useMemo(() => {
    if (!hasMyNumberQuery) return null
    const matches = isMyNumberSingle
      ? allDraws.filter((d) => d.parts.includes(myNumberParts[0]))
      : allDraws.filter((d) => d.normalized === myNumberNormalized)

    const byYear = new Map(allYears.map((y) => [y, []]))
    for (const m of matches) {
      const y = m.monthKey.slice(0, 4)
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y).push(m)
    }
    const rows = allYears.map((y) => {
      const hits = byYear.get(y) ?? []
      const monthMap = new Map()
      for (const h of hits) {
        const idx = parseInt(h.monthKey.slice(5, 7), 10) - 1
        if (!monthMap.has(idx)) monthMap.set(idx, [])
        monthMap.get(idx).push(h)
      }
      // Always list all 12 months, Jan through Dec — not just the ones
      // that had a hit — so a blank month is just as visible as a hit.
      const months = MONTH_NAMES.map((name, idx) => {
        const monthHits = monthMap.get(idx) ?? []
        return {
          idx,
          name,
          short: name.slice(0, 3),
          count: monthHits.length,
          hits: [...monthHits].sort((a, b) => (a.date < b.date ? -1 : 1)),
        }
      })
      return { year: y, hits, months }
    })
    const maxCount = Math.max(1, ...rows.map((r) => r.hits.length))

    // All-time totals per calendar month, added up across every year — a
    // quick "which month does this number usually land in" overview.
    const allTimeMonths = MONTH_NAMES.map((name, idx) => {
      const hitsThisMonth = rows.flatMap((r) => r.months[idx].hits)
      return { idx, name, short: name.slice(0, 3), count: hitsThisMonth.length, hits: hitsThisMonth }
    })

    return { rows, total: matches.length, matches, maxCount, allTimeMonths }
  }, [hasMyNumberQuery, isMyNumberSingle, myNumberParts, myNumberNormalized, allDraws, allYears])
  const [expandedYear, setExpandedYear] = useState(null)
  const [expandedMonth, setExpandedMonth] = useState(null) // { year, idx } | null
  const [expandedAllTimeMonth, setExpandedAllTimeMonth] = useState(null) // month idx | null
  const [expandedSavedMonth, setExpandedSavedMonth] = useState(null) // month name | null
  const [savedStatsYear, setSavedStatsYear] = useState('all') // 'all' | '2020'..'2030'
  const [expandedSavedCardMonth, setExpandedSavedCardMonth] = useState(null) // { normalized, idx } | null

  // Reset the open all-time month whenever the searched number changes, so
  // stale hits from a previous number never show under the wrong heading.
  useEffect(() => {
    setExpandedAllTimeMonth(null)
  }, [myNumberNormalized])

  // "Saved by month" now opens as a popup instead of an inline panel — close
  // it on Escape and lock page scroll while it's open, like any modal.
  useEffect(() => {
    if (!expandedSavedMonth) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setExpandedSavedMonth(null)
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [expandedSavedMonth])

  // "Manage Months" popup — same close-on-Escape / scroll-lock behavior.
  const [manageMonthsYear, setManageMonthsYear] = useState(null)
  useEffect(() => {
    if (!manageMonthsOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setManageMonthsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [manageMonthsOpen])

  // Months grouped by year, newest year first, for the Manage Months panel.
  const monthsByYear = useMemo(() => {
    const byYear = new Map()
    for (const key of monthKeys) {
      const year = key.slice(0, 4)
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year).push(key)
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, keys]) => ({ year, keys: keys.sort() }))
  }, [monthKeys])

  useEffect(() => {
    if (manageMonthsOpen && manageMonthsYear === null && monthsByYear.length > 0) {
      setManageMonthsYear(monthsByYear[0].year)
    }
  }, [manageMonthsOpen, manageMonthsYear, monthsByYear])

  function setAllMonthsForYear(year, enabled) {
    setMonthToggles((prev) => {
      const next = { ...prev }
      for (const key of monthKeys) {
        if (key.startsWith(year)) next[`${province}:${key}`] = enabled
      }
      return next
    })
  }

  // Close any open saved-card month breakdown whenever the underlying data
  // it would show could change out from under it (different year, or the
  // month panel itself got collapsed/switched).
  useEffect(() => {
    setExpandedSavedCardMonth(null)
  }, [savedStatsYear, expandedSavedMonth])

  // Group saved numbers (myNumbers.<province>.js) by the calendar month you filed them
  // under, so the "My Number" tab can show a Jan–Dec box grid up top.
  const savedByMonth = useMemo(() => {
    const map = new Map(MONTH_NAMES.map((name) => [name, []]))
    for (const entry of myNumbers) {
      if (map.has(entry.month)) map.get(entry.month).push(entry)
    }
    return map
  }, [myNumbers])

  // Precompute each saved number's full stats (total hits + a Jan–Dec,
  // all-years-combined breakdown) so a month box can show real winning
  // data the instant it's opened, no extra tap needed.
  const savedNumberStats = useMemo(() => {
    const map = new Map()
    for (const { number } of myNumbers) {
      const normalized = normalizeNumber(number)
      if (map.has(normalized)) continue
      const parts = parseParts(number)
      const isSingle = parts.length === 1
      let matches = isSingle
        ? allDraws.filter((d) => d.parts.includes(parts[0]))
        : allDraws.filter((d) => d.normalized === normalized)
      if (savedStatsYear !== 'all') {
        matches = matches.filter((m) => m.monthKey.slice(0, 4) === savedStatsYear)
      }
      const allTimeMonths = MONTH_NAMES.map((name, idx) => {
        const hits = matches.filter((m) => parseInt(m.monthKey.slice(5, 7), 10) - 1 === idx)
        return { idx, name, short: name.slice(0, 3), count: hits.length, hits }
      })
      map.set(normalized, { total: matches.length, allTimeMonths })
    }
    return map
  }, [allDraws, savedStatsYear, myNumbers])

  // Full log for one calendar month (every date, every slot) regardless of
  // what's being searched — this is what shows when a month is opened, e.g.
  // opening August lists every draw logged that August: "2-8", "23-35", etc.
  function getMonthLog(year, idx) {
    const monthKey = `${year}-${String(idx + 1).padStart(2, '0')}`
    const rows = [...(drawResults[monthKey]?.days ?? [])].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    )
    return rows.map((row) => ({
      date: row.date,
      slots: SLOT_META.map((slot) => ({
        ...slot,
        value: row[slot.key],
        isMatch: hasMyNumberQuery && row[slot.key] && normalizeNumber(row[slot.key]) === myNumberNormalized
          ? true
          : hasMyNumberQuery && isMyNumberSingle && row[slot.key]
            ? parseParts(row[slot.key]).includes(myNumberParts[0])
            : false,
      })),
    }))
  }

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-eyebrow">Daily Results Board</div>
        <h1 className="masthead-title">STL Draw Tracker</h1>
        <p className="masthead-sub">
          Morning &middot; Afternoon &middot; Evening — logged day by day, month by month.
        </p>
        <button
          type="button"
          className="manage-months-btn"
          onClick={() => setManageMonthsOpen(true)}
        >
          ⏻ Manage Months ({enabledMonthKeys.length}/{monthKeys.length} ON)
        </button>
      </header>

      <div className="mode-toggle province-toggle" role="tablist" aria-label="Select province">
        {PROVINCES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={province === p.id}
            className={`mode-toggle-btn ${province === p.id ? 'is-active' : ''}`}
            onClick={() => setProvince(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search a number — e.g. 7-11, or just 7"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search draw number"
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {!isSearching && (
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-toggle-btn ${
              !compareMode && !predictMode && !myNumberMode && !cycleMode && !yearlyMode && !hotColdMode && !randomMode && !dateCalcMode
                ? 'is-active'
                : ''
            }`}
            onClick={() => {
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setYearlyMode(false)
              setHotColdMode(false)
              setRandomMode(false)
              setDateCalcMode(false)
            }}
          >
            By Month
          </button>
          {compareGroups.length > 0 && (
            <button
              type="button"
              className={`mode-toggle-btn ${compareMode ? 'is-active' : ''}`}
              onClick={() => {
                setCompareMode(true)
                setPredictMode(false)
                setMyNumberMode(false)
                setCycleMode(false)
                setYearlyMode(false)
                setHotColdMode(false)
                setRandomMode(false)
                setDateCalcMode(false)
              }}
            >
              Compare Years
            </button>
          )}
          <button
            type="button"
            className={`mode-toggle-btn ${predictMode ? 'is-active' : ''}`}
            onClick={() => {
              setPredictMode(true)
              setCompareMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setYearlyMode(false)
              setHotColdMode(false)
              setRandomMode(false)
              setDateCalcMode(false)
            }}
          >
            Predictions
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${myNumberMode ? 'is-active' : ''}`}
            onClick={() => {
              setMyNumberMode(true)
              setCompareMode(false)
              setPredictMode(false)
              setCycleMode(false)
              setYearlyMode(false)
              setHotColdMode(false)
              setRandomMode(false)
              setDateCalcMode(false)
            }}
          >
            My Number
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${cycleMode ? 'is-active' : ''}`}
            onClick={() => {
              setCycleMode(true)
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setYearlyMode(false)
              setHotColdMode(false)
              setRandomMode(false)
              setDateCalcMode(false)
              setHasSearchedCycle(false)
            }}
          >
            Month Cycle
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${yearlyMode ? 'is-active' : ''}`}
            onClick={() => {
              setYearlyMode(true)
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setHotColdMode(false)
              setRandomMode(false)
              setDateCalcMode(false)
              setExpandedYearlyCombo(null)
            }}
          >
            Every Year
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${hotColdMode ? 'is-active' : ''}`}
            onClick={() => {
              setHotColdMode(true)
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setYearlyMode(false)
              setRandomMode(false)
              setDateCalcMode(false)
              setExpandedHotColdCombo(null)
            }}
          >
            Hot &amp; Cold
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${randomMode ? 'is-active' : ''}`}
            onClick={() => {
              setRandomMode(true)
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setYearlyMode(false)
              setHotColdMode(false)
              setDateCalcMode(false)
            }}
          >
            🎲 Random Pick
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${dateCalcMode ? 'is-active' : ''}`}
            onClick={() => {
              setDateCalcMode(true)
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setYearlyMode(false)
              setHotColdMode(false)
              setRandomMode(false)
            }}
          >
            📅 Date Calculator
          </button>
        </div>
      )}

      {favorites.length > 0 && (
        <div className="favorites-panel">
          <span className="favorites-label">Pinned</span>
          <div className="favorites-chips">
            {favorites.map((fav) => (
              <span className="favorite-chip" key={fav}>
                <button
                  type="button"
                  className="favorite-chip-value"
                  onClick={() => setQuery(fav)}
                >
                  {fav}
                </button>
                <button
                  type="button"
                  className="favorite-chip-remove"
                  onClick={() => toggleFavorite(fav)}
                  aria-label={`Unpin ${fav}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {!isSearching && !compareMode && !predictMode && !myNumberMode && !hotColdMode && !randomMode && !dateCalcMode && (
        <nav className="month-tabs" aria-label="Select month">
          {monthKeys.map((key) => {
            const enabled = isMonthEnabled(key)
            return (
              <button
                key={key}
                className={`month-tab ${key === activeMonth ? 'is-active' : ''} ${enabled ? '' : 'is-month-off'}`}
                onClick={() => setActiveMonth(key)}
                title={enabled ? undefined : "OFF — not counted in predictions"}
              >
                {drawResults[key].label}
                {!enabled && <span className="month-tab-off-tag">OFF</span>}
              </button>
            )
          })}
        </nav>
      )}

      {!isSearching && compareMode && activeCompareGroup && (
        <nav className="month-tabs" aria-label="Select month to compare">
          {compareGroups.map((g) => (
            <button
              key={g.idx}
              className={`month-tab ${g.idx === activeCompareGroup.idx ? 'is-active' : ''}`}
              onClick={() => setCompareMonthIdx(g.idx)}
            >
              {g.name}
            </button>
          ))}
        </nav>
      )}

      {!isSearching && predictMode && activePredictGroup && (
        <nav className="month-tabs" aria-label="Select month to predict">
          {monthNameGroups.map((g) => (
            <button
              key={g.idx}
              className={`month-tab ${g.idx === activePredictGroup.idx ? 'is-active' : ''}`}
              onClick={() => {
                setPredictMonthIdx(g.idx)
                setPredictYearsWindow('all')
                setPredictAnchorYear(null)
              }}
            >
              {g.name}
            </button>
          ))}
        </nav>
      )}

      {!isSearching && hotColdMode && (
        <nav className="month-tabs" aria-label="Select month for Hot & Cold">
          {MONTH_NAMES.map((name, idx) => (
            <button
              key={name}
              className={`month-tab ${idx === hotColdMonthIdx ? 'is-active' : ''}`}
              onClick={() => {
                setHotColdMonthIdx(idx)
                setExpandedHotColdCombo(null)
              }}
            >
              {name}
            </button>
          ))}
        </nav>
      )}

      {!isSearching && predictMode && activePredictGroup && predictWindowOptions.length > 1 && (
        <div className="mode-toggle window-toggle">
          {predictWindowOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-toggle-btn ${predictYearsWindow === opt.id ? 'is-active' : ''}`}
              onClick={() => setPredictYearsWindow(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {!isSearching && predictMode && activePredictGroup && predictYearsWindow !== 'all' && (
        <div className="year-anchor-picker">
          <span className="year-anchor-label">Ending year</span>
          <div className="mode-toggle year-anchor-toggle">
            {activePredictGroup.entries.map(({ year }) => (
              <button
                key={year}
                type="button"
                className={`mode-toggle-btn year-anchor-btn ${
                  year === effectiveAnchorYear ? 'is-active' : ''
                }`}
                onClick={() => setPredictAnchorYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="board">
        {isSearching ? (
          <>
            <p className="search-summary">
              {searchMatches.length === 0
                ? `No draws found for "${normalizedQuery}"`
                : `${searchMatches.length} draw${searchMatches.length === 1 ? '' : 's'} found for ${normalizedQuery}`}
            </p>
            {isSingleNumberSearch && partnerSummary.length > 0 && (
              <div className="partner-summary">
                <span className="partner-summary-label">Most common partner numbers</span>
                <div className="partner-chips">
                  {partnerSummary.map(([num, count]) => (
                    <button
                      key={num}
                      type="button"
                      className="partner-chip"
                      onClick={() => setQuery(`${queryParts[0]}-${num}`)}
                      title={`Search ${queryParts[0]}-${num}`}
                    >
                      {num}
                      <span className="partner-chip-count">×{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {searchCyclePrediction && (
              <div className="partner-summary cycle-calculator">
                <span className="partner-summary-label">Month calculator</span>
                <p className="cycle-row-months">
                  {`This ${isSingleNumberSearch ? 'number' : 'combo'} has repeated roughly every `}
                  <strong>
                    {searchCyclePrediction.gapMonths} month
                    {searchCyclePrediction.gapMonths === 1 ? '' : 's'}
                  </strong>
                  {` (seen ${searchCyclePrediction.occurrences} time${searchCyclePrediction.occurrences === 1 ? '' : 's'}) — last drawn ${searchCyclePrediction.lastHitMonthName} (${searchCyclePrediction.lastHitDate}), possible again in `}
                  <strong>{searchCyclePrediction.nextMonthName}</strong>
                  {', around '}
                  <strong>{searchCyclePrediction.predictedWeek.label}</strong>
                  {` (days ${searchCyclePrediction.predictedWeek.range}).`}
                </p>
                <p className="predict-disclaimer">
                  Historical frequency only — each STL draw is independent, so past results don't
                  influence future ones.
                </p>
              </div>
            )}
            {searchMatches.length > 0 && (
              <div className="ticket-list">
                {searchMatches.map((m) => {
                  const { weekday, day } = formatDay(m.date)
                  return (
                    <article className="ticket search-result" key={`${m.date}-${m.key}`}>
                      <div className="ticket-date">
                        <span className="ticket-day">{day}</span>
                        <span className="ticket-weekday">{weekday}</span>
                      </div>
                      <div className="ticket-slots search-slots">
                        <Slot
                          label={m.label}
                          time={m.time}
                          value={m.value}
                          accentVar={m.accentVar}
                          isMatch
                          isFavorite={favorites.includes(m.normalized)}
                          onToggleFavorite={() => toggleFavorite(m.normalized)}
                        />
                        <span className="search-month-tag">{m.monthLabel}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        ) : compareMode ? (
          compareData === null || compareData.yearColumns.every((c) => c.rows.length === 0) ? (
            <p className="empty-state">No overlapping months to compare yet.</p>
          ) : (
            <>
              {compareData.repeatSummary.length > 0 ? (
                <div className="partner-summary">
                  <span className="partner-summary-label">
                    Numbers that repeated in {activeCompareGroup.name} across multiple years
                  </span>
                  <div className="partner-chips">
                    {compareData.repeatSummary.map(([num, years]) => (
                      <button
                        key={num}
                        type="button"
                        className="partner-chip"
                        onClick={() => setQuery(String(num))}
                        title={`Search ${num}`}
                      >
                        {num}
                        <span className="partner-chip-count">×{years.size} yrs</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="search-summary">
                  No numbers repeated across years for {activeCompareGroup.name} yet.
                </p>
              )}
              <div className="compare-columns">
                {compareData.yearColumns.map((col) => (
                  <div className={`compare-column ${col.enabled ? '' : 'is-off'}`} key={col.key}>
                    <div className="compare-column-head">
                      <span className="compare-column-label">{col.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={col.enabled}
                        className={`compare-month-switch ${col.enabled ? 'is-on' : 'is-off'}`}
                        onClick={() => setMonthEnabled(col.key, !col.enabled)}
                        title={
                          col.enabled
                            ? `Turn ${col.label} OFF (won't count toward predictions/cycles/hot-cold/compare)`
                            : `Turn ${col.label} ON`
                        }
                      >
                        <span className="compare-month-switch-knob" />
                        <span className="compare-month-switch-text">
                          {col.enabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </div>
                    {col.rows.length === 0 ? (
                      <p className="empty-state">No draws logged yet.</p>
                    ) : (
                      <div className="ticket-list compact">
                        {col.rows.map((row) => {
                          const { weekday, day } = formatDay(row.date)
                          return (
                            <article className="ticket compact-ticket" key={row.date}>
                              <div className="ticket-date">
                                <span className="ticket-day">{day}</span>
                                <span className="ticket-weekday">{weekday}</span>
                              </div>
                              <div className="ticket-slots compact-slots">
                                {SLOT_META.map((slot) => {
                                  const value = row[slot.key]
                                  const parts = parseParts(value)
                                  const isRepeat = parts.some((p) =>
                                    compareData.repeatingNumbers.has(p),
                                  )
                                  return (
                                    <span
                                      key={slot.key}
                                      className={`compact-number ${isRepeat ? 'is-repeat' : ''} ${
                                        !value ? 'is-empty' : ''
                                      }`}
                                      style={{ '--accent': `var(${slot.accentVar})` }}
                                      title={slot.label}
                                    >
                                      {value || '—'}
                                    </span>
                                  )
                                })}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        ) : predictMode ? (
          predictionData === null || predictionData.totalDraws === 0 ? (
            <p className="empty-state">No draws logged for {activePredictGroup?.name ?? 'this month'} yet.</p>
          ) : (
            <>
              <p className="search-summary">
                Based on {predictionData.totalDraws} draw{predictionData.totalDraws === 1 ? '' : 's'} across{' '}
                {activePredictGroup.name} in {predictionData.years.join(', ')}
              </p>

              {predictionData.numberTiers.map(({ bucket, capped, items }) => {
                const { icon, className, chipClass } = tierStyle(bucket)
                return (
                  <div className="predict-tier" key={`num-${bucket}`}>
                    <span className={`predict-tier-label ${className}`}>
                      {icon} Appeared {capped ? `${bucket}x or more` : `${bucket}x`}
                    </span>
                    <div className="partner-chips">
                      {items.map(([num, count]) => (
                        <button
                          key={num}
                          type="button"
                          className={`partner-chip ${chipClass}`}
                          onClick={() => setQuery(String(num))}
                          title={`Search ${num}`}
                        >
                          {num}
                          <span className="partner-chip-count">×{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              <div className="predict-divider">
                <span>Exact pairs (e.g. 02-08)</span>
              </div>

              {predictionData.comboTiers.length === 0 ? (
                <p className="predict-empty">No exact pair has repeated yet.</p>
              ) : (
                predictionData.comboTiers.map(({ bucket, capped, items }) => {
                  const { icon, className, chipClass } = tierStyle(bucket)
                  return (
                    <div className="predict-tier" key={`combo-${bucket}`}>
                      <span className={`predict-tier-label ${className}`}>
                        {icon} Pair appeared {capped ? `${bucket}x or more` : `${bucket}x`}
                      </span>
                      <div className="partner-chips">
                        {items.map(([combo, count, years]) => (
                          <button
                            key={combo}
                            type="button"
                            className={`partner-chip ${chipClass}`}
                            onClick={() => setQuery(combo)}
                            title={`Appeared in ${[...years].sort().join(', ')}`}
                          >
                            {combo}
                            <span className="partner-chip-count">×{count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}

              <p className="predict-disclaimer">
                Historical frequency only — each STL draw is independent, so past results don't
                influence future ones. Tap a number or pair to see its full draw history.
              </p>
            </>
          )
        ) : myNumberMode ? (
          <>
            <div className="search-bar my-number-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Type your number — e.g. 02-08, 7-11, or just 7"
                value={myNumberQuery}
                onChange={(e) => setMyNumberQuery(e.target.value)}
                aria-label="Check number by year"
              />
              {myNumberQuery && (
                <button
                  className="search-clear"
                  onClick={() => setMyNumberQuery('')}
                  aria-label="Clear"
                >
                  ×
                </button>
              )}
            </div>

            {myNumbers.length > 0 && (
              <div className="saved-numbers">
                <span className="saved-numbers-label">Saved by month</span>
                <div className="month-grid saved-month-grid">
                  {MONTH_NAMES.map((name) => {
                    const entries = savedByMonth.get(name) ?? []
                    const isOpen = expandedSavedMonth === name
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`month-cell ${entries.length > 0 ? 'has-hits' : ''} ${
                          isOpen ? 'is-open' : ''
                        }`}
                        onClick={() =>
                          entries.length > 0 && setExpandedSavedMonth(isOpen ? null : name)
                        }
                        disabled={entries.length === 0}
                        title={
                          entries.length > 0
                            ? `${entries.length} saved number${entries.length === 1 ? '' : 's'} under ${name}`
                            : `No numbers saved under ${name}`
                        }
                      >
                        <span className="month-cell-name">{name.slice(0, 3)}</span>
                        <span className="month-cell-count">
                          {entries.length > 0 ? entries.length : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {expandedSavedMonth && (
                  <div
                    className="saved-month-overlay"
                    onClick={() => setExpandedSavedMonth(null)}
                  >
                  <div
                    className="saved-month-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${expandedSavedMonth} saved numbers`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="saved-month-panel-close"
                      onClick={() => setExpandedSavedMonth(null)}
                      aria-label="Close"
                      title="Close"
                    >
                      ×
                    </button>
                    <div className="saved-month-panel-head">
                      <p className="saved-month-panel-title">
                        {expandedSavedMonth} — your saved numbers,{' '}
                        {savedStatsYear === 'all'
                          ? `${allYears[0]}–${allYears[allYears.length - 1]}`
                          : savedStatsYear}
                      </p>
                      <div className="saved-year-picker">
                        <button
                          type="button"
                          className="saved-year-arrow"
                          onClick={() => {
                            if (savedStatsYear === 'all') {
                              setSavedStatsYear(allYears[allYears.length - 1])
                              return
                            }
                            const i = allYears.indexOf(savedStatsYear)
                            if (i > 0) setSavedStatsYear(allYears[i - 1])
                          }}
                          disabled={savedStatsYear !== 'all' && allYears.indexOf(savedStatsYear) === 0}
                          aria-label="Previous year"
                          title="Previous year"
                        >
                          ‹
                        </button>
                        <select
                          className="saved-year-select"
                          value={savedStatsYear}
                          onChange={(e) => setSavedStatsYear(e.target.value)}
                          aria-label="Choose year"
                        >
                          <option value="all">All years</option>
                          {allYears.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="saved-year-arrow"
                          onClick={() => {
                            if (savedStatsYear === 'all') return
                            const i = allYears.indexOf(savedStatsYear)
                            if (i === -1) return
                            if (i === allYears.length - 1) {
                              setSavedStatsYear('all')
                            } else {
                              setSavedStatsYear(allYears[i + 1])
                            }
                          }}
                          disabled={savedStatsYear === 'all'}
                          aria-label="Next year"
                          title="Next year"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <div className="saved-number-cards">
                      {(savedByMonth.get(expandedSavedMonth) ?? []).map(({ number, label }) => {
                        const normalized = normalizeNumber(number)
                        const stats = savedNumberStats.get(normalized)
                        const isActive = normalized === myNumberNormalized
                        return (
                          <div
                            key={number}
                            className={`saved-number-card ${isActive ? 'is-active' : ''}`}
                          >
                            <button
                              type="button"
                              className="saved-number-card-head"
                              onClick={() => setMyNumberQuery(number)}
                              title={`Load full ${normalized} breakdown below`}
                            >
                              <span className="saved-number-card-value">{normalized}</span>
                              {label && <span className="saved-number-note">{label}</span>}
                              <span className="saved-number-card-total">
                                ×{stats?.total ?? 0} total
                              </span>
                            </button>
                            <div className="mini-month-grid">
                              {stats?.allTimeMonths.map((m) => {
                                const isOpenCell =
                                  expandedSavedCardMonth?.normalized === normalized &&
                                  expandedSavedCardMonth?.idx === m.idx
                                return (
                                  <button
                                    key={m.idx}
                                    type="button"
                                    className={`mini-month-cell ${m.count > 0 ? 'has-hits' : ''} ${
                                      isOpenCell ? 'is-open' : ''
                                    }`}
                                    onClick={() =>
                                      m.count > 0 &&
                                      setExpandedSavedCardMonth(
                                        isOpenCell ? null : { normalized, idx: m.idx },
                                      )
                                    }
                                    disabled={m.count === 0}
                                    title={
                                      m.count > 0
                                        ? `See exact ${m.name} draw${m.count === 1 ? '' : 's'}`
                                        : `No ${m.name} hits yet`
                                    }
                                  >
                                    {m.short}
                                    <b>{m.count > 0 ? m.count : '—'}</b>
                                  </button>
                                )
                              })}
                            </div>

                            {expandedSavedCardMonth?.normalized === normalized && (
                              <div className="saved-card-hit-log">
                                <p className="saved-card-hit-log-title">
                                  {stats?.allTimeMonths[expandedSavedCardMonth.idx]?.name} —
                                  exact {normalized} draws
                                  {savedStatsYear !== 'all' ? ` in ${savedStatsYear}` : ''}
                                </p>
                                <ul className="saved-card-hit-list">
                                  {[...(stats?.allTimeMonths[expandedSavedCardMonth.idx]?.hits ?? [])]
                                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                                    .map((h) => {
                                      const { weekday, day } = formatDay(h.date)
                                      return (
                                        <li key={`${h.date}-${h.key}`} className="saved-card-hit-row">
                                          <span className="saved-card-hit-date">
                                            {h.date.slice(0, 4)} · {day}{' '}
                                            <span className="saved-card-hit-weekday">{weekday}</span>
                                          </span>
                                          <span className="saved-card-hit-slot" title={h.time}>
                                            {h.label}
                                          </span>
                                          <span className="saved-card-hit-value">{h.value}</span>
                                        </li>
                                      )
                                    })}
                                </ul>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <p className="saved-month-panel-hint">
                      Tap a number above to load its full year-by-year breakdown below.
                    </p>
                  </div>
                  </div>
                )}
              </div>
            )}

            {!hasMyNumberQuery ? (
              <p className="empty-state">
                Enter a number above — e.g. 02-08, or 7-11 — to see how many times it's shown up,
                year by year — 2020 through 2030, not just one year.
              </p>
            ) : (
              <>
                <p className="search-summary">
                  {myNumberData.total === 0
                    ? `"${myNumberNormalized}" hasn't appeared in any logged draw yet.`
                    : `${myNumberData.total} appearance${
                        myNumberData.total === 1 ? '' : 's'
                      } of ${myNumberNormalized} across ${allYears[0]}–${allYears[allYears.length - 1]}`}
                </p>

                <div className="alltime-months">
                  <span className="alltime-months-label">Jan – Dec, all years combined</span>
                  <div className="month-grid">
                    {myNumberData.allTimeMonths.map((m) => {
                      const isOpen = expandedAllTimeMonth === m.idx
                      return (
                        <button
                          key={m.idx}
                          type="button"
                          className={`month-cell ${m.count > 0 ? 'has-hits' : ''} ${isOpen ? 'is-open' : ''}`}
                          onClick={() => m.count > 0 && setExpandedAllTimeMonth(isOpen ? null : m.idx)}
                          disabled={m.count === 0}
                          title={m.count > 0 ? `See every ${m.name} hit, all years` : `No ${m.name} draws yet`}
                        >
                          <span className="month-cell-name">{m.short}</span>
                          <span className="month-cell-count">{m.count > 0 ? `×${m.count}` : '—'}</span>
                        </button>
                      )
                    })}
                  </div>

                  {expandedAllTimeMonth !== null && (
                    <div className="month-log">
                      <p className="month-log-title">
                        {MONTH_NAMES[expandedAllTimeMonth]} — every {myNumberNormalized} hit, 2020–2030
                      </p>
                      <ul className="month-log-list">
                        {[...myNumberData.allTimeMonths[expandedAllTimeMonth].hits]
                          .sort((a, b) => (a.date < b.date ? 1 : -1))
                          .map((h) => {
                            const { weekday, day } = formatDay(h.date)
                            return (
                              <li key={`${h.date}-${h.key}`} className="month-log-row">
                                <span className="month-log-date">
                                  {h.date.slice(0, 4)} · {day}{' '}
                                  <span className="month-log-weekday">{weekday}</span>
                                </span>
                                <span className="month-log-values">
                                  <span className="month-log-value is-match" title={`${h.label} · ${h.time}`}>
                                    {h.value}
                                  </span>
                                </span>
                              </li>
                            )
                          })}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="year-breakdown">
                  {myNumberData.rows.map(({ year, hits, months }) => {
                    const isExpanded = expandedYear === year
                    return (
                      <div className="year-block" key={year}>
                        <div className="year-row">
                          <button
                            type="button"
                            className="year-row-label"
                            onClick={() => setExpandedYear(isExpanded ? null : year)}
                            aria-expanded={isExpanded}
                            title={`Show Jan–Dec ${year}`}
                          >
                            {year}
                            <span className="year-row-chevron">{isExpanded ? '▾' : '▸'}</span>
                          </button>
                          <div className="year-row-bar-track">
                            <div
                              className="year-row-bar-fill"
                              style={{ width: `${(hits.length / myNumberData.maxCount) * 100}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            className={`year-row-count ${hits.length === 0 ? 'is-zero' : ''}`}
                            onClick={() => hits.length > 0 && setQuery(myNumberNormalized)}
                            disabled={hits.length === 0}
                            title={hits.length > 0 ? `See all ${year} draws for ${myNumberNormalized}` : undefined}
                          >
                            ×{hits.length}
                          </button>
                        </div>

                        {isExpanded && (
                          <>
                            <div className="month-grid">
                              {months.map((m) => {
                                const isOpenMonth =
                                  expandedMonth?.year === year && expandedMonth?.idx === m.idx
                                return (
                                  <button
                                    key={m.idx}
                                    type="button"
                                    className={`month-cell ${m.count > 0 ? 'has-hits' : ''} ${
                                      isOpenMonth ? 'is-open' : ''
                                    }`}
                                    onClick={() =>
                                      setExpandedMonth(isOpenMonth ? null : { year, idx: m.idx })
                                    }
                                    title={`Open ${m.name} ${year}`}
                                  >
                                    <span className="month-cell-name">{m.short}</span>
                                    <span className="month-cell-count">
                                      {m.count > 0 ? `×${m.count}` : '—'}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>

                            {expandedMonth?.year === year && (
                              <div className="month-log">
                                <p className="month-log-title">
                                  {MONTH_NAMES[expandedMonth.idx]} {year} — every draw logged
                                </p>
                                {getMonthLog(year, expandedMonth.idx).length === 0 ? (
                                  <p className="month-log-empty">No draws logged for this month yet.</p>
                                ) : (
                                  <ul className="month-log-list">
                                    {getMonthLog(year, expandedMonth.idx).map(({ date, slots }) => {
                                      const { weekday, day } = formatDay(date)
                                      return (
                                        <li key={date} className="month-log-row">
                                          <span className="month-log-date">
                                            {day} <span className="month-log-weekday">{weekday}</span>
                                          </span>
                                          <span className="month-log-values">
                                            {slots.map((s) =>
                                              s.value ? (
                                                <span
                                                  key={s.key}
                                                  className={`month-log-value ${s.isMatch ? 'is-match' : ''}`}
                                                  title={`${s.label} · ${s.time}`}
                                                >
                                                  {s.value}
                                                </span>
                                              ) : (
                                                <span key={s.key} className="month-log-value is-empty">
                                                  —
                                                </span>
                                              ),
                                            )}
                                          </span>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {myNumberData.total > 0 && (
                  <p className="predict-disclaimer">
                    Tap a year for Jan–Dec, then a month to see every draw logged that month — your
                    number's highlighted. Tap the ×count to jump to every matching draw in search.
                  </p>
                )}
              </>
            )}
          </>
        ) : cycleMode ? (
          <>
            <div className="cycle-view-toggle" role="tablist" aria-label="month cycle view">
              <button
                type="button"
                role="tab"
                aria-selected={cycleView === 'number'}
                className={`mode-toggle-btn ${cycleView === 'number' ? 'is-active' : ''}`}
                onClick={() => setCycleView('number')}
              >
                By Number
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cycleView === 'grid'}
                className={`mode-toggle-btn ${cycleView === 'grid' ? 'is-active' : ''}`}
                onClick={() => setCycleView('grid')}
              >
                Jan → Dec Grid
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cycleView === 'predict'}
                className={`mode-toggle-btn ${cycleView === 'predict' ? 'is-active' : ''}`}
                onClick={() => setCycleView('predict')}
              >
                6-Mo Predictions
              </button>
            </div>

            {cycleView === 'predict' ? (
              <>
                <p className="predict-disclaimer cycle-intro">
                  {`Jan ${SIX_MONTH_PREDICT_FROM.slice(0, 4)} – Dec ${SIX_MONTH_PREDICT_TO.slice(0, 4)} only — a combo qualifies here if it shows up at least ${SIX_MONTH_PREDICT_MIN_HITS} times in that span, each hit exactly 6 months after the last (a clean, unbroken cycle). Grouped by the month it's next due.`}
                </p>

                <div className="cycle-list">
                  {sixMonthPredictions.map((m) => (
                    <div className="cycle-group" key={m.name}>
                      <div className="cycle-row cycle-row-header">
                        <span className="reminder-chip cycle-chip">{m.name}</span>
                        <span className="cycle-row-stat">
                          {m.combos.length === 0
                            ? 'no confirmed 6-month cycle'
                            : `${m.combos.length} predicted number${m.combos.length === 1 ? '' : 's'}`}
                        </span>
                      </div>

                      {m.combos.length === 0 ? (
                        <p className="empty-state">
                          Nothing has hit on a clean 6-month cycle {SIX_MONTH_PREDICT_MIN_HITS}+
                          times pointing at {m.name} yet.
                        </p>
                      ) : (
                        m.combos.map((c) => {
                          const rowKey = `predict-${m.idx}-${c.normalized}`
                          const isOpen = expandedSixMonthPredict === rowKey
                          return (
                            <div className="cycle-group" key={rowKey}>
                              <button
                                type="button"
                                className={`cycle-row cycle-row-btn ${isOpen ? 'is-open' : ''}`}
                                onClick={() => setExpandedSixMonthPredict(isOpen ? null : rowKey)}
                                aria-expanded={isOpen}
                              >
                                <span className="reminder-chip cycle-chip partner-chip predict-chip-hot">
                                  {c.normalized}
                                </span>
                                <div className="cycle-row-detail">
                                  <span className="cycle-row-stat">
                                    {`hit ${c.hitCount}× on cycle · last ${c.lastHitDate} · predicts ${c.predictedMonthLabel}, ${c.predictedWeek.label}`}
                                  </span>
                                </div>
                                <span className="cycle-row-chevron" aria-hidden="true">
                                  {isOpen ? '▲' : '▼'}
                                </span>
                              </button>

                              {isOpen && (
                                <div className="ticket-list cycle-ticket-list">
                                  {c.draws.map((h) => {
                                    const { weekday, day } = formatDay(h.date)
                                    return (
                                      <article className="ticket search-result" key={`${h.date}-${h.key}`}>
                                        <div className="ticket-date">
                                          <span className="ticket-day">{day}</span>
                                          <span className="ticket-weekday">{weekday}</span>
                                        </div>
                                        <div className="ticket-slots search-slots">
                                          <Slot
                                            label={h.label}
                                            time={h.time}
                                            value={h.value}
                                            accentVar={h.accentVar}
                                            isMatch
                                            isFavorite={favorites.includes(h.normalized)}
                                            onToggleFavorite={() => toggleFavorite(h.normalized)}
                                          />
                                          <span className="search-month-tag">{h.monthLabel}</span>
                                        </div>
                                      </article>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  ))}
                </div>

                <p className="predict-disclaimer">
                  Historical frequency only — each STL draw is independent, so past results don't
                  influence future ones.
                </p>
              </>
            ) : cycleView === 'grid' ? (
              <>
                <p className="predict-disclaimer cycle-intro">
                  The full calendar broken into its 6 six-month-apart pairs (January + July,
                  February + August, and so on). A number lands in a pair if it was ever drawn in
                  either of those two months, in any year — the hits don't need to be the same
                  year, just the same pair of calendar months.
                </p>

                <div className="cycle-list">
                  {janDecGrid.map((pair) => (
                    <div className="cycle-group" key={`${pair.aName}-${pair.bName}`}>
                      <div className="cycle-row cycle-row-header">
                        <span className="reminder-chip cycle-chip">
                          {pair.aName} + {pair.bName}
                        </span>
                        <span className="cycle-row-stat">
                          {pair.matches.length === 0
                            ? 'no repeats yet'
                            : `${pair.matches.length} number${pair.matches.length === 1 ? '' : 's'} in both months`}
                        </span>
                      </div>

                      {pair.matches.length === 0 ? (
                        <p className="empty-state">
                          No combo has landed in both {pair.aName} and {pair.bName} yet.
                        </p>
                      ) : (
                        pair.matches.map((m) => {
                          const rowKey = `${pair.aName}-${m.normalized}`
                          const isOpen = expandedGridCombo === rowKey
                          return (
                            <div className="cycle-group" key={rowKey}>
                              <button
                                type="button"
                                className={`cycle-row cycle-row-btn ${isOpen ? 'is-open' : ''}`}
                                onClick={() => setExpandedGridCombo(isOpen ? null : rowKey)}
                                aria-expanded={isOpen}
                              >
                                <span className="reminder-chip cycle-chip">{m.normalized}</span>
                                <div className="cycle-row-detail">
                                  <span className="cycle-row-stat">
                                    {m.aHits.length} hit{m.aHits.length === 1 ? '' : 's'} in{' '}
                                    {pair.aName} &middot; {m.bHits.length} hit
                                    {m.bHits.length === 1 ? '' : 's'} in {pair.bName}
                                  </span>
                                </div>
                                <span className="cycle-row-chevron" aria-hidden="true">
                                  {isOpen ? '▲' : '▼'}
                                </span>
                              </button>

                              {isOpen && (
                                <div className="ticket-list cycle-ticket-list">
                                  {[...m.aHits, ...m.bHits].map((h) => {
                                    const { weekday, day } = formatDay(h.date)
                                    return (
                                      <article
                                        className="ticket search-result"
                                        key={`${h.date}-${h.key}`}
                                      >
                                        <div className="ticket-date">
                                          <span className="ticket-day">{day}</span>
                                          <span className="ticket-weekday">{weekday}</span>
                                        </div>
                                        <div className="ticket-slots search-slots">
                                          <Slot
                                            label={h.label}
                                            time={h.time}
                                            value={h.value}
                                            accentVar={h.accentVar}
                                            isMatch
                                            isFavorite={favorites.includes(h.normalized)}
                                            onToggleFavorite={() => toggleFavorite(h.normalized)}
                                          />
                                          <span className="search-month-tag">{h.monthLabel}</span>
                                        </div>
                                      </article>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  ))}
                </div>

                <p className="predict-disclaimer">
                  Historical frequency only — each STL draw is independent, so past results don't
                  influence future ones.
                </p>
              </>
            ) : (
              <>
            <p className="predict-disclaimer cycle-intro">
              {`Every combo drawn between ${cycleWindowLabel}, checked only against its own draws in that span — flagged here if it showed up twice exactly ${cycleMonths} month${cycleMonths === 1 ? '' : 's'} apart within that range. Strongest cycles first.`}
            </p>

            <div className="cycle-year-picker cycle-range-picker">
              <span className="cycle-year-label">Every</span>
              <select
                className="saved-year-select"
                value={cycleMonths}
                onChange={(e) => {
                  setCycleMonths(Number(e.target.value))
                  setHasSearchedCycle(false)
                  setExpandedCycleCombo(null)
                }}
                aria-label="Cycle length in months"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} month{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>

              <span className="cycle-year-label">From</span>
              <select
                className="saved-year-select"
                value={cycleFromMonth}
                onChange={(e) => {
                  setCycleFromMonth(Number(e.target.value))
                  setHasSearchedCycle(false)
                  setExpandedCycleCombo(null)
                }}
                aria-label="From month"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="saved-year-select"
                value={cycleFromYear}
                onChange={(e) => {
                  setCycleFromYear(Number(e.target.value))
                  setHasSearchedCycle(false)
                  setExpandedCycleCombo(null)
                }}
                aria-label="From year"
              >
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <span className="cycle-year-label">To</span>
              <select
                className="saved-year-select"
                value={cycleToMonth}
                onChange={(e) => {
                  setCycleToMonth(Number(e.target.value))
                  setHasSearchedCycle(false)
                  setExpandedCycleCombo(null)
                }}
                aria-label="To month"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="saved-year-select"
                value={cycleToYear}
                onChange={(e) => {
                  setCycleToYear(Number(e.target.value))
                  setHasSearchedCycle(false)
                  setExpandedCycleCombo(null)
                }}
                aria-label="To year"
              >
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn-find-cycle"
                onClick={() => {
                  setHasSearchedCycle(true)
                  setExpandedCycleCombo(null)
                }}
              >
                Find {cycleMonths}-Month Cycle
              </button>
            </div>

            {!hasSearchedCycle ? (
              <p className="empty-state">
                Pick a From and To month/year above and click{' '}
                <strong>Find {cycleMonths}-Month Cycle</strong> to search.
              </p>
            ) : sixMonthCycleAll.length === 0 ? (
              <p className="empty-state">
                {`No number was drawn twice exactly ${cycleMonths} month${cycleMonths === 1 ? '' : 's'} apart between ${cycleWindowLabel}.`}
              </p>
            ) : (
              <div className="cycle-list">
                {sixMonthCycleAll.map((c) => {
                  const isOpen = expandedCycleCombo === c.normalized
                  return (
                    <div className="cycle-group" key={c.normalized}>
                      <button
                        type="button"
                        className={`cycle-row cycle-row-btn ${isOpen ? 'is-open' : ''}`}
                        onClick={() => setExpandedCycleCombo(isOpen ? null : c.normalized)}
                        aria-expanded={isOpen}
                      >
                        <span className="reminder-chip cycle-chip">{c.normalized}</span>
                        <div className="cycle-row-detail">
                          <span className="cycle-row-stat">
                            {`${c.hitCount} draws between ${cycleWindowLabel}`}
                            &middot; {c.sixMonthGaps} {cycleMonths}-month repeat
                            {c.sixMonthGaps === 1 ? '' : 's'}
                          </span>
                          <span className="cycle-row-months">
                            last drawn {c.lastHitMonthName} ({c.lastHitDate}) &middot; possible
                            again in <strong>{c.nextMonthName}</strong>, around{' '}
                            <strong>{c.predictedWeek.label}</strong> (days {c.predictedWeek.range})
                          </span>
                        </div>
                        <span className="cycle-row-chevron" aria-hidden="true">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </button>


                      {isOpen && (
                        <div className="ticket-list cycle-ticket-list">
                          {c.draws.map((m) => {
                            const { weekday, day } = formatDay(m.date)
                            return (
                              <article className="ticket search-result" key={`${m.date}-${m.key}`}>
                                <div className="ticket-date">
                                  <span className="ticket-day">{day}</span>
                                  <span className="ticket-weekday">{weekday}</span>
                                </div>
                                <div className="ticket-slots search-slots">
                                  <Slot
                                    label={m.label}
                                    time={m.time}
                                    value={m.value}
                                    accentVar={m.accentVar}
                                    isMatch
                                    isFavorite={favorites.includes(m.normalized)}
                                    onToggleFavorite={() => toggleFavorite(m.normalized)}
                                  />
                                  <span className="search-month-tag">{m.monthLabel}</span>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <p className="predict-disclaimer">
              Historical frequency only — each STL draw is independent, so past results don't
              influence future ones.
            </p>
              </>
            )}
          </>
        ) : yearlyMode ? (
          <>
            <p className="predict-disclaimer cycle-intro">
              {`Every calendar month (January – December), checked across ${yearlyRepeaters.yearsInRange[0]}–${yearlyRepeaters.yearsInRange[yearlyRepeaters.yearsInRange.length - 1]} — a number is flagged only if it was drawn in that same month in EVERY one of those years.`}
            </p>

            <div className="cycle-year-picker cycle-range-picker">
              <span className="cycle-year-label">From</span>
              <select
                className="saved-year-select"
                value={yearlyFromYear}
                onChange={(e) => {
                  setYearlyFromYear(Number(e.target.value))
                  setExpandedYearlyCombo(null)
                }}
                aria-label="From year"
              >
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <span className="cycle-year-label">To</span>
              <select
                className="saved-year-select"
                value={yearlyToYear}
                onChange={(e) => {
                  setYearlyToYear(Number(e.target.value))
                  setExpandedYearlyCombo(null)
                }}
                aria-label="To year"
              >
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {yearlyRepeaters.yearsInRange.length < 2 ? (
              <p className="empty-state">Pick a From and To year at least one year apart.</p>
            ) : (
              <div className="cycle-list">
                {yearlyRepeaters.months.map((m) => (
                  <div className="cycle-group" key={m.name}>
                    <div className="cycle-row cycle-row-header">
                      <span className="reminder-chip cycle-chip">{m.name}</span>
                      <span className="cycle-row-stat">
                        {!m.complete
                          ? `no data yet for every year (${m.yearsWithData.length}/${yearlyRepeaters.yearsInRange.length} years logged)`
                          : m.combos.length === 0
                            ? 'no number repeated every year'
                            : `${m.combos.length} number${m.combos.length === 1 ? '' : 's'} every year`}
                      </span>
                    </div>

                    {!m.complete ? (
                      <p className="empty-state">
                        {`${m.name} doesn't have logged draws yet for every year in ${yearlyRepeaters.yearsInRange[0]}–${yearlyRepeaters.yearsInRange[yearlyRepeaters.yearsInRange.length - 1]}, so it can't be checked yet.`}
                      </p>
                    ) : m.combos.length === 0 ? (
                      <p className="empty-state">
                        No combo landed in {m.name} in every one of{' '}
                        {yearlyRepeaters.yearsInRange.join(', ')}.
                      </p>
                    ) : (
                      m.combos.map((c) => {
                        const rowKey = `${m.monthIdx}-${c.normalized}`
                        const isOpen = expandedYearlyCombo === rowKey
                        return (
                          <div className="cycle-group" key={rowKey}>
                            <button
                              type="button"
                              className={`cycle-row cycle-row-btn ${isOpen ? 'is-open' : ''}`}
                              onClick={() => setExpandedYearlyCombo(isOpen ? null : rowKey)}
                              aria-expanded={isOpen}
                            >
                              <span className="reminder-chip cycle-chip">{c.normalized}</span>
                              <div className="cycle-row-detail">
                                <span className="cycle-row-stat">
                                  {c.yearHits
                                    .map((yh) => `${yh.year}: ${yh.count}×`)
                                    .join(' · ')}
                                </span>
                              </div>
                              <span className="cycle-row-chevron" aria-hidden="true">
                                {isOpen ? '▲' : '▼'}
                              </span>
                            </button>

                            {isOpen && (
                              <div className="ticket-list cycle-ticket-list">
                                {c.draws.map((h) => {
                                  const { weekday, day } = formatDay(h.date)
                                  return (
                                    <article className="ticket search-result" key={`${h.date}-${h.key}`}>
                                      <div className="ticket-date">
                                        <span className="ticket-day">{day}</span>
                                        <span className="ticket-weekday">{weekday}</span>
                                      </div>
                                      <div className="ticket-slots search-slots">
                                        <Slot
                                          label={h.label}
                                          time={h.time}
                                          value={h.value}
                                          accentVar={h.accentVar}
                                          isMatch
                                          isFavorite={favorites.includes(h.normalized)}
                                          onToggleFavorite={() => toggleFavorite(h.normalized)}
                                        />
                                        <span className="search-month-tag">{h.monthLabel}</span>
                                      </div>
                                    </article>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="predict-disclaimer">
              Historical frequency only — each STL draw is independent, so past results don't
              influence future ones.
            </p>
          </>
        ) : hotColdMode ? (
          <>
            <p className="predict-disclaimer cycle-intro">
              {`${MONTH_NAMES[hotColdMonthIdx]}, ${hotColdData.fromY}–${hotColdData.toY} — 🔥 Hot means a number was drawn ${HOT_THRESHOLD}+ times in ${MONTH_NAMES[hotColdMonthIdx]} within that range. Everything else is sorted by how long it's been since it last hit ${MONTH_NAMES[hotColdMonthIdx]}, and ❄️ Cold means it never has.`}
            </p>

            <div className="cycle-group six-month-ever-group">
              <div className="cycle-row cycle-row-header six-month-ever-header">
                <span className="predict-tier-label predict-tier-hot">
                  🔁 Every {sixMonthEverGap} Months — January 2024 to Now
                </span>
                <span className="cycle-row-stat">
                  {everySixMonthsData.combos.length} number
                  {everySixMonthsData.combos.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="cycle-year-picker six-month-ever-gap-picker">
                <span className="cycle-year-label">Gap</span>
                <select
                  className="saved-year-select"
                  value={sixMonthEverGap}
                  onChange={(e) => {
                    setSixMonthEverGap(Number(e.target.value))
                    setExpandedSixMonthEverCombo(null)
                  }}
                  aria-label="Months apart"
                >
                  {[6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) => (
                    <option key={n} value={n}>
                      {n} months apart
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">How many</span>
                <select
                  className="saved-year-select"
                  value={sixMonthEverHowMany}
                  onChange={(e) => {
                    setSixMonthEverHowMany(Number(e.target.value))
                    setExpandedSixMonthEverCombo(null)
                  }}
                  aria-label="How many results to show"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} result{n === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </div>

              <p className="predict-disclaimer six-month-ever-intro">
                {`Numbers that have landed twice with an exact ${sixMonthEverGap}-month gap somewhere between January 2024 and this month, with no closer repeat in between (a number drawn in, say, January and March is rejected — too close together) and not due again for at least 6 months.`}
                {everySixMonthsData.rejectedRecent > 0
                  ? ` (${everySixMonthsData.rejectedRecent} rejected as too recent or too close-together.)`
                  : ''}
              </p>

              {everySixMonthsData.combos.length === 0 ? (
                <p className="empty-state">
                  {`Nothing has repeated on an exact ${sixMonthEverGap}-month gap since January 2024 yet.`}
                </p>
              ) : (
                <div className="cycle-list">
                  {everySixMonthsData.combos.map((c) => {
                    const rowKey = `every6mo-${c.normalized}`
                    const isOpen = expandedSixMonthEverCombo === rowKey
                    return (
                      <div className="cycle-group" key={rowKey}>
                        <button
                          type="button"
                          className={`cycle-row cycle-row-btn ${isOpen ? 'is-open' : ''}`}
                          onClick={() => setExpandedSixMonthEverCombo(isOpen ? null : rowKey)}
                          aria-expanded={isOpen}
                        >
                          <span className="reminder-chip cycle-chip">{c.normalized}</span>
                          <div className="cycle-row-detail">
                            <span className="cycle-row-stat">
                              {`${c.hitCount} draws since Jan 2024`}
                              &middot; {c.sixMonthGaps} 6-month repeat
                              {c.sixMonthGaps === 1 ? '' : 's'}
                            </span>
                            <span className="cycle-row-months">
                              last drawn {c.lastHitMonthName} ({c.lastHitDate}) &middot; predicts{' '}
                              <strong>{c.nextMonthName}</strong>, around{' '}
                              <strong>{c.predictedWeek.label}</strong> (days{' '}
                              {c.predictedWeek.range})
                            </span>
                          </div>
                          <span className="cycle-row-chevron" aria-hidden="true">
                            {isOpen ? '▲' : '▼'}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="ticket-list cycle-ticket-list">
                            {c.draws.map((m) => {
                              const { weekday, day } = formatDay(m.date)
                              return (
                                <article className="ticket search-result" key={`${m.date}-${m.key}`}>
                                  <div className="ticket-date">
                                    <span className="ticket-day">{day}</span>
                                    <span className="ticket-weekday">{weekday}</span>
                                  </div>
                                  <div className="ticket-slots search-slots">
                                    <Slot
                                      label={m.label}
                                      time={m.time}
                                      value={m.value}
                                      accentVar={m.accentVar}
                                      isMatch
                                      isFavorite={favorites.includes(m.normalized)}
                                      onToggleFavorite={() => toggleFavorite(m.normalized)}
                                    />
                                    <span className="search-month-tag">{m.monthLabel}</span>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="cycle-year-picker cycle-range-picker">
              <span className="cycle-year-label">From</span>
              <select
                className="saved-year-select"
                value={hotColdFromYear}
                onChange={(e) => {
                  setHotColdFromYear(Number(e.target.value))
                  setExpandedHotColdCombo(null)
                }}
                aria-label="From year"
              >
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <span className="cycle-year-label">To</span>
              <select
                className="saved-year-select"
                value={hotColdToYear}
                onChange={(e) => {
                  setHotColdToYear(Number(e.target.value))
                  setExpandedHotColdCombo(null)
                }}
                aria-label="To year"
              >
                {allYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const renderComboList = (list, sectionId, chipClass, emptyText) =>
                list.length === 0 ? (
                  <p className="empty-state">{emptyText}</p>
                ) : (
                  <div className="ticket-list cycle-ticket-list">
                    {list.map((entry) => {
                      const rowKey = `${sectionId}-${entry.normalized}`
                      const isOpen = expandedHotColdCombo === rowKey
                      const hasDraws = Boolean(entry.draws && entry.draws.length > 0)
                      return (
                        <div className="cycle-group" key={rowKey}>
                          <button
                            type="button"
                            className={`cycle-row cycle-row-btn ${isOpen ? 'is-open' : ''}`}
                            onClick={() =>
                              hasDraws && setExpandedHotColdCombo(isOpen ? null : rowKey)
                            }
                            aria-expanded={isOpen}
                            disabled={!hasDraws}
                          >
                            <span className={`partner-chip ${chipClass}`}>
                              {entry.normalized}
                            </span>
                            <div className="cycle-row-detail">
                              <span className="cycle-row-stat">
                                {hasDraws
                                  ? `${entry.inRangeCount ?? entry.totalHits}× in range · last hit ${entry.lastHitDate}`
                                  : `never drawn in ${MONTH_NAMES[hotColdMonthIdx]}`}
                              </span>
                            </div>
                            {hasDraws && (
                              <span className="cycle-row-chevron" aria-hidden="true">
                                {isOpen ? '▲' : '▼'}
                              </span>
                            )}
                          </button>

                          {isOpen && hasDraws && (
                            <div className="ticket-list cycle-ticket-list">
                              {entry.draws.map((h) => {
                                const { weekday, day } = formatDay(h.date)
                                return (
                                  <article className="ticket search-result" key={`${h.date}-${h.key}`}>
                                    <div className="ticket-date">
                                      <span className="ticket-day">{day}</span>
                                      <span className="ticket-weekday">{weekday}</span>
                                    </div>
                                    <div className="ticket-slots search-slots">
                                      <Slot
                                        label={h.label}
                                        time={h.time}
                                        value={h.value}
                                        accentVar={h.accentVar}
                                        isMatch
                                        isFavorite={favorites.includes(h.normalized)}
                                        onToggleFavorite={() => toggleFavorite(h.normalized)}
                                      />
                                      <span className="search-month-tag">{h.monthLabel}</span>
                                    </div>
                                  </article>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )

              return (
                <>
                  <div className="cycle-group">
                    <div className="cycle-row cycle-row-header">
                      <span className="predict-tier-label predict-tier-hot">
                        🔥 Hot — {HOT_THRESHOLD}+ times in {hotColdData.fromY}–{hotColdData.toY}
                      </span>
                      <span className="cycle-row-stat">{hotColdData.hot.length} number{hotColdData.hot.length === 1 ? '' : 's'}</span>
                    </div>
                    {renderComboList(
                      hotColdData.hot,
                      'hot',
                      'predict-chip-hot',
                      `Nothing has hit ${MONTH_NAMES[hotColdMonthIdx]} ${HOT_THRESHOLD}+ times in ${hotColdData.fromY}–${hotColdData.toY} yet.`,
                    )}
                  </div>

                  {hotColdData.recent.length > 0 && (
                    <div className="cycle-group">
                      <div className="cycle-row cycle-row-header">
                        <span className="predict-tier-label predict-tier-warm">
                          ⭐ Recently Hit — under 6 months ago
                        </span>
                        <span className="cycle-row-stat">{hotColdData.recent.length} number{hotColdData.recent.length === 1 ? '' : 's'}</span>
                      </div>
                      {renderComboList(hotColdData.recent, 'recent', 'predict-chip-warm', '')}
                    </div>
                  )}

                  {hotColdData.tiers.map((tier) => (
                    <div className="cycle-group" key={tier.id}>
                      <div className="cycle-row cycle-row-header">
                        <span className="predict-tier-label predict-tier-warm">
                          ⭐ {tier.label}
                        </span>
                        <span className="cycle-row-stat">{tier.combos.length} number{tier.combos.length === 1 ? '' : 's'}</span>
                      </div>
                      {renderComboList(
                        tier.combos,
                        `tier-${tier.id}`,
                        'predict-chip-warm',
                        `Nothing last hit ${MONTH_NAMES[hotColdMonthIdx]} exactly ${tier.label.toLowerCase()}.`,
                      )}
                    </div>
                  ))}

                  {hotColdData.dormant.length > 0 && (
                    <div className="cycle-group">
                      <div className="cycle-row cycle-row-header">
                        <span className="predict-tier-label predict-tier-cool">
                          • 13+ Months Ago
                        </span>
                        <span className="cycle-row-stat">{hotColdData.dormant.length} number{hotColdData.dormant.length === 1 ? '' : 's'}</span>
                      </div>
                      {renderComboList(hotColdData.dormant, 'dormant', 'predict-chip-cool', '')}
                    </div>
                  )}

                  <div className="cycle-group">
                    <div className="cycle-row cycle-row-header">
                      <span className="predict-tier-label predict-tier-cool">
                        ❄️ Cold — never in {MONTH_NAMES[hotColdMonthIdx]}
                      </span>
                      <span className="cycle-row-stat">{hotColdData.cold.length} number{hotColdData.cold.length === 1 ? '' : 's'}</span>
                    </div>
                    {renderComboList(
                      hotColdData.cold,
                      'cold',
                      'predict-chip-cool',
                      `Every number has hit ${MONTH_NAMES[hotColdMonthIdx]} at least once.`,
                    )}
                  </div>
                </>
              )
            })()}

            <p className="predict-disclaimer">
              Historical frequency only — each STL draw is independent, so past results don't
              influence future ones.
            </p>
          </>
        ) : randomMode ? (
          <>
            <p className="predict-disclaimer cycle-intro">
              Pick a strategy to build a pool of numbers from your draw history, then tap
              Randomize to draw one at random from that pool.
            </p>

            <div className="mode-toggle random-strategy-toggle">
              {[
                { id: 'month', label: 'Month + Times' },
                { id: 'everyYear', label: 'Every Year' },
                { id: 'recentHot', label: 'Recent Hot Streak' },
                { id: 'range', label: 'Year Range' },
                { id: 'monthsAway', label: 'Months Away' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`mode-toggle-btn ${randomStrategy === opt.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setRandomStrategy(opt.id)
                    setRandomPick(null)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {randomStrategy === 'month' && (
              <div className="cycle-year-picker cycle-range-picker">
                <span className="cycle-year-label">Month</span>
                <select
                  className="saved-year-select"
                  value={randomMonthIdx}
                  onChange={(e) => {
                    setRandomMonthIdx(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="Month"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">At least</span>
                <select
                  className="saved-year-select"
                  value={randomMinTimes}
                  onChange={(e) => {
                    setRandomMinTimes(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="Minimum times appeared"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}&times; times
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">Months away</span>
                <select
                  className="saved-year-select"
                  value={randomMonthTimesAwayMin === null ? 'any' : randomMonthTimesAwayMin}
                  onChange={(e) => {
                    const v = e.target.value
                    setRandomMonthTimesAwayMin(v === 'any' ? null : Number(v))
                    setRandomPick(null)
                  }}
                  aria-label="Minimum months since last drawn"
                >
                  <option value="any">Any</option>
                  {[6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) => (
                    <option key={n} value={n}>
                      {n}+ months away
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">From</span>
                <select
                  className="saved-year-select"
                  value={randomFromYear}
                  onChange={(e) => {
                    setRandomFromYear(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="From year"
                >
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">To</span>
                <select
                  className="saved-year-select"
                  value={randomToYear}
                  onChange={(e) => {
                    setRandomToYear(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="To year"
                >
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {randomStrategy === 'everyYear' && (
              <div className="cycle-year-picker cycle-range-picker">
                <span className="cycle-year-label">Target month</span>
                <select
                  className="saved-year-select"
                  value={randomEveryYearMonthIdx === null ? 'any' : randomEveryYearMonthIdx}
                  onChange={(e) => {
                    const v = e.target.value
                    setRandomEveryYearMonthIdx(v === 'any' ? null : Number(v))
                    setRandomPick(null)
                  }}
                  aria-label="Target month"
                >
                  <option value="any">Any month</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">From</span>
                <select
                  className="saved-year-select"
                  value={randomFromYear}
                  onChange={(e) => {
                    setRandomFromYear(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="From year"
                >
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">To</span>
                <select
                  className="saved-year-select"
                  value={randomToYear}
                  onChange={(e) => {
                    setRandomToYear(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="To year"
                >
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {randomStrategy === 'recentHot' && (
              <div className="cycle-year-picker cycle-range-picker">
                <span className="cycle-year-label">Target month</span>
                <select
                  className="saved-year-select"
                  value={randomRecentTargetMonthIdx === null ? 'any' : randomRecentTargetMonthIdx}
                  onChange={(e) => {
                    const v = e.target.value
                    setRandomRecentTargetMonthIdx(v === 'any' ? null : Number(v))
                    setRandomPick(null)
                  }}
                  aria-label="Target month"
                >
                  <option value="any">Any month</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">At least</span>
                <select
                  className="saved-year-select"
                  value={randomRecentMinTimes}
                  onChange={(e) => {
                    setRandomRecentMinTimes(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="Minimum times appeared recently"
                >
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}&times; times
                    </option>
                  ))}
                </select>

                {randomRecentTargetMonthIdx === null ? (
                  <>
                    <span className="cycle-year-label">in the last</span>
                    <select
                      className="saved-year-select"
                      value={randomRecentWindow}
                      onChange={(e) => {
                        setRandomRecentWindow(Number(e.target.value))
                        setRandomPick(null)
                      }}
                      aria-label="Rolling window in months"
                    >
                      {[6, 7, 8, 9, 10, 11, 12, 13, 14].map((n) => (
                        <option key={n} value={n}>
                          {n} months
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <span className="cycle-year-label">from</span>
                    <select
                      className="saved-year-select"
                      value={randomRecentFromYear}
                      onChange={(e) => {
                        setRandomRecentFromYear(Number(e.target.value))
                        setRandomPick(null)
                      }}
                      aria-label="From year"
                    >
                      {allYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <span className="cycle-year-label">to now</span>
                  </>
                )}
              </div>
            )}

            {randomStrategy === 'range' && (
              <div className="cycle-year-picker cycle-range-picker">
                <span className="cycle-year-label">Target month</span>
                <select
                  className="saved-year-select"
                  value={randomRangeTargetMonthIdx === null ? 'any' : randomRangeTargetMonthIdx}
                  onChange={(e) => {
                    const v = e.target.value
                    setRandomRangeTargetMonthIdx(v === 'any' ? null : Number(v))
                    setRandomPick(null)
                  }}
                  aria-label="Target month"
                >
                  <option value="any">Any month</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">At least</span>
                <select
                  className="saved-year-select"
                  value={randomRangeMinTimes}
                  onChange={(e) => {
                    setRandomRangeMinTimes(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="Minimum times appeared in range"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}&times; times
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">From</span>
                <select
                  className="saved-year-select"
                  value={randomFromYear}
                  onChange={(e) => {
                    setRandomFromYear(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="From year"
                >
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                <span className="cycle-year-label">To</span>
                <select
                  className="saved-year-select"
                  value={randomToYear}
                  onChange={(e) => {
                    setRandomToYear(Number(e.target.value))
                    setRandomPick(null)
                  }}
                  aria-label="To year"
                >
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {randomStrategy === 'monthsAway' && (
              <>
                <p className="predict-disclaimer">
                  {monthsAwayTargetMonthIdx === null
                    ? `Numbers drawn less than 6 months ago are always rejected. Everything else is grouped by how many months ago (counting back from today) it last hit (13 catches 13+ months ago) — set how many random picks you want per bucket below.`
                    : `Numbers last drawn less than 6 months before ${MONTH_NAMES[monthsAwayTargetMonthIdx]} are always rejected. Everything else is grouped by how many months before ${MONTH_NAMES[monthsAwayTargetMonthIdx]} it last hit (13 catches 13+ months) — set how many random picks you want per bucket below.`}
                </p>

                <div className="cycle-year-picker cycle-range-picker">
                  <span className="cycle-year-label">Target month</span>
                  <select
                    className="saved-year-select"
                    value={monthsAwayTargetMonthIdx === null ? 'any' : monthsAwayTargetMonthIdx}
                    onChange={(e) => {
                      const v = e.target.value
                      setMonthsAwayTargetMonthIdx(v === 'any' ? null : Number(v))
                      setRandomMonthsAwayPicks({})
                    }}
                    aria-label="Target month"
                  >
                    <option value="any">Any month (count back from today)</option>
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cycle-year-picker cycle-range-picker">
                  <span className="cycle-year-label">From</span>
                  <select
                    className="saved-year-select"
                    value={monthsAwayFromMonth}
                    onChange={(e) => {
                      setMonthsAwayFromMonth(Number(e.target.value))
                      setRandomMonthsAwayPicks({})
                    }}
                    aria-label="From month"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="saved-year-select"
                    value={monthsAwayFromYear}
                    onChange={(e) => {
                      setMonthsAwayFromYear(Number(e.target.value))
                      setRandomMonthsAwayPicks({})
                    }}
                    aria-label="From year"
                  >
                    {allYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>

                  <span className="cycle-year-label">To</span>
                  <select
                    className="saved-year-select"
                    value={monthsAwayToMonth}
                    onChange={(e) => {
                      setMonthsAwayToMonth(Number(e.target.value))
                      setRandomMonthsAwayPicks({})
                    }}
                    aria-label="To month"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="saved-year-select"
                    value={monthsAwayToYear}
                    onChange={(e) => {
                      setMonthsAwayToYear(Number(e.target.value))
                      setRandomMonthsAwayPicks({})
                    }}
                    aria-label="To year"
                  >
                    {allYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="random-pick-panel months-away-panel">
                  <button
                    type="button"
                    className="btn-find-cycle random-roll-btn"
                    onClick={rollMonthsAwayAll}
                  >
                    🎲 Randomize All Buckets
                  </button>

                  {MONTHS_AWAY_BUCKETS.map((n) => {
                    const pool = monthsAwayPool[n] || []
                    const picks = randomMonthsAwayPicks[n] || []
                    const bucketLabel = n === 13 ? '13+ months ago' : `${n} months ago`
                    return (
                      <div className="cycle-group months-away-bucket" key={n}>
                        <div className="cycle-row cycle-row-header">
                          <span className="predict-tier-label predict-tier-hot">{bucketLabel}</span>
                          <span className="cycle-row-stat">
                            {pool.length} eligible
                          </span>
                        </div>

                        <div className="cycle-year-picker cycle-range-picker">
                          <span className="cycle-year-label">How many</span>
                          <select
                            className="saved-year-select"
                            value={randomMonthsAwayCounts[n] ?? 0}
                            onChange={(e) => {
                              const count = Number(e.target.value)
                              setRandomMonthsAwayCounts((prev) => ({ ...prev, [n]: count }))
                              setRandomMonthsAwayPicks((prev) => ({
                                ...prev,
                                [n]: (prev[n] || []).slice(0, count),
                              }))
                            }}
                            aria-label={`How many picks for ${bucketLabel}`}
                          >
                            {Array.from({ length: 31 }, (_, i) => i).map((num) => (
                              <option key={num} value={num}>
                                {num} pair{num === 1 ? '' : 's'}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="mode-toggle-btn"
                            onClick={() => rollMonthsAwayBucket(n)}
                            disabled={pool.length === 0 || (randomMonthsAwayCounts[n] ?? 0) === 0}
                          >
                            🔀 Reroll
                          </button>
                        </div>

                        {(randomMonthsAwayCounts[n] ?? 0) === 0 ? (
                          <p className="empty-state">Set "How many" above 0 to draw picks from this bucket.</p>
                        ) : pool.length === 0 ? (
                          <p className="empty-state">Nothing qualifies in this bucket yet.</p>
                        ) : picks.length === 0 ? (
                          <p className="empty-state">Tap Randomize to draw from the {pool.length} eligible.</p>
                        ) : (
                          <div className="favorites-chips">
                            {picks.map((p) => (
                              <span className="favorite-chip" key={p.normalized}>
                                <span className="favorite-chip-value">{p.normalized}</span>
                                <span className="cycle-row-stat">
                                  {` hit ${p.hitCount}\u00d7 \u00b7 last ${p.lastDate}`}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {randomStrategy !== 'monthsAway' && (
            <div className="random-pick-panel">
              <button
                type="button"
                className="btn-find-cycle random-roll-btn"
                onClick={rollRandomPick}
                disabled={randomPool.length === 0}
              >
                🎲 Randomize &middot; {randomPool.length} eligible
              </button>

              {randomPool.length === 0 ? (
                <p className="empty-state">Nothing in your draw history matches these filters yet.</p>
              ) : randomPick ? (
                <div className="random-pick-result">
                  <span className="random-pick-chip">{randomPick.normalized}</span>
                  <span className="cycle-row-stat">
                    {`hit ${randomPick.hitCount}\u00d7 matching this filter \u00b7 last hit ${randomPick.draws[0]?.date}`}
                  </span>
                </div>
              ) : (
                <p className="empty-state">
                  {`Tap Randomize to draw one of the ${randomPool.length} numbers that qualify.`}
                </p>
              )}

              {randomHistory.length > 1 && (
                <div className="random-history">
                  <span className="cycle-year-label">Recent picks</span>
                  <div className="favorites-chips">
                    {randomHistory.slice(1).map((p) => (
                      <span className="favorite-chip" key={p.normalized}>
                        <span className="favorite-chip-value">{p.normalized}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}

            <p className="predict-disclaimer">
              Historical frequency only — each STL draw is independent, so past results don't
              influence future ones. This tool narrows a pool by your filters and picks randomly
              within it; it does not forecast the actual draw.
            </p>
          </>
        ) : dateCalcMode ? (
          <>
            <p className="predict-disclaimer cycle-intro">
              Pick two dates to see the gap between them — both the flat day count and a calendar
              months + days breakdown.
            </p>

            <div className="cycle-year-picker cycle-range-picker">
              <span className="cycle-year-label">From</span>
              <input
                type="date"
                className="saved-year-select date-calc-input"
                value={dateCalcFrom}
                onChange={(e) => setDateCalcFrom(e.target.value)}
                aria-label="From date"
              />

              <span className="cycle-year-label">To</span>
              <input
                type="date"
                className="saved-year-select date-calc-input"
                value={dateCalcTo}
                onChange={(e) => setDateCalcTo(e.target.value)}
                aria-label="To date"
              />
            </div>

            <div className="random-pick-panel">
              {!dateCalcResult ? (
                <p className="empty-state">Pick both a from and to date.</p>
              ) : (
                <div className="random-pick-result date-calc-result">
                  {dateCalcResult.isReversed && (
                    <p className="predict-disclaimer">
                      "From" was later than "To", so the dates were swapped automatically.
                    </p>
                  )}
                  <span className="random-pick-chip date-calc-chip">
                    {dateCalcResult.totalDays.toLocaleString()} day
                    {dateCalcResult.totalDays === 1 ? '' : 's'}
                  </span>
                  <span className="cycle-row-stat">
                    {`${dateCalcResult.startLabel} \u2192 ${dateCalcResult.endLabel}`}
                  </span>
                  <p className="cycle-row-months">
                    {'That\u2019s '}
                    {dateCalcResult.years > 0 && (
                      <>
                        <strong>
                          {dateCalcResult.years} year{dateCalcResult.years === 1 ? '' : 's'}
                        </strong>
                        {', '}
                      </>
                    )}
                    <strong>
                      {dateCalcResult.months} month{dateCalcResult.months === 1 ? '' : 's'}
                    </strong>
                    {' and '}
                    <strong>
                      {dateCalcResult.days} day{dateCalcResult.days === 1 ? '' : 's'}
                    </strong>
                    {` — or ${dateCalcResult.totalMonths} month${
                      dateCalcResult.totalMonths === 1 ? '' : 's'
                    } total, or `}
                    <strong>
                      {dateCalcResult.weeks} week{dateCalcResult.weeks === 1 ? '' : 's'}
                    </strong>
                    {dateCalcResult.remDaysAfterWeeks > 0 &&
                      ` and ${dateCalcResult.remDaysAfterWeeks} day${
                        dateCalcResult.remDaysAfterWeeks === 1 ? '' : 's'
                      }`}
                    {'.'}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : days.length === 0 ? (
          <p className="empty-state">No draws logged for this month yet.</p>
        ) : (
          <div className="ticket-list">
            {days.map((row) => {
              const { weekday, day } = formatDay(row.date)
              return (
                <article className="ticket" key={row.date}>
                  <div className="ticket-date">
                    <span className="ticket-day">{day}</span>
                    <span className="ticket-weekday">{weekday}</span>
                  </div>
                  <div className="ticket-slots">
                    {SLOT_META.map((slot) => {
                      const normalized = normalizeNumber(row[slot.key])
                      return (
                        <Slot
                          key={slot.key}
                          label={slot.label}
                          time={slot.time}
                          value={row[slot.key]}
                          accentVar={slot.accentVar}
                          isFavorite={favorites.includes(normalized)}
                          onToggleFavorite={() => toggleFavorite(normalized)}
                        />
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      <footer className="footnote">
        Tap <span aria-hidden="true">☆</span> to pin a number · edit{' '}
        <code>src/data/drawResults.{province}.js</code> to add new months or update numbers · edit{' '}
        <code>src/data/myNumbers.{province}.js</code> to change your saved numbers.
      </footer>

      {manageMonthsOpen && (
        <div className="saved-month-overlay" onClick={() => setManageMonthsOpen(false)}>
          <div
            className="saved-month-panel manage-months-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Manage months"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="saved-month-panel-close"
              onClick={() => setManageMonthsOpen(false)}
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
            <p className="saved-month-panel-title">
              Manage Months — {PROVINCES.find((p) => p.id === province)?.name}
            </p>
            <p className="manage-months-sub">
              Switch a month OFF to leave it out of predictions, cycles, hot/cold and
              compare — its numbers stay put and you can still browse it, it just won't
              be counted. {enabledMonthKeys.length} of {monthKeys.length} months are ON.
            </p>

            <div className="manage-months-year-picker" role="tablist" aria-label="Select year">
              {monthsByYear.map(({ year }) => (
                <button
                  key={year}
                  type="button"
                  role="tab"
                  aria-selected={manageMonthsYear === year}
                  className={`manage-months-year-btn ${manageMonthsYear === year ? 'is-active' : ''}`}
                  onClick={() => setManageMonthsYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>

            {monthsByYear
              .filter((g) => g.year === manageMonthsYear)
              .map(({ year, keys }) => (
                <div key={year} className="manage-months-year-block">
                  <div className="manage-months-bulk-row">
                    <button
                      type="button"
                      className="manage-months-bulk-btn"
                      onClick={() => setAllMonthsForYear(year, true)}
                    >
                      All ON
                    </button>
                    <button
                      type="button"
                      className="manage-months-bulk-btn"
                      onClick={() => setAllMonthsForYear(year, false)}
                    >
                      All OFF
                    </button>
                  </div>
                  <div className="manage-months-list">
                    {keys.map((key) => {
                      const enabled = isMonthEnabled(key)
                      const label = drawResults[key]?.label ?? key
                      return (
                        <div key={key} className="manage-months-row">
                          <span className="manage-months-row-label">{label}</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            className={`manage-months-switch ${enabled ? 'is-on' : 'is-off'}`}
                            onClick={() => setMonthEnabled(key, !enabled)}
                            title={enabled ? 'Turn this month OFF' : 'Turn this month ON'}
                          >
                            <span className="manage-months-switch-knob" />
                            <span className="manage-months-switch-text">
                              {enabled ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
