import { loadFromJsonText, parseBinaryModel } from '../src/ai/model_loader.js'
import { CharPredictor } from '../src/ai/char_predictor.js'
import { base64ToBytes } from '../src/ai/base64.js'
import charModelText from '../src/assets/char_model.js'
import charModelBase64 from '../src/assets/char_model_b64.js'
import charMeta from '../src/assets/char_model_meta.js'

let checks = 0
const failures = []

function check(name, condition, detail) {
  checks++
  if (condition) {
    console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  } else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

const jsonModel = loadFromJsonText(charModelText)
check('JSON model trained', jsonModel.trained === true, String(jsonModel.trained))
check('JSON model format', jsonModel.format === charMeta.format, jsonModel.format)
// v1 的输入是 one-hot（每个字 vocabSize 维），v2 的输入是嵌入（每个字 embeddingDim 维）。
const jsonInputWidth = jsonModel.dims.embeddingDim || jsonModel.labels.length
check(
  'JSON model dims',
  jsonModel.dims.input === jsonModel.meta.contextLength * jsonInputWidth &&
    jsonModel.dims.hidden === jsonModel.meta.hiddenSize &&
    jsonModel.dims.output === jsonModel.labels.length,
  jsonModel.dims.input + 'x' + jsonModel.dims.hidden + 'x' + jsonModel.dims.output
)
check('JSON model labels', jsonModel.labels.length === jsonModel.meta.vocabSize, String(jsonModel.labels.length))
check(
  'JSON model meta context',
  jsonModel.meta.contextLength === charMeta.meta.contextLength && jsonModel.meta.contextLength > 0,
  String(jsonModel.meta.contextLength)
)
check(
  'JSON model demo seeds',
  jsonModel.demoSeeds.length >= 4 && jsonModel.demoSeeds.length === charMeta.demoSeeds.length,
  String(jsonModel.demoSeeds.length)
)

const jsonPredictor = new CharPredictor(jsonModel)
for (const seed of jsonModel.demoSeeds) {
  const result = jsonPredictor.predict(seed.context, 3)
  check(
    'demo ' + seed.context + ' -> ' + seed.expectedLabel,
    result.bestLabel === seed.expectedLabel,
    result.bestLabel + ' ' + (result.bestScore * 100).toFixed(2) + '%'
  )
  check(
    'top3 sorted ' + seed.context,
    result.top.length === 3 &&
      result.top[0].score >= result.top[1].score &&
      result.top[1].score >= result.top[2].score,
    result.top.map((item) => item.label + ':' + item.score.toFixed(4)).join(' ')
  )
}

for (const testCase of jsonModel.testCases) {
  const result = jsonPredictor.predict(testCase.context, 1)
  check(
    'testCase ' + testCase.context + ' -> ' + testCase.expectedLabel,
    result.bestLabel === testCase.expectedLabel,
    result.bestLabel
  )
}

const bytes = base64ToBytes(charModelBase64)
check('base64 decodes model binary', bytes.length === charMeta.binaryBytes, String(bytes.length))
const binaryModel = parseBinaryModel(bytes)
const binaryPredictor = new CharPredictor(binaryModel, charMeta.meta)
check(
  'binary dims',
  binaryModel.dims.input === jsonModel.dims.input &&
    binaryModel.dims.hidden === jsonModel.dims.hidden &&
    binaryModel.dims.output === jsonModel.dims.output
)
check('binary labels', binaryModel.labels.join('') === jsonModel.labels.join(''))

for (const seed of jsonModel.demoSeeds) {
  const jsonResult = jsonPredictor.predict(seed.context, 1)
  const binaryResult = binaryPredictor.predict(seed.context, 1)
  check(
    'binary matches JSON ' + seed.context,
    jsonResult.bestLabel === binaryResult.bestLabel &&
      Math.abs(jsonResult.bestScore - binaryResult.bestScore) < 1e-6,
    binaryResult.bestLabel
  )
}

let sum = 0
const raw = jsonPredictor.network.predict(jsonPredictor.encodeContext(jsonModel.demoSeeds[0].context))
for (let i = 0; i < raw.scores.length; i++) {
  sum += raw.scores[i]
}
check('candidate scores sum to 1', Math.abs(sum - 1) < 1e-4, sum.toFixed(6))

const timed = jsonPredictor.predictTimed(jsonModel.demoSeeds[0].context, 20, 3)
check('timed inference', timed.result.bestLabel === jsonModel.demoSeeds[0].expectedLabel, timed.averageMs.toFixed(2) + 'ms avg')
check(
  'timing fields',
  timed.times.length === 20 &&
    timed.minMs <= timed.averageMs &&
    timed.maxMs >= timed.averageMs,
  timed.minMs + '/' + timed.averageMs.toFixed(2) + '/' + timed.maxMs
)

check('meta train accuracy recorded', typeof charMeta.meta.trainTop1 === 'number', String(charMeta.meta.trainTop1))
check('meta val accuracy recorded', typeof charMeta.meta.valTop1 === 'number', String(charMeta.meta.valTop1))
check('meta parameter count', charMeta.meta.parameterCount === jsonModel.meta.parameterCount, String(charMeta.meta.parameterCount))
check('binary asset size', bytes.length === charMeta.binaryBytes, String(bytes.length))

console.log('')
console.log('Meta: train top1=' + (charMeta.meta.trainTop1 * 100).toFixed(2) + '% val top1=' + (charMeta.meta.valTop1 * 100).toFixed(2) + '%')
console.log('Model: ' + charModelBase64.length + ' base64 chars, ' + bytes.length + ' binary bytes')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL CHAR MODEL CHECKS PASSED')
