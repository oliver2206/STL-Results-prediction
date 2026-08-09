import { useEffect, useMemo, useState } from 'react'
import drawResults from './data/drawResults.js'
import myNumbers from './data/myNumbers.js'
import './App.css'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const FAVORITES_KEY = 'stl-favorites'

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

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
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
  const monthKeys = useMemo(
    () => Object.keys(drawResults).sort((a, b) => (a < b ? 1 : -1)),
    [],
  )
  // monthKeys is sorted newest-first, so the last entry is the earliest
  // month in the dataset and the first entry is the latest.
  const earliestMonthKey = monthKeys[monthKeys.length - 1] ?? '2022-01'
  const latestMonthKey = monthKeys[0] ?? '2022-01'
  const [activeMonth, setActiveMonth] = useState(monthKeys[0])
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
  const [cycleView, setCycleView] = useState('number') // 'number' | 'grid'
  const [expandedGridCombo, setExpandedGridCombo] = useState(null) // "pairIdx-normalized" | null

  // "Every Year" tab — for a custom year range (defaults to 2024–2026),
  // finds numbers that were drawn in the SAME calendar month in every
  // single year of that range (e.g. hit in January 2024, January 2025,
  // AND January 2026 = a January "every year" number).
  const [yearlyMode, setYearlyMode] = useState(false)
  const [yearlyFromYear, setYearlyFromYear] = useState(2024)
  const [yearlyToYear, setYearlyToYear] = useState(2026)
  const [expandedYearlyCombo, setExpandedYearlyCombo] = useState(null) // "monthIdx-normalized" | null

  // Reminder = whatever you've saved under the CURRENT calendar month.
  // Updates automatically as the month changes — no "new vs seen" tracking.
  const currentMonthName = MONTH_NAMES[new Date().getMonth()]
  const currentMonthReminders = useMemo(
    () => myNumbers.filter((entry) => entry.month === currentMonthName),
    [currentMonthName],
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

  // Flat, searchable list built once: every draw across every month.
  const allDraws = useMemo(() => {
    const flat = []
    for (const key of monthKeys) {
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
  }, [monthKeys])

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
  }, [allDraws])

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
  const monthNameGroups = useMemo(() => {
    const byIdx = new Map()
    for (const key of monthKeys) {
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
  }, [monthKeys])

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
      return { year, key, label: drawResults[key].label, rows, numbersThisYear }
    })

    const yearsByNumber = new Map()
    for (const col of yearColumns) {
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
  }, [activeCompareGroup])

  // Predictions work off a single month name too — no minimum year count —
  // by tallying how many times each single number showed up in that month
  // name across every year of data available.
  const activePredictGroup =
    monthNameGroups.find((g) => g.idx === predictMonthIdx) ?? monthNameGroups[0] ?? null

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

  // Close any open saved-card month breakdown whenever the underlying data
  // it would show could change out from under it (different year, or the
  // month panel itself got collapsed/switched).
  useEffect(() => {
    setExpandedSavedCardMonth(null)
  }, [savedStatsYear, expandedSavedMonth])

  // Group saved numbers (myNumbers.js) by the calendar month you filed them
  // under, so the "My Number" tab can show a Jan–Dec box grid up top.
  const savedByMonth = useMemo(() => {
    const map = new Map(MONTH_NAMES.map((name) => [name, []]))
    for (const entry of myNumbers) {
      if (map.has(entry.month)) map.get(entry.month).push(entry)
    }
    return map
  }, [])

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
  }, [allDraws, savedStatsYear])

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
      </header>

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
              !compareMode && !predictMode && !myNumberMode && !cycleMode && !yearlyMode
                ? 'is-active'
                : ''
            }`}
            onClick={() => {
              setCompareMode(false)
              setPredictMode(false)
              setMyNumberMode(false)
              setCycleMode(false)
              setYearlyMode(false)
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
              setExpandedYearlyCombo(null)
            }}
          >
            Every Year
          </button>
        </div>
      )}

      {(currentMonthReminders.length > 0 || monthlyPatterns.length > 0) && (
        <div className="reminder-card-stack">
          {currentMonthReminders.length > 0 && (
            <div className="reminder-card">
              <span className="reminder-tag">{currentMonthName.toUpperCase()} REMINDER</span>
              <div className="reminder-chips">
                {currentMonthReminders.map((entry) => (
                  <span className="reminder-chip" key={savedEntryKey(entry)}>
                    {normalizeNumber(entry.number)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {currentMonthReminders.length > 0 && (
            <div className="reminder-card reminder-card-followup">
              <span className="reminder-tag reminder-tag-followup">
                NEXT DUE — {followUpMonthName.toUpperCase()}
              </span>
              <div className="reminder-chips">
                {currentMonthReminders.map((entry) => (
                  <span className="reminder-chip" key={`followup-${savedEntryKey(entry)}`}>
                    {normalizeNumber(entry.number)}
                  </span>
                ))}
              </div>
              <span className="reminder-followup-note">
                6 months after {currentMonthName}
              </span>
            </div>
          )}

          {monthlyPatterns.length > 0 && (
            <div className="reminder-card reminder-card-pattern">
              <span className="reminder-tag reminder-tag-pattern">CYCLE PATTERN</span>
              <div className="pattern-list">
                {monthlyPatterns.map((p) => (
                  <div className="pattern-row" key={p.normalized}>
                    <span className="reminder-chip">{p.normalized}</span>
                    <span className="pattern-detail">
                      last drawn {p.lastHitMonthName} · possible again in{' '}
                      <strong>{p.nextMonthName}</strong>, around{' '}
                      <strong>{p.predictedWeek.label}</strong> (days {p.predictedWeek.range})
                      {' '}
                      <span className="pattern-interval">
                        ({p.intervalMonths}-month cycle)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {!isSearching && !compareMode && !predictMode && !myNumberMode && (
        <nav className="month-tabs" aria-label="Select month">
          {monthKeys.map((key) => (
            <button
              key={key}
              className={`month-tab ${key === activeMonth ? 'is-active' : ''}`}
              onClick={() => setActiveMonth(key)}
            >
              {drawResults[key].label}
            </button>
          ))}
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
                  <div className="compare-column" key={col.key}>
                    <div className="compare-column-head">{col.label}</div>
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
                  <div className="saved-month-panel">
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
            </div>

            {cycleView === 'grid' ? (
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
        <code>src/data/drawResults.js</code> to add new months or update numbers · edit{' '}
        <code>src/data/myNumbers.js</code> to change your saved numbers.
      </footer>
    </div>
  )
}
