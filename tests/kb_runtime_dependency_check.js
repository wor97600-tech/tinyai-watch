import fs from 'node:fs'

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

const simpleSource = fs.readFileSync('src/ai/simple_kb.js', 'utf8')
const replySource = fs.readFileSync('src/ai/reply_engine.js', 'utf8')
const tokenizerPath = 'src/ai/tokenizer.js'
const tokenizerSource = fs.existsSync(tokenizerPath) ? fs.readFileSync(tokenizerPath, 'utf8') : ''

check('lightweight tokenizer module exists', tokenizerSource.length > 0, tokenizerPath)
check(
  'simple knowledge base does not import full TF-IDF module',
  simpleSource.includes("from './tokenizer.js'") && !simpleSource.includes("from './knowledge_base.js'"),
  'simple_kb.js'
)
check(
  'reply engine does not import full TF-IDF module',
  replySource.includes("from './tokenizer.js'") && !replySource.includes("from './knowledge_base.js'"),
  'reply_engine.js'
)
check(
  'lightweight tokenizer has no TF-IDF dependency',
  tokenizerSource.includes('export function tokenize') && !tokenizerSource.includes("from './matrix.js'") && !tokenizerSource.includes('class KnowledgeBase'),
  tokenizerPath
)

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL RUNTIME DEPENDENCY CHECKS PASSED')
