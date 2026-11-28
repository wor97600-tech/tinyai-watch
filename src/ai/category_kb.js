import { SimpleKnowledgeBase } from './simple_kb.js'
import {
  KB_DOMAINS,
  hashKnowledgeKey,
  hashNormalizedKnowledgeKey,
  isKnowledgeRouteStopTerm,
  normalizeKnowledgeKey,
} from './kb_domains.js'

export const KB_ROUTER_MAGIC = 'TKR1'
export const KB_ROUTER_VERSION = 2
export const KB_ROUTER_HEADER_BYTES = 64
export const KB_ROUTE_THRESHOLD = 4

function toBytes(input) {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input)
  }
  if (input && input.buffer instanceof ArrayBuffer) {
    return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength || input.length)
  }
  if (input && typeof input.length === 'number') {
    const out = new Uint8Array(input.length)
    for (let i = 0; i < input.length; i++) out[i] = input[i]
    return out
  }
  throw new Error('Unsupported knowledge router input type')
}

function requireByteRange(bytes, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new Error('Knowledge router ' + label + ' is out of bounds')
  }
}

function lowerBound(keys, value, count) {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >> 1
    if (keys[middle] < value) low = middle + 1
    else high = middle
  }
  return low
}

// Only rewrite the complete formula question, never a reaction or equation exercise.
function normalizeWaterFormulaQuestion(text) {
  const key = normalizeKnowledgeKey(text)
  return /^(?:请问|我想知道)?水的(?:化学)?方程式(?:是什么|是啥)?[？?。！!]*$/.test(key)
    ? '水的化学式是什么'
    : text
}
export function parseCategoryRouter(input) {
  const started = Date.now()
  const bytes = toBytes(input)
  if (bytes.length < KB_ROUTER_HEADER_BYTES) throw new Error('Knowledge router is shorter than its header')
  let magic = ''
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(bytes[i])
  if (magic !== KB_ROUTER_MAGIC) throw new Error('Knowledge router magic is invalid')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint16(4, true)
  const headerBytes = view.getUint16(6, true)
  const domainCount = view.getUint16(8, true)
  const routeCount = view.getUint32(12, true)
  const questionCount = view.getUint32(16, true)
  const routeOffset = view.getUint32(20, true)
  const questionOffset = view.getUint32(24, true)
  const totalBytes = view.getUint32(28, true)
  if (
    version !== KB_ROUTER_VERSION ||
    headerBytes < KB_ROUTER_HEADER_BYTES ||
    domainCount !== KB_DOMAINS.length ||
    routeCount === 0 ||
    questionCount === 0
  ) {
    throw new Error('Knowledge router version or counts are invalid')
  }
  if (totalBytes !== bytes.length) throw new Error('Knowledge router byte length does not match its header')
  requireByteRange(bytes, routeOffset, routeCount * 8, 'route records')
  requireByteRange(bytes, questionOffset, questionCount * 8, 'question records')
  if (routeOffset < headerBytes || questionOffset < routeOffset + routeCount * 8) {
    throw new Error('Knowledge router sections overlap or are misordered')
  }

  const domainCounts = new Uint16Array(domainCount)
  for (let i = 0; i < domainCount; i++) domainCounts[i] = view.getUint16(32 + i * 2, true)
  const routeKeys = new Float64Array(routeCount)
  const routeDomains = new Uint8Array(routeCount)
  const routeWeights = new Uint8Array(routeCount)
  for (let i = 0; i < routeCount; i++) {
    const offset = routeOffset + i * 8
    routeKeys[i] = view.getUint32(offset, true) * 65536 + view.getUint16(offset + 4, true)
    routeDomains[i] = bytes[offset + 6]
    routeWeights[i] = bytes[offset + 7]
    if (routeDomains[i] >= domainCount || routeWeights[i] === 0 || (i > 0 && routeKeys[i] < routeKeys[i - 1])) {
      throw new Error('Knowledge router route record ' + i + ' is invalid')
    }
  }

  const questionKeys = new Float64Array(questionCount)
  const questionDomains = new Uint8Array(questionCount)
  for (let i = 0; i < questionCount; i++) {
    const offset = questionOffset + i * 8
    questionKeys[i] = view.getUint32(offset, true) * 65536 + view.getUint16(offset + 4, true)
    questionDomains[i] = bytes[offset + 6]
    if (questionDomains[i] >= domainCount || (i > 0 && questionKeys[i] < questionKeys[i - 1])) {
      throw new Error('Knowledge router question record ' + i + ' is invalid')
    }
  }

  return {
    version: version,
    domains: KB_DOMAINS.slice(),
    domainCounts: domainCounts,
    routeCount: routeCount,
    questionCount: questionCount,
    routeKeys: routeKeys,
    routeDomains: routeDomains,
    routeWeights: routeWeights,
    questionKeys: questionKeys,
    questionDomains: questionDomains,
    buildMs: Date.now() - started,
  }
}
export class CategoryKnowledgeBase {
  constructor(routerInput, options) {
    const opts = options || {}
    this.router = parseCategoryRouter(routerInput)
    this.domains = this.router.domains
    this.domainCounts = this.router.domainCounts
    this.isSimple = true
    this.entryCount = this.router.questionCount
    this.routeThreshold = opts.routeThreshold || KB_ROUTE_THRESHOLD
    this.shardLoader = opts.shardLoader || null
    this.baseKb = null
    this.domainKb = null
    this.loadedDomain = 'none'
    this.loadedEntries = 0
    this.loadChain = Promise.resolve(true)
    this.routerBuildMs = this.router.buildMs
    this.lastLoadMs = 0
    this.lastBuildMs = 0
    this.buildMs = this.routerBuildMs
    this.domainOffsets = new Uint32Array(this.domains.length)
    let offset = 0
    for (let i = 0; i < this.domains.length; i++) {
      this.domainOffsets[i] = offset
      offset += this.domainCounts[i]
    }
    if (offset !== this.entryCount) throw new Error('Knowledge router domain counts do not match declared entry count')
  }

  setShardLoader(loader) {
    this.shardLoader = loader
  }

  domainIndex(domain) {
    return this.domains.indexOf(domain)
  }

  entryCountForDomain(domain) {
    const index = this.domainIndex(domain)
    return index >= 0 ? this.domainCounts[index] : 0
  }

  domainStart(domain) {
    const index = this.domainIndex(domain)
    return index >= 0 ? this.domainOffsets[index] : 0
  }

  findExactDomain(text) {
    const key = hashKnowledgeKey(text)
    let index = lowerBound(this.router.questionKeys, key, this.router.questionCount)
    if (index >= this.router.questionCount || this.router.questionKeys[index] !== key) return ''
    return this.domains[this.router.questionDomains[index]]
  }

  addRouteScore(scores, key) {
    let index = lowerBound(this.router.routeKeys, key, this.router.routeCount)
    while (index < this.router.routeCount && this.router.routeKeys[index] === key) {
      scores[this.router.routeDomains[index]] += this.router.routeWeights[index]
      index++
    }
  }

  routeDetails(text) {
    const normalized = normalizeKnowledgeKey(normalizeWaterFormulaQuestion(text))
    if (!normalized) return { domain: 'base', score: 0, exact: false }
    const exactDomain = this.findExactDomain(normalized)
    if (exactDomain) return { domain: exactDomain, score: 100, exact: true }

    const scores = new Uint16Array(this.domains.length)
    for (let length = 2; length <= 6; length++) {
      for (let start = 0; start + length <= normalized.length; start++) {
        const part = normalized.substr(start, length)
        if (isKnowledgeRouteStopTerm(part)) continue
        this.addRouteScore(scores, hashNormalizedKnowledgeKey(part))
      }
    }

    let bestDomain = 0
    let bestScore = 0
    for (let i = 1; i < this.domains.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i]
        bestDomain = i
      }
    }
    if (bestScore < this.routeThreshold) return { domain: 'base', score: bestScore, exact: false }
    return { domain: this.domains[bestDomain], score: bestScore, exact: false }
  }

  route(text) {
    return this.routeDetails(text)
  }

  loadOneShard(domain) {
    if (!this.shardLoader) return Promise.reject(new Error('Knowledge shard loader is not configured'))
    return Promise.resolve(this.shardLoader(domain)).then(function (bytes) {
      if (!bytes) throw new Error('Knowledge shard is empty: ' + domain)
      return bytes
    })
  }

  releaseDomain() {
    // Only one compact index may stay alive. Releasing the active shard before
    // the next read avoids retaining base + topic indexes on memory-limited watches.
    this.baseKb = null
    this.domainKb = null
    this.loadedDomain = 'none'
    this.loadedEntries = 0
  }

  loadDomain(domain) {
    const self = this
    const target = this.domainIndex(domain) >= 0 ? domain : 'base'
    const loadShard = function (shardDomain) {
      const started = Date.now()
      return self.loadOneShard(shardDomain).then(function (bytes) {
        const shardKb = new SimpleKnowledgeBase(bytes)
        const expectedCount = self.entryCountForDomain(shardDomain)
        if (shardKb.entryCount !== expectedCount) {
          throw new Error(
            'Knowledge shard count mismatch for ' +
              shardDomain +
              ': ' +
              shardKb.entryCount +
              '/' +
              expectedCount
          )
        }
        self.baseKb = shardDomain === 'base' ? shardKb : null
        self.domainKb = shardDomain === 'base' ? null : shardKb
        self.loadedDomain = shardDomain
        self.loadedEntries = shardKb.entryCount
        self.lastLoadMs = Date.now() - started
        self.lastBuildMs = shardKb.buildMs
        self.buildMs = self.routerBuildMs + self.lastBuildMs
        return true
      })
    }

    this.loadChain = this.loadChain
      .catch(function () { return false })
      .then(function () {
        if (target === self.loadedDomain && (self.baseKb || self.domainKb)) return true
        self.releaseDomain()
        return loadShard(target).catch(function (error) {
          if (target === 'base') throw error
          self.lastLoadError = error
          // Fallback is sequential: release any partial topic load, then try only
          // the small base shard, never both at once.
          self.releaseDomain()
          return loadShard('base').catch(function () {
            throw error
          })
        })
      })
    return this.loadChain
  }

  loadForQuery(text) {
    const self = this
    const details = this.routeDetails(text)
    this.lastLoadError = null
    return this.loadDomain(details.domain).then(function () {
      return {
        ok: true,
        details: details,
        degraded: !!self.lastLoadError,
      }
    })
  }
  mergeResult(baseResult, domainResult, topK, details) {
    const merged = []
    const limit = topK && topK > 0 ? Math.floor(topK) : 3
    for (let i = 0; i < baseResult.top.length; i++) {
      const item = baseResult.top[i]
      merged.push({ id: item.id, question: item.question, answer: item.answer, score: item.score, index: item.index })
    }
    if (domainResult) {
      for (let i = 0; i < domainResult.top.length; i++) {
        const item = domainResult.top[i]
        merged.push({
          id: item.id,
          question: item.question,
          answer: item.answer,
          score: item.score,
          index: this.domainStart(details.domain) + item.index,
        })
      }
    }
    merged.sort(function (left, right) {
      if (right.score !== left.score) return right.score - left.score
      if (left.question.length !== right.question.length) return left.question.length - right.question.length
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
    const top = []
    for (let i = 0; i < Math.min(limit, merged.length); i++) top.push(merged[i])
    return {
      query: baseResult.query,
      top: top,
      tokens: domainResult ? domainResult.tokens : baseResult.tokens,
      elapsedMs: baseResult.elapsedMs,
      candidateCount: baseResult.candidateCount + (domainResult ? domainResult.candidateCount : 0),
      route: details,
    }
  }

  query(text, topK) {
    if (!this.baseKb && !this.domainKb) throw new Error('Knowledge base shards are not loaded')
    const started = Date.now()
    const details = this.routeDetails(text)
    const lookupText = normalizeWaterFormulaQuestion(text)
    const emptyResult = {
      query: text,
      top: [],
      tokens: [],
      elapsedMs: 0,
      candidateCount: 0,
    }
    let baseResult = emptyResult
    let domainResult = null
    if (this.loadedDomain === 'base' && this.baseKb) {
      baseResult = this.baseKb.query(lookupText, topK)
    } else if (this.domainKb && this.loadedDomain === details.domain) {
      domainResult = this.domainKb.query(lookupText, topK)
    }
    const merged = this.mergeResult(baseResult, domainResult, topK, details)
    merged.elapsedMs = Date.now() - started
    return merged
  }

  domainForGlobalIndex(globalIndex) {
    if (globalIndex < 0 || globalIndex >= this.entryCount) return ''
    for (let i = 0; i < this.domains.length; i++) {
      if (globalIndex < this.domainOffsets[i] + this.domainCounts[i]) return this.domains[i]
    }
    return ''
  }

  entryAt(globalIndex) {
    if (!this.baseKb && !this.domainKb) return null
    const domain = this.domainForGlobalIndex(globalIndex)
    if (!domain) return null
    if (domain === 'base') return this.baseKb.entryAt(globalIndex)
    if (!this.domainKb || this.loadedDomain !== domain) return null
    return this.domainKb.entryAt(globalIndex - this.domainStart(domain))
  }

  findQuestionIndex(text) {
    if (this.loadedDomain === 'base' && this.baseKb) {
      return this.baseKb.findQuestionIndex(text)
    }
    if (this.domainKb && this.loadedDomain !== 'base') {
      const domainIndex = this.domainKb.findQuestionIndex(text)
      return domainIndex >= 0 ? this.domainStart(this.loadedDomain) + domainIndex : -1
    }
    return -1
  }

  findEntryIndex(id) {
    if (this.loadedDomain === 'base' && this.baseKb) {
      return this.baseKb.findEntryIndex(id)
    }
    if (this.domainKb && this.loadedDomain !== 'base') {
      const domainIndex = this.domainKb.findEntryIndex(id)
      return domainIndex >= 0 ? this.domainStart(this.loadedDomain) + domainIndex : -1
    }
    return -1
  }

  findEntryById(id) {
    const index = this.findEntryIndex(id)
    return index >= 0 ? this.entryAt(index) : null
  }

  tokensForEntry(globalIndex) {
    const entry = this.entryAt(globalIndex)
    if (!entry) return []
    const domain = this.domainForGlobalIndex(globalIndex)
    if (domain === 'base') return this.baseKb.tokensForEntry(globalIndex)
    return this.domainKb.tokensForEntry(globalIndex - this.domainStart(domain))
  }
  // 手表页面探针只抽样当前唯一常驻的分片，绝不再轮换加载其他分片。
  // 完整 measureSample 仅保留给电脑端测试使用。
  measureLoadedSample(sampleCount) {
    const kb = this.baseKb || this.domainKb
    if (!kb || this.loadedDomain === 'none') {
      return Promise.reject(new Error('Knowledge base shard is not loaded'))
    }
    const requested = Math.max(1, Math.floor(Number(sampleCount) || 16))
    const count = kb.entryCount
    const latencies = []
    const candidateCounts = []
    let candidateTotal = 0
    let candidateMax = 0
    const target = Math.max(1, Math.min(count, requested))

    for (let i = 0; i < target; i++) {
      const localIndex = Math.min(count - 1, Math.floor((i * count) / target))
      const entry = kb.entryAt(localIndex)
      if (!entry) {
        return Promise.reject(
          new Error('Knowledge sample entry is unavailable: ' + this.loadedDomain + '/' + localIndex)
        )
      }
      const result = this.query('我想知道' + entry.question, 1)
      latencies.push(result.elapsedMs)
      candidateCounts.push(result.candidateCount)
      candidateTotal += result.candidateCount
      if (result.candidateCount > candidateMax) candidateMax = result.candidateCount
    }

    return Promise.resolve({
      sampleCount: latencies.length,
      latencies: latencies,
      candidateCounts: candidateCounts,
      candidateTotal: candidateTotal,
      candidateMax: candidateMax,
      candidateAverage: latencies.length ? Math.round(candidateTotal / latencies.length) : 0,
      peakBuildMs: this.buildMs,
      loadedShards: [this.loadedDomain],
    })
  }

  measureSample(sampleCount) {
    const self = this
    const requested = Math.max(this.domains.length, Math.floor(Number(sampleCount) || this.domains.length))
    const perDomain = Math.floor(requested / this.domains.length)
    const remainder = requested % this.domains.length
    const latencies = []
    const candidateCounts = []
    const loadedShards = []
    let candidateTotal = 0
    let candidateMax = 0
    let peakBuildMs = this.routerBuildMs

    function runDomain(domainIndex) {
      if (domainIndex >= self.domains.length) {
        return self.loadDomain('base').then(function () {
          return {
            sampleCount: latencies.length,
            latencies: latencies,
            candidateCounts: candidateCounts,
            candidateTotal: candidateTotal,
            candidateMax: candidateMax,
            candidateAverage: latencies.length ? Math.round(candidateTotal / latencies.length) : 0,
            peakBuildMs: peakBuildMs,
            loadedShards: loadedShards,
          }
        })
      }

      const domain = self.domains[domainIndex]
      const target = perDomain + (domainIndex < remainder ? 1 : 0)
      return self.loadDomain(domain).then(function () {
        loadedShards.push(domain)
        if (self.buildMs > peakBuildMs) peakBuildMs = self.buildMs
        const count = self.entryCountForDomain(domain)
        const start = self.domainStart(domain)
        for (let i = 0; i < target; i++) {
          const localIndex = Math.min(count - 1, Math.floor((i * count) / target))
          const entry = self.entryAt(start + localIndex)
          if (!entry) throw new Error('Knowledge sample entry is unavailable: ' + domain + '/' + localIndex)
          const result = self.query('我想知道' + entry.question, 1)
          latencies.push(result.elapsedMs)
          candidateCounts.push(result.candidateCount)
          candidateTotal += result.candidateCount
          if (result.candidateCount > candidateMax) candidateMax = result.candidateCount
        }
        return runDomain(domainIndex + 1)
      })
    }

    return runDomain(0)
  }

  getStats() {
    let keywordCount = 0
    let postingCount = 0
    if (this.baseKb) {
      const baseStats = this.baseKb.getStats()
      keywordCount += baseStats.keywordCount || 0
      postingCount += baseStats.postingCount || 0
    }
    if (this.domainKb) {
      const domainStats = this.domainKb.getStats()
      keywordCount += domainStats.keywordCount || 0
      postingCount += domainStats.postingCount || 0
    }
    return {
      entries: this.entryCount,
      loadedEntries: this.loadedEntries,
      loadedDomain: this.loadedDomain,
      domainCount: this.domains.length,
      buildMs: this.buildMs,
      routerBuildMs: this.routerBuildMs,
      routeCount: this.router.routeCount,
      questionCount: this.router.questionCount,
      routeThreshold: this.routeThreshold,
      keywordCount: keywordCount,
      postingCount: postingCount,
    }
  }
}
