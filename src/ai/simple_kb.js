import { tokenize } from './knowledge_base.js'

// 轻量检索：不建倒排表、不建词表，只用「查询 bigram 在条目里的命中」打分。
// 手表内存只有几 MB，250 多条条目建完整 TF-IDF 索引会直接闪退；
// 这里常驻的只有 250 多条 lowercase 文本，查询时现算。

const CJK_START = 0x4e00
const CJK_END = 0x9fff

const STOP_BIGRAMS = {
  什么: 1,
  为什: 1,
  怎么: 1,
  么样: 1,
  怎样: 1,
  如何: 1,
  这个: 1,
  那个: 1,
  这些: 1,
  那些: 1,
  可以: 1,
  是不: 1,
  不是: 1,
  就是: 1,
  我们: 1,
  你们: 1,
  他们: 1,
  她们: 1,
  一个: 1,
  一下: 1,
  多少: 1,
  不能: 1,
  能不: 1,
  能够: 1,
  的话: 1,
  了吗: 1,
  的呢: 1,
  有没: 1,
  没有: 1,
  是什: 1,
  么是: 1,
  因为: 1,
  所以: 1,
  但是: 1,
  如果: 1,
  现在: 1,
  时候: 1,
  觉得: 1,
}

function isCjk(code) {
  return code >= CJK_START && code <= CJK_END
}

function queryBigrams(text) {
  const out = []
  const seen = Object.create(null)
  let previous = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isCjk(text.charCodeAt(i))) {
      if (previous) {
        const bigram = previous + ch
        if (!STOP_BIGRAMS[bigram] && !seen[bigram]) {
          seen[bigram] = true
          out.push(bigram)
        }
      }
      previous = ch
    } else {
      previous = ''
    }
  }
  return out
}

function queryWords(text) {
  const out = []
  const seen = Object.create(null)
  let buffer = ''
  const flush = function () {
    if (buffer.length >= 2) {
      const word = buffer.toLowerCase()
      if (!seen[word]) {
        seen[word] = true
        out.push(word)
      }
    }
    buffer = ''
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const isWord =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122)
    if (isWord) {
      buffer += text[i]
    } else {
      flush()
    }
  }
  flush()
  return out
}

function entryText(entry) {
  const keywords = entry.keywords && entry.keywords.length ? ' ' + entry.keywords.join(' ') : ''
  return entry.question + ' ' + entry.answer + keywords
}

export class SimpleKnowledgeBase {
  constructor(entries) {
    if (!entries || typeof entries.length !== 'number' || entries.length === 0) {
      throw new Error('SimpleKnowledgeBase requires at least one entry')
    }
    const started = Date.now()
    this.entries = entries
    this.isSimple = true
    this.lowerTexts = []
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry || typeof entry.question !== 'string' || typeof entry.answer !== 'string') {
        throw new Error('Knowledge entry ' + i + ' must have question and answer')
      }
      this.lowerTexts.push(entryText(entry).toLowerCase())
    }
    this.buildMs = Date.now() - started
  }

  scoreEntry(text, index) {
    const entry = this.entries[index]
    const bigrams = queryBigrams(text)
    const words = queryWords(text)
    const totalWeight = bigrams.length * 3 + words.length * 3
    if (totalWeight === 0) {
      return 0
    }
    const question = entry.question
    const keywords = entry.keywords && entry.keywords.length ? entry.keywords.join(' ') : ''
    const answer = entry.answer
    let hit = 0
    for (let i = 0; i < bigrams.length; i++) {
      const bigram = bigrams[i]
      if (question.indexOf(bigram) >= 0) {
        hit += 3
      } else if (keywords.indexOf(bigram) >= 0) {
        hit += 2
      } else if (answer.indexOf(bigram) >= 0) {
        hit += 1
      }
    }
    const lower = this.lowerTexts[index]
    for (let i = 0; i < words.length; i++) {
      if (lower.indexOf(words[i]) >= 0) {
        hit += 3
      }
    }
    let score = hit / totalWeight
    // 原句包含关系直接当高分，覆盖“同一个问题换个问法”的情况。
    if (text.indexOf(question) >= 0 || question.indexOf(text) >= 0) {
      score = Math.max(score, 0.9)
    }
    return Math.min(score, 0.95)
  }

  query(text, topK) {
    const started = Date.now()
    const limit = topK && topK > 0 ? Math.floor(topK) : 3
    const results = []
    for (let i = 0; i < this.entries.length; i++) {
      const score = this.scoreEntry(text, i)
      if (score <= 0) {
        continue
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
      tokens: tokenize(text),
      elapsedMs: Date.now() - started,
    }
  }

  tokensForEntry(index) {
    const entry = this.entries[index]
    return entry ? tokenize(entryText(entry)) : []
  }

  getStats() {
    return {
      entries: this.entries.length,
      vocabSize: 0,
      nonZeroTerms: 0,
      buildMs: this.buildMs,
    }
  }
}
