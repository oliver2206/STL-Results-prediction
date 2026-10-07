import { useEffect, useRef, useState } from 'react'
import {
  MAX_LEN,
  MIN_LEN,
  isValidFormat,
  lockRemainingMs,
  setPasscode,
  verifyPasscode,
} from './passcode.js'

// mode: 'setup'  -> choose a new passcode (enter twice)
//       'verify' -> enter the passcode to continue (e.g. before deleting)
//       'change' -> enter current passcode, then choose a new one
export default function PasscodeDialog({ mode, title, message, confirmLabel, danger, onSuccess, onCancel }) {
  const [current, setCurrent] = useState('')
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockedMs, setLockedMs] = useState(() => lockRemainingMs())
  const firstRef = useRef(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  // count the lock-out down
  useEffect(() => {
    if (lockedMs <= 0) return undefined
    const t = setTimeout(() => setLockedMs(lockRemainingMs()), 500)
    return () => clearTimeout(t)
  }, [lockedMs])

  const digits = (setter) => (e) => setter(e.target.value.slice(0, MAX_LEN))
  const locked = lockedMs > 0

  async function checkCurrent(value) {
    const res = await verifyPasscode(value)
    if (res.ok) return true
    if (res.lockedMs > 0) {
      setLockedMs(res.lockedMs)
      setError('Too many wrong tries. Please wait a moment.')
    } else {
      setError(`Wrong passcode. ${res.triesLeft} ${res.triesLeft === 1 ? 'try' : 'tries'} left.`)
    }
    return false
  }

  async function submit(ev) {
    ev.preventDefault()
    if (busy || locked) return
    setError('')
    setBusy(true)
    try {
      if (mode === 'verify') {
        if (await checkCurrent(code)) onSuccess()
        else setCode('')
        return
      }
      if (mode === 'change' && !(await checkCurrent(current))) {
        setCurrent('')
        return
      }
      if (!isValidFormat(code)) {
        setError(`Use ${MIN_LEN}–${MAX_LEN} characters.`)
        return
      }
      if (code !== again) {
        setError('The two passcodes do not match.')
        return
      }
      await setPasscode(code)
      onSuccess()
    } catch {
      setError('Could not save the passcode — storage may be blocked.')
    } finally {
      setBusy(false)
    }
  }

  const field = (label, value, setter, ref) => (
    <label className="pc-field">
      <span>{label}</span>
      <input
        ref={ref}
        type="password"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        maxLength={MAX_LEN}
        value={value}
        onChange={digits(setter)}
        disabled={locked}
      />
    </label>
  )

  return (
    <div className="pc-backdrop" onClick={onCancel}>
      <form
        className="pc-box"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
        onSubmit={submit}
      >
        <h3 className="pc-title">🔒 {title}</h3>
        {message && <p className="pc-msg">{message}</p>}

        {mode === 'verify' && field('Passcode', code, setCode, firstRef)}
        {mode === 'change' && field('Current passcode', current, setCurrent, firstRef)}
        {mode === 'setup' && field(`New passcode (${MIN_LEN}–${MAX_LEN} characters)`, code, setCode, firstRef)}
        {mode === 'change' && field(`New passcode (${MIN_LEN}–${MAX_LEN} characters)`, code, setCode)}
        {mode !== 'verify' && field('Type it again', again, setAgain)}

        {locked && <p className="pc-error">Locked for {Math.ceil(lockedMs / 1000)} s…</p>}
        {error && !locked && <p className="pc-error">{error}</p>}
        {mode === 'setup' && (
          <p className="pc-warn">
            Remember this passcode — there is no way to recover it. Without it, nothing in the gallery can be deleted.
          </p>
        )}

        <div className="pc-actions">
          <button type="button" className="pc-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={`pc-btn is-main ${danger ? 'is-danger' : ''}`}
            disabled={busy || locked}
          >
            {busy ? 'Checking…' : confirmLabel ?? (mode === 'verify' ? 'Unlock' : 'Save passcode')}
          </button>
        </div>
      </form>
    </div>
  )
}
