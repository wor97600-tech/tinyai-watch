import entries from '../src/assets/knowledge_base.js'
import { KnowledgeBase } from '../src/ai/knowledge_base.js'
import { loadFromJsonText } from '../src/ai/model_loader.js'
import { CharPredictor } from '../src/ai/char_predictor.js'
import charModelText from '../src/assets/char_model.js'

let checks = 0
const failures = []
function check(name, condition, detail) {
  checks++
  if (condition) console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  else { failures.push(name + (detail ? ': ' + detail : '')); console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : '')) }
}
const kb = new KnowledgeBase(entries)
const model = loadFromJsonText(charModelText)
const predictor = new CharPredictor(model, model.meta)
function generate(seedText, count) {
  const contextLength = model.meta.contextLength
  const cleaned = String(seedText).replace(/[^\u4e00-\u9fff]/g, '')
  let context = cleaned.length >= contextLength ? cleaned.slice(-contextLength) : cleaned
  if (context.length === 0) context = '你好'
  const start = Date.now()
  let out = ''
  for (let i = 0; i < count; i++) {
    const result = predictor.predict(context, 1)
    const ch = result.bestLabel
    if (!ch || ch.indexOf('<') === 0) break
    out += ch
    context = (context + ch).slice(-contextLength)
  }
  return { text: out, context, elapsedMs: Date.now() - start }
}
const kbCases = [
  ['模型多大', 'model-size'],
  ['需要联网吗', 'need-network'],
  ['下一步做什么', 'next-plan'],
  ['怎么编译', 'build-rpk'],
]
for (const [query, expected] of kbCases) {
  const result = kb.query(query, 1)
  const top = result.top[0]
  check('retrieval ' + query, top.id === expected, top.id + ' ' + top.score.toFixed(3))
  check('high confidence ' + query, top.score >= 0.15, top.score.toFixed(3))
  const cont = generate(top.answer, 4)
  check('continuation bounded ' + query, cont.text.length <= 4, cont.context + ' -> ' + cont.text)
  console.log('      ' + query + ' => ' + top.answer + ' || 续写: ' + cont.text)
}
for (const query of ['你好', '明天']) {
  const result = kb.query(query, 1)
  const top = result.top[0]
  check('low confidence ' + query, top.score < 0.15, top.score.toFixed(3))
  const cont = generate(query, 4)
  check('fallback generation ' + query, cont.text.length > 0 && /^[\u4e00-\u9fff]+$/.test(cont.text), cont.context + ' -> ' + cont.text)
  console.log('      ' + query + ' => 生成: ' + cont.text)
}
const fast = predictor.nextChar('你好')
const full = predictor.predict('你好', 1)
check(
  'nextChar fast path matches predict',
  fast.label === full.bestLabel && Math.abs(fast.score - full.bestScore) < 1e-6,
  fast.label
)
console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1) }
console.log('ALL HYBRID QA CHECKS PASSED')
