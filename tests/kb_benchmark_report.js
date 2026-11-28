import fs from 'node:fs'
import path from 'node:path'
import { CategoryKnowledgeBase, parseCategoryRouter } from '../src/ai/category_kb.js'
import { KB_DOMAINS } from '../src/ai/kb_domains.js'

function percentile(values, ratio) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

const routerPath = path.resolve('src/assets/kb_router.bin')
const shardDir = path.resolve('src/assets/kb_shards')
const routerBytes = fs.readFileSync(routerPath)
const router = parseCategoryRouter(routerBytes)
const shardBytes = {}
for (const domain of KB_DOMAINS) shardBytes[domain] = fs.readFileSync(path.join(shardDir, domain + '.bin'))
const kb = new CategoryKnowledgeBase(routerBytes)
kb.setShardLoader((domain) => Promise.resolve(shardBytes[domain]))
const sample = await kb.measureSample(Math.max(KB_DOMAINS.length * 8, 64))
const p50 = percentile(sample.latencies, 0.5)
const p95 = percentile(sample.latencies, 0.95)
const max = sample.latencies.length ? Math.max(...sample.latencies) : 0
const report = {
  entries: router.questionCount,
  domainCount: router.domains.length,
  buildMs: sample.peakBuildMs,
  p50,
  p95,
  max,
  candidateAverage: sample.candidateAverage,
  candidateMax: sample.candidateMax,
  routerBytes: routerBytes.length,
  shardBytes: Object.values(shardBytes).reduce((sum, bytes) => sum + bytes.length, 0),
}
console.log(JSON.stringify(report))
