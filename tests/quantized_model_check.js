import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFromJsonText, parseBinaryModel } from '../src/ai/model_loader.js'
import { CharPredictor } from '../src/ai/char_predictor.js'
import charModelText from '../src/assets/char_model.js'
import quantMeta from '../src/assets/char_model_q_meta.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const qBytes = fs.readFileSync(path.join(root, 'src', 'assets', 'char_model_q.bin'))

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
const qModel = parseBinaryModel(qBytes)
const jsonPredictor = new CharPredictor(jsonModel, jsonModel.meta)
const qPredictor = new CharPredictor(qModel, quantMeta.meta)

// v2 的输入宽度是 embeddingDim，不再是 vocabSize。
const quantInputWidth = qModel.dims.embeddingDim || qModel.labels.length
check(
  'quantized dims',
  qModel.dims.input === quantMeta.meta.contextLength * quantInputWidth &&
    qModel.dims.hidden === quantMeta.meta.hiddenSize &&
    qModel.dims.output === qModel.labels.length
)
check('quantized labels', qModel.labels.join('') === jsonModel.labels.join(''))
check('quantized size', quantMeta.binaryBytes === qBytes.length, String(quantMeta.binaryBytes))
check(
  'size reduction',
  quantMeta.binaryBytes < quantMeta.originalBytes,
  String(quantMeta.binaryBytes) + '/' + String(quantMeta.originalBytes)
)

let maxDiff = 0
for (const seed of jsonModel.demoSeeds) {
  const jsonResult = jsonPredictor.predict(seed.context, 1)
  const qResult = qPredictor.predict(seed.context, 1)
  const diff = Math.abs(jsonResult.bestScore - qResult.bestScore)
  if (diff > maxDiff) {
    maxDiff = diff
  }
  check(
    'demo ' + seed.context + ' -> ' + seed.expectedLabel,
    qResult.bestLabel === seed.expectedLabel && jsonResult.bestLabel === seed.expectedLabel,
    qResult.bestLabel + ' / ' + jsonResult.bestLabel + ' diff=' + diff.toFixed(4)
  )
}

for (const testCase of jsonModel.testCases) {
  const jsonResult = jsonPredictor.predict(testCase.context, 1)
  const qResult = qPredictor.predict(testCase.context, 1)
  const diff = Math.abs(jsonResult.bestScore - qResult.bestScore)
  if (diff > maxDiff) {
    maxDiff = diff
  }
  check(
    'testCase ' + testCase.context + ' -> ' + testCase.expectedLabel,
    qResult.bestLabel === testCase.expectedLabel && jsonResult.bestLabel === testCase.expectedLabel,
    qResult.bestLabel + ' / ' + jsonResult.bestLabel + ' diff=' + diff.toFixed(4)
  )
}

for (const query of ['你好', '明天', '春天', '花开']) {
  const jsonResult = jsonPredictor.predict(query, 1)
  const qResult = qPredictor.predict(query, 1)
  const diff = Math.abs(jsonResult.bestScore - qResult.bestScore)
  if (diff > maxDiff) {
    maxDiff = diff
  }
  check(
    'generation seed ' + query,
    qResult.bestLabel.length > 0,
    qResult.bestLabel + ' diff=' + diff.toFixed(4)
  )
}

check('max score diff acceptable', maxDiff < 0.1, maxDiff.toFixed(6))

const timed = qPredictor.predictTimed(jsonModel.demoSeeds[0].context, 20, 1)
check('quantized timed inference', timed.result.bestLabel === jsonModel.demoSeeds[0].expectedLabel, timed.averageMs.toFixed(3) + 'ms avg')

let badRejected = false
try {
  const bad = Buffer.from(qBytes)
  bad[0] = 0
  parseBinaryModel(bad)
} catch (error) {
  badRejected = true
}
check('bad quantized magic rejected', badRejected)

console.log('')
console.log('Quantized: ' + quantMeta.binaryBytes + ' bytes vs float32 ' + quantMeta.originalBytes + ' bytes')
console.log('Max score diff: ' + maxDiff.toFixed(6))
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL QUANTIZED MODEL CHECKS PASSED')
