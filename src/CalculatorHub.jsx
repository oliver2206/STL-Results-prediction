import { useState } from 'react'
import Calculator from './Calculator.jsx'

// Four independent iPad-style calculators. All stay mounted (just hidden) so
// each keeps its own display, memory and history while you switch between them.
const CALCULATORS = [1, 2, 3, 4]

export default function CalculatorHub() {
  const [current, setCurrent] = useState(1)

  return (
    <div className="calc-hub">
      <div className="calc-hub-tabs" role="tablist" aria-label="Choose a calculator">
        {CALCULATORS.map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={current === n}
            className={`calc-hub-tab ${current === n ? 'is-active' : ''}`}
            onClick={() => setCurrent(n)}
          >
            Calculator {n}
          </button>
        ))}
      </div>

      {CALCULATORS.map((n) => (
        <div key={n} hidden={current !== n}>
          <Calculator id={n} active={current === n} />
        </div>
      ))}
    </div>
  )
}
