import {
  matVecInto,
  addBiasInPlace,
  reluInPlace,
  softmaxInPlace,
  argMax,
  createFloatArray,
} from './matrix.js'

function assertPositiveInt(value, name) {
  if (typeof value !== 'number' || value <= 0 || Math.floor(value) !== value) {
    throw new Error('Invalid ' + name + ': ' + value)
  }
}

function assertFloatArray(value, expectedLength, name) {
  if (!value || typeof value.length !== 'number') {
    throw new Error('Missing model array: ' + name)
  }
  if (value.length !== expectedLength) {
    throw new Error(
      'Model array ' + name + ' has length ' + value.length + ', expected ' + expectedLength
    )
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'number' || !isFinite(value[i])) {
      throw new Error('Model array ' + name + ' contains a non-finite value at ' + i)
    }
  }
}

function toFloat32(value, expectedLength, name) {
  assertFloatArray(value, expectedLength, name)
  if (typeof Float32Array === 'function' && value instanceof Float32Array) {
    return value
  }
  const out = createFloatArray(expectedLength)
  for (let i = 0; i < expectedLength; i++) {
    out[i] = value[i]
  }
  return out
}

export class FeedForwardNetwork {
  constructor(model) {
    if (!model || !model.dims || !model.weights) {
      throw new Error('FeedForwardNetwork requires a model object')
    }
    const inputSize = model.dims.input
    const hiddenSize = model.dims.hidden
    const outputSize = model.dims.output
    assertPositiveInt(inputSize, 'dims.input')
    assertPositiveInt(hiddenSize, 'dims.hidden')
    assertPositiveInt(outputSize, 'dims.output')
    if (!model.labels || model.labels.length !== outputSize) {
      throw new Error('Model labels length must equal output size')
    }

    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.outputSize = outputSize
    this.labels = model.labels.slice()
    this.modelName = model.name || 'unnamed-model'
    this.trained = model.trained === true
    this.format = model.format || 'unknown'
    this.weightsIH = toFloat32(
      model.weights.inputHidden,
      hiddenSize * inputSize,
      'inputHidden'
    )
    this.biasH = toFloat32(model.weights.hiddenBias, hiddenSize, 'hiddenBias')
    this.weightsHO = toFloat32(
      model.weights.hiddenOutput,
      outputSize * hiddenSize,
      'hiddenOutput'
    )
    this.biasO = toFloat32(model.weights.outputBias, outputSize, 'outputBias')

    this.hiddenBuffer = createFloatArray(hiddenSize)
    this.outputBuffer = createFloatArray(outputSize)
    this.forwardCount = 0
    this.lastHidden = null
  }

  getModelInfo() {
    return {
      name: this.modelName,
      trained: this.trained,
      format: this.format,
      input: this.inputSize,
      hidden: this.hiddenSize,
      output: this.outputSize,
      labels: this.labels.slice(),
    }
  }

  predict(input) {
    if (!input || input.length !== this.inputSize) {
      throw new Error(
        'Input size mismatch: expected ' + this.inputSize + ', got ' + (input ? input.length : 0)
      )
    }
    for (let i = 0; i < input.length; i++) {
      if (typeof input[i] !== 'number' || !isFinite(input[i])) {
        throw new Error('Input contains a non-finite value at ' + i)
      }
    }

    const hidden = this.hiddenBuffer
    matVecInto(this.weightsIH, this.hiddenSize, this.inputSize, input, hidden)
    addBiasInPlace(hidden, this.biasH, 1, this.hiddenSize)
    reluInPlace(hidden)

    const scores = this.outputBuffer
    matVecInto(this.weightsHO, this.outputSize, this.hiddenSize, hidden, scores)
    addBiasInPlace(scores, this.biasO, 1, this.outputSize)
    softmaxInPlace(scores)

    const bestIndex = argMax(scores)
    const snapshot = createFloatArray(this.outputSize)
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i] = scores[i]
    }
    this.forwardCount++
    this.lastHidden = hidden

    return {
      bestIndex: bestIndex,
      bestLabel: this.labels[bestIndex],
      bestScore: snapshot[bestIndex],
      scores: snapshot,
      labels: this.labels,
    }
  }

  predictTimed(input, repeats) {
    const count = repeats && repeats > 0 ? Math.floor(repeats) : 1
    const times = []
    let prediction = null
    for (let i = 0; i < count; i++) {
      const start = Date.now()
      prediction = this.predict(input)
      const end = Date.now()
      times.push(end - start)
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
      prediction: prediction,
      times: times,
      totalMs: total,
      averageMs: total / times.length,
      minMs: min,
      maxMs: max,
    }
  }
}
