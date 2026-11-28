import fs from 'node:fs'
import path from 'node:path'
import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import kbV2Entries from '../src/assets/kb/index.js'
import { SimpleKnowledgeBase } from '../src/ai/simple_kb.js'
import { ReplyEngine } from '../src/ai/reply_engine.js'
import { packEntries } from '../scripts/kb_pack.mjs'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'

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

function charLength(text) {
  return Array.from(String(text || '')).length
}

function normalized(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '')
}

function bigrams(text) {
  const value = normalized(text)
  const out = new Set()
  for (let i = 0; i + 1 < value.length; i++) out.add(value.slice(i, i + 2))
  return out
}

function jaccard(a, b) {
  let common = 0
  for (const item of a) if (b.has(item)) common++
  return common / (a.size + b.size - common || 1)
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

const allEntries = entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries)
const resourceBytes = packEntries(allEntries)
const kb = new SimpleKnowledgeBase(resourceBytes)
const stats = kb.getStats()

check('watch release contains exactly the configured target', allEntries.length === KB_RELEASE_MANIFEST.targetEntries, String(allEntries.length))
check(
  'packed resource contains all source entries',
  kb.entryCount === allEntries.length,
  kb.entryCount + '/' + allEntries.length
)
check(
  'generated JS chunks match configured count',
  kbV2Entries.length === allEntries.length - entries.length - dailyEntries.length - dailyExtraEntries.length &&
    fs.readdirSync(path.resolve('src/assets/kb')).filter((name) => /^kb_v2_\d{2}\.js$/.test(name)).length === KB_RELEASE_MANIFEST.jsChunkCount,
  kbV2Entries.length + ' extension entries / ' + KB_RELEASE_MANIFEST.jsChunkCount + ' chunks'
)

const seenIds = new Set()
const seenQuestions = new Set()
let duplicateIds = 0
let duplicateQuestions = 0
let badAnswers = 0
let badKeywords = 0
let duplicateKeywordLists = 0
let bannedEmptyPhrases = 0
const BANNED_EMPTY_PHRASES = ['因人而异', '这要看情况']

for (const entry of allEntries) {
  if (seenIds.has(entry.id)) duplicateIds++
  seenIds.add(entry.id)
  const questionKey = normalized(entry.question)
  if (seenQuestions.has(questionKey)) duplicateQuestions++
  seenQuestions.add(questionKey)

  const answerLength = charLength(entry.answer)
  if (answerLength < 10 || answerLength > 80) badAnswers++

  const keywords = entry.keywords || []
  if (
    keywords.length < 3 ||
    keywords.length > 6 ||
    new Set(keywords.map((item) => normalized(item))).size !== keywords.length
  ) {
    badKeywords++
  }

  for (const phrase of BANNED_EMPTY_PHRASES) {
    if (String(entry.answer).indexOf(phrase) >= 0) bannedEmptyPhrases++
  }
}

check('ids are globally unique', duplicateIds === 0, duplicateIds + ' duplicates')
check('questions are globally unique', duplicateQuestions === 0, duplicateQuestions + ' duplicates')
check('answers are 10-80 characters', badAnswers === 0, badAnswers + ' invalid')
check('keywords are 3-6 unique values', badKeywords === 0, badKeywords + ' invalid')
check('no banned empty phrases', bannedEmptyPhrases === 0, bannedEmptyPhrases + ' occurrences')

let resourceMismatches = 0
for (let i = 0; i < allEntries.length; i++) {
  const entry = kb.entryAt(i)
  const expected = allEntries[i]
  if (
    !entry ||
    entry.id !== expected.id ||
    entry.question !== expected.question ||
    entry.answer !== expected.answer ||
    entry.keywords.join('|') !== expected.keywords.map((item) => normalized(item)).join('|')
  ) {
    resourceMismatches++
  }
}
check('packed resource matches source content', resourceMismatches === 0, resourceMismatches + ' mismatches')

const rpkIndex = kb.findEntryIndex('what-is-rpk')
check(
  'exact lookup normalizes case and whitespace',
  rpkIndex >= 0 && kb.findQuestionIndex('  RPK 是什么 ') === rpkIndex,
  kb.findQuestionIndex('  RPK 是什么 ') + '/' + rpkIndex
)

let selfHits = 0
for (let i = 0; i < allEntries.length; i++) {
  const result = kb.query(allEntries[i].question, 1)
  if (result.top[0] && result.top[0].id === allEntries[i].id) selfHits++
}
check('self-hit rate is 100%', selfHits === allEntries.length, selfHits + '/' + allEntries.length)

let nearDuplicates = 0
const nearest = []
for (let i = 0; i < allEntries.length; i++) {
  const a = bigrams(allEntries[i].question)
  for (let j = i + 1; j < allEntries.length; j++) {
    const similarity = jaccard(a, bigrams(allEntries[j].question))
    if (similarity >= 0.75) {
      nearDuplicates++
      if (nearest.length < 10) {
        nearest.push(similarity.toFixed(2) + ':' + allEntries[i].question + ' / ' + allEntries[j].question)
      }
    }
  }
}
check('near duplicates >= 0.75 is zero', nearDuplicates === 0, nearDuplicates + ' ' + nearest.join(' | '))

// 白名单只允许语义确实相同的问法，且最多 20 条。
const CROSS_WHITELIST = new Set([
  'x-eye-dry|k2-health-dry-eyes',
  'k2-health-dry-eyes|x-eye-dry',
  'k2-emotion-burnout|k2-work-burnout',
  'k2-work-burnout|k2-emotion-burnout',
])
let falseCross = 0
let whitelistedCross = 0
let maxFalseScore = 0
const crossSamples = []
const crossStarted = Date.now()
for (let i = 0; i < allEntries.length; i++) {
  const prepared = kb.prepareQuery(allEntries[i].question)
  let bestScore = 0
  let bestIndex = -1
  for (let j = 0; j < allEntries.length; j++) {
    if (i === j) continue
    const score = kb.scorePrepared(prepared, j)
    if (score > bestScore) {
      bestScore = score
      bestIndex = j
    }
  }
  if (bestScore >= 0.3) {
    const pair = allEntries[i].id + '|' + allEntries[bestIndex].id
    if (CROSS_WHITELIST.has(pair)) {
      whitelistedCross++
    } else {
      falseCross++
      if (bestScore > maxFalseScore) maxFalseScore = bestScore
      if (crossSamples.length < 12) {
        crossSamples.push(allEntries[i].question + ' -> ' + allEntries[bestIndex].question + ' ' + bestScore.toFixed(3))
      }
    }
  }
}
const crossRate = falseCross / allEntries.length
check(
  'false-cross rate <= 0.5%',
  crossRate <= 0.005,
  falseCross + '/' + allEntries.length + ' = ' + (crossRate * 100).toFixed(2) + '% in ' + (Date.now() - crossStarted) + 'ms'
)
check('cross whitelist <= 20', CROSS_WHITELIST.size <= 20, String(CROSS_WHITELIST.size))
if (falseCross > 0) console.log('      cross samples: ' + crossSamples.join(' | '))

const latencies = []
let candidateTotal = 0
let candidateMax = 0
for (let i = 0; i < allEntries.length; i++) {
  const result = kb.query('我想知道' + allEntries[i].question, 3)
  latencies.push(result.elapsedMs)
  candidateTotal += result.candidateCount
  if (result.candidateCount > candidateMax) candidateMax = result.candidateCount
}
latencies.sort((a, b) => a - b)
const p50 = percentile(latencies, 0.5)
const p95 = percentile(latencies, 0.95)
const max = latencies[latencies.length - 1]
const candidateAverage = Math.round(candidateTotal / allEntries.length)
console.log(
  'Perf: build=' +
    stats.buildMs +
    'ms p50=' +
    p50 +
    'ms p95=' +
    p95 +
    'ms max=' +
    max +
    'ms candidates(avg/max)=' +
    candidateAverage +
    '/' +
    candidateMax
)
check('keyword map built', stats.keywordCount > 2000, String(stats.keywordCount))
check('build time recorded <= 800ms', stats.buildMs >= 0 && stats.buildMs <= 800, stats.buildMs + 'ms')
check('latency stats recorded', latencies.length === allEntries.length && p50 >= 0 && p95 >= p50, p50 + '/' + p95 + '/' + max)

const engine = new ReplyEngine({ knowledgeBase: kb, predictor: null })

// 候选评分必须保留原有 +3/+2/+1 权重，而不是只看关键词是否命中。
const formulaEntries = [
  { id: 'formula-question', question: '甲乙丙丁', answer: '问题命中占最高权重。', keywords: ['测试甲', '测试乙', '测试丙'] },
  { id: 'formula-keyword', question: '风马牛不相及', answer: '关键词命中占中间权重。', keywords: ['甲乙丙丁', '测试甲', '测试乙'] },
  { id: 'formula-answer', question: '风马牛不相及', answer: '甲乙丙丁只出现在答案里。', keywords: ['测试甲', '测试乙', '测试丙'] },
]
const formulaKb = new SimpleKnowledgeBase(packEntries(formulaEntries))
// 加一个非 CJK 标点，避免精确命中短路，单独验证候选公式权重。
const formulaPrepared = formulaKb.prepareQuery('甲乙丙丁？')
const formulaQuestionScore = formulaKb.scorePrepared(formulaPrepared, 0)
const formulaKeywordScore = formulaKb.scorePrepared(formulaPrepared, 1)
const formulaAnswerScore = formulaKb.scorePrepared(formulaPrepared, 2)
check(
  'weighted formula ranks question over keyword over answer',
  formulaQuestionScore > formulaKeywordScore &&
    formulaKeywordScore > formulaAnswerScore &&
    formulaAnswerScore > 0 &&
    formulaAnswerScore < 0.3,
  [formulaQuestionScore, formulaKeywordScore, formulaAnswerScore].map((value) => value.toFixed(3)).join(' / ')
)
check(
  'keyword match keeps its 2/3 formula weight',
  formulaKeywordScore >= 0.65,
  formulaKeywordScore.toFixed(3)
)

const lowerCaseKb = new SimpleKnowledgeBase(
  packEntries([
    { id: 'case-entry', question: 'BlueOS 是什么', answer: 'BlueOS 是手表系统。', keywords: ['BlueOS', '系统', '手表'] },
  ])
)
check(
  'question and keyword matching are case-insensitive',
  lowerCaseKb.query('blueos 是什么', 1).top[0]?.id === 'case-entry',
  lowerCaseKb.query('blueos 是什么', 1).top[0]?.id || '-'
)
const homeworkCases = [
  '求下列函数的值',
  '解方程 2x+3=7',
  '这道证明题怎么写',
  '作业答案发我',
  '计算题第三题',
  '选择题选哪个',
  '填空题不会',
  '应用题怎么做',
  '求导怎么做',
  '求积分 x平方',
  '计算积分',
  '化简这个式子',
  '因式分解 2x+4',
  '帮我做题',
  '我要做作业',
  '解题过程写一下',
  '你能帮我写作业吗',
  '3x+5=20怎么解',
  'x的平方加2x等于0',
  '求2的平方根',
  '证明三角形内角和',
  '英语翻译一下',
  '帮我写作文',
]
let homeworkHits = 0
for (const query of homeworkCases) {
  const reply = engine.reply(query)
  if (reply.mode === 'homework') homeworkHits++
  check(
    'homework refused: ' + query,
    reply.mode === 'homework' && reply.text === '我只能回答基础知识，作业题和复杂计算没法替你作答。',
    reply.mode + ' ' + reply.text
  )
}
check('all homework cases refused', homeworkHits === homeworkCases.length, homeworkHits + '/' + homeworkCases.length)

const scienceCases = [
  ['水的化学式', 'k2-science-water-molecule'],
  ['光速有多快', 'k2-science-light-speed'],
  ['水多少度沸腾', 'k2-science-boiling'],
  ['什么是欧姆定律', 'k2-science-ohm-law'],
  ['光合作用是什么', 'k2-science-photosynthesis'],
  ['鲸鱼是鱼吗', 'k2-science-whale'],
  ['积分是什么', 'k2-science-calculus'],
]
for (const [query, expected] of scienceCases) {
  const reply = engine.reply(query)
  check(
    'basic knowledge: ' + query,
    reply.mode !== 'homework' && reply.entryId === expected,
    reply.mode + ' ' + (reply.entryId || '-') + ' ' + reply.text
  )
}
for (const query of ['水多少度沸腾', '光速有多快', '什么是欧姆定律', '积分是什么', '平方根是什么', '什么是方程']) {
  const reply = engine.reply(query)
  check('homework guard leaves basics alone: ' + query, reply.mode !== 'homework', reply.mode)
}

// 改写问法必须走加权候选打分，不能只靠问题原句命中。
const paraphraseCases = [
  ['怎么快速入睡', ['d-cant-sleep', 'k2-food-cant-sleep']],
  ['怎么缓解压力', ['d-stress', 'x-stress', 'k2-emotion-stress-relief']],
  ['早餐吃点什么好', ['d-eat-breakfast']],
  ['手机充电要注意什么', ['k2-digital-phone-charge']],
  ['水的沸点是多少', ['k2-science-boiling']],
  ['鲸鱼为什么不是鱼', ['k2-science-whale']],
  ['积分是什么意思', ['k2-science-calculus']],
  ['冬天手机掉电特别快', ['k2-digital-cold-battery']],
  ['猫为什么晚上活动', ['k2-science-cat']],
  ['植物需要阳光吗', ['k2-science-photosynthesis']],
  ['太阳为什么会发光', ['k2-science-star']],
  ['动物为什么要冬眠', ['k2-science-bear']],
]
let paraphraseHits = 0
for (const [query, expectedIds] of paraphraseCases) {
  const reply = engine.reply(query)
  const hit = reply.mode === 'knowledge' && expectedIds.includes(reply.entryId)
  if (hit) paraphraseHits++
  check(
    'paraphrase answered: ' + query,
    hit,
    reply.mode + ' ' + (reply.entryId || '-') + ' ' + reply.text
  )
}
check(
  'all paraphrases answered',
  paraphraseHits === paraphraseCases.length,
  paraphraseHits + '/' + paraphraseCases.length
)

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL RELEASE KNOWLEDGE CHECKS PASSED')
