import fs from 'node:fs'
import path from 'node:path'
import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import kbV2Entries from '../src/assets/kb/index.js'
import { CategoryKnowledgeBase, parseCategoryRouter } from '../src/ai/category_kb.js'
import { KB_DOMAINS } from '../src/ai/kb_domains.js'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'
import { ReplyEngine } from '../src/ai/reply_engine.js'

let checks = 0
const failures = []

function check(name, condition, detail) {
  checks++
  if (condition) {
    console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  } else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

function expectedDomain(entry) {
  return expectedDomainFromId(entry.id)
}

function expectedDomainFromId(id) {
  if (!String(id).startsWith('k2-')) return 'base'
  return String(id).split('-')[1]
}

function shardPath(domain) {
  return path.resolve('src/assets/kb_shards/' + domain + '.bin')
}

const allEntries = entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries)
const routerFile = path.resolve('src/assets/kb_router.bin')
const shardFiles = KB_DOMAINS.map(shardPath)
const routerBytes = fs.readFileSync(routerFile)
const router = parseCategoryRouter(routerBytes)
check('router records are emitted in hash order', [12, 16].every(function (field) {
  const count = routerBytes.readUInt32LE(field)
  const offset = routerBytes.readUInt32LE(field + 8)
  let previous = -1
  for (let i = 0; i < count; i++) {
    const at = offset + i * 8
    const hash = routerBytes.readUInt32LE(at) * 65536 + routerBytes.readUInt16LE(at + 4)
    if (hash < previous) return false
    previous = hash
  }
  return true
}))
const kb = new CategoryKnowledgeBase(routerBytes)
const shardBytes = {}
for (const domain of KB_DOMAINS) {
  shardBytes[domain] = fs.readFileSync(shardPath(domain))
}
kb.setShardLoader(function (domain) {
  return Promise.resolve(shardBytes[domain])
})

check('router domain order is explicit', KB_DOMAINS[0] === 'base' && KB_DOMAINS[KB_DOMAINS.length - 1] === 'practice' && router.domains.length === KB_DOMAINS.length, KB_DOMAINS.join(','))
check('all declared shard files exist', shardFiles.every((file) => fs.existsSync(file)), shardFiles.length + ' files')
check('router knows all questions', router.questionCount === allEntries.length, router.questionCount + '/' + allEntries.length)

let routed = 0
const routeFailures = []
for (const entry of allEntries) {
  const actual = kb.route(entry.question).domain
  const expected = expectedDomain(entry)
  if (actual === expected) routed++
  else if (routeFailures.length < 8) routeFailures.push(entry.question + ':' + actual + '/' + expected)
}
check('every exact question routes to its own domain', routed === allEntries.length, routed + '/' + allEntries.length + ' ' + routeFailures.join(' | '))

let shardTotal = 0
const shardCounts = {}
for (const domain of KB_DOMAINS) {
  const one = new CategoryKnowledgeBase(routerBytes, {
    shardLoader: function (requestedDomain) {
      return Promise.resolve(shardBytes[requestedDomain === 'base' ? 'base' : domain])
    },
  })
  await one.loadDomain(domain)
  shardCounts[domain] = one.entryCountForDomain(domain)
  shardTotal += shardCounts[domain]
}
check('all shards merge back to generated entry count', shardTotal === allEntries.length, shardTotal + '/' + allEntries.length)
check('base shard keeps the original 258 entries', shardCounts.base === entries.length + dailyEntries.length + dailyExtraEntries.length, String(shardCounts.base))
check('science shard includes physics chemistry biology animal plant basics', shardCounts.science >= 200, String(shardCounts.science))

const scienceCases = [
  ['水的化学式', 'k2-science-water-molecule'],
  ['光速有多快', 'k2-science-light-speed'],
  ['水多少度沸腾', 'k2-science-boiling'],
  ['什么是欧姆定律', 'k2-science-ohm-law'],
  ['光合作用是什么', 'k2-science-photosynthesis'],
  ['鲸鱼是鱼吗', 'k2-science-whale'],
  ['猫为什么晚上活动', 'k2-science-cat'],
  ['植物需要阳光吗', 'k2-science-photosynthesis'],
  ['太阳为什么会发光', 'k2-science-star'],
  ['动物为什么要冬眠', 'k2-science-bear'],
]
let scienceHits = 0
const scienceFailures = []
for (const [query, expectedId] of scienceCases) {
  await kb.loadForQuery(query)
  const result = kb.query(query, 1)
  const top = result.top[0]
  if (top && top.id === expectedId) scienceHits++
  else scienceFailures.push(query + ':' + ((top && top.id) || '-') + '/' + expectedId)
}
check('science basics are answered from the science shard', scienceHits === scienceCases.length, scienceHits + '/' + scienceCases.length + ' ' + scienceFailures.join(' | '))

const natureCases = [
  ['鸭嘴兽是哺乳动物吗', 'k2-nature-platypus'],
  ['蜘蛛有几条腿', 'k2-nature-spider-legs'],
  ['被子植物如何识别', 'k2-nature-angiosperm'],
]
let natureHits = 0
const natureFailures = []
for (const [query, expectedId] of natureCases) {
  await kb.loadForQuery(query)
  const top = kb.query(query, 1).top[0]
  if (top && top.id === expectedId) natureHits++
  else natureFailures.push(query + ':' + ((top && top.id) || '-') + '/' + expectedId)
}
check('animal and plant basics answer from the nature shard', natureHits === natureCases.length, natureHits + '/' + natureCases.length + ' ' + natureFailures.join(' | '))

const expansionCases = [
  ['营养成分表先看啥', 'k2-food-reserve-basics-nutrition-label-a'],
  ['昼夜节律是什么规律', 'k2-health-reserve-basics-circadian-rhythm-a'],
  ['保护色怎样帮助动物', 'k2-nature-camouflage'],
  ['真空光速是多少', 'k2-science-light-speed'],
  ['因式分解的定义是什么', 'k2-math-math-factor-a'],
  ['参考系是什么意思', 'k2-physics-physics-reference-frame-a'],
  ['氢的元素符号', 'k2-chemistry-element-hydrogen-symbol'],
  ['细胞有何功能', 'k2-biology-bio-cell-a'],
  ['纬度怎样划分', 'k2-geography-reserve-next-latitude-a'],
  ['音乐速度如何表示', 'k2-music-reserve-next-tempo-a'],
]
let expansionHits = 0
let singleShardLoads = true
const expansionFailures = []
for (const [query, expectedId] of expansionCases) {
  await kb.loadForQuery(query)
  const top = kb.query(query, 1).top[0]
  const expectedDomain = expectedDomainFromId(expectedId)
  if (top && top.id === expectedId) expansionHits++
  else expansionFailures.push(query + ':' + ((top && top.id) || '-') + '/' + expectedId)
  if (kb.getStats().loadedEntries !== shardCounts[expectedDomain]) singleShardLoads = false
}
check('new 2500-release additions resolve across daily, science, and school domains', expansionHits === expansionCases.length, expansionHits + '/' + expansionCases.length + ' ' + expansionFailures.join(' | '))
check('category queries keep only the routed shard resident', singleShardLoads, 'last active entries=' + kb.getStats().loadedEntries)

await kb.loadForQuery('今天完全无法归类的生僻内容')
check('unknown questions fall back to base only', kb.getStats().loadedDomain === 'base', kb.getStats().loadedDomain)
check('unknown questions do not load another domain', kb.getStats().loadedEntries === shardCounts.base, String(kb.getStats().loadedEntries))

await kb.loadForQuery('手机充电要注意什么')
check('switching domain releases the previous shard', kb.getStats().loadedDomain === 'digital' && kb.getStats().loadedEntries === shardCounts.digital, kb.getStats().loadedDomain + ':' + kb.getStats().loadedEntries)

const samplerShardBefore = kb.getStats().loadedDomain
const loadedSample = await kb.measureLoadedSample(16)
check('watch stats sampler only samples the single resident shard', loadedSample.loadedShards.length === 1 && loadedSample.loadedShards[0] === samplerShardBefore, loadedSample.loadedShards.join(','))
check('watch stats sampler returns bounded latency samples', loadedSample.latencies.length <= 16 && loadedSample.latencies.length > 0, String(loadedSample.latencies.length))
check('watch stats sampler does not switch loaded domain', kb.getStats().loadedDomain === samplerShardBefore, kb.getStats().loadedDomain)
const sample = await kb.measureSample(52)
check('full sampler visits every shard for Node diagnostics', sample.loadedShards.length === KB_DOMAINS.length, String(sample.loadedShards.length))
check('full sampler returns latency samples', sample.latencies.length >= KB_DOMAINS.length, String(sample.latencies.length))
check('full sampler releases transient shards', kb.getStats().loadedDomain === 'base', kb.getStats().loadedDomain)

const engineKb = new CategoryKnowledgeBase(routerBytes)
engineKb.setShardLoader(function (domain) {
  return Promise.resolve(shardBytes[domain])
})
await engineKb.loadForQuery('解方程 2x+3=7')
const engine = new ReplyEngine({ knowledgeBase: engineKb, now: function () { return Date.now() } })
const homework = engine.reply('解方程 2x+3=7')
check('homework questions stay rejected before knowledge lookup', homework.mode === 'homework' && homework.text === '我只能回答基础知识，作业题和复杂计算没法替你作答。', homework.mode + ' ' + homework.text)

await engineKb.loadForQuery('世界上最快的人是谁')
const fastestPerson = engine.reply('世界上最快的人是谁')
check('fastest-person question with 上 reaches the facts shard', fastestPerson.entryId === 'k2-facts-mens-100m-record-holder', fastestPerson.mode + '/' + (fastestPerson.entryId || '-'))

const userReportedQuestions = [
  ['参考系是什么意思', 'k2-physics-physics-reference-frame-a'],
  ['氢的元素符号', 'k2-chemistry-element-hydrogen-symbol'],
  ['细胞有何功能', 'k2-biology-bio-cell-a'],
]
let userReportedReplies = 0
for (const [query, expectedId] of userReportedQuestions) {
  await engineKb.loadForQuery(query)
  const reply = engine.reply(query)
  if (reply.mode === 'knowledge' && reply.entryId === expectedId) userReportedReplies++
}
check('reported physics, chemistry, and biology questions survive the real reply chain', userReportedReplies === userReportedQuestions.length, userReportedReplies + '/' + userReportedQuestions.length)

await engineKb.loadForQuery('光合作用是什么')
for (const phrase of ['水的化学方程式', '水的方程式', '请问水的化学方程式是什么？']) {
  await engineKb.loadForQuery(phrase)
  const reply = engine.reply(phrase)
  check('water formula paraphrase: ' + phrase, reply.entryId === 'k2-science-water-molecule' && reply.text.includes('H2O'), reply.mode)
}
await engineKb.loadForQuery('光合作用是什么')
const basic = engine.reply('光合作用是什么')
check('basic science questions still reach the knowledge base', basic.mode === 'knowledge' && basic.entryId === 'k2-science-photosynthesis', basic.mode + ' ' + (basic.entryId || '-'))

const pageSource = fs.readFileSync('src/pages/Home/index.ux', 'utf8')
check('page reads the compact router', pageSource.includes("fileReadArrayBuffer('/assets/kb_router.bin'"))
check('page no longer reads the monolithic 1500 binary', !pageSource.includes('/assets/kb_1500.bin'))
check('page keeps static shard resource references', KB_DOMAINS.every((domain) => pageSource.includes("'/assets/kb_shards/" + domain + ".bin'")))

const routerAndShards = routerBytes.length + shardFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0)
check('router and shards fit the configured package budget', routerAndShards <= KB_RELEASE_MANIFEST.maxPackageBytes, routerAndShards + ' bytes')

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KB CATEGORY CHECKS PASSED')
