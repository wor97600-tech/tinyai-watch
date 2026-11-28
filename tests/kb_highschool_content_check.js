import fs from 'node:fs'
import path from 'node:path'
import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import kbV2Entries from '../src/assets/kb/index.js'

const matrix = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/highschool_coverage_matrix.json'), 'utf8'))
const allEntries = entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries)
const byId = new Map(allEntries.map((entry) => [entry.id, entry]))
const targets = {
  math: 180, physics: 110, chemistry: 110, biology: 110,
  geography: 90, history: 90, politics: 90, chinese: 80, english: 80,
  information: 60, technology: 50, music: 30, art: 30, pe: 40, labor: 20, practice: 20,
}
for (const [domain, minimum] of Object.entries(targets)) {
  const count = allEntries.filter((entry) => entry.id.startsWith('k2-' + domain + '-')).length
  if (count < minimum) throw new Error(domain + ' 条目不足：' + count + '/' + minimum)
}
const required = matrix.filter((row) => row.required)
const missing = required.filter((row) => !byId.has(row.plannedEntryId))
if (missing.length) throw new Error('必修矩阵缺少条目：' + missing.slice(0, 8).map((row) => row.plannedEntryId).join(', '))
for (const entry of allEntries.filter((item) => /^k2-(math|physics|chemistry|biology|geography|history|politics|chinese|english|information|technology|music|art|pe|labor|practice)-/.test(item.id))) {
  if (entry.answer.length < 10 || entry.answer.length > 80) throw new Error('高中答案长度不合格：' + entry.id)
  if (entry.keywords.length < 3 || entry.keywords.length > 6) throw new Error('高中关键词数量不合格：' + entry.id)
  if (new Set(entry.keywords.map((item) => item.toLowerCase())).size !== entry.keywords.length) throw new Error('高中关键词重复：' + entry.id)
}
const dated = byId.get('k2-facts-mens-100m-record-holder')
if (dated && !/截至\s*20\d\d[-年]/.test(dated.answer)) throw new Error('纪录答案缺少核验日期')
console.log('HIGH SCHOOL CONTENT CHECK PASSED')
