// Gallery delete-passcode. The code itself is never stored — only a salted hash.
// PBKDF2 (Web Crypto) is used where available (https / localhost). On plain
// http (e.g. a phone opening the dev server over Wi-Fi) Web Crypto is missing,
// so a pure-JS salted SHA-256 is used instead.
const KEY = 'stl-gallery-passcode'
const LOCK_KEY = 'stl-gallery-lock'
const PBKDF2_ITERATIONS = 150000
const FALLBACK_ROUNDS = 5000
export const MIN_LEN = 4
export const MAX_LEN = 32
const MAX_TRIES = 5
const LOCK_MS = 30000

// ---- pure-JS SHA-256 (fallback only) ----
const PRIMES = []
for (let n = 2; PRIMES.length < 64; n++) {
  if (PRIMES.every((p) => n % p !== 0)) PRIMES.push(n)
}
const frac32 = (x) => Math.floor((x - Math.floor(x)) * 2 ** 32) >>> 0
const K = PRIMES.map((p) => frac32(Math.cbrt(p)))
const H0 = PRIMES.slice(0, 8).map((p) => frac32(Math.sqrt(p)))

function sha256Bytes(bytes) {
  const len = bytes.length
  const total = (((len + 9 + 63) >> 6) << 6)
  const buf = new Uint8Array(total)
  buf.set(bytes)
  buf[len] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(total - 8, Math.floor((len * 8) / 2 ** 32))
  view.setUint32(total - 4, (len * 8) >>> 0)
  const h = [...H0]
  const w = new Uint32Array(64)
  const rotr = (x, n) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  h.forEach((v, i) => ov.setUint32(i * 4, v))
  return out
}

export const _sha256ForTest = sha256Bytes

const enc = new TextEncoder()
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((x) => parseInt(x, 16)))
const hasSubtle = () => typeof crypto !== 'undefined' && !!crypto.subtle

async function derive(code, saltHex, algo) {
  if (algo === 'pbkdf2') {
    if (!hasSubtle()) throw new Error('crypto-unavailable')
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMat,
      256,
    )
    return toHex(new Uint8Array(bits))
  }
  let cur = new Uint8Array([...fromHex(saltHex), ...enc.encode(code)])
  for (let i = 0; i < FALLBACK_ROUNDS; i++) cur = sha256Bytes(cur)
  return toHex(cur)
}

function readStored() {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && parsed.hash && parsed.salt && parsed.algo ? parsed : null
  } catch {
    return null
  }
}

export const hasPasscode = () => readStored() !== null
export const isValidFormat = (code) => code.length >= MIN_LEN && code.length <= MAX_LEN

export async function setPasscode(code) {
  if (!isValidFormat(code)) throw new Error('format')
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  const algo = hasSubtle() ? 'pbkdf2' : 'sha256x'
  const hash = await derive(code, salt, algo)
  window.localStorage.setItem(KEY, JSON.stringify({ salt, hash, algo }))
  window.localStorage.removeItem(LOCK_KEY)
}

// ---- brute-force slowdown: 5 wrong tries => 30 s lock ----
function readLock() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCK_KEY) ?? 'null')
    return raw && typeof raw === 'object' ? raw : { tries: 0, until: 0 }
  } catch {
    return { tries: 0, until: 0 }
  }
}

export function lockRemainingMs() {
  return Math.max(0, readLock().until - Date.now())
}

// -> { ok: boolean, lockedMs: number, triesLeft: number }
export async function verifyPasscode(code) {
  const lock = readLock()
  const left = Math.max(0, lock.until - Date.now())
  if (left > 0) return { ok: false, lockedMs: left, triesLeft: 0 }
  const stored = readStored()
  if (!stored) return { ok: false, lockedMs: 0, triesLeft: MAX_TRIES }
  let ok = false
  try {
    ok = (await derive(code, stored.salt, stored.algo)) === stored.hash
  } catch {
    ok = false
  }
  if (ok) {
    window.localStorage.removeItem(LOCK_KEY)
    return { ok: true, lockedMs: 0, triesLeft: MAX_TRIES }
  }
  const tries = lock.tries + 1
  if (tries >= MAX_TRIES) {
    window.localStorage.setItem(LOCK_KEY, JSON.stringify({ tries: 0, until: Date.now() + LOCK_MS }))
    return { ok: false, lockedMs: LOCK_MS, triesLeft: 0 }
  }
  window.localStorage.setItem(LOCK_KEY, JSON.stringify({ tries, until: 0 }))
  return { ok: false, lockedMs: 0, triesLeft: MAX_TRIES - tries }
}
