import fs from 'node:fs'
import path from 'node:path'
import { CategoryKnowledgeBase } from '../src/ai/category_kb.js'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'

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

function collectGarbage() {
  if (typeof global.gc === 'function') {
    global.gc()
  }
}

collectGarbage()
const before = process.memoryUsage()

const routerFile = path.resolve('src/assets/kb_router.bin')
const shardDir = path.resolve('src/assets/kb_shards')
const routerBytes = fs.readFileSync(routerFile)
const shardFiles = fs.readdirSync(shardDir)
  .filter((name) => name.endsWith('.bin') && name !== 'base.bin')
  .map((name) => ({
    domain: name.slice(0, -4),
    file: path.join(shardDir, name),
    bytes: fs.statSync(path.join(shardDir, name)).size,
  }))
  .sort((left, right) => right.bytes - left.bytes)
const largestShard = shardFiles[0]
const baseFile = path.join(shardDir, 'base.bin')
const baseBytes = fs.readFileSync(baseFile)
const largestBytes = fs.readFileSync(largestShard.file)
const maxKb = new CategoryKnowledgeBase(routerBytes)
maxKb.setShardLoader(function (domain) {
  if (domain === 'base') return Promise.resolve(baseBytes)
  if (domain === largestShard.domain) return Promise.resolve(largestBytes)
  return Promise.reject(new Error('unexpected shard: ' + domain))
})

await maxKb.loadDomain(largestShard.domain)
const loadedCount = maxKb.getStats().loadedEntries
collectGarbage()

const after = process.memoryUsage()
const deltaBytes = after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers
const deltaMiB = deltaBytes / 1024 / 1024
const packageBytes = fs.statSync(routerFile).size + largestShard.bytes
const activeKb = maxKb.baseKb || maxKb.domainKb

check('runtime recognizes all release entries', maxKb.entryCount === KB_RELEASE_MANIFEST.targetEntries, String(maxKb.entryCount))
check('largest shard is loaded without a resident base shard', maxKb.getStats().loadedDomain === largestShard.domain && loadedCount === activeKb.entryCount && maxKb.baseKb === null, largestShard.domain + ':' + loadedCount)
check('runtime is not loading the full knowledge base', loadedCount < maxKb.entryCount, loadedCount + '/' + maxKb.entryCount)
check('largest resident shard is capped at the original base size', loadedCount <= KB_RELEASE_MANIFEST.maxActiveEntries, loadedCount + '/' + KB_RELEASE_MANIFEST.maxActiveEntries)
check('runtime does not retain entry objects', maxKb.entries === undefined && activeKb.entries === undefined)
check('runtime does not retain lowercase arrays', maxKb.lowerQuestions === undefined && activeKb.lowerQuestions === undefined)
check(
  'largest active domain stays below the runtime memory budget',
  deltaBytes < 1.25 * 1024 * 1024,
  deltaMiB.toFixed(3) + ' MiB (' + largestShard.domain + ')'
)
check(
  'router plus the largest single shard fit the active slice budget',
  packageBytes <= KB_RELEASE_MANIFEST.maxActiveSliceBytes,
  packageBytes + ' bytes (' + largestShard.domain + ') / ' + KB_RELEASE_MANIFEST.maxActiveSliceBytes + ' byte budget'
)

const scienceBytes = fs.readFileSync(path.join(shardDir, 'science.bin'))
const scienceKb = new CategoryKnowledgeBase(routerBytes)
scienceKb.setShardLoader(function (domain) {
  if (domain === 'base') return Promise.resolve(baseBytes)
  if (domain === 'science') return Promise.resolve(scienceBytes)
  return Promise.reject(new Error('unexpected shard: ' + domain))
})
await scienceKb.loadForQuery('\u6c34\u7684\u5316\u5b66\u5f0f\u662f\u4ec0\u4e48')
const result = scienceKb.query('\u6211\u60f3\u77e5\u9053\u6c34\u7684\u5316\u5b66\u5f0f\u662f\u4ec0\u4e48', 1)
check(
  'active science shard answers a non-exact query',
  result.top[0]?.id === 'k2-science-water-molecule',
  (result.top[0]?.id || '-') + ' candidates=' + result.candidateCount
)
check('query latency is recorded', result.elapsedMs >= 0 && result.elapsedMs <= 300, result.elapsedMs + 'ms')

const pageSource = fs.readFileSync('src/pages/Home/index.ux', 'utf8')
const eagerKbNames = ['knowledgeEntries', 'dailyEntries', 'dailyExtraEntries', 'kbV2Entries']
check(
  'page does not eager-import knowledge entry arrays',
  !eagerKbNames.some(function (name) { return pageSource.includes('import ' + name) })
)
check('page reads the category router', pageSource.includes("fileReadArrayBuffer('/assets/kb_router.bin'"))
check('page constructs CategoryKnowledgeBase', pageSource.includes('new CategoryKnowledgeBase(binary)'))
check('page routes each query before loading a shard', pageSource.includes('knowledgeBase.loadForQuery(text ||'))
check('page no longer reads the monolithic binary', !pageSource.includes('/assets/kb_1500.bin'))
check('page releases the active shard on hide', pageSource.includes('onHide()') && pageSource.includes('knowledgeBase.releaseDomain()'))

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KB MEMORY CHECKS PASSED')
