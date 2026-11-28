import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import knowledgeEntries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import { KB_DATA_MANIFEST } from './kb_data/manifest.mjs'
import { KB_RELEASE_MANIFEST } from './kb_release_manifest.mjs'
import { packEntries, encodePackedPayload, encodeKnowledgeRouter } from './kb_pack.mjs'
import {
  KB_DOMAINS,
  KB_DOMAIN_LABELS,
  hashKnowledgeKey,
  isKnowledgeRouteStopTerm,
  knowledgeDomainFromId,
  normalizeKnowledgeKey,
} from '../src/ai/kb_domains.js'
import { CategoryKnowledgeBase } from '../src/ai/category_kb.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'scripts', 'kb_data')
const outputDir = path.join(root, 'src', 'assets', 'kb')
const shardDir = path.join(root, 'src', 'assets', 'kb_shards')
const routerFile = path.join(root, 'src', 'assets', 'kb_router.bin')
const obsoleteFullShardFile = path.join(root, 'src', 'assets', 'kb_all.bin')
const legacyPayloadFile = path.join(root, 'src', 'assets', 'kb_1500.bin')

function charLength(text) {
  return Array.from(text).length
}

function bigrams(text) {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, '')
  const out = new Set()
  for (let i = 0; i + 1 < normalized.length; i++) out.add(normalized.slice(i, i + 2))
  return out
}

function jaccard(a, b) {
  let common = 0
  for (const item of a) if (b.has(item)) common++
  return common / (a.size + b.size - common || 1)
}

export function validateManifestShape(manifest) {
  const failures = []
  const domains = []
  const seen = new Set()
  for (const item of manifest || []) {
    if (!item || typeof item.domain !== 'string' || !Array.isArray(item.files) || item.files.length === 0) {
      failures.push('数据清单项必须是 { domain, files } 且 files 非空')
      continue
    }
    if (!/^[a-z][a-z0-9_]*$/.test(item.domain)) failures.push('领域名不合规：' + item.domain)
    if (seen.has(item.domain)) failures.push('数据清单重复领域：' + item.domain)
    seen.add(item.domain)
    if (item.releaseLimit !== undefined && (!Number.isInteger(item.releaseLimit) || item.releaseLimit < 1)) {
      failures.push(item.domain + ': releaseLimit 必须是正整数')
    }
    domains.push(item.domain)
  }
  const expected = KB_DOMAINS.filter((domain) => domain !== 'base')
  if (JSON.stringify(domains) !== JSON.stringify(expected)) {
    failures.push('数据清单领域顺序必须匹配 KB_DOMAINS 非 base 部分')
  }
  if (domains.length + 1 !== KB_DOMAINS.length) failures.push('数据清单没有覆盖全部运行时领域')
  return { ok: failures.length === 0, errors: failures, domains }
}

function normalizeManifestPath(relativePath) {
  const resolved = path.resolve(dataDir, relativePath)
  const relative = path.relative(dataDir, resolved)
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('数据模块路径越界：' + relativePath)
  }
  return resolved
}

export async function loadKnowledgeManifest(manifest = KB_DATA_MANIFEST) {
  const failures = []
  const entries = []
  const counts = {}
  const byId = new Map()
  const byQuestion = new Map()
  const shape = validateManifestShape(manifest)
  failures.push(...shape.errors)
  if (!shape.ok) return { failures, entries, counts }

  for (const item of manifest) {
    const domain = item.domain
    const domainEntries = []
    for (const relativePath of item.files) {
      let dataFile
      try {
        dataFile = normalizeManifestPath(relativePath)
      } catch (error) {
        failures.push(domain + ': ' + error.message)
        continue
      }
      if (!fs.existsSync(dataFile)) {
        failures.push('缺少领域数据：' + path.relative(root, dataFile))
        continue
      }
      const module = await import(pathToFileURL(dataFile).href + '?v=' + Date.now())
      const data = module.default
      if (!data || data.domain !== domain || !Array.isArray(data.rows)) {
        failures.push(domain + ': ' + relativePath + ' 必须导出 { domain, rows }')
        continue
      }

      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i]
        const where = domain + '/' + relativePath + '[' + i + ']'
        if (!Array.isArray(row) || row.length < 6) {
          failures.push(where + ': 行格式应为 [slug, question, answer, 关键词1, 关键词2, 关键词3...]')
          continue
        }
        const slug = String(row[0] || '')
        const question = String(row[1] || '').trim()
        const answer = String(row[2] || '').trim()
        const keywords = row.slice(3).map((item) => String(item || '').trim()).filter(Boolean)
        const id = 'k2-' + domain + '-' + slug

        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          failures.push(where + ': slug 只能使用小写英文、数字和连字符：' + slug)
        }
        if (byId.has(id)) failures.push(where + ': 重复 id ' + id)
        byId.set(id, true)
        if (question.length < 4 || charLength(question) > 12) {
          failures.push(where + ': question 需 4~12 字：' + question)
        }
        if (answer.length < 20 || charLength(answer) > 60) {
          failures.push(where + ': answer 需 20~60 字（当前 ' + charLength(answer) + '）：' + question)
        }
        if (keywords.length < 3 || keywords.length > 6) {
          failures.push(where + ': keywords 需 3~6 个：' + question)
        }
        if (new Set(keywords.map((item) => item.toLowerCase())).size !== keywords.length) {
          failures.push(where + ': keywords 有重复：' + question)
        }
        const qKey = question.toLowerCase().replace(/\s+/g, '')
        if (byQuestion.has(qKey)) failures.push(where + ': 重复 question ' + question)
        byQuestion.set(qKey, id)

        domainEntries.push({ id, question, answer, keywords })
      }
    }
    if (item.releaseLimit !== undefined && item.releaseLimit > domainEntries.length) {
      failures.push(domain + ': releaseLimit 超过来源条数：' + item.releaseLimit + '/' + domainEntries.length)
    }
    const selectedEntries = item.releaseLimit === undefined
      ? domainEntries
      : domainEntries.slice(0, item.releaseLimit)
    entries.push(...selectedEntries)
    counts[domain] = selectedEntries.length
    if (counts[domain] === 0) failures.push(domain + ': 没有任何有效条目')
  }

  const questionBigrams = entries.map((entry) => bigrams(entry.question))
  for (let i = 0; i < entries.length; i++) {
    const a = questionBigrams[i]
    for (let j = i + 1; j < entries.length; j++) {
      const similarity = jaccard(a, questionBigrams[j])
      if (similarity >= 0.75) {
        failures.push('近似重复 ' + similarity.toFixed(2) + '：' + entries[i].question + ' / ' + entries[j].question)
      }
    }
  }

  return { failures, entries, counts }
}

async function loadDomains() {
  return loadKnowledgeManifest(KB_DATA_MANIFEST)
}

function formatChunk(chunk, index) {
  const lines = chunk.map(function (entry) {
    const row = [entry.id, entry.question, entry.answer].concat(entry.keywords)
    return '  ' + JSON.stringify(row) + ','
  })
  return [
    '// TinyAI 知识库分片 ' + String(index + 1).padStart(2, '0') + '：由 scripts/build_kb_1500.mjs 生成。',
    'const rows = [',
    ...lines,
    ']',
    '',
    'export default rows.map(function (row) {',
    '  return { id: row[0], question: row[1], answer: row[2], keywords: row.slice(3) }',
    '})',
    '',
  ].join('\n')
}

export async function buildKnowledgeAssets() {
  const result = await loadDomains()
  if (result.failures.length > 0) {
    throw new Error('知识库构建失败，共 ' + result.failures.length + ' 个问题：\n' + result.failures.map((failure) => '  - ' + failure).join('\n'))
  }

  const baseEntries = knowledgeEntries.concat(dailyEntries, dailyExtraEntries)
  const allEntries = baseEntries.concat(result.entries)
  const byId = new Map()
  const byQuestion = new Map()
  const mergeFailures = []
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i]
    const id = String(entry && entry.id ? entry.id : '')
    const question = String(entry && entry.question ? entry.question : '')
    const questionKey = question.toLowerCase().replace(/\s+/g, '')
    if (!id) mergeFailures.push('合并条目[' + i + '] 缺少 id')
    if (byId.has(id)) mergeFailures.push('合并重复 id：' + id)
    if (byQuestion.has(questionKey)) mergeFailures.push('合并重复 question：' + question)
    byId.set(id, true)
    byQuestion.set(questionKey, true)
  }
  if (allEntries.length !== KB_RELEASE_MANIFEST.targetEntries) {
    mergeFailures.push('手表测试包必须恰好包含 ' + KB_RELEASE_MANIFEST.targetEntries + ' 条：' + allEntries.length)
  }
  if (mergeFailures.length > 0) {
    throw new Error('知识库合并失败，共 ' + mergeFailures.length + ' 个问题：\n' + mergeFailures.map((failure) => '  - ' + failure).join('\n'))
  }

  const entriesByDomain = {}
  for (const domain of KB_DOMAINS) entriesByDomain[domain] = []
  for (const entry of allEntries) {
    const domain = knowledgeDomainFromId(entry.id)
    if (!entriesByDomain[domain]) throw new Error('条目使用了未声明领域：' + entry.id)
    entriesByDomain[domain].push(entry)
  }

  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(shardDir, { recursive: true })

  const chunkCount = KB_RELEASE_MANIFEST.jsChunkCount
  const baseSize = Math.floor(result.entries.length / chunkCount)
  const remainder = result.entries.length % chunkCount
  let cursor = 0
  for (let i = 0; i < chunkCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0)
    const chunk = result.entries.slice(cursor, cursor + size)
    cursor += size
    fs.writeFileSync(path.join(outputDir, 'kb_v2_' + String(i + 1).padStart(2, '0') + '.js'), formatChunk(chunk, i), 'utf8')
  }

  const imports = []
  const items = []
  for (let i = 0; i < chunkCount; i++) {
    const name = 'part' + String(i + 1).padStart(2, '0')
    imports.push("import " + name + " from './kb_v2_" + String(i + 1).padStart(2, '0') + ".js'")
    items.push(name)
  }
  fs.writeFileSync(
    path.join(outputDir, 'index.js'),
    imports.join('\n') + '\n\nexport default [\n  ' + items.join(',\n  ') + ',\n].reduce(function (all, part) { return all.concat(part) }, [])\n',
    'utf8'
  )

  const shardSizes = {}
  for (const domain of KB_DOMAINS) {
    const payload = packEntries(entriesByDomain[domain])
    const binary = encodePackedPayload(payload)
    const target = path.join(shardDir, domain + '.bin')
    fs.writeFileSync(target, Buffer.from(binary))
    shardSizes[domain] = binary.byteLength
  }
  // Never emit a monolithic runtime shard: weak matches and read errors must not
  // turn a single watch query into a full-corpus memory allocation.
  if (fs.existsSync(obsoleteFullShardFile)) fs.unlinkSync(obsoleteFullShardFile)

  const keywordDomainCounts = new Map()
  for (const entry of allEntries) {
    const domain = knowledgeDomainFromId(entry.id)
    const seen = new Set()
    for (const rawKeyword of entry.keywords || []) {
      const key = normalizeKnowledgeKey(rawKeyword)
      if (key.length < 2 || key.length > 6 || seen.has(key) || isKnowledgeRouteStopTerm(key)) continue
      seen.add(key)
      let counts = keywordDomainCounts.get(key)
      if (!counts) {
        counts = {}
        keywordDomainCounts.set(key, counts)
      }
      counts[domain] = (counts[domain] || 0) + 1
    }
  }

  const routes = []
  for (const [key, counts] of keywordDomainCounts) {
    let total = 0
    let bestDomain = ''
    let bestCount = 0
    for (const domain of KB_DOMAINS) {
      if (domain === 'base') continue
      const count = counts[domain] || 0
      total += count
      if (count > bestCount) {
        bestCount = count
        bestDomain = domain
      }
    }
    const dominance = total > 0 ? bestCount / total : 0
    if (!bestDomain || dominance < 0.6) continue
    const weight = Math.max(1, Math.min(8, Math.round((2 + Math.min(key.length, 6)) * dominance)))
    routes.push({ key, domain: bestDomain, weight })
  }

  const questions = allEntries.map(function (entry) {
    return { question: entry.question, domain: knowledgeDomainFromId(entry.id) }
  })
  const seenQuestionHashes = new Map()
  for (const question of questions) {
    const key = hashKnowledgeKey(question.question)
    const previous = seenQuestionHashes.get(key)
    if (previous && previous !== question.domain) {
      throw new Error('路由哈希冲突：' + previous + ' / ' + question.domain)
    }
    seenQuestionHashes.set(key, question.domain)
  }

  const domainCounts = KB_DOMAINS.map((domain) => entriesByDomain[domain].length)
  if (domainCounts.some((count) => count > 65535)) throw new Error('领域条目数超过二进制计数容量')
  const routerBinary = encodeKnowledgeRouter({ domains: KB_DOMAINS, domainCounts, routes, questions })
  fs.writeFileSync(routerFile, Buffer.from(routerBinary))
  if (fs.existsSync(legacyPayloadFile)) fs.unlinkSync(legacyPayloadFile)

  const routerKb = new CategoryKnowledgeBase(routerBinary)
  let routeMismatches = 0
  for (const entry of allEntries) {
    if (routerKb.route(entry.question).domain !== knowledgeDomainFromId(entry.id)) routeMismatches++
  }
  if (routeMismatches > 0) throw new Error('路由表自检失败：' + routeMismatches + ' 条问题没有进入原领域')

  const shardBytes = Object.values(shardSizes).reduce((sum, value) => sum + value, 0)
  console.log('知识库已生成：' + allEntries.length + ' 条，' + chunkCount + ' 个 JS 测试分片')
  console.log('运行时路由：' + path.relative(root, routerFile) + '，' + routerBinary.byteLength + ' bytes，关键词路由 ' + routes.length + ' 条')
  console.log('运行时分片：' + KB_DOMAINS.length + ' 个，合计 ' + shardBytes + ' bytes；单次最多常驻 1 个知识分片')
  console.log('稳定策略：启动只读小型路由表，查询时单独加载一个领域分片；不生成整库运行时包')
  console.log('领域条数：' + KB_DOMAINS.map((domain) => KB_DOMAIN_LABELS[domain] + ' ' + entriesByDomain[domain].length).join(' · '))
  return {
    allEntries,
    entriesByDomain,
    shardSizes,
    routerBytes: routerBinary.byteLength,
    shardBytes,
    routes: routes.length,
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  buildKnowledgeAssets().catch(function (error) {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
}
