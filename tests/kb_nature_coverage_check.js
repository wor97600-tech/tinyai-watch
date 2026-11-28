import fs from 'node:fs'
import path from 'node:path'
import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import kbV2Entries from '../src/assets/kb/index.js'

const matrix = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/nature_coverage_matrix.json'), 'utf8'))
const sources = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/everyday_sources.json'), 'utf8'))
const all = new Map(entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries).map((entry) => [entry.id, entry]))
const sourceKeys = new Set(sources.map((source) => source.sourceKey))
if (!Array.isArray(matrix) || matrix.length === 0) throw new Error('自然覆盖矩阵不能为空')
const ids = new Set()
for (const row of matrix) {
  if (!row.conceptKey || !row.plannedEntryId || !row.sourceKey || !row.checkedAt || !sourceKeys.has(row.sourceKey)) {
    throw new Error('自然覆盖记录或来源不完整：' + JSON.stringify(row))
  }
  if (ids.has(row.plannedEntryId)) throw new Error('自然覆盖条目重复：' + row.plannedEntryId)
  ids.add(row.plannedEntryId)
  if (!all.has(row.plannedEntryId)) throw new Error('自然覆盖条目未构建：' + row.plannedEntryId)
}
console.log('NATURE COVERAGE CHECK PASSED (' + matrix.length + ' items)')
