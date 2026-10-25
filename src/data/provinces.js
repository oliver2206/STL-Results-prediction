// Central province registry. Each province has its own draw-results file
// and its own "My Number" saved-numbers file, so switching provinces in the
// app swaps the whole dataset — results, predictions, cycles, everything.
//
// TO ADD ANOTHER PROVINCE LATER:
//   1. Create data/drawResults.<id>.js and data/myNumbers.<id>.js (copy the
//      shape from an existing pair, e.g. drawResults.abra.js).
//   2. Import them below and add one line to PROVINCES, drawResultsByProvince,
//      and myNumbersByProvince.

import drawResultsIlocosSur from './drawResults.ilocosSur.js'
import drawResultsIlocosNorte from './drawResults.ilocosNorte.js'
import drawResultsLaUnion from './drawResults.laUnion.js'
import drawResultsAbra from './drawResults.abra.js'

import myNumbersIlocosSur from './myNumbers.ilocosSur.js'
import myNumbersIlocosNorte from './myNumbers.ilocosNorte.js'
import myNumbersLaUnion from './myNumbers.laUnion.js'
import myNumbersAbra from './myNumbers.abra.js'

// Order here is the order provinces appear in the switcher.
export const PROVINCES = [
  { id: 'ilocosSur', name: 'Ilocos Sur' },
  { id: 'ilocosNorte', name: 'Ilocos Norte' },
  { id: 'laUnion', name: 'La Union' },
  { id: 'abra', name: 'Abra' },
]

export const DEFAULT_PROVINCE = 'ilocosSur'

export const drawResultsByProvince = {
  ilocosSur: drawResultsIlocosSur,
  ilocosNorte: drawResultsIlocosNorte,
  laUnion: drawResultsLaUnion,
  abra: drawResultsAbra,
}

export const myNumbersByProvince = {
  ilocosSur: myNumbersIlocosSur,
  ilocosNorte: myNumbersIlocosNorte,
  laUnion: myNumbersLaUnion,
  abra: myNumbersAbra,
}
