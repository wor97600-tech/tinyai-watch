import fs from 'node:fs'
import path from 'node:path'

const sources = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/everyday_sources.json'), 'utf8'))
const facts = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/fact_registry.json'), 'utf8'))
if (!Array.isArray(sources) || sources.length === 0) throw new Error('来源清单不能为空')
if (!Array.isArray(facts) || facts.length === 0) throw new Error('事实登记不能为空')
const sourceKeys = new Set(sources.map((item) => item.sourceKey))
if (sourceKeys.size !== sources.length) throw new Error('来源 sourceKey 重复')
const factIds = new Set()
for (const item of facts) {
  if (!item.entryId || !item.sourceKey || !sourceKeys.has(item.sourceKey) || !item.checkedAt || !item.factScope) {
    throw new Error('事实登记字段或 sourceKey 不完整：' + JSON.stringify(item))
  }
  if (factIds.has(item.entryId)) throw new Error('事实登记重复 ID：' + item.entryId)
  factIds.add(item.entryId)
  if (!['stable', 'review_annual', 'review_monthly'].includes(item.volatility)) throw new Error('时效类别非法：' + item.entryId)
  if (item.volatility !== 'stable' && (!item.reviewAfter || !item.answerMustContain)) {
    throw new Error('易变事实缺少复核日期或答案边界：' + item.entryId)
  }
}
console.log('EVERYDAY REGISTRY CHECK PASSED')
