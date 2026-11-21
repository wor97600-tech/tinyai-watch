// 离线拼音候选引擎（精简版）。
// 词库在构建期被压成 pinyin_index.js：约 23KB 纯文本，
// 运行时只做一次 split 解析，不再在手表上拆 80KB 大表 + 排序 6000 个键，
// 避免第一次按键时卡住甚至被系统杀掉。
import { charIndex, wordIndex } from '../assets/pinyin_index.js'

export const MAX_PINYIN_LENGTH = 24

const MAX_CACHE = 48
const DEFAULT_LIMIT = 3
const SYLLABLE_MAX = 6
const WORD_MAX = 16

let charMap = null
let wordMap = null
let wordKeys = []
let charKeys = []
let cache = {}
let cacheOrder = []

function parseText(text, splitChars) {
  const map = {}
  if (!text) {
    return map
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      continue
    }
    const tab = line.indexOf('\t')
    if (tab <= 0) {
      continue
    }
    const pinyin = line.slice(0, tab)
    const raw = line.slice(tab + 1)
    if (!pinyin || !raw) {
      continue
    }
    map[pinyin] = splitChars ? raw.split('') : [raw]
  }
  return map
}

// 不用 localeCompare：部分手表 JS 引擎上没有实现，排序会直接抛异常。
function compareKey(a, b) {
  if (a.length !== b.length) {
    return a.length - b.length
  }
  return a < b ? -1 : a > b ? 1 : 0
}

function ensureIndexes() {
  if (charMap && wordMap) {
    return
  }
  charMap = parseText(charIndex, true)
  wordMap = parseText(wordIndex, false)
  charKeys = Object.keys(charMap).sort(compareKey)
  wordKeys = Object.keys(wordMap).sort(compareKey)
}

export function normalizePinyin(value) {
  const text = String(value || '')
    .toLowerCase()
    .replace(/ü/g, 'v')
    .replace(/[^a-z]/g, '')
  return text.slice(0, MAX_PINYIN_LENGTH)
}

function addCandidate(out, value, limit) {
  if (!value || out.length >= limit || out.indexOf(value) !== -1) {
    return
  }
  out.push(value)
}

// 整串切分：优先整词，其次单字。
function findBest(pinyin, start, memo) {
  if (start >= pinyin.length) {
    return []
  }
  if (memo[start] !== undefined) {
    return memo[start]
  }
  const max = Math.min(WORD_MAX, pinyin.length - start)
  for (let size = max; size >= 2; size--) {
    const part = pinyin.slice(start, start + size)
    const values = wordMap[part]
    if (values && values.length > 0) {
      const tail = findBest(pinyin, start + size, memo)
      if (tail) {
        memo[start] = [values[0]].concat(tail)
        return memo[start]
      }
    }
  }
  const maxSyllable = Math.min(SYLLABLE_MAX, pinyin.length - start)
  for (let size = maxSyllable; size >= 1; size--) {
    const part = pinyin.slice(start, start + size)
    const chars = charMap[part]
    if (chars && chars.length > 0) {
      const tail = findBest(pinyin, start + size, memo)
      if (tail) {
        memo[start] = [chars[0]].concat(tail)
        return memo[start]
      }
    }
  }
  memo[start] = null
  return null
}

function composeText(pinyin) {
  const parts = findBest(pinyin, 0, {})
  if (!parts || parts.length === 0) {
    return ''
  }
  return parts.join('')
}

function addWordPrefixes(out, pinyin, limit) {
  for (let i = 0; i < wordKeys.length && out.length < limit; i++) {
    const key = wordKeys[i]
    if (key.length <= pinyin.length || key.indexOf(pinyin) !== 0) {
      continue
    }
    const values = wordMap[key]
    for (let j = 0; j < values.length && out.length < limit; j++) {
      addCandidate(out, values[j], limit)
    }
  }
}

function addCharPrefixes(out, pinyin, limit) {
  for (let i = 0; i < charKeys.length && out.length < limit; i++) {
    const key = charKeys[i]
    if (key.length <= pinyin.length || key.indexOf(pinyin) !== 0) {
      continue
    }
    const values = charMap[key]
    for (let j = 0; j < values.length && out.length < limit; j++) {
      addCandidate(out, values[j], limit)
    }
  }
}

function remember(key, value) {
  if (!cache[key]) {
    cacheOrder.push(key)
    if (cacheOrder.length > MAX_CACHE) {
      const old = cacheOrder.shift()
      delete cache[old]
    }
  }
  cache[key] = value
  return value
}

export function getCandidates(value, limit) {
  const pinyin = normalizePinyin(value)
  if (!pinyin) {
    return []
  }
  ensureIndexes()
  const max = Math.max(1, Math.min(limit || DEFAULT_LIMIT, 12))
  const cacheKey = pinyin + ':' + max
  if (cache[cacheKey]) {
    return cache[cacheKey]
  }

  const out = []
  const exactWords = wordMap[pinyin]
  if (exactWords) {
    for (let i = 0; i < exactWords.length; i++) {
      addCandidate(out, exactWords[i], max)
    }
  }

  const composed = composeText(pinyin)
  if (composed && composed !== pinyin) {
    addCandidate(out, composed, max)
  }

  const exactChars = charMap[pinyin]
  if (exactChars) {
    for (let i = 0; i < exactChars.length; i++) {
      addCandidate(out, exactChars[i], max)
    }
  }

  if (out.length < max && (out.length === 0 || pinyin.length >= 4)) {
    addWordPrefixes(out, pinyin, max)
  }
  if (out.length < max) {
    addCharPrefixes(out, pinyin, max)
  }

  if (out.length === 0) {
    addCandidate(out, pinyin, max)
  }
  return remember(cacheKey, out)
}
