import fs from 'node:fs'
import path from 'node:path'

const matrix = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/highschool_coverage_matrix.json'), 'utf8'))
const sources = JSON.parse(fs.readFileSync(path.resolve('docs/knowledge/highschool_sources.json'), 'utf8'))
const domains = new Set([
  'math', 'physics', 'chemistry', 'biology', 'geography', 'history', 'politics',
  'chinese', 'english', 'information', 'technology', 'music', 'art', 'pe', 'labor', 'practice',
])
if (!Array.isArray(matrix) || matrix.length === 0) throw new Error('高中覆盖矩阵不能为空')
if (!Array.isArray(sources) || sources.length === 0) throw new Error('高中来源清单不能为空')
const ids = matrix.map((row) => row.plannedEntryId)
if (new Set(ids).size !== ids.length) throw new Error('覆盖矩阵存在重复 plannedEntryId')
const sourceKeys = new Set(sources.map((row) => row.sourceKey))
for (const row of matrix) {
  if (!domains.has(row.domain) || !row.stage || !row.module || !row.conceptKey || !row.plannedEntryId || !row.sourceKey) {
    throw new Error('覆盖矩阵字段不完整：' + JSON.stringify(row))
  }
  if (!sourceKeys.has(row.sourceKey)) throw new Error('矩阵来源不存在：' + row.sourceKey)
  if (!/^k2-[a-z0-9-]+$/.test(row.plannedEntryId)) throw new Error('条目 ID 不合规：' + row.plannedEntryId)
  if (typeof row.required !== 'boolean') throw new Error('required 必须是布尔值：' + row.plannedEntryId)
}
for (const source of sources) {
  if (!source.sourceKey || !source.publisher || !source.title || !source.version || !source.checkedAt || !source.scope) {
    throw new Error('来源清单字段不完整：' + JSON.stringify(source))
  }
}
console.log('HIGH SCHOOL MATRIX CHECK PASSED')
