import { KB_DOMAINS, hashKnowledgeKey } from '../src/ai/kb_domains.js'

// Compact knowledge-base payload shared by the build script and Node tests.
// The watch parses this once at runtime; it never imports one JS module per chunk.

const FIELD_BREAK = /[\t\r\n]/

function normalizeKeyword(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function validateField(where, name, value, allowPipe) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(where + ': ' + name + ' must be a non-empty string')
  }
  if (FIELD_BREAK.test(value)) {
    throw new Error(where + ': ' + name + ' contains a tab or newline')
  }
  if (!allowPipe && value.indexOf('|') >= 0) {
    throw new Error(where + ': ' + name + ' contains the keyword separator')
  }
}

export function packEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('packEntries requires at least one entry')
  }

  const lines = []
  const keywordIndexes = new Map()
  const keywordNames = []
  const postingsByKeyword = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const where = 'entry[' + i + ']'
    if (!entry || typeof entry !== 'object') {
      throw new Error(where + ' must be an object')
    }
    validateField(where, 'id', entry.id, false)
    validateField(where, 'question', entry.question, true)
    validateField(where, 'answer', entry.answer, true)
    if (!Array.isArray(entry.keywords) || entry.keywords.length === 0) {
      throw new Error(where + ': keywords must be a non-empty array')
    }

    const seen = Object.create(null)
    const keywords = []
    for (let k = 0; k < entry.keywords.length; k++) {
      const keyword = normalizeKeyword(entry.keywords[k])
      validateField(where, 'keyword', keyword, false)
      if (seen[keyword]) {
        continue
      }
      seen[keyword] = true
      keywords.push(keyword)

      let keywordIndex = keywordIndexes.get(keyword)
      if (keywordIndex === undefined) {
        keywordIndex = keywordNames.length
        keywordIndexes.set(keyword, keywordIndex)
        keywordNames.push(keyword)
        postingsByKeyword.push([])
      }
      postingsByKeyword[keywordIndex].push(i)
    }

    if (keywords.length === 0) {
      throw new Error(where + ': no usable keywords')
    }
    lines.push([entry.id, entry.question, entry.answer, keywords.join('|')].join('\t'))
  }

  const postingStarts = new Uint32Array(keywordNames.length + 1)
  let postingCount = 0
  for (let i = 0; i < postingsByKeyword.length; i++) {
    postingStarts[i] = postingCount
    postingCount += postingsByKeyword[i].length
  }
  postingStarts[keywordNames.length] = postingCount

  const postings = new Uint16Array(postingCount)
  let postingCursor = 0
  for (let i = 0; i < postingsByKeyword.length; i++) {
    const list = postingsByKeyword[i]
    for (let j = 0; j < list.length; j++) {
      postings[postingCursor++] = list[j]
    }
  }

  return {
    version: 2,
    count: entries.length,
    keywordCount: keywordNames.length,
    data: lines.join('\n') + '\n',
    keywords: keywordNames.join('\n') + '\n',
    postingStarts: Array.from(postingStarts).join(','),
    postings: Array.from(postings).join(','),
  }
}
export const KB_BINARY_MAGIC = 'TKB1'
export const KB_BINARY_VERSION = 1
export const KB_BINARY_HEADER_BYTES = 40

function encodeUtf8(value) {
  const text = String(value || '')
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(text)
  }
  const out = []
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
        i++
      }
    }
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return Uint8Array.from(out)
}

function decodeNumericCsv(text, Type, expectedLength, label) {
  const out = new Type(expectedLength)
  let value = 0
  let index = 0
  let hasDigit = false
  const input = String(text || '')
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code >= 48 && code <= 57) {
      value = value * 10 + code - 48
      hasDigit = true
    } else if (code === 44) {
      if (!hasDigit || index >= expectedLength) {
        throw new Error('Invalid ' + label + ' CSV')
      }
      out[index++] = value
      value = 0
      hasDigit = false
    } else {
      throw new Error('Invalid ' + label + ' CSV character')
    }
  }
  if (hasDigit) {
    if (index >= expectedLength) {
      throw new Error(label + ' CSV is too long')
    }
    out[index++] = value
  }
  if (index !== expectedLength) {
    throw new Error(label + ' CSV length mismatch: ' + index + '/' + expectedLength)
  }
  return out
}

function align4(value) {
  return (value + 3) & ~3
}

export function encodePackedPayload(payload) {
  if (!payload || payload.version !== 2) {
    throw new Error('encodePackedPayload requires a version 2 payload')
  }
  const count = Number(payload.count)
  const keywordCount = Number(payload.keywordCount)
  if (!(count > 0) || count > 65535 || !(keywordCount > 0) || keywordCount > 65535) {
    throw new Error('Packed payload counts are invalid')
  }

  const dataBytes = encodeUtf8(payload.data)
  const keywordBytes = encodeUtf8(payload.keywords)
  const postingStarts = decodeNumericCsv(
    payload.postingStarts,
    Uint32Array,
    keywordCount + 1,
    'postingStarts'
  )
  const postingCount = postingStarts[keywordCount]
  const postings = decodeNumericCsv(payload.postings, Uint16Array, postingCount, 'postings')

  const dataOffset = KB_BINARY_HEADER_BYTES
  const keywordOffset = dataOffset + dataBytes.length
  const postingStartsOffset = align4(keywordOffset + keywordBytes.length)
  const postingsOffset = postingStartsOffset + (keywordCount + 1) * 4
  const totalBytes = postingsOffset + postingCount * 2
  const buffer = new ArrayBuffer(totalBytes)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  for (let i = 0; i < 4; i++) bytes[i] = KB_BINARY_MAGIC.charCodeAt(i)
  view.setUint16(4, KB_BINARY_VERSION, true)
  view.setUint16(6, KB_BINARY_HEADER_BYTES, true)
  view.setUint16(8, count, true)
  view.setUint16(10, keywordCount, true)
  view.setUint32(12, dataOffset, true)
  view.setUint32(16, dataBytes.length, true)
  view.setUint32(20, keywordOffset, true)
  view.setUint32(24, keywordBytes.length, true)
  view.setUint32(28, postingStartsOffset, true)
  view.setUint32(32, postingsOffset, true)
  view.setUint32(36, postingCount, true)

  bytes.set(dataBytes, dataOffset)
  bytes.set(keywordBytes, keywordOffset)
  for (let i = 0; i < postingStarts.length; i++) {
    view.setUint32(postingStartsOffset + i * 4, postingStarts[i], true)
  }
  for (let i = 0; i < postings.length; i++) {
    view.setUint16(postingsOffset + i * 2, postings[i], true)
  }
  return buffer
}

export const KB_ROUTER_MAGIC = 'TKR1'
export const KB_ROUTER_VERSION = 2
export const KB_ROUTER_HEADER_BYTES = 64

function writeRouterHash(view, offset, key) {
  const hash = hashKnowledgeKey(key)
  view.setUint32(offset, Math.floor(hash / 65536), true)
  view.setUint16(offset + 4, hash % 65536, true)
}

export function encodeKnowledgeRouter(options) {
  const opts = options || {}
  const domains = Array.isArray(opts.domains) ? opts.domains : KB_DOMAINS
  const domainCounts = opts.domainCounts || []
  const routes = (opts.routes || []).slice().sort(function (a, b) {
    return hashKnowledgeKey(a.key) - hashKnowledgeKey(b.key) || domains.indexOf(a.domain) - domains.indexOf(b.domain)
  })
  const questions = (opts.questions || []).slice().sort(function (a, b) {
    return hashKnowledgeKey(a.question) - hashKnowledgeKey(b.question) || domains.indexOf(a.domain) - domains.indexOf(b.domain)
  })
  if (domains.length === 0 || domains.length > 255) {
    throw new Error('Knowledge router domains must be between 1 and 255')
  }
  if (domainCounts.length !== domains.length || questions.length === 0) {
    throw new Error('Knowledge router counts are invalid')
  }
  const totalEntries = domainCounts.reduce(function (sum, value) { return sum + Number(value || 0) }, 0)
  if (totalEntries !== questions.length) {
    throw new Error('Knowledge router domain counts do not match questions')
  }
  if (routes.length === 0) {
    throw new Error('Knowledge router needs at least one keyword route')
  }

  const headerBytes = Math.max(KB_ROUTER_HEADER_BYTES, 32 + domains.length * 2)
  const routeOffset = headerBytes
  const questionOffset = routeOffset + routes.length * 8
  const totalBytes = questionOffset + questions.length * 8
  const buffer = new ArrayBuffer(totalBytes)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  for (let i = 0; i < 4; i++) bytes[i] = KB_ROUTER_MAGIC.charCodeAt(i)
  view.setUint16(4, KB_ROUTER_VERSION, true)
  view.setUint16(6, headerBytes, true)
  view.setUint16(8, domains.length, true)
  view.setUint32(12, routes.length, true)
  view.setUint32(16, questions.length, true)
  view.setUint32(20, routeOffset, true)
  view.setUint32(24, questionOffset, true)
  view.setUint32(28, totalBytes, true)
  for (let i = 0; i < domains.length; i++) {
    view.setUint16(32 + i * 2, Number(domainCounts[i]), true)
  }

  const seenRoutes = new Set()
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]
    const domain = domains.indexOf(route.domain)
    const weight = Math.floor(Number(route.weight))
    if (domain <= 0 || weight < 1 || weight > 255) {
      throw new Error('Knowledge router route ' + i + ' is invalid')
    }
    const signature = route.key + '|' + domain
    if (seenRoutes.has(signature)) {
      throw new Error('Knowledge router has a duplicate route: ' + signature)
    }
    seenRoutes.add(signature)
    const offset = routeOffset + i * 8
    writeRouterHash(view, offset, route.key)
    bytes[offset + 6] = domain
    bytes[offset + 7] = weight
  }

  const seenQuestions = new Set()
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    const domain = domains.indexOf(question.domain)
    if (domain < 0) throw new Error('Knowledge router question ' + i + ' has no domain')
    const key = String(question.question || '')
    if (seenQuestions.has(key)) throw new Error('Knowledge router has a duplicate question: ' + key)
    seenQuestions.add(key)
    const offset = questionOffset + i * 8
    writeRouterHash(view, offset, key)
    bytes[offset + 6] = domain
    bytes[offset + 7] = 0
  }
  return buffer
}
