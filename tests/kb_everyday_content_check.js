import fs from 'node:fs'
import path from 'node:path'
import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import kbV2Entries from '../src/assets/kb/index.js'

const allEntries = entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries)
const counts = {}
for (const entry of allEntries) {
  const match = /^k2-([a-z0-9_]+)-/.exec(String(entry.id))
  if (match) counts[match[1]] = (counts[match[1]] || 0) + 1
  if (/^k2-(nature|facts)-/.test(entry.id)) {
    if (entry.answer.length < 10 || entry.answer.length > 80) throw new Error('自然/事实答案长度不合格：' + entry.id)
    if (entry.keywords.length < 3 || entry.keywords.length > 6) throw new Error('自然/事实关键词数量不合格：' + entry.id)
  }
}
const minimums = { nature: 180, facts: 100, food: 190, health: 170, emotion: 140, relation: 150, work: 140, study: 80, digital: 85, home: 100, travel: 70, consumer: 80, law: 80 }
for (const [domain, minimum] of Object.entries(minimums)) {
  if ((counts[domain] || 0) < minimum) throw new Error(domain + ' 条目不足：' + (counts[domain] || 0) + '/' + minimum)
}
const facts = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/fact_registry.json'), 'utf8'))
const factIds = new Set(facts.map((item) => item.entryId))
for (const entry of allEntries.filter((item) => item.id.startsWith('k2-facts-'))) {
  if (!factIds.has(entry.id)) throw new Error('事实缺少登记：' + entry.id)
}
const record = allEntries.find((entry) => entry.id === 'k2-facts-mens-100m-record-holder')
if (!record) throw new Error('缺少男子 100 米纪录事实条目')
if (!/截至\s*20\d\d[-年]/.test(record.answer)) throw new Error('男子 100 米纪录答案缺少核验日期')
if (!/男子?\s*100\s*米|100m/.test(record.answer + record.question)) throw new Error('纪录答案缺少项目口径')
console.log('EVERYDAY CONTENT CHECK PASSED')
