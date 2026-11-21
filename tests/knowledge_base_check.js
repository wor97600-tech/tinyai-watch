import entries from '../src/assets/knowledge_base.js'
import { KnowledgeBase, tokenize } from '../src/ai/knowledge_base.js'

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

const kb = new KnowledgeBase(entries)
const stats = kb.getStats()
console.log('Stats: ' + JSON.stringify(stats))
check('entry count', stats.entries === 80, String(stats.entries))
check('vocab built', stats.vocabSize > 500, String(stats.vocabSize))
check('build time recorded', typeof stats.buildMs === 'number' && stats.buildMs >= 0, String(stats.buildMs))

const cases = [
  ['模型多大', 'model-size'],
  ['需要联网吗', 'need-network'],
  ['准确率为什么低', 'low-accuracy'],
  ['怎么编译', 'build-rpk'],
  ['下一步做什么', 'next-plan'],
  ['什么是 Softmax', 'softmax'],
  ['资源读取失败怎么办', 'resource-fallback'],
  ['数据会上传吗', 'upload-data'],
  ['怎么换成自己的语料', 'own-corpus'],
  ['安装包在哪里', 'install-rpk'],
  ['为什么不用 GPU', 'no-gpu'],
  ['TAI1 是什么', 'tai1-format'],
]

for (const [query, expected] of cases) {
  const result = kb.query(query, 3)
  const top = result.top[0]
  check(
    'query ' + query + ' -> ' + expected,
    top && top.id === expected,
    top ? top.id + ' ' + top.score.toFixed(4) + ' / ' + result.elapsedMs + 'ms' : 'no result'
  )
  check(
    'top3 sorted for ' + query,
    result.top.length === 3 &&
      result.top[0].score >= result.top[1].score &&
      result.top[1].score >= result.top[2].score,
    result.top.map((item) => item.id + ':' + item.score.toFixed(3)).join(' ')
  )
  check(
    'scores in range for ' + query,
    result.top[0].score >= 0 && result.top[0].score <= 1.000001,
    result.top[0].score.toFixed(6)
  )
}

const empty = kb.query('', 3)
check('empty query', empty.top.length === 0, String(empty.top.length))

const unknown = kb.query('zzzz 未知 词汇 组合', 3)
check('unknown query has low score', unknown.top.length === 3 && unknown.top[0].score < 0.2, unknown.top[0].score.toFixed(4))

const tokens = tokenize('字符模型多大')
check('tokenizer unigrams', tokens.indexOf('u:模') >= 0, tokens.join(','))
check('tokenizer bigrams', tokens.indexOf('b:模型') >= 0, tokens.join(','))
check('tokenizer ascii', tokenize('Softmax 概率').indexOf('w:softmax') >= 0)

const repeatA = kb.query('需要联网吗', 3)
const repeatB = kb.query('需要联网吗', 3)
check(
  'repeat query deterministic',
  repeatA.top[0].id === repeatB.top[0].id && repeatA.top[0].score === repeatB.top[0].score
)

const many = kb.query('模型', 10)
check('topK limit', many.top.length === 10, String(many.top.length))

const timed = Date.now()
for (let i = 0; i < 20; i++) {
  kb.query('模型多大', 3)
}
const total = Date.now() - timed
check('20 queries executed', total >= 0, total + 'ms total')

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KNOWLEDGE BASE CHECKS PASSED')
