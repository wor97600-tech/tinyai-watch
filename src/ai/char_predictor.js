import { FeedForwardNetwork } from './neural_network.js'
import { createFloatArray } from './matrix.js'

function topKFromScores(scores, labels, k) {
  const items = []
  for (let i = 0; i < scores.length; i++) {
    const label = labels[i]
    if (label === '<s>' || label === '<eos>') {
      continue
    }
    items.push({
      index: i,
      label: label === '<unk>' ? '？' : label,
      rawLabel: label,
      score: scores[i],
    })
  }
  items.sort(function (a, b) {
    return b.score - a.score
  })
  const limit = k > 0 ? Math.min(k, items.length) : items.length
  const out = []
  for (let i = 0; i < limit; i++) {
    out.push(items[i])
  }
  return out
}

export class CharPredictor {
  constructor(model, metaOverride) {
    if (!model || !model.labels) {
      throw new Error('CharPredictor requires a character model')
    }
    const meta = model.meta || metaOverride
    if (!meta || typeof meta.contextLength !== 'number') {
      throw new Error('CharPredictor requires model meta with contextLength')
    }
    this.contextLength = meta.contextLength
    this.labels = model.labels.slice()
    this.charToIndex = {}
    for (let i = 0; i < this.labels.length; i++) {
      this.charToIndex[this.labels[i]] = i
    }
    if (typeof this.charToIndex['<unk>'] !== 'number') {
      throw new Error('Character model is missing <unk> label')
    }
    if (typeof this.charToIndex['<s>'] !== 'number') {
      throw new Error('Character model is missing <s> label')
    }
    this.unkIndex = this.charToIndex['<unk>']
    this.startIndex = this.charToIndex['<s>']
    // v2 模型：输入是「每个字一条嵌入向量」拼起来，不再是 one-hot。
    this.embeddingDim = (model.dims && model.dims.embeddingDim) || 0
    this.embedding = this.embeddingDim > 0 ? model.weights.embedding : null
    if (this.embeddingDim > 0 && !this.embedding) {
      throw new Error('Character model declares embeddingDim but has no embedding weights')
    }
    this.inputWidth = this.embeddingDim > 0 ? this.embeddingDim : this.labels.length
    this.network = new FeedForwardNetwork(model)
    this.inputBuffer = createFloatArray(this.contextLength * this.inputWidth)
    this.modelMeta = meta
    this.modelName = model.name
    this.trained = model.trained === true
    this.format = model.format
  }

  getInfo() {
    const info = this.network.getModelInfo()
    info.contextLength = this.contextLength
    info.meta = this.modelMeta
    info.vocabSize = this.labels.length
    info.embeddingDim = this.embeddingDim
    return info
  }

  encodeContext(context) {
    const indices = []
    const text = typeof context === 'string' ? context : ''
    for (let i = 0; i < text.length; i++) {
      const index = this.charToIndex[text[i]]
      indices.push(typeof index === 'number' ? index : this.unkIndex)
    }
    const width = this.inputWidth
    for (let i = 0; i < this.inputBuffer.length; i++) {
      this.inputBuffer[i] = 0
    }
    if (this.embeddingDim > 0) {
      // 嵌入查表：把 C 个字的 d 维向量按顺序抄进输入缓冲，拼成 C*d 的一维向量。
      const embeddingDim = this.embeddingDim
      const table = this.embedding
      for (let position = 0; position < this.contextLength; position++) {
        const source = indices.length - this.contextLength + position
        const index = source >= 0 ? indices[source] : this.startIndex
        const rowOffset = index * embeddingDim
        const targetOffset = position * embeddingDim
        for (let d = 0; d < embeddingDim; d++) {
          this.inputBuffer[targetOffset + d] = table[rowOffset + d]
        }
      }
      return this.inputBuffer
    }
    for (let position = 0; position < this.contextLength; position++) {
      const source = indices.length - this.contextLength + position
      const index = source >= 0 ? indices[source] : this.startIndex
      this.inputBuffer[position * width + index] = 1
    }
    return this.inputBuffer
  }

  // 模型可能把 <s>/<unk>/<eos> 顶到第一名，这些不是能接下去的字，取下一个。
  bestTextIndex(scores) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < scores.length; i++) {
      const label = this.labels[i]
      if (label === '<s>' || label === '<unk>' || label === '<eos>') {
        continue
      }
      if (scores[i] > bestScore) {
        bestScore = scores[i]
        best = i
      }
    }
    return best
  }

  predict(context, k) {
    const input = this.encodeContext(context)
    const start = Date.now()
    const prediction = this.network.predict(input)
    const elapsedMs = Date.now() - start
    const top = topKFromScores(prediction.scores, this.labels, k || 3)
    const bestIndex = this.bestTextIndex(prediction.scores)
    const best = bestIndex >= 0 ? top[0] : null
    return {
      context: context,
      top: top,
      bestLabel: best ? best.label : prediction.bestLabel,
      bestScore: best ? best.score : prediction.bestScore,
      elapsedMs: elapsedMs,
    }
  }

  nextChar(context) {
    const input = this.encodeContext(context)
    const start = Date.now()
    const prediction = this.network.predict(input)
    const bestIndex = this.bestTextIndex(prediction.scores)
    return {
      label: bestIndex >= 0 ? this.labels[bestIndex] : prediction.bestLabel,
      score: bestIndex >= 0 ? prediction.scores[bestIndex] : prediction.bestScore,
      elapsedMs: Date.now() - start,
    }
  }

  predictAndAppend(context, k) {
    const result = this.predict(context, k)
    result.nextContext = context + result.bestLabel
    return result
  }

  predictTimed(context, repeats, k) {
    const count = repeats && repeats > 0 ? Math.floor(repeats) : 1
    const times = []
    let last = null
    for (let i = 0; i < count; i++) {
      const start = Date.now()
      last = this.predict(context, k)
      times.push(Date.now() - start)
    }
    let total = 0
    let min = times[0]
    let max = times[0]
    for (let i = 0; i < times.length; i++) {
      total += times[i]
      if (times[i] < min) {
        min = times[i]
      }
      if (times[i] > max) {
        max = times[i]
      }
    }
    return {
      result: last,
      times: times,
      totalMs: total,
      averageMs: total / times.length,
      minMs: min,
      maxMs: max,
    }
  }
}
