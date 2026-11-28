import fs from 'node:fs'
import path from 'node:path'
import { SimpleKnowledgeBase } from '../src/ai/simple_kb.js'
import { CategoryKnowledgeBase, parseCategoryRouter } from '../src/ai/category_kb.js'
import { KB_DOMAINS } from '../src/ai/kb_domains.js'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'
import { packEntries, encodePackedPayload } from '../scripts/kb_pack.mjs'
import { normalizeBinaryResult } from '../src/platform/binary_result.js'

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

const samples = [
  {
    id: 'k2-science-water',
    question: '\u6c34\u7684\u5316\u5b66\u5f0f\u662f\u4ec0\u4e48',
    answer: '\u6c34\u7684\u5316\u5b66\u5f0f\u662fH2O\uff0c\u6bcf\u4e2a\u6c34\u5206\u5b50\u7531\u4e24\u4e2a\u6c22\u539f\u5b50\u548c\u4e00\u4e2a\u6c27\u539f\u5b50\u6784\u6210\u3002',
    keywords: ['\u6c34', '\u5316\u5b66\u5f0f', 'H2O'],
  },
  {
    id: 'k2-science-photosynthesis',
    question: '\u690d\u7269\u600e\u4e48\u5236\u9020\u517b\u6599',
    answer: '\u690d\u7269\u901a\u8fc7\u5149\u5408\u4f5c\u7528\uff0c\u5229\u7528\u5149\u80fd\u628a\u4e8c\u6c27\u5316\u78b3\u548c\u6c34\u5236\u6210\u6709\u673a\u7269\uff0c\u5e76\u91ca\u653e\u6c27\u6c14\u3002',
    keywords: ['\u5149\u5408\u4f5c\u7528', '\u690d\u7269', '\u517b\u6599'],
  },
]

const payload = packEntries(samples)
const jsonBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
const binary = encodePackedPayload(payload)
check('encoder returns ArrayBuffer', binary instanceof ArrayBuffer, String(binary && binary.byteLength))
check('binary payload is smaller than JSON', binary.byteLength < jsonBytes, binary.byteLength + '/' + jsonBytes)

const wrappedBinary = normalizeBinaryResult({ buffer: binary })
check('native file result wrapper is unwrapped', wrappedBinary === binary, String(wrappedBinary && wrappedBinary.byteLength))
const wrappedWithLength = normalizeBinaryResult({ buffer: binary, length: binary.byteLength })
check('native wrapper with length is unwrapped', wrappedWithLength === binary, String(wrappedWithLength && wrappedWithLength.byteLength))
const wrappedKb = new SimpleKnowledgeBase(wrappedBinary)
check('wrapped binary constructor keeps all entries', wrappedKb.entryCount === samples.length, String(wrappedKb.entryCount))

const smallKb = new SimpleKnowledgeBase(binary)
check('binary constructor keeps all entries', smallKb.entryCount === samples.length, String(smallKb.entryCount))
check('binary constructor decodes records', smallKb.findEntryById('k2-science-water')?.question === samples[0].question)
check('binary constructor keeps inverted lookup', smallKb.query('\u6c34\u7684\u5316\u5b66\u5f0f\u662f\u4ec0\u4e48', 1).top[0]?.id === 'k2-science-water')

const routerFile = path.resolve('src/assets/kb_router.bin')
const shardDir = path.resolve('src/assets/kb_shards')
const fullShardFile = path.resolve('src/assets/kb_all.bin')
check('category router exists', fs.existsSync(routerFile), routerFile)
check('monolithic runtime shard is not generated', !fs.existsSync(fullShardFile), fullShardFile)

const routerBytes = fs.readFileSync(routerFile)
const router = parseCategoryRouter(routerBytes)
check('router contains at least the release floor', router.questionCount === KB_RELEASE_MANIFEST.targetEntries, String(router.questionCount))
check('router uses the declared domains', router.domains.length === KB_DOMAINS.length && router.domains.every((domain, index) => domain === KB_DOMAINS[index]), router.domains.join(','))

let shardTotal = 0
let validShards = 0
for (let i = 0; i < KB_DOMAINS.length; i++) {
  const domain = KB_DOMAINS[i]
  const file = path.join(shardDir, domain + '.bin')
  if (!fs.existsSync(file)) continue
  const bytes = fs.readFileSync(file)
  const shardKb = new SimpleKnowledgeBase(bytes)
  if (shardKb.entryCount === router.domainCounts[i]) validShards++
  shardTotal += bytes.length
}
check('all domain shards exist and match router counts', validShards === KB_DOMAINS.length, validShards + '/' + KB_DOMAINS.length)

const totalBytes = routerBytes.length + shardTotal
check('router and shards fit package budget', totalBytes <= KB_RELEASE_MANIFEST.maxPackageBytes, totalBytes + ' bytes')
check('legacy monolithic binary is gone', !fs.existsSync(path.resolve('src/assets/kb_1500.bin')))

const pageSource = fs.readFileSync('src/pages/Home/index.ux', 'utf8')
check('page reads the category router', pageSource.includes("fileReadArrayBuffer('/assets/kb_router.bin'"))
check('page uses CategoryKnowledgeBase', pageSource.includes('new CategoryKnowledgeBase(binary)'))
check('page no longer reads the monolithic binary', !pageSource.includes('/assets/kb_1500.bin'))
check(
  'page keeps static shard resource references',
  KB_DOMAINS.every((domain) => pageSource.includes("'/assets/kb_shards/" + domain + ".bin'"))
)
check('page never reads the monolithic KB at runtime', !pageSource.includes("'/assets/kb_all.bin'"))
check('page has no full-KB fallback loader', !pageSource.includes('setFullShardLoader'))

const kb = new CategoryKnowledgeBase(routerBytes)
kb.setShardLoader(function (domain) {
  return Promise.resolve(fs.readFileSync(path.join(shardDir, domain + '.bin')))
})
await kb.loadForQuery('\u6c34\u7684\u5316\u5b66\u5f0f\u662f\u4ec0\u4e48')
check('category runtime answers from the science shard', kb.query('\u6c34\u7684\u5316\u5b66\u5f0f\u662f\u4ec0\u4e48', 1).top[0]?.id === 'k2-science-water-molecule')

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KB BINARY CHECKS PASSED')
