import { KB_DOMAINS, KB_DOMAIN_LABELS } from '../src/ai/kb_domains.js'
import { KB_DATA_MANIFEST } from '../scripts/kb_data/manifest.mjs'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'

const required = [
  'base', 'food', 'health', 'emotion', 'relation', 'work', 'study',
  'digital', 'home', 'travel', 'consumer', 'law', 'science', 'nature',
  'facts', 'math', 'physics', 'chemistry', 'biology', 'geography',
  'history', 'politics', 'chinese', 'english', 'information', 'technology',
  'music', 'art', 'pe', 'labor', 'practice',
]
if (JSON.stringify(KB_DOMAINS) !== JSON.stringify(required)) {
  throw new Error('KB_DOMAINS 顺序或领域集合不完整：' + KB_DOMAINS.join(','))
}
if (KB_DOMAINS.length > KB_RELEASE_MANIFEST.maxRouterDomains) {
  throw new Error('领域数超过路由器容量')
}
if (KB_DOMAINS.some((domain) => typeof KB_DOMAIN_LABELS[domain] !== 'string')) {
  throw new Error('领域标签不完整')
}
const manifestDomains = KB_DATA_MANIFEST.map((item) => item.domain)
if (JSON.stringify(manifestDomains) !== JSON.stringify(KB_DOMAINS.filter((domain) => domain !== 'base'))) {
  throw new Error('数据清单必须按 KB_DOMAINS 顺序覆盖所有非 base 领域')
}
for (const item of KB_DATA_MANIFEST) {
  if (!Array.isArray(item.files) || item.files.length === 0) {
    throw new Error(item.domain + ' 没有数据模块')
  }
}
console.log('KB MANIFEST CHECK PASSED')
