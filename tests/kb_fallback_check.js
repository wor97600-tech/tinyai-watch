import fs from 'node:fs'
import path from 'node:path'
import { CategoryKnowledgeBase } from '../src/ai/category_kb.js'
import { SimpleKnowledgeBase } from '../src/ai/simple_kb.js'
import { KB_DOMAINS } from '../src/ai/kb_domains.js'
import { encodePackedPayload, packEntries } from '../scripts/kb_pack.mjs'

let checks = 0
const failures = []
function check(name, condition, detail) {
  checks++
  if (condition) console.log('PASS  ' + name + (detail ? ' (' + detail + ')' : ''))
  else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('FAIL  ' + name + (detail ? ' (' + detail + ')' : ''))
  }
}

const routerBytes = fs.readFileSync(path.resolve('src/assets/kb_router.bin'))
const shardBytes = Object.fromEntries(
  KB_DOMAINS.map((domain) => [domain, fs.readFileSync(path.resolve('src/assets/kb_shards/' + domain + '.bin'))])
)
const factsKb = new SimpleKnowledgeBase(shardBytes.facts)
const staleFactsEntries = Array.from({ length: factsKb.entryCount }, function () { return factsKb.entryAt(0) })
const staleFactsBytes = encodePackedPayload(packEntries(staleFactsEntries))
let fullReads = 0

const weakShardKb = new CategoryKnowledgeBase(routerBytes, {
  shardLoader(domain) {
    return domain === 'facts' ? staleFactsBytes : shardBytes[domain]
  },
  fullShardLoader() {
    fullReads++
    return fs.readFileSync('src/assets/kb_all.bin')
  },
})
await weakShardKb.loadForQuery('世界最快的人是谁')
check(
  'low-confidence topic lookup loads only its routed domain',
  weakShardKb.loadedDomain === 'facts' && weakShardKb.loadedEntries < weakShardKb.entryCount,
  weakShardKb.loadedDomain + '/' + weakShardKb.loadedEntries + '/' + weakShardKb.entryCount
)
check('low-confidence query never reads the monolithic KB', fullReads === 0, String(fullReads))
check('runtime has no full-KB object', weakShardKb.fullKb === undefined, String(weakShardKb.fullKb))

const failedDomainKb = new CategoryKnowledgeBase(routerBytes, {
  shardLoader(domain) {
    if (domain === 'facts') return Promise.reject(new Error('simulated facts shard failure'))
    return shardBytes[domain]
  },
  fullShardLoader() {
    fullReads++
    return fs.readFileSync('src/assets/kb_all.bin')
  },
})
const degraded = await failedDomainKb.loadForQuery('世界最快的人是谁')
check(
  'failed topic shard safely degrades to the base shard',
  degraded.degraded && failedDomainKb.loadedDomain === 'base' && failedDomainKb.baseKb,
  failedDomainKb.loadedDomain + '/' + degraded.degraded
)
check('failed topic shard does not read the monolithic KB', fullReads === 0, String(fullReads))
const baseResult = failedDomainKb.query('你好', 1)
check('base shard remains queryable after topic shard failure', Array.isArray(baseResult.top), failedDomainKb.loadedDomain)

const invalidBaseKb = new CategoryKnowledgeBase(routerBytes, {
  shardLoader(domain) {
    return domain === 'base' ? staleFactsBytes : shardBytes[domain]
  },
})
let invalidBaseRejected = false
await invalidBaseKb.loadForQuery('你好').catch(function () { invalidBaseRejected = true })
check(
  'invalid base shard is rejected instead of treated as a safe fallback',
  invalidBaseRejected && !invalidBaseKb.baseKb,
  'rejected=' + invalidBaseRejected + '/base=' + (invalidBaseKb.baseKb ? invalidBaseKb.baseKb.entryCount : 0)
)

const healthyKb = new CategoryKnowledgeBase(routerBytes, {
  shardLoader(domain) { return shardBytes[domain] },
})
await healthyKb.loadForQuery('光合作用是什么')
check(
  'healthy topic query loads only the selected domain',
  healthyKb.loadedDomain === 'science' && healthyKb.loadedEntries < healthyKb.entryCount,
  healthyKb.loadedDomain + '/' + healthyKb.loadedEntries
)
check(
  'runtime no longer exposes a full-shard fallback API',
  typeof healthyKb.setFullShardLoader === 'undefined' && typeof healthyKb.loadFullFallback === 'undefined'
)

console.log('\nChecks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KB FALLBACK CHECKS PASSED')
