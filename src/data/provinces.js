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
import drawResultsBaguio from './drawResults.baguio.js'
import drawResultsBenguet from './drawResults.benguet.js'
import drawResultsIfugao from './drawResults.ifugao.js'
import drawResultsApayao from './drawResults.apayao.js'
import drawResultsNuevaEcija from './drawResults.nuevaEcija.js'
import drawResultsAurora from './drawResults.aurora.js'
import drawResultsPangasinan from './drawResults.pangasinan.js'

import myNumbersIlocosSur from './myNumbers.ilocosSur.js'
import myNumbersIlocosNorte from './myNumbers.ilocosNorte.js'
import myNumbersLaUnion from './myNumbers.laUnion.js'
import myNumbersAbra from './myNumbers.abra.js'
import myNumbersBaguio from './myNumbers.baguio.js'
import myNumbersBenguet from './myNumbers.benguet.js'
import myNumbersIfugao from './myNumbers.ifugao.js'
import myNumbersApayao from './myNumbers.apayao.js'
import myNumbersNuevaEcija from './myNumbers.nuevaEcija.js'
import myNumbersAurora from './myNumbers.aurora.js'
import myNumbersPangasinan from './myNumbers.pangasinan.js'

// Order here is the order provinces appear in the switcher.
export const PROVINCES = [
  { id: 'ilocosSur', name: 'Ilocos Sur' },
  { id: 'ilocosNorte', name: 'Ilocos Norte' },
  { id: 'laUnion', name: 'La Union' },
  { id: 'abra', name: 'Abra' },
  { id: 'baguio', name: 'Baguio' },
  { id: 'benguet', name: 'Benguet' },
  { id: 'ifugao', name: 'Ifugao' },
  { id: 'apayao', name: 'Apayao' },
  { id: 'nuevaEcija', name: 'Nueva Ecija' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'pangasinan', name: 'Pangasinan' },
]

export const DEFAULT_PROVINCE = 'ilocosSur'

export const drawResultsByProvince = {
  ilocosSur: drawResultsIlocosSur,
  ilocosNorte: drawResultsIlocosNorte,
  laUnion: drawResultsLaUnion,
  abra: drawResultsAbra,
  baguio: drawResultsBaguio,
  benguet: drawResultsBenguet,
  ifugao: drawResultsIfugao,
  apayao: drawResultsApayao,
  nuevaEcija: drawResultsNuevaEcija,
  aurora: drawResultsAurora,
  pangasinan: drawResultsPangasinan,
}

export const myNumbersByProvince = {
  ilocosSur: myNumbersIlocosSur,
  ilocosNorte: myNumbersIlocosNorte,
  laUnion: myNumbersLaUnion,
  abra: myNumbersAbra,
  baguio: myNumbersBaguio,
  benguet: myNumbersBenguet,
  ifugao: myNumbersIfugao,
  apayao: myNumbersApayao,
  nuevaEcija: myNumbersNuevaEcija,
  aurora: myNumbersAurora,
  pangasinan: myNumbersPangasinan,
}
