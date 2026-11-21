import { createFloatArray } from './matrix.js'

export const BINARY_MAGIC = 'TAI1'
export const BINARY_VERSION = 1
export const BINARY_HEADER_BYTES = 14
export const QUANT_MAGIC = 'TAI2'
export const QUANT_VERSION = 1
// v2：输入不再是 one-hot，而是「每个字一条嵌入向量」首尾拼起来，
// 所以二进制里多存一张 embedding 表，头也从 14 字节扩到 18 字节。
export const EMBED_BINARY_VERSION = 2
export const EMBED_HEADER_BYTES = 18

function requireObject(value, name) {
  if (!value || typeof value !== 'object') {
    throw new Error('Missing object: ' + name)
  }
}

function requirePositiveInt(value, name) {
  if (typeof value !== 'number' || value <= 0 || Math.floor(value) !== value) {
    throw new Error('Invalid ' + name + ': ' + value)
  }
}

function requireNumberArray(value, expectedLength, name) {
  if (!value || typeof value.length !== 'number') {
    throw new Error('Missing numeric array: ' + name)
  }
  if (value.length !== expectedLength) {
    throw new Error(
      'Array ' + name + ' has length ' + value.length + ', expected ' + expectedLength
    )
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'number' || !isFinite(value[i])) {
      throw new Error('Array ' + name + ' has an invalid value at index ' + i)
    }
  }
}

function toFloat32Array(value, expectedLength, name) {
  requireNumberArray(value, expectedLength, name)
  const out = createFloatArray(expectedLength)
  for (let i = 0; i < expectedLength; i++) {
    out[i] = value[i]
  }
  return out
}

function normalizeLabels(labels, outputSize) {
  if (!labels || typeof labels.length !== 'number' || labels.length !== outputSize) {
    throw new Error('labels length must equal output size')
  }
  const out = []
  for (let i = 0; i < labels.length; i++) {
    if (typeof labels[i] !== 'string' || labels[i].length === 0) {
      throw new Error('labels[' + i + '] must be a non-empty string')
    }
    out.push(labels[i])
  }
  return out
}

function normalizeTestCases(testCases, inputSize) {
  if (!testCases || typeof testCases.length !== 'number') {
    return []
  }
  const out = []
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    if (!testCase) {
      throw new Error('testCases[' + i + '] is invalid')
    }
    if (typeof testCase.context === 'string') {
      if (testCase.context.length === 0 || typeof testCase.expectedLabel !== 'string') {
        throw new Error('testCases[' + i + '] must have context and expectedLabel')
      }
      out.push({
        context: testCase.context,
        expectedLabel: testCase.expectedLabel,
      })
      continue
    }
    if (!testCase.input || testCase.input.length !== inputSize) {
      throw new Error('testCases[' + i + '].input length must equal input size')
    }
    if (typeof testCase.expectedLabel !== 'string') {
      throw new Error('testCases[' + i + '].expectedLabel must be a string')
    }
    const input = []
    for (let j = 0; j < inputSize; j++) {
      if (typeof testCase.input[j] !== 'number' || !isFinite(testCase.input[j])) {
        throw new Error('testCases[' + i + '].input[' + j + '] is invalid')
      }
      input.push(testCase.input[j])
    }
    out.push({
      input: input,
      expectedLabel: testCase.expectedLabel,
    })
  }
  return out
}

function normalizeDemoSeeds(demoSeeds) {
  if (!demoSeeds || typeof demoSeeds.length !== 'number') {
    return []
  }
  const out = []
  for (let i = 0; i < demoSeeds.length; i++) {
    const seed = demoSeeds[i]
    if (!seed || typeof seed.context !== 'string' || seed.context.length === 0) {
      throw new Error('demoSeeds[' + i + '].context must be a non-empty string')
    }
    out.push({
      context: seed.context,
      expectedLabel: typeof seed.expectedLabel === 'string' ? seed.expectedLabel : '',
    })
  }
  return out
}

export function parseModelObject(source) {
  requireObject(source, 'model')
  requireObject(source.dims, 'model.dims')
  requireObject(source.weights, 'model.weights')
  const input = source.dims.input
  const hidden = source.dims.hidden
  const output = source.dims.output
  const embeddingDim = source.dims.embeddingDim || 0
  requirePositiveInt(input, 'dims.input')
  requirePositiveInt(hidden, 'dims.hidden')
  requirePositiveInt(output, 'dims.output')
  if (input > 65535 || hidden > 65535 || output > 65535) {
    throw new Error('Model dimensions exceed the supported 16-bit limit')
  }
  if (embeddingDim > 0) {
    requirePositiveInt(embeddingDim, 'dims.embeddingDim')
    if (embeddingDim > 4096) {
      throw new Error('dims.embeddingDim is unreasonably large')
    }
    if (input % embeddingDim !== 0) {
      throw new Error('dims.input must be a multiple of dims.embeddingDim')
    }
  }

  const model = {
    format: source.format || 'tinyai-json-v1',
    version: source.version || 1,
    name: source.name || 'unnamed-model',
    trained: source.trained === true,
    note: source.note || '',
    dims: {
      input: input,
      hidden: hidden,
      output: output,
      embeddingDim: embeddingDim,
    },
    labels: normalizeLabels(source.labels, output),
    meta: source.meta || {},
    testCases: normalizeTestCases(source.testCases, input),
    demoSeeds: normalizeDemoSeeds(source.demoSeeds),
    weights: {
      inputHidden: toFloat32Array(
        source.weights.inputHidden,
        hidden * input,
        'weights.inputHidden'
      ),
      hiddenBias: toFloat32Array(source.weights.hiddenBias, hidden, 'weights.hiddenBias'),
      hiddenOutput: toFloat32Array(
        source.weights.hiddenOutput,
        output * hidden,
        'weights.hiddenOutput'
      ),
      outputBias: toFloat32Array(source.weights.outputBias, output, 'weights.outputBias'),
      embedding:
        embeddingDim > 0
          ? toFloat32Array(
              source.weights.embedding,
              output * embeddingDim,
              'weights.embedding'
            )
          : null,
    },
  }
  return model
}

export function loadFromJsonText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Model JSON text is empty')
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error('Model JSON parse failed: ' + error.message)
  }
  const model = parseModelObject(parsed)
  model.format = parsed.format || 'tinyai-json-v1'
  model.source = 'json-text'
  return model
}

function toUint8View(bufferInput) {
  if (!bufferInput) {
    throw new Error('Binary model input is empty')
  }
  if (typeof Uint8Array !== 'function') {
    throw new Error('Uint8Array is unavailable')
  }
  if (typeof ArrayBuffer !== 'undefined' && bufferInput instanceof ArrayBuffer) {
    return new Uint8Array(bufferInput)
  }
  if (bufferInput.buffer && typeof bufferInput.byteLength === 'number') {
    return new Uint8Array(bufferInput.buffer, bufferInput.byteOffset || 0, bufferInput.byteLength)
  }
  if (typeof bufferInput.length === 'number') {
    const out = new Uint8Array(bufferInput.length)
    for (let i = 0; i < bufferInput.length; i++) {
      out[i] = bufferInput[i]
    }
    return out
  }
  throw new Error('Unsupported binary model input type')
}

export function decodeUtf8(bytes, start, length) {
  let result = ''
  let i = start
  const end = start + length
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

export function parseBinaryModel(bufferInput) {
  const bytes = toUint8View(bufferInput)
  if (bytes.length < BINARY_HEADER_BYTES) {
    throw new Error('Binary model is shorter than the 14-byte header')
  }
  if (typeof DataView !== 'function') {
    throw new Error('DataView is unavailable')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic =
    String.fromCharCode(bytes[0]) +
    String.fromCharCode(bytes[1]) +
    String.fromCharCode(bytes[2]) +
    String.fromCharCode(bytes[3])
  if (magic === QUANT_MAGIC) {
    return parseQuantizedBinary(bytes, view)
  }
  if (magic !== BINARY_MAGIC) {
    throw new Error('Invalid binary model magic: ' + magic)
  }
  const version = view.getUint16(4, true)
  if (version === EMBED_BINARY_VERSION) {
    return parseEmbeddingBinary(bytes, view)
  }
  if (version !== BINARY_VERSION) {
    throw new Error('Unsupported binary model version: ' + version)
  }
  const input = view.getUint16(6, true)
  const hidden = view.getUint16(8, true)
  const output = view.getUint16(10, true)
  const labelCount = view.getUint16(12, true)
  requirePositiveInt(input, 'binary input')
  requirePositiveInt(hidden, 'binary hidden')
  requirePositiveInt(output, 'binary output')
  if (labelCount !== output) {
    throw new Error('Binary label count ' + labelCount + ' does not match output ' + output)
  }

  const ihLength = hidden * input
  const hoLength = output * hidden
  const floatCount = ihLength + hidden + hoLength + output
  let offset = BINARY_HEADER_BYTES
  if (offset + floatCount * 4 > bytes.length) {
    throw new Error('Binary model weight section is truncated')
  }

  const inputHidden = createFloatArray(ihLength)
  const hiddenBias = createFloatArray(hidden)
  const hiddenOutput = createFloatArray(hoLength)
  const outputBias = createFloatArray(output)
  const sections = [inputHidden, hiddenBias, hiddenOutput, outputBias]
  for (let s = 0; s < sections.length; s++) {
    const target = sections[s]
    for (let i = 0; i < target.length; i++) {
      target[i] = view.getFloat32(offset, true)
      offset += 4
    }
  }

  const labels = []
  for (let i = 0; i < labelCount; i++) {
    if (offset + 2 > bytes.length) {
      throw new Error('Binary model label section is truncated')
    }
    const length = view.getUint16(offset, true)
    offset += 2
    if (offset + length > bytes.length) {
      throw new Error('Binary model label ' + i + ' is truncated')
    }
    labels.push(decodeUtf8(bytes, offset, length))
    offset += length
  }

  return {
    format: 'tinyai-binary-v1',
    version: version,
    name: 'TAI1 binary model',
    trained: false,
    note: 'Binary format does not store training metadata; not claimed as trained.',
    source: 'binary',
    dims: {
      input: input,
      hidden: hidden,
      output: output,
    },
    labels: labels,
    weights: {
      inputHidden: inputHidden,
      hiddenBias: hiddenBias,
      hiddenOutput: hiddenOutput,
      outputBias: outputBias,
    },
    binaryBytes: bytes.length,
  }
}
function parseQuantizedBinary(bytes, view) {
  const version = view.getUint16(4, true)
  if (version === EMBED_BINARY_VERSION) {
    return parseQuantizedEmbeddingBinary(bytes, view)
  }
  if (version !== QUANT_VERSION) {
    throw new Error('Unsupported quantized model version: ' + version)
  }
  const input = view.getUint16(6, true)
  const hidden = view.getUint16(8, true)
  const output = view.getUint16(10, true)
  const labelCount = view.getUint16(12, true)
  requirePositiveInt(input, 'quantized input')
  requirePositiveInt(hidden, 'quantized hidden')
  requirePositiveInt(output, 'quantized output')
  if (labelCount !== output) {
    throw new Error('Quantized label count does not match output')
  }

  let offset = BINARY_HEADER_BYTES

  function readFloatArray(length, name) {
    if (offset + length * 4 > bytes.length) {
      throw new Error('Quantized model section is truncated: ' + name)
    }
    const out = createFloatArray(length)
    for (let i = 0; i < length; i++) {
      out[i] = view.getFloat32(offset, true)
      offset += 4
    }
    return out
  }

  const scaleIH = readFloatArray(hidden, 'scaleIH')
  if (offset + hidden * input > bytes.length) {
    throw new Error('Quantized model section is truncated: qIH')
  }
  const inputHidden = createFloatArray(hidden * input)
  for (let row = 0; row < hidden; row++) {
    const rowOffset = row * input
    const scale = scaleIH[row]
    for (let col = 0; col < input; col++) {
      inputHidden[rowOffset + col] = view.getInt8(offset) * scale
      offset++
    }
  }

  const hiddenBias = readFloatArray(hidden, 'hiddenBias')
  const scaleHO = readFloatArray(output, 'scaleHO')
  if (offset + output * hidden > bytes.length) {
    throw new Error('Quantized model section is truncated: qHO')
  }
  const hiddenOutput = createFloatArray(output * hidden)
  for (let row = 0; row < output; row++) {
    const rowOffset = row * hidden
    const scale = scaleHO[row]
    for (let col = 0; col < hidden; col++) {
      hiddenOutput[rowOffset + col] = view.getInt8(offset) * scale
      offset++
    }
  }

  const outputBias = readFloatArray(output, 'outputBias')

  const labels = []
  for (let i = 0; i < labelCount; i++) {
    if (offset + 2 > bytes.length) {
      throw new Error('Quantized model label section is truncated')
    }
    const length = view.getUint16(offset, true)
    offset += 2
    if (offset + length > bytes.length) {
      throw new Error('Quantized model label ' + i + ' is truncated')
    }
    labels.push(decodeUtf8(bytes, offset, length))
    offset += length
  }

  return {
    format: 'tinyai-int8-v1',
    version: version,
    name: 'TAI2 int8 model',
    trained: false,
    note: 'Int8 quantized with per-row scales; training metadata comes from the meta module.',
    source: 'quantized-binary',
    dims: {
      input: input,
      hidden: hidden,
      output: output,
    },
    labels: labels,
    weights: {
      inputHidden: inputHidden,
      hiddenBias: hiddenBias,
      hiddenOutput: hiddenOutput,
      outputBias: outputBias,
    },
    binaryBytes: bytes.length,
  }
}

// ---------- v2：带字嵌入的 float32 模型 ----------
function readEmbedHeader(bytes, view, kind) {
  const version = view.getUint16(4, true)
  if (version !== EMBED_BINARY_VERSION) {
    throw new Error('Unsupported ' + kind + ' model version: ' + version)
  }
  const input = view.getUint16(6, true)
  const hidden = view.getUint16(8, true)
  const output = view.getUint16(10, true)
  const labelCount = view.getUint16(12, true)
  const embeddingDim = view.getUint16(14, true)
  const embeddingCount = view.getUint16(16, true)
  requirePositiveInt(input, kind + ' input')
  requirePositiveInt(hidden, kind + ' hidden')
  requirePositiveInt(output, kind + ' output')
  requirePositiveInt(embeddingDim, kind + ' embeddingDim')
  if (labelCount !== output) {
    throw new Error(kind + ' label count does not match output')
  }
  if (embeddingCount !== output) {
    throw new Error(kind + ' embedding row count does not match output')
  }
  if (input % embeddingDim !== 0) {
    throw new Error(kind + ' input is not a multiple of embeddingDim')
  }
  return {
    input: input,
    hidden: hidden,
    output: output,
    embeddingDim: embeddingDim,
    embeddingCount: embeddingCount,
    labelCount: labelCount,
  }
}

function readLabelSection(bytes, view, offset, labelCount, kind) {
  const labels = []
  for (let i = 0; i < labelCount; i++) {
    if (offset + 2 > bytes.length) {
      throw new Error(kind + ' label section is truncated')
    }
    const length = view.getUint16(offset, true)
    offset += 2
    if (offset + length > bytes.length) {
      throw new Error(kind + ' label ' + i + ' is truncated')
    }
    labels.push(decodeUtf8(bytes, offset, length))
    offset += length
  }
  return labels
}

export function parseEmbeddingBinary(bytes, view) {
  const header = readEmbedHeader(bytes, view, 'embedding')
  const { input, hidden, output, embeddingDim, embeddingCount, labelCount } = header
  const floatCount = embeddingCount * embeddingDim + hidden * input + hidden + output * hidden + output
  let offset = EMBED_HEADER_BYTES
  if (offset + floatCount * 4 > bytes.length) {
    throw new Error('Embedding binary weight section is truncated')
  }

  function readFloats(length) {
    const out = createFloatArray(length)
    for (let i = 0; i < length; i++) {
      out[i] = view.getFloat32(offset, true)
      offset += 4
    }
    return out
  }

  const embedding = readFloats(embeddingCount * embeddingDim)
  const inputHidden = readFloats(hidden * input)
  const hiddenBias = readFloats(hidden)
  const hiddenOutput = readFloats(output * hidden)
  const outputBias = readFloats(output)
  const labels = readLabelSection(bytes, view, offset, labelCount, 'Embedding binary')

  return {
    format: 'tinyai-binary-v2',
    version: EMBED_BINARY_VERSION,
    name: 'TAI1 v2 embedding model',
    trained: false,
    note: 'Binary format does not store training metadata; not claimed as trained.',
    source: 'binary',
    dims: {
      input: input,
      hidden: hidden,
      output: output,
      embeddingDim: embeddingDim,
    },
    labels: labels,
    weights: {
      embedding: embedding,
      inputHidden: inputHidden,
      hiddenBias: hiddenBias,
      hiddenOutput: hiddenOutput,
      outputBias: outputBias,
    },
    binaryBytes: bytes.length,
  }
}

export function parseQuantizedEmbeddingBinary(bytes, view) {
  const header = readEmbedHeader(bytes, view, 'quantized embedding')
  const { input, hidden, output, embeddingDim, embeddingCount, labelCount } = header
  let offset = EMBED_HEADER_BYTES

  function readFloats(length, name) {
    if (offset + length * 4 > bytes.length) {
      throw new Error('Quantized embedding section is truncated: ' + name)
    }
    const out = createFloatArray(length)
    for (let i = 0; i < length; i++) {
      out[i] = view.getFloat32(offset, true)
      offset += 4
    }
    return out
  }

  function readQuantizedRows(rows, cols, name) {
    const scales = readFloats(rows, name + '.scales')
    if (offset + rows * cols > bytes.length) {
      throw new Error('Quantized embedding section is truncated: ' + name + '.values')
    }
    const values = createFloatArray(rows * cols)
    for (let row = 0; row < rows; row++) {
      const rowOffset = row * cols
      const scale = scales[row]
      for (let col = 0; col < cols; col++) {
        values[rowOffset + col] = view.getInt8(offset) * scale
        offset++
      }
    }
    return values
  }

  const embedding = readQuantizedRows(embeddingCount, embeddingDim, 'embedding')
  const inputHidden = readQuantizedRows(hidden, input, 'inputHidden')
  const hiddenBias = readFloats(hidden, 'hiddenBias')
  const hiddenOutput = readQuantizedRows(output, hidden, 'hiddenOutput')
  const outputBias = readFloats(output, 'outputBias')
  const labels = readLabelSection(bytes, view, offset, labelCount, 'Quantized embedding')

  return {
    format: 'tinyai-int8-v2',
    version: EMBED_BINARY_VERSION,
    name: 'TAI2 v2 int8 embedding model',
    trained: false,
    note: 'Int8 quantized with per-row scales; training metadata comes from the meta module.',
    source: 'quantized-binary',
    dims: {
      input: input,
      hidden: hidden,
      output: output,
      embeddingDim: embeddingDim,
    },
    labels: labels,
    weights: {
      embedding: embedding,
      inputHidden: inputHidden,
      hiddenBias: hiddenBias,
      hiddenOutput: hiddenOutput,
      outputBias: outputBias,
    },
    binaryBytes: bytes.length,
  }
}
