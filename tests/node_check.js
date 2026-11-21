import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMatrixSelfTest } from '../src/ai/matrix.js'
import { FeedForwardNetwork } from '../src/ai/neural_network.js'
import { loadFromJsonText, parseBinaryModel } from '../src/ai/model_loader.js'
import testModelText from '../src/assets/test_model.js'
import embeddedBinary from '../src/assets/test_model_bin.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const failures = []
let checks = 0

function check(name, condition, detail) {
  checks++
  if (condition) {
    console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  } else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

function close(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance
}

const matrix = runMatrixSelfTest()
check('matrix self-test', matrix.ok, matrix.passed + '/' + matrix.total)
for (const item of matrix.checks) {
  if (!item.ok) {
    console.log('  matrix detail: ' + item.name + ' actual=' + item.actual + ' expected=' + item.expected)
  }
}

const model = loadFromJsonText(testModelText)
check('JSON model name', model.name === 'TEST_MODEL_HANDCRAFTED_V1', model.name)
check('JSON model trained flag', model.trained === false, String(model.trained))
check('JSON model dims', model.dims.input === 6 && model.dims.hidden === 8 && model.dims.output === 5)
check('JSON model labels', model.labels.join('') === '你好世界机', model.labels.join(' '))
check('JSON test cases', model.testCases.length === 3, String(model.testCases.length))

const network = new FeedForwardNetwork(model)
for (const testCase of model.testCases) {
  const prediction = network.predict(testCase.input)
  check(
    'predict ' + testCase.input.join(',') + ' -> ' + testCase.expectedLabel,
    prediction.bestLabel === testCase.expectedLabel,
    prediction.bestLabel + ' ' + Number(prediction.bestScore).toFixed(4)
  )
  let sum = 0
  for (let i = 0; i < prediction.scores.length; i++) {
    sum += prediction.scores[i]
  }
  check('softmax sum ' + testCase.expectedLabel, close(sum, 1, 1e-6), sum.toFixed(8))
}

const first = network.predict(model.testCases[0].input)
const firstScores = Array.from(first.scores)
network.predict(model.testCases[1].input)
check(
  'prediction snapshot is not overwritten',
  firstScores.every((value, index) => close(value, first.scores[index], 1e-9)),
  'saved=' + firstScores.map((v) => v.toFixed(4)).join(',')
)

const binary = parseBinaryModel(embeddedBinary)
check('binary model dims', binary.dims.input === 6 && binary.dims.hidden === 8 && binary.dims.output === 5)
check('binary model labels', binary.labels.join('') === '你好世界机', binary.labels.join(' '))
const binaryBytes = fs.readFileSync(path.join(root, 'src', 'assets', 'test_model.bin'))
check('binary file size', binaryBytes.length === embeddedBinary.length, String(binaryBytes.length))

const binaryNetwork = new FeedForwardNetwork(binary)
for (const testCase of model.testCases) {
  const jsonPrediction = network.predict(testCase.input)
  const binaryPrediction = binaryNetwork.predict(testCase.input)
  check(
    'binary prediction matches JSON for ' + testCase.expectedLabel,
    jsonPrediction.bestIndex === binaryPrediction.bestIndex &&
      close(jsonPrediction.bestScore, binaryPrediction.bestScore, 1e-6),
    binaryPrediction.bestLabel
  )
}

let badMagicRejected = false
try {
  const bad = new Uint8Array(embeddedBinary.length)
  bad.set(embeddedBinary)
  bad[0] = 0
  parseBinaryModel(bad)
} catch (error) {
  badMagicRejected = true
}
check('binary bad magic rejected', badMagicRejected)

let truncatedRejected = false
try {
  parseBinaryModel(new Uint8Array([84, 65, 73, 49]))
} catch (error) {
  truncatedRejected = true
}
check('binary truncated rejected', truncatedRejected)

const timed = network.predictTimed(model.testCases[0].input, 5)
check('timed prediction', timed.prediction.bestLabel === '你', String(timed.times))
check('timed repeatable', timed.times.length === 5)

const jsonFile = JSON.parse(fs.readFileSync(path.join(root, 'src', 'assets', 'test_model.json'), 'utf8'))
check('JSON asset matches JS module', JSON.stringify(jsonFile) === JSON.stringify(JSON.parse(testModelText)))
check('binary asset size on disk', fs.statSync(path.join(root, 'src', 'assets', 'test_model.bin')).size === binaryBytes.length)

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL NODE CHECKS PASSED')
