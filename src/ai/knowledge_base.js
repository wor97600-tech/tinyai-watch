import { createFloatArray } from './matrix.js'

const CJK_START = 0x4e00
const CJK_END = 0x9fff

function isCjk(code) {
  return code >= CJK_START && code <= CJK_END
}

function isAsciiWord(code) {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 46
  )
}

export function tokenize(text) {
  const tokens = []
  if (typeof text !== 'string' || text.length === 0) {
    return tokens
  }
  let previousCjk = ''
  let asciiBuffer = ''

  function flushAscii() {
    if (asciiBuffer.length > 0) {
      tokens.push('w:' + asciiBuffer.toLowerCase())
      asciiBuffer = ''
    }
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isCjk(code)) {
      flushAscii()
      const ch = text[i]
      tokens.push('u:' + ch)
      if (previousCjk) {
        tokens.push('b:' + previousCjk + ch)
      }
      previousCjk = ch
    } else if (isAsciiWord(code)) {
      previousCjk = ''
      asciiBuffer += text[i]
    } else {
      flushAscii()
      previousCjk = ''
    }
  }
  flushAscii()
  return tokens
}

function termTypeWeight(term) {
  if (term.length > 2 && term[0] === 'u' && term[1] === ':') {
    return 0.5
  }
  return 1.0
}

function normalizeVector(vector) {
  let sum = 0
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i] * vector[i]
  }
  if (sum <= 0) {
    return
  }
  const norm = Math.sqrt(sum)
  for (let i = 0; i < vector.length; i++) {
    vector[i] = vector[i] / norm
  }
}

function documentText(entry) {
  const keywords = entry.keywords && entry.keywords.length ? ' ' + entry.keywords.join(' ') : ''
  return entry.question + ' ' + entry.answer + keywords
}

export class KnowledgeBase {
  constructor(entries) {
    if (!entries || typeof entries.length !== 'number' || entries.length === 0) {
      throw new Error('KnowledgeBase requires at least one entry')
    }
    const started = Date.now()
    this.entries = entries
    // 不长期保存每条的 token 数组：250 多条 × 约 200 个词项会在手表上吃掉 1~2MB。
    // 需要做 bigram 重合校验时用 tokensForEntry() 现算。
    const entryTokens = []
    this.documentFrequency = Object.create(null)
    this.termList = []

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry || typeof entry.question !== 'string' || typeof entry.answer !== 'string') {
        throw new Error('Knowledge entry ' + i + ' must have question and answer')
      }
      const tokens = tokenize(documentText(entry))
      entryTokens.push(tokens)
      const seen = Object.create(null)
      for (let t = 0; t < tokens.length; t++) {
        const term = tokens[t]
        if (!seen[term]) {
          seen[term] = true
          if (this.documentFrequency[term]) {
            this.documentFrequency[term]++
          } else {
            this.documentFrequency[term] = 1
            this.termList.push(term)
          }
        }
      }
    }

    this.termIndex = Object.create(null)
    for (let i = 0; i < this.termList.length; i++) {
      this.termIndex[this.termList[i]] = i
    }
    this.vocabSize = this.termList.length
    this.idf = createFloatArray(this.vocabSize)
    for (let i = 0; i < this.vocabSize; i++) {
      const df = this.documentFrequency[this.termList[i]]
      this.idf[i] = Math.log((entries.length + 1) / (df + 1)) + 1
    }
    // 这两张表只在构建期用一次，建完就释放，省下几百 KB 常驻内存。
    this.documentFrequency = null
    this.termList = null

    this.vectors = []
    this.nonZeroTerms = 0
    // 复用同一个缓冲区，避免为每条条目各分配一次大向量。
    const sharedVector = createFloatArray(this.vocabSize)
    for (let i = 0; i < entryTokens.length; i++) {
      const vector = this.buildVector(entryTokens[i], sharedVector)
      normalizeVector(vector)
      const indices = []
      const values = []
      for (let d = 0; d < vector.length; d++) {
        if (vector[d] !== 0) {
          indices.push(d)
          values.push(vector[d])
        }
      }
      this.nonZeroTerms += indices.length
      this.vectors.push({
        indices: indices,
        values: values,
      })
    }
    this.buildMs = Date.now() - started
  }

  buildVector(tokens, buffer) {
    const counts = Object.create(null)
    let weightedTotal = 0
    for (let i = 0; i < tokens.length; i++) {
      const term = tokens[i]
      const weight = termTypeWeight(term)
      counts[term] = (counts[term] || 0) + weight
      weightedTotal += weight
    }
    const vector = buffer || createFloatArray(this.vocabSize)
    if (buffer) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] = 0
      }
    }
    if (weightedTotal <= 0) {
      return vector
    }
    for (const term in counts) {
      const index = this.termIndex[term]
      if (typeof index === 'number') {
        vector[index] = (1 + Math.log(counts[term])) * this.idf[index]
      }
    }
    return vector
  }

  // 按需切词：只在需要做内容重合校验时调用，避免常驻大量 token 字符串。
  tokensForEntry(index) {
    const entry = this.entries[index]
    return entry ? tokenize(documentText(entry)) : []
  }

  query(text, topK) {
    const started = Date.now()
    const tokens = tokenize(text)
    const limit = topK && topK > 0 ? Math.floor(topK) : 3
    if (tokens.length === 0) {
      return {
        query: text,
        top: [],
        tokens: tokens,
        elapsedMs: Date.now() - started,
      }
    }
    const vector = this.buildVector(tokens, this.queryBuffer || (this.queryBuffer = createFloatArray(this.vocabSize)))
    normalizeVector(vector)
    const results = []
    for (let i = 0; i < this.vectors.length; i++) {
      const document = this.vectors[i]
      let score = 0
      for (let j = 0; j < document.indices.length; j++) {
        score += vector[document.indices[j]] * document.values[j]
      }
      const entry = this.entries[i]
      results.push({
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
        score: score,
      })
    }
    results.sort(function (a, b) {
      return b.score - a.score
    })
    const top = []
    for (let i = 0; i < Math.min(limit, results.length); i++) {
      top.push(results[i])
    }
    return {
      query: text,
      top: top,
      tokens: tokens,
      elapsedMs: Date.now() - started,
    }
  }

  getStats() {
    return {
      entries: this.entries.length,
      vocabSize: this.vocabSize,
      nonZeroTerms: this.nonZeroTerms,
      buildMs: this.buildMs,
    }
  }
}
