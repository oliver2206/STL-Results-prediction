import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BINARY,
  CalcError,
  endsOperand,
  evaluate,
  fmtResult,
  fmtTok,
  isNumTok,
  isOpener,
  normalize,
  toText,
} from './calcEngine.js'
import './Calculator.css'

// Calculator 1 keeps the original key so its saved history carries over.
const historyKeyFor = (id) => (id === 1 ? 'stl-calc-history' : `stl-calc-history-${id}`)
const HISTORY_LIMIT = 100
const MAX_DIGITS = 15

function loadHistory(key) {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((h) => h && Array.isArray(h.tokens)) : []
  } catch {
    return []
  }
}

const INITIAL = { tokens: [], justEval: false, error: false, lastEq: null }

// ---- Key layout (mirrors the iPad scientific calculator) -------------------
// kind: 'sci' dark keys · 'fn' light-grey keys · 'digit' · 'op' orange · 'eq'
// `sec` is what the key turns into while "2nd" is on.
const sup = (c) => <sup>{c}</sup>
const sub = (c) => <sub>{c}</sub>

const SCI_KEYS = [
  { id: '(', label: '(' },
  { id: ')', label: ')' },
  { id: 'mc', label: 'mc' },
  { id: 'm+', label: 'm+' },
  { id: 'm-', label: 'm−' },
  { id: 'mr', label: 'mr' },

  { id: '2nd', label: '2nd', toggle: 'second' },
  { id: 'sq', label: <>x{sup(2)}</>, aria: 'x squared' },
  { id: 'cube', label: <>x{sup(3)}</>, aria: 'x cubed' },
  { id: 'pow', label: <>x{sup('y')}</>, aria: 'x to the power y' },
  {
    id: 'epow', label: <>e{sup('x')}</>, aria: 'e to the power x',
    sec: { id: 'ypow', label: <>y{sup('x')}</>, aria: 'y to the power x' },
  },
  {
    id: '10pow', label: <>10{sup('x')}</>, aria: '10 to the power x',
    sec: { id: '2pow', label: <>2{sup('x')}</>, aria: '2 to the power x' },
  },

  { id: 'inv', label: <>1/x</>, aria: 'one over x' },
  { id: 'sqrt', label: <>{sup(2)}√x</>, aria: 'square root' },
  { id: 'cbrt', label: <>{sup(3)}√x</>, aria: 'cube root' },
  { id: 'yroot', label: <>{sup('y')}√x</>, aria: 'y-th root of x' },
  {
    id: 'ln', label: 'ln', aria: 'natural log',
    sec: { id: 'logy', label: <>log{sub('y')}</>, aria: 'log base y' },
  },
  {
    id: 'log10', label: <>log{sub('10')}</>, aria: 'log base 10',
    sec: { id: 'log2', label: <>log{sub('2')}</>, aria: 'log base 2' },
  },

  { id: 'fact', label: 'x!', aria: 'factorial' },
  {
    id: 'sin', label: 'sin',
    sec: { id: 'asin', label: <>sin{sup('−1')}</>, aria: 'inverse sine' },
  },
  {
    id: 'cos', label: 'cos',
    sec: { id: 'acos', label: <>cos{sup('−1')}</>, aria: 'inverse cosine' },
  },
  {
    id: 'tan', label: 'tan',
    sec: { id: 'atan', label: <>tan{sup('−1')}</>, aria: 'inverse tangent' },
  },
  { id: 'e', label: 'e', aria: 'Euler number' },
  { id: 'EE', label: 'EE', aria: 'times ten to the power' },

  { id: 'angle', label: 'Rad', toggle: 'angle' },
  {
    id: 'sinh', label: 'sinh',
    sec: { id: 'asinh', label: <>sinh{sup('−1')}</>, aria: 'inverse hyperbolic sine' },
  },
  {
    id: 'cosh', label: 'cosh',
    sec: { id: 'acosh', label: <>cosh{sup('−1')}</>, aria: 'inverse hyperbolic cosine' },
  },
  {
    id: 'tanh', label: 'tanh',
    sec: { id: 'atanh', label: <>tanh{sup('−1')}</>, aria: 'inverse hyperbolic tangent' },
  },
  { id: 'pi', label: 'π', aria: 'pi' },
  { id: 'rand', label: 'Rand', aria: 'random number' },
]

const BASIC_KEYS = [
  { id: 'AC', label: 'AC', kind: 'fn', aria: 'All clear' },
  { id: 'pm', label: '+/−', kind: 'fn', aria: 'Plus minus' },
  { id: 'pct', label: '%', kind: 'fn', aria: 'Percent' },
  { id: '÷', label: '÷', kind: 'op', aria: 'Divide' },

  { id: '7', label: '7', kind: 'digit' },
  { id: '8', label: '8', kind: 'digit' },
  { id: '9', label: '9', kind: 'digit' },
  { id: '×', label: '×', kind: 'op', aria: 'Multiply' },

  { id: '4', label: '4', kind: 'digit' },
  { id: '5', label: '5', kind: 'digit' },
  { id: '6', label: '6', kind: 'digit' },
  { id: '−', label: '−', kind: 'op', aria: 'Subtract' },

  { id: '1', label: '1', kind: 'digit' },
  { id: '2', label: '2', kind: 'digit' },
  { id: '3', label: '3', kind: 'digit' },
  { id: '+', label: '+', kind: 'op', aria: 'Add' },

  { id: '0', label: '0', kind: 'digit', wide: true },
  { id: '.', label: '.', kind: 'digit', aria: 'Decimal point' },
  { id: '=', label: '=', kind: 'op', aria: 'Equals' },
]

// Which binary token each op key puts into the expression.
const OP_TOKEN = { '+': '+', '−': '−', '×': '×', '÷': '÷', pow: '^', ypow: '^', yroot: 'ʸ√', logy: 'logᵧ' }
const POSTFIX_TOKEN = { sq: '²', cube: '³', inv: '⁻¹', fact: '!', pct: '%' }
const FN_TOKEN = {
  sqrt: '√(', cbrt: '∛(', ln: 'ln(', log10: 'log₁₀(', log2: 'log₂(',
  sin: 'sin(', cos: 'cos(', tan: 'tan(',
  asin: 'sin⁻¹(', acos: 'cos⁻¹(', atan: 'tan⁻¹(',
  sinh: 'sinh(', cosh: 'cosh(', tanh: 'tanh(',
  asinh: 'sinh⁻¹(', acosh: 'cosh⁻¹(', atanh: 'tanh⁻¹(',
}
const BASE_POW = { epow: 'e', '10pow': '10', '2pow': '2' }

// Physical-keyboard shortcuts (desktop).
const KEYMAP = {
  '+': '+', '-': '−', '*': '×', '/': '÷', Enter: '=', '=': '=', Backspace: 'back',
  Escape: 'AC', Delete: 'AC', '(': '(', ')': ')', '.': '.', ',': '.', '%': 'pct',
  '^': 'pow', '!': 'fact',
}

function timeLabel(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// `id` keeps each calculator's history separate; `active` is false while its
// tab is hidden so only the visible calculator reacts to the keyboard.
export default function Calculator({ id = 1, active = true }) {
  const historyKey = historyKeyFor(id)
  const [calc, setCalc] = useState(INITIAL)
  const [deg, setDeg] = useState(true)
  const [second, setSecond] = useState(false)
  const [memory, setMemory] = useState(0)
  const [sciOpen, setSciOpen] = useState(false) // narrow screens only
  const [history, setHistory] = useState(() => loadHistory(historyKey))

  useEffect(() => {
    try {
      window.localStorage.setItem(historyKey, JSON.stringify(history))
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [history, historyKey])

  const { tokens, justEval, error, lastEq } = calc
  const base = () => (error ? [] : [...tokens]) // tokens to build on (an error resets)
  const fresh = () => (error || justEval ? [] : [...tokens]) // …or start over after "="

  const put = (next, extra = {}) =>
    setCalc({ tokens: next, justEval: false, error: false, lastEq: lastEq, ...extra })

  // Evaluate `exprTokens`, record it in history, and show the result.
  function commit(exprTokens) {
    let value
    try {
      value = evaluate(exprTokens, deg)
    } catch (e) {
      if (!(e instanceof CalcError)) throw e
      setCalc({ tokens: [], justEval: false, error: true, lastEq: null })
      return
    }
    const result = fmtResult(value)
    const closed = normalize(exprTokens)
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tokens: closed, result, ts: Date.now() }
    setHistory((h) => [entry, ...h].slice(0, HISTORY_LIMIT))
    setCalc({ tokens: [result], justEval: true, error: false, lastEq: `${toText(closed)} =` })
  }

  const isSingleNumber = (t) => t.length === 1 && isNumTok(t[0])

  function pressDigit(d) {
    const t = fresh()
    const last = t[t.length - 1]
    if (isNumTok(last)) {
      const bare = last.replace(/^-/, '')
      const sign = last.startsWith('-') ? '-' : ''
      if (bare === '0') t[t.length - 1] = sign + d
      else if (last.replace(/\D/g, '').length < MAX_DIGITS) t[t.length - 1] = last + d
    } else {
      t.push(d)
    }
    put(t)
  }

  function pressDot() {
    const t = fresh()
    const last = t[t.length - 1]
    if (isNumTok(last)) {
      if (/[.e]/.test(last)) return
      t[t.length - 1] = last + '.'
    } else {
      t.push('0.')
    }
    put(t)
  }

  function pressEE() {
    const t = error ? [] : [...tokens] // works on a result too: 5 → 5e
    const last = t[t.length - 1]
    if (isNumTok(last)) {
      if (last.includes('e')) return
      t[t.length - 1] = last + 'e'
    } else {
      t.push('1e')
    }
    put(t)
  }

  function pressOp(op) {
    let t = base()
    const last = t[t.length - 1]
    if (t.length === 0) {
      t = ['0', op]
    } else if (BINARY.includes(last)) {
      t[t.length - 1] = op
    } else if (isOpener(last)) {
      if (op !== '−') return
      t.push(op) // allow a leading minus inside brackets
    } else {
      t.push(op)
    }
    put(t)
  }

  function pressPostfix(p) {
    const t = base()
    const last = t[t.length - 1]
    if (!endsOperand(last)) return
    const next = [...t, p]
    if (isSingleNumber(t)) commit(next) // 5 then x² → 25 straight away
    else put(next)
  }

  function pressFn(name) {
    const t = base()
    const last = t[t.length - 1]
    if (isNumTok(last)) {
      const next = [...t.slice(0, -1), name, last, ')']
      if (isSingleNumber(t)) commit(next) // 30 then sin → 0.5 straight away
      else put(next)
    } else if (error || justEval || !endsOperand(last)) {
      put([...(justEval ? [] : t), name])
    } else {
      put([...t, name]) // after ")" etc. — implicit multiplication
    }
  }

  function pressBasePow(baseTok) {
    const t = base()
    const last = t[t.length - 1]
    if (isNumTok(last)) {
      const next = [...t.slice(0, -1), baseTok, '^', last]
      if (isSingleNumber(t)) commit(next)
      else put(next)
    } else {
      put([...fresh(), baseTok, '^'])
    }
  }

  function pressConst(c) {
    put([...fresh(), c])
  }

  function pressOpen() {
    put([...fresh(), '('])
  }

  function pressClose() {
    const t = base()
    let open = 0
    for (const x of t) {
      if (isOpener(x)) open++
      else if (x === ')') open--
    }
    if (open > 0 && endsOperand(t[t.length - 1])) put([...t, ')'])
  }

  function pressPlusMinus() {
    const t = base()
    const last = t[t.length - 1]
    if (isNumTok(last)) {
      t[t.length - 1] = last.startsWith('-') ? last.slice(1) : `-${last}`
      put(t, { justEval })
    } else if (t.length === 0 || BINARY.includes(last) || isOpener(last)) {
      put([...t, '-0'])
    }
  }

  function pressBack() {
    if (error || justEval) {
      setCalc(INITIAL)
      return
    }
    const t = [...tokens]
    const last = t.pop()
    if (isNumTok(last)) {
      const shorter = last.slice(0, -1)
      if (shorter !== '' && shorter !== '-') t.push(shorter)
    }
    put(t)
  }

  function pressEquals() {
    if (error || justEval || tokens.length === 0 || isSingleNumber(tokens)) return
    commit(tokens)
  }

  // Value of whatever is currently on the display (for the memory keys).
  function currentValue() {
    if (error || tokens.length === 0) return 0
    try {
      return evaluate(tokens, deg)
    } catch {
      return null
    }
  }

  function memoryAdd(sign) {
    const v = currentValue()
    if (v === null) return
    setMemory((m) => m + sign * v)
    if (isSingleNumber(tokens)) setCalc({ ...calc, justEval: true })
  }

  function pressMemoryRecall() {
    const tok = fmtResult(memory)
    const t = fresh()
    if (isNumTok(t[t.length - 1])) t[t.length - 1] = tok
    else t.push(tok)
    put(t)
  }

  function insertValue(result) {
    const t = fresh()
    if (isNumTok(t[t.length - 1])) t[t.length - 1] = result
    else t.push(result)
    put(t)
  }

  function act(id) {
    if (/^\d$/.test(id)) return pressDigit(id)
    if (id in OP_TOKEN) return pressOp(OP_TOKEN[id])
    if (id in POSTFIX_TOKEN) return pressPostfix(POSTFIX_TOKEN[id])
    if (id in FN_TOKEN) return pressFn(FN_TOKEN[id])
    if (id in BASE_POW) return pressBasePow(BASE_POW[id])
    switch (id) {
      case '.': return pressDot()
      case 'EE': return pressEE()
      case '=': return pressEquals()
      case 'AC': return setCalc(INITIAL)
      case 'back': return pressBack()
      case 'pm': return pressPlusMinus()
      case '(': return pressOpen()
      case ')': return pressClose()
      case 'pi': return pressConst('π')
      case 'e': return pressConst('e')
      case 'rand': return insertValue(fmtResult(Number(Math.random().toFixed(9)) || 0.5))
      case 'mc': return setMemory(0)
      case 'm+': return memoryAdd(1)
      case 'm-': return memoryAdd(-1)
      case 'mr': return pressMemoryRecall()
      case '2nd': return setSecond((s) => !s)
      case 'angle': return setDeg((d) => !d)
      default: return undefined
    }
  }

  // The keyboard listener lives for the life of the tab, so route through a ref
  // to always call the latest handlers.
  const actRef = useRef(act)
  actRef.current = act
  useEffect(() => {
    if (!active) return undefined
    function onKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      const tag = el && el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return
      const id = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key]
      if (!id) return
      e.preventDefault()
      actRef.current(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])

  // ---- Display -------------------------------------------------------------
  const preview = useMemo(() => {
    if (justEval || error || tokens.length === 0 || isSingleNumber(tokens)) return null
    try {
      return fmtTok(fmtResult(evaluate(tokens, deg)))
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, justEval, error, deg])

  const mainText = error ? 'Error' : tokens.length ? toText(tokens) : '0'
  const subText = justEval ? lastEq : preview ? `= ${preview}` : ''
  const size = mainText.length > 22 ? 'xs' : mainText.length > 14 ? 'sm' : mainText.length > 9 ? 'md' : 'lg'

  const last = tokens[tokens.length - 1]
  const pendingOp = !justEval && !error && BINARY.includes(last) ? last : null

  function renderKey(k, group) {
    const active = second && k.sec ? k.sec : k
    const kind = k.kind ?? 'sci'
    let label = active.label
    if (k.toggle === 'angle') label = deg ? 'Rad' : 'Deg'
    const isOn = k.toggle === 'second' ? second : false
    const isPending = group === 'basic' && kind === 'op' && OP_TOKEN[k.id] && OP_TOKEN[k.id] === pendingOp
    const aria = k.toggle === 'angle' ? `Switch to ${deg ? 'radians' : 'degrees'}` : active.aria
    return (
      <button
        key={k.id}
        type="button"
        className={`calc-key is-${kind} ${k.wide ? 'is-wide' : ''} ${isOn ? 'is-on' : ''} ${isPending ? 'is-pending' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => act(active.id)}
        aria-label={aria}
        aria-pressed={k.toggle === 'second' ? second : undefined}
      >
        <span>{label}</span>
      </button>
    )
  }

  return (
    <section className="calc-wrap" aria-label="Scientific calculator">
      <div className="calc-card">
        <div className="calc-screen">
          <div className="calc-flags">
            <span className="calc-flag">{deg ? 'DEG' : 'RAD'}</span>
            {memory !== 0 && <span className="calc-flag is-mem">M</span>}
            <span className="calc-flags-spacer" />
            <button
              type="button"
              className={`calc-mini calc-sci-toggle ${sciOpen ? 'is-on' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSciOpen((o) => !o)}
              aria-pressed={sciOpen}
            >
              Scientific
            </button>
            <button
              type="button"
              className="calc-mini"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => act('back')}
              aria-label="Delete last entry"
            >
              ⌫
            </button>
          </div>
          <div className="calc-sub">{subText || '\u00A0'}</div>
          <div className={`calc-line size-${size}`} role="status" aria-live="polite">
            <span>{mainText}</span>
          </div>
        </div>

        <div className={`calc-pads ${sciOpen ? 'sci-open' : ''}`}>
          <div className="calc-sci">{SCI_KEYS.map((k) => renderKey(k, 'sci'))}</div>
          <div className="calc-basic">{BASIC_KEYS.map((k) => renderKey(k, 'basic'))}</div>
        </div>
      </div>

      <aside className="calc-history" aria-label="Calculation history">
        <div className="calc-history-head">
          <h3 className="calc-history-title">History</h3>
          {history.length > 0 && (
            <button type="button" className="calc-history-clear" onClick={() => setHistory([])}>
              Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="calc-history-empty">
            No calculations yet — every time you press <strong>=</strong> it is recorded here.
          </p>
        ) : (
          <ul className="calc-history-list">
            {history.map((h) => (
              <li className="calc-history-item" key={h.id}>
                <button
                  type="button"
                  className="calc-history-expr"
                  onClick={() => put([...h.tokens], { lastEq })}
                  title="Load this expression back into the calculator"
                >
                  {toText(h.tokens)} =
                </button>
                <div className="calc-history-row">
                  <button
                    type="button"
                    className="calc-history-result"
                    onClick={() => insertValue(h.result)}
                    title="Use this result"
                  >
                    {fmtTok(h.result)}
                  </button>
                  <span className="calc-history-time">{timeLabel(h.ts)}</span>
                  <button
                    type="button"
                    className="calc-history-del"
                    onClick={() => setHistory((all) => all.filter((x) => x.id !== h.id))}
                    aria-label="Remove this entry"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="calc-history-hint">
          Tap a result to use it, or an expression to edit it. Keyboard works too — digits,
          + − * / ( ), Enter, Backspace, Esc.
        </p>
      </aside>
    </section>
  )
}
