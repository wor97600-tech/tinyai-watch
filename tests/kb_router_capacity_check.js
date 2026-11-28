import { encodeKnowledgeRouter } from '../scripts/kb_pack.mjs'
import { parseCategoryRouter } from '../src/ai/category_kb.js'

const domains = Array.from({ length: 256 }, (_, index) => 'd' + index)
const counts = domains.map((_, index) => index === 1 ? 1 : 0)
let threw = false
try {
  encodeKnowledgeRouter({
    domains,
    domainCounts: counts,
    routes: [{ key: '数学', domain: 'd1', weight: 1 }],
    questions: [{ question: '测试问题', domain: 'd1' }],
  })
} catch (error) {
  threw = /domains/i.test(String(error && error.message))
}
if (!threw) throw new Error('超过 255 个领域时必须拒绝编码')
console.log('KB ROUTER CAPACITY CHECK PASSED')
const expandedDomains = Array.from({ length: 31 }, (_, index) => 'domain' + index)
const expandedCounts = expandedDomains.map((_, index) => index === 1 ? 1 : 0)
const expandedRouter = encodeKnowledgeRouter({
  domains: expandedDomains,
  domainCounts: expandedCounts,
  routes: [{ key: '高中', domain: 'domain1', weight: 1 }],
  questions: [{ question: '扩展路由测试', domain: 'domain1' }],
})
const parsed = parseCategoryRouter(expandedRouter)
if (parsed.domains.length !== expandedDomains.length || parsed.domainCounts[1] !== 1) {
  throw new Error('31 个领域的动态头部没有保留完整计数')
}
console.log('KB ROUTER HEADER CHECK PASSED')
