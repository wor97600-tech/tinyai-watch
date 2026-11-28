import { tokenize } from './tokenizer.js'

// 手表运行时检索器：只读取紧凑 payload，不保留 1500 个条目对象。
// 常驻数据是两段字符串 + 偏移/倒排 TypedArray，查询只扫描关键词命中的候选。

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

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
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

function rawBigrams(text) {
  const value = normalizeText(text)
  const out = []
  const seen = Object.create(null)
  for (let i = 0; i + 1 < value.length; i++) {
    if (!isCjk(value.charCodeAt(i)) || !isCjk(value.charCodeAt(i + 1))) {
      continue
    }
    const pair = value.substr(i, 2)
    if (!seen[pair]) {
      seen[pair] = true
      out.push(pair)
    }
  }
  return out
}

function pairSimilarity(left, right) {
  if (left.length === 0 || right.length === 0) {
    return 0
  }
  const rightSeen = Object.create(null)
  for (let i = 0; i < right.length; i++) {
    rightSeen[right[i]] = true
  }
  let common = 0
  for (let i = 0; i < left.length; i++) {
    if (rightSeen[left[i]]) {
      common++
    }
  }
  return common / (left.length + right.length - common)
}

function queryCore(text) {
  let value = normalizeText(text)
  value = value.replace(/^(请问|请|麻烦|我想知道|想知道|什么是|什么叫|啥是)/, '')
  value = value.replace(/(是什么意思|是啥意思|啥意思|是什么|是啥|什么意思|怎么办|怎么|如何|为什么|为啥|多少|多大|多快|多高|多重|多远|多久|吗|呢|啊|呀)$/, '')
  return value
}

function isQuestionTail(text) {
  return /^(是什么意思|是啥意思|啥意思|是什么|是啥|什么意思|怎么办|怎么|如何|为什么|为啥|多少|多大|多快|多高|多重|多远|多久|吗|呢|啊|呀)+$/.test(
    text
  )
}

function entryText(entry) {
  const keywords = entry.keywords && entry.keywords.length ? ' ' + entry.keywords.join(' ') : ''
  return entry.question + ' ' + entry.answer + keywords
}

function hashString(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

function hashTableSize(count) {
  let size = 8
  while (size < count * 2) {
    size = size << 1
  }
  return size
}

function buildHashTable(count, stringAt) {
  const size = hashTableSize(count)
  const buckets = new Uint16Array(size)
  const next = new Uint16Array(count)
  for (let i = 0; i < count; i++) {
    const slot = hashString(stringAt(i)) & (size - 1)
    next[i] = buckets[slot]
    buckets[slot] = i + 1
  }
  return { buckets: buckets, next: next, mask: size - 1 }
}

function lookupHashTable(table, stringAt, value) {
  if (!value) {
    return -1
  }
  let index = table.buckets[hashString(value) & table.mask] - 1
  while (index >= 0) {
    if (normalizeText(stringAt(index)) === value) {
      return index
    }
    index = table.next[index] - 1
  }
  return -1
}

function decodeUtf8(bytes, start, length) {
  const end = start + length
  if (typeof TextDecoder === 'function') {
    try {
      return new TextDecoder('utf-8').decode(bytes.subarray(start, end))
    } catch (error) {}
  }

  let result = ''
  let i = start
  while (i < end) {
    const b0 = bytes[i]
    let codePoint = 0
    let extra = 0
    if (b0 < 0x80) {
      codePoint = b0
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      codePoint = b0 & 0x1f
      extra = 1
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      codePoint = b0 & 0x0f
      extra = 2
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      codePoint = b0 & 0x07
      extra = 3
    } else {
      result += '\ufffd'
      i++
      continue
    }
    if (i + extra >= end) {
      result += '\ufffd'
      break
    }
    let valid = true
    for (let k = 1; k <= extra; k++) {
      const bk = bytes[i + k]
      if ((bk & 0xc0) !== 0x80) {
        valid = false
        break
      }
      codePoint = (codePoint << 6) | (bk & 0x3f)
    }
    if (!valid) {
      result += '\ufffd'
      i++
      continue
    }
    if (codePoint <= 0xffff) {
      result += String.fromCharCode(codePoint)
    } else {
      const adjusted = codePoint - 0x10000
      result += String.fromCharCode(0xd800 + (adjusted >> 10))
      result += String.fromCharCode(0xdc00 + (adjusted & 0x3ff))
    }
    i += extra + 1
  }
  return result
}
const KB_BINARY_MAGIC = 'TKB1'
const KB_BINARY_VERSION = 1
const KB_BINARY_HEADER_BYTES = 40

function toBytes(input) {
  if (!input) {
    throw new Error('Knowledge binary input is empty')
  }
  if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) {
    return new Uint8Array(input)
  }
  if (input.buffer && typeof input.byteLength === 'number') {
    return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength)
  }
  if (typeof input.length === 'number') {
    const out = new Uint8Array(input.length)
    for (let i = 0; i < input.length; i++) {
      out[i] = input[i]
    }
    return out
  }
  throw new Error('Unsupported knowledge binary input type')
}

function requireByteRange(bytes, offset, length, label) {
  if (
    typeof offset !== 'number' ||
    typeof length !== 'number' ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.length
  ) {
    throw new Error('Knowledge binary ' + label + ' is out of bounds')
  }
}

function parseBinaryKnowledge(input) {
  const bytes = toBytes(input)
  if (bytes.length < KB_BINARY_HEADER_BYTES) {
    throw new Error('Knowledge binary is shorter than its header')
  }

  let magic = ''
  for (let i = 0; i < 4; i++) {
    magic += String.fromCharCode(bytes[i])
  }
  if (magic !== KB_BINARY_MAGIC) {
    throw new Error('Knowledge binary magic is invalid')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint16(4, true)
  const headerBytes = view.getUint16(6, true)
  const count = view.getUint16(8, true)
  const keywordCount = view.getUint16(10, true)
  if (version !== KB_BINARY_VERSION || headerBytes < KB_BINARY_HEADER_BYTES || headerBytes > bytes.length) {
    throw new Error('Knowledge binary version or header is invalid')
  }
  if (count === 0 || keywordCount === 0 || count > 65535) {
    throw new Error('Knowledge binary counts are invalid')
  }

  const dataOffset = view.getUint32(12, true)
  const dataLength = view.getUint32(16, true)
  const keywordOffset = view.getUint32(20, true)
  const keywordLength = view.getUint32(24, true)
  const postingStartsOffset = view.getUint32(28, true)
  const postingsOffset = view.getUint32(32, true)
  const postingCount = view.getUint32(36, true)

  requireByteRange(bytes, dataOffset, dataLength, 'data section')
  requireByteRange(bytes, keywordOffset, keywordLength, 'keyword section')
  if (
    dataOffset < headerBytes ||
    keywordOffset < dataOffset + dataLength ||
    postingStartsOffset < keywordOffset + keywordLength ||
    postingsOffset < postingStartsOffset + (keywordCount + 1) * 4
  ) {
    throw new Error('Knowledge binary sections overlap or are misordered')
  }
  if (postingCount === 0 || postingCount > 65535) {
    throw new Error('Knowledge binary postings are invalid')
  }
  requireByteRange(bytes, postingStartsOffset, (keywordCount + 1) * 4, 'posting starts')
  requireByteRange(bytes, postingsOffset, postingCount * 2, 'postings')

  const postingStarts = new Uint32Array(keywordCount + 1)
  for (let i = 0; i < postingStarts.length; i++) {
    postingStarts[i] = view.getUint32(postingStartsOffset + i * 4, true)
    if (i > 0 && postingStarts[i] < postingStarts[i - 1]) {
      throw new Error('Knowledge binary posting starts are not ordered')
    }
  }
  if (postingStarts[keywordCount] !== postingCount) {
    throw new Error('Knowledge binary posting count does not match')
  }

  const postings = new Uint16Array(postingCount)
  for (let i = 0; i < postings.length; i++) {
    postings[i] = view.getUint16(postingsOffset + i * 2, true)
    if (postings[i] >= count) {
      throw new Error('Knowledge binary posting points outside entries')
    }
  }

  return {
    version: 2,
    count: count,
    keywordCount: keywordCount,
    data: decodeUtf8(bytes, dataOffset, dataLength),
    keywords: decodeUtf8(bytes, keywordOffset, keywordLength),
    postingStarts: postingStarts,
    postings: postings,
  }
}

function materializeNumberArray(value, ArrayType, size, name) {
  if (value && typeof value.length === 'number' && typeof value.buffer !== 'undefined') {
    if (value.length !== size) {
      throw new Error('Knowledge payload ' + name + ' length mismatch')
    }
    return value instanceof ArrayType ? value : new ArrayType(value)
  }
  return decodeNumberCsv(String(value || ''), size, ArrayType)
}
function decodeNumberCsv(text, size, ArrayType) {
  const out = new ArrayType(size)
  let value = 0
  let index = 0
  let hasDigit = false
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 48 && code <= 57) {
      value = value * 10 + code - 48
      hasDigit = true
    } else if (code === 44) {
      if (!hasDigit || index >= size) {
        throw new Error('Invalid numeric CSV in knowledge payload')
      }
      out[index++] = value
      value = 0
      hasDigit = false
    } else {
      throw new Error('Invalid numeric CSV character in knowledge payload')
    }
  }
  if (hasDigit) {
    if (index >= size) {
      throw new Error('Knowledge payload numeric CSV is too long')
    }
    out[index++] = value
  }
  if (index !== size) {
    throw new Error('Knowledge payload numeric CSV length mismatch')
  }
  return out
}

export class SimpleKnowledgeBase {
  constructor(payload) {
    let source = payload
    if (
      source &&
      source.version !== 2 &&
      source.data &&
      typeof source.data !== 'string' &&
      typeof source.data.length === 'number'
    ) {
      source = source.data
    }
    const packed =
      source && source.version === 2 && typeof source.data === 'string'
        ? source
        : parseBinaryKnowledge(source)
    const started = Date.now()
    const count = Number(packed.count)
    const keywordCount = Number(packed.keywordCount)
    if (!(count > 0) || !(keywordCount > 0)) {
      throw new Error('Knowledge payload must contain entries and keywords')
    }

    this.isSimple = true
    this.entryCount = count
    this.keywordCount = keywordCount
    this.data = packed.data
    this.keywordBlob = String(packed.keywords || '')
    this.recordOffsets = new Uint32Array(count + 1)
    this.questionOffsets = new Uint32Array(count)
    this.answerOffsets = new Uint32Array(count)
    this.keywordFieldOffsets = new Uint32Array(count)

    let cursor = 0
    for (let i = 0; i < count; i++) {
      this.recordOffsets[i] = cursor
      const newline = this.data.indexOf('\n', cursor)
      if (newline < 0) {
        throw new Error('Knowledge payload has fewer records than declared')
      }
      cursor = newline + 1
      const tab1 = this.data.indexOf('\t', this.recordOffsets[i])
      const tab2 = tab1 >= 0 ? this.data.indexOf('\t', tab1 + 1) : -1
      const tab3 = tab2 >= 0 ? this.data.indexOf('\t', tab2 + 1) : -1
      if (tab1 < 0 || tab1 >= newline || tab2 < 0 || tab2 >= newline || tab3 < 0 || tab3 >= newline) {
        throw new Error('Knowledge payload record ' + i + ' is malformed')
      }
      this.questionOffsets[i] = tab1 + 1
      this.answerOffsets[i] = tab2 + 1
      this.keywordFieldOffsets[i] = tab3 + 1
    }
    this.recordOffsets[count] = this.data.length
    if (cursor !== this.data.length) {
      throw new Error('Knowledge payload has more records than declared')
    }

    this.keywordOffsets = new Uint32Array(keywordCount + 1)
    cursor = 0
    for (let i = 0; i < keywordCount; i++) {
      this.keywordOffsets[i] = cursor
      const newline = this.keywordBlob.indexOf('\n', cursor)
      if (newline < 0) {
        throw new Error('Knowledge payload has fewer keywords than declared')
      }
      cursor = newline + 1
    }
    this.keywordOffsets[keywordCount] = this.keywordBlob.length
    if (cursor !== this.keywordBlob.length) {
      throw new Error('Knowledge payload has more keywords than declared')
    }

    this.postingStarts = materializeNumberArray(
      packed.postingStarts,
      Uint32Array,
      keywordCount + 1,
      'postingStarts'
    )
    const postingCount = this.postingStarts[keywordCount]
    this.postings = materializeNumberArray(packed.postings, Uint16Array, postingCount, 'postings')
    if (postingCount === 0 || this.postings.length !== postingCount) {
      throw new Error('Knowledge payload postings are empty')
    }

    const self = this
    this.questionTable = buildHashTable(count, function (index) {
      return normalizeText(self.questionAt(index))
    })
    this.idTable = buildHashTable(count, function (index) {
      return normalizeText(self.idAt(index))
    })
    this.keywordTable = buildHashTable(keywordCount, function (index) {
      return self.keywordAt(index)
    })

    this.candidateStamps = new Uint16Array(count)
    this.candidateIndexBuffer = new Uint16Array(count)
    this.candidateStamp = 0
    this.buildMs = Date.now() - started
  }

  idAt(index) {
    if (index < 0 || index >= this.entryCount) {
      return ''
    }
    return this.data.slice(this.recordOffsets[index], this.questionOffsets[index] - 1)
  }

  questionAt(index) {
    if (index < 0 || index >= this.entryCount) {
      return ''
    }
    return this.data.slice(this.questionOffsets[index], this.answerOffsets[index] - 1)
  }

  answerAt(index) {
    if (index < 0 || index >= this.entryCount) {
      return ''
    }
    return this.data.slice(this.answerOffsets[index], this.keywordFieldOffsets[index] - 1)
  }

  keywordFieldAt(index) {
    if (index < 0 || index >= this.entryCount) {
      return ''
    }
    return this.data.slice(this.keywordFieldOffsets[index], this.recordOffsets[index + 1] - 1)
  }

  entryAt(index) {
    if (index < 0 || index >= this.entryCount) {
      return null
    }
    const keywordField = this.keywordFieldAt(index)
    return {
      id: this.idAt(index),
      question: this.questionAt(index),
      answer: this.answerAt(index),
      keywords: keywordField ? keywordField.split('|') : [],
    }
  }

  keywordAt(index) {
    if (index < 0 || index >= this.keywordCount) {
      return ''
    }
    return this.keywordBlob.slice(this.keywordOffsets[index], this.keywordOffsets[index + 1] - 1)
  }

  findQuestionIndex(question) {
    return lookupHashTable(this.questionTable, this.questionAt.bind(this), normalizeText(question))
  }

  findEntryIndex(id) {
    return lookupHashTable(this.idTable, this.idAt.bind(this), normalizeText(id))
  }

  findEntryById(id) {
    return this.entryAt(this.findEntryIndex(id))
  }

  findKeywordIndex(keyword) {
    return lookupHashTable(this.keywordTable, this.keywordAt.bind(this), normalizeText(keyword))
  }

  keywordPostingLength(keyword) {
    const index = this.findKeywordIndex(keyword)
    if (index < 0) {
      return 0
    }
    return this.postingStarts[index + 1] - this.postingStarts[index]
  }

  prepareQuery(text) {
    const normalized = normalizeText(text)
    const exactOwner = this.findQuestionIndex(normalized)
    return {
      normalized: normalized,
      core: queryCore(normalized),
      bigrams: queryBigrams(normalized),
      words: queryWords(normalized),
      rawBigrams: rawBigrams(normalized),
      exactOwner: exactOwner >= 0 ? exactOwner : undefined,
    }
  }

  nextCandidateStamp() {
    if (this.candidateStamp >= 65535) {
      this.candidateStamps.fill(0)
      this.candidateStamp = 0
    }
    this.candidateStamp++
    return this.candidateStamp
  }

  candidateIndexes(prepared) {
    const self = this
    const stamp = this.nextCandidateStamp()
    const indexes = this.candidateIndexBuffer
    const stamps = this.candidateStamps
    let count = 0

    const addEntry = function (index) {
      if (index < 0 || index >= self.entryCount || stamps[index] === stamp) {
        return
      }
      stamps[index] = stamp
      indexes[count++] = index
    }
    const addKeyword = function (keyword) {
      const keywordIndex = self.findKeywordIndex(keyword)
      if (keywordIndex < 0) {
        return
      }
      const start = self.postingStarts[keywordIndex]
      const end = self.postingStarts[keywordIndex + 1]
      for (let i = start; i < end; i++) {
        addEntry(self.postings[i])
      }
    }

    addEntry(prepared.exactOwner)
    addKeyword(prepared.normalized)
    addKeyword(prepared.core)
    for (let i = 0; i < prepared.words.length; i++) {
      addKeyword(prepared.words[i])
    }

    // 中文查询枚举 2~6 字子串；30 字长句最多约 450 次哈希查找。
    for (let len = 2; len <= 6; len++) {
      for (let start = 0; start + len <= prepared.normalized.length; start++) {
        const part = prepared.normalized.substr(start, len)
        if (!STOP_BIGRAMS[part]) {
          addKeyword(part)
        }
      }
    }
    return { indexes: indexes, count: count }
  }

  formulaScore(prepared, question, keywordText, answer, allowQuestionHits) {
    const totalWeight = prepared.bigrams.length * 3 + prepared.words.length * 3
    if (totalWeight === 0) {
      return {
        score: 0,
        totalWeight: 0,
        questionHits: 0,
        keywordHits: 0,
        answerHits: 0,
      }
    }

    let hit = 0
    let questionHits = 0
    let keywordHits = 0
    let answerHits = 0
    for (let i = 0; i < prepared.bigrams.length; i++) {
      const bigram = prepared.bigrams[i]
      if (allowQuestionHits && question.indexOf(bigram) >= 0) {
        hit += 3
        questionHits++
      } else if (keywordText.indexOf(bigram) >= 0) {
        hit += 2
        keywordHits++
      } else if (answer.indexOf(bigram) >= 0) {
        hit += 1
        answerHits++
      }
    }
    for (let i = 0; i < prepared.words.length; i++) {
      const word = prepared.words[i]
      if (allowQuestionHits && question.indexOf(word) >= 0) {
        hit += 3
        questionHits++
      } else if (keywordText.indexOf(word) >= 0) {
        hit += 3
        keywordHits++
      } else if (answer.indexOf(word) >= 0) {
        hit += 1
        answerHits++
      }
    }
    return {
      score: hit / totalWeight,
      totalWeight: totalWeight,
      questionHits: questionHits,
      keywordHits: keywordHits,
      answerHits: answerHits,
    }
  }

  scoreEntryRecord(prepared, index, entry) {
    const query = prepared.normalized
    const question = normalizeText(entry.question)
    if (!query || !question) {
      return 0
    }
    if (query === question) {
      return 0.95
    }
    const exactLocked = prepared.exactOwner !== undefined && prepared.exactOwner !== index

    const keywordList = entry.keywords || []
    const keywordText = keywordList.join(' ')
    const answer = normalizeText(entry.answer)
    for (let i = 0; i < prepared.words.length; i++) {
      const word = prepared.words[i]
      if (question.indexOf(word) < 0 && keywordText.indexOf(word) < 0 && answer.indexOf(word) < 0) {
        return 0
      }
    }

    if (query.length >= 4 && question.indexOf(query) === 0 && isQuestionTail(question.slice(query.length))) {
      return exactLocked ? 0.29 : 0.9
    }
    if (question.length >= 4 && query.indexOf(question) === 0 && isQuestionTail(query.slice(question.length))) {
      return exactLocked ? 0.29 : 0.9
    }

    const formula = this.formulaScore(prepared, question, keywordText, answer, !exactLocked)
    let matchedUniqueKeyword = ''
    for (let i = 0; i < keywordList.length; i++) {
      const keyword = keywordList[i]
      if (keyword.length < 2 || this.keywordPostingLength(keyword) !== 1) {
        continue
      }
      const exactKeyword = query === keyword || prepared.core === keyword
      const longKeyword = keyword.length >= 4 && (query.indexOf(keyword) >= 0 || prepared.core.indexOf(keyword) >= 0)
      if (exactKeyword || longKeyword) {
        matchedUniqueKeyword = keyword
        break
      }
    }

    const uniqueKeywordHit = matchedUniqueKeyword !== ''
    let score = Math.min(formula.score, 0.95)
    if (uniqueKeywordHit) {
      const exactKeyword = query === matchedUniqueKeyword || prepared.core === matchedUniqueKeyword
      score = Math.max(score, exactKeyword ? 0.6 : 0.55)
    }
    const shortQuestionMatch = prepared.bigrams.length <= 1 && formula.questionHits >= 1
    const strongTopic =
      formula.questionHits >= 2 ||
      shortQuestionMatch ||
      formula.keywordHits >= 1 ||
      uniqueKeywordHit
    if (!strongTopic || (formula.questionHits === 0 && formula.keywordHits === 0 && formula.answerHits > 0)) {
      score = Math.min(score, 0.29)
    }

    if (!exactLocked) {
      const similarity = pairSimilarity(prepared.rawBigrams, rawBigrams(question))
      if (similarity >= 0.75) {
        score = Math.max(score, 0.9)
      }
    } else {
      score = Math.min(score, 0.29)
    }
    return score
  }

  scorePrepared(prepared, index) {
    const entry = this.entryAt(index)
    return entry ? this.scoreEntryRecord(prepared, index, entry) : 0
  }

  scoreEntry(text, index) {
    return this.scorePrepared(this.prepareQuery(text), index)
  }

  query(text, topK) {
    const started = Date.now()
    const limit = topK && topK > 0 ? Math.floor(topK) : 3
    const prepared = this.prepareQuery(text)
    if (!prepared.normalized) {
      return {
        query: text,
        top: [],
        tokens: [],
        elapsedMs: Date.now() - started,
        candidateCount: 0,
      }
    }

    if (prepared.exactOwner !== undefined) {
      const entry = this.entryAt(prepared.exactOwner)
      return {
        query: text,
        top: [
          {
            id: entry.id,
            question: entry.question,
            answer: entry.answer,
            score: 0.95,
            index: prepared.exactOwner,
          },
        ],
        tokens: tokenize(text),
        elapsedMs: Date.now() - started,
        candidateCount: 1,
      }
    }

    const candidates = this.candidateIndexes(prepared)
    const results = []
    for (let i = 0; i < candidates.count; i++) {
      const index = candidates.indexes[i]
      const entry = this.entryAt(index)
      const score = this.scoreEntryRecord(prepared, index, entry)
      if (score > 0) {
        results.push({
          id: entry.id,
          question: entry.question,
          answer: entry.answer,
          score: score,
          index: index,
        })
      }
    }
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score
      if (a.question.length !== b.question.length) return a.question.length - b.question.length
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
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
      candidateCount: candidates.count,
    }
  }

  tokensForEntry(index) {
    const entry = this.entryAt(index)
    return entry ? tokenize(entryText(entry)) : []
  }

  getStats() {
    return {
      entries: this.entryCount,
      vocabSize: 0,
      nonZeroTerms: 0,
      keywordCount: this.keywordCount,
      postingCount: this.postings.length,
      buildMs: this.buildMs,
    }
  }
}
