// Full offline source inventory. KB_DATA_MANIFEST remains the subset compiled into the watch build.
import { KB_DATA_MANIFEST } from './manifest.mjs'

export const KB_RESERVE_FILES = {
  food: [], health: [], emotion: [], relation: [], work: [], study: [], digital: [],
  home: ['./home-reserve.mjs'], travel: ['./travel-reserve.mjs'], consumer: ['./consumer-reserve.mjs'], law: [], science: ['./science/reserve-next.mjs'], nature: ['./nature/reserve-animals.mjs', './nature/reserve-plants.mjs'], facts: [],
  math: ['./math/reserve-next.mjs'], physics: [], chemistry: ['./chemistry/reserve-elements.mjs', './chemistry/reserve-compounds.mjs'], biology: ['./biology/reserve-next.mjs'], geography: [], history: ['./history/reserve-next.mjs'],
  politics: [], chinese: ['./chinese/reserve-next.mjs'], english: ['./english/reserve-next.mjs'], information: ['./information/reserve-next.mjs'], technology: ['./technology/reserve-next.mjs'], music: [],
  art: ['./art-reserve.mjs'], pe: ['./pe-reserve.mjs'], labor: [], practice: [],
}

export const KB_CORPUS_MANIFEST = KB_DATA_MANIFEST.map((item) => ({
  domain: item.domain,
  files: item.files.concat(KB_RESERVE_FILES[item.domain] || []),
}))

export default KB_CORPUS_MANIFEST
