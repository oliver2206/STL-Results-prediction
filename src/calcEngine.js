// Pure maths for the Calculator tab — no React in here, so it's easy to test.
//
// An expression is an array of string "tokens", e.g.
//   ['12', '+', 'sin(', '30', ')', '×', '2']
//
// Token kinds:
//   number   '12', '-3.5', '1.2e5'      (anything starting with a digit, '.', or '-digit')
//   binary   + − × ÷ ^ ʸ√ logᵧ
//   postfix  ² ³ ⁻¹ ! %                 (apply to the operand just before them)
//   const    π e
//   open     '(' or a function opener like 'sin(' 'ln(' '√('
//   close    ')'
//
// Usual precedence applies: 2 + 3 × 4 = 14, just like the iPad calculator.

export const BINARY = ['+', '−', '×', '÷', '^', 'ʸ√', 'logᵧ']
export const POWER_OPS = ['^', 'ʸ√', 'logᵧ']
export const POSTFIX = ['²', '³', '⁻¹', '!', '%']
export const CONSTS = ['π', 'e']

export class CalcError extends Error {}

export function isNumTok(t) {
  return typeof t === 'string' && /^-?(\d|\.)/.test(t)
}

export function isOpener(t) {
  return typeof t === 'string' && t.endsWith('(')
}

// A token that can end an operand — you may put a postfix op or ")" after it.
export function endsOperand(t) {
  return t !== undefined && (isNumTok(t) || CONSTS.includes(t) || t === ')' || POSTFIX.includes(t))
}

// Drops dangling operators / exponent marks and closes any open brackets so a
// half-typed expression can still be previewed or recorded.
export function normalize(tokens) {
  const t = [...tokens]
  while (t.length && BINARY.includes(t[t.length - 1])) t.pop()
  if (t.length) {
    const last = t[t.length - 1]
    if (isNumTok(last) && /e[+-]?$/.test(last)) t[t.length - 1] = last.replace(/e[+-]?$/, '')
  }
  let open = 0
  for (const x of t) {
    if (isOpener(x)) open++
    else if (x === ')') open--
  }
  while (open-- > 0) t.push(')')
  return t
}

function trig(kind, x, deg) {
  if (deg) {
    // Exact answers at the "nice" angles so sin(180°) is 0, not 1.2e-16.
    if (kind === 'sin' && x % 180 === 0) return 0
    if (kind === 'cos' && (x - 90) % 180 === 0) return 0
    if (kind === 'tan') {
      if (x % 180 === 0) return 0
      if ((x - 90) % 180 === 0) throw new CalcError('tan undefined')
    }
    x = (x * Math.PI) / 180
  }
  if (kind === 'sin') return Math.sin(x)
  if (kind === 'cos') return Math.cos(x)
  return Math.tan(x)
}

function applyFn(name, x, deg) {
  const back = deg ? 180 / Math.PI : 1
  switch (name) {
    case 'sin(': return trig('sin', x, deg)
    case 'cos(': return trig('cos', x, deg)
    case 'tan(': return trig('tan', x, deg)
    case 'sin⁻¹(':
      if (Math.abs(x) > 1) throw new CalcError('domain')
      return Math.asin(x) * back
    case 'cos⁻¹(':
      if (Math.abs(x) > 1) throw new CalcError('domain')
      return Math.acos(x) * back
    case 'tan⁻¹(': return Math.atan(x) * back
    case 'sinh(': return Math.sinh(x)
    case 'cosh(': return Math.cosh(x)
    case 'tanh(': return Math.tanh(x)
    case 'sinh⁻¹(': return Math.asinh(x)
    case 'cosh⁻¹(':
      if (x < 1) throw new CalcError('domain')
      return Math.acosh(x)
    case 'tanh⁻¹(':
      if (Math.abs(x) >= 1) throw new CalcError('domain')
      return Math.atanh(x)
    case 'ln(':
      if (x <= 0) throw new CalcError('domain')
      return Math.log(x)
    case 'log₁₀(':
      if (x <= 0) throw new CalcError('domain')
      return Math.log10(x)
    case 'log₂(':
      if (x <= 0) throw new CalcError('domain')
      return Math.log2(x)
    case '√(':
      if (x < 0) throw new CalcError('domain')
      return Math.sqrt(x)
    case '∛(': return Math.cbrt(x)
    default: throw new CalcError('unknown function')
  }
}

function applyPostfix(p, v) {
  switch (p) {
    case '²': return v * v
    case '³': return v * v * v
    case '⁻¹':
      if (v === 0) throw new CalcError('div0')
      return 1 / v
    case '%': return v / 100
    case '!': {
      if (!Number.isInteger(v) || v < 0 || v > 170) throw new CalcError('factorial')
      let r = 1
      for (let n = 2; n <= v; n++) r *= n
      return r
    }
    default: throw new CalcError('unknown postfix')
  }
}

// ʸ√x : the y-th root of x (type y first, then x).
function nthRoot(y, x) {
  if (y === 0) throw new CalcError('domain')
  if (x < 0) {
    if (Number.isInteger(y) && Math.abs(y % 2) === 1) return -Math.pow(-x, 1 / y)
    throw new CalcError('domain')
  }
  return Math.pow(x, 1 / y)
}

export function evaluate(tokens, deg = true) {
  const toks = normalize(tokens)
  if (!toks.length) throw new CalcError('empty')
  let i = 0
  const peek = () => toks[i]
  const startsPrimary = (t) => t !== undefined && (isNumTok(t) || CONSTS.includes(t) || isOpener(t))

  const parseExpr = () => {
    let v = parseTerm()
    while (peek() === '+' || peek() === '−') {
      const op = toks[i++]
      const r = parseTerm()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  const parseTerm = () => {
    let v = parseUnary()
    for (;;) {
      const t = peek()
      if (t === '×') {
        i++
        v *= parseUnary()
      } else if (t === '÷') {
        i++
        const r = parseUnary()
        if (r === 0) throw new CalcError('div0')
        v /= r
      } else if (startsPrimary(t)) {
        v *= parseUnary() // implicit multiplication: 2π, 3(4+1)
      } else break
    }
    return v
  }

  const parseUnary = () => {
    const t = peek()
    if (t === '−') {
      i++
      return -parseUnary()
    }
    if (t === '+') {
      i++
      return parseUnary()
    }
    return parsePower()
  }

  const parsePower = () => {
    const base = parsePostfix()
    const t = peek()
    if (POWER_OPS.includes(t)) {
      i++
      const rhs = parseUnary() // recurses into parsePower, so ^ is right-associative
      if (t === '^') return Math.pow(base, rhs)
      if (t === 'ʸ√') return nthRoot(base, rhs)
      if (base <= 0 || base === 1 || rhs <= 0) throw new CalcError('domain')
      return Math.log(rhs) / Math.log(base) // logᵧ: base first, then value
    }
    return base
  }

  const parsePostfix = () => {
    let v = parsePrimary()
    while (POSTFIX.includes(peek())) v = applyPostfix(toks[i++], v)
    return v
  }

  const parsePrimary = () => {
    const t = toks[i++]
    if (t === undefined) throw new CalcError('syntax')
    if (isNumTok(t)) {
      const n = Number(t.replace(/e[+-]?$/, ''))
      if (Number.isNaN(n)) throw new CalcError('syntax')
      return n
    }
    if (t === 'π') return Math.PI
    if (t === 'e') return Math.E
    if (isOpener(t)) {
      const inner = parseExpr()
      if (peek() === ')') i++
      return t === '(' ? inner : applyFn(t, inner, deg)
    }
    throw new CalcError('syntax')
  }

  const result = parseExpr()
  if (i !== toks.length) throw new CalcError('syntax')
  if (!Number.isFinite(result)) throw new CalcError('overflow')
  return result
}

// Number -> string token. 12 significant digits keeps 0.1 + 0.2 at 0.3, and
// very big / very small values switch to e-notation.
export function fmtResult(n) {
  if (!Number.isFinite(n)) return 'Error'
  if (n === 0) return '0'
  const s = parseFloat(n.toPrecision(12))
  const abs = Math.abs(s)
  if (abs >= 1e15 || abs < 1e-9) return s.toExponential().replace('e+', 'e')
  return String(s)
}

// Adds thousands separators to a number token for display only.
export function fmtTok(t) {
  if (!isNumTok(t)) return t
  const m = t.match(/^(-?)(\d*)(\.\d*)?(e[+-]?\d*)?$/)
  if (!m) return t
  const [, sign, int, dec = '', exp = ''] = m
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign ? '−' : ''}${grouped}${dec}${exp}`
}

// Tokens -> the text shown on the display / in history.
export function toText(tokens) {
  let out = ''
  tokens.forEach((t, idx) => {
    if (BINARY.includes(t)) {
      const prev = tokens[idx - 1]
      const unary = prev === undefined || isOpener(prev) || BINARY.includes(prev)
      out += unary ? t : ` ${t} `
    } else {
      out += fmtTok(t)
    }
  })
  return out.replace(/ {2,}/g, ' ').trim()
}
