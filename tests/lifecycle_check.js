// 生命周期回归：熄屏/切后台必须把后台资源收干净，否则手表会整机卡死。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const uxPath = path.join(root, 'src', 'pages', 'Home', 'index.ux')
const source = fs.readFileSync(uxPath, 'utf8')

const failures = []
let checks = 0
function check(name, condition, detail) {
  checks++
  if (condition) {
    console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  } else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

const script = source.slice(source.indexOf('<script>') + 8, source.indexOf('</script>'))
const body = script.replace(/^\s*import .*$/gm, '')
const header = [
  "import { getCandidates } from '../src/input/pinyin_engine.js'",
  "const parseBinaryModel = function () { throw new Error('stub parseBinaryModel') }",
  "class CharPredictor { constructor() {} }",
  'const knowledgeEntries = []',
  'const dailyEntries = []',
  'const dailyExtraEntries = []',
  'const kbV2Entries = []',
  'class SimpleKnowledgeBase { constructor() {} }',
  'class ReplyEngine { constructor() {} cancelStream() {} }',
  'const isCreativeRequest = function () { return false }',
  'const runBenchmarkAsync = async function () { return {} }',
  'const cancelBenchmark = function () {}',
  'const formatBenchmark = function () { return "" }',
  'const fileReadArrayBuffer = async function () { return new ArrayBuffer(0) }',
  "const storageGet = function () { return Promise.resolve(globalThis.__tinyAiTestHistory || '') }",
  'const storageSet = async function () {}',
  'const charModelQMeta = {}',
  '',
].join('\n')

const tmpDir = path.join(root, '.tmp')
fs.mkdirSync(tmpDir, { recursive: true })
const tmpFile = path.join(tmpDir, 'lifecycle_page.mjs')
fs.writeFileSync(tmpFile, header + body, 'utf8')
const mod = await import(pathToFileURL(tmpFile).href)
const pageDef = mod.default

function makePage() {
  const page = Object.assign({}, JSON.parse(JSON.stringify(pageDef.data)))
  for (const key of Object.keys(pageDef)) {
    if (key !== 'data') page[key] = pageDef[key]
  }
  return page
}

check('has onHide', typeof pageDef.onHide === 'function')
check('has onShow', typeof pageDef.onShow === 'function')
check('has onDestroy', typeof pageDef.onDestroy === 'function')
check('data has pausedReply', pageDef.data.pausedReply === false)

// 熄屏时正在回复：必须停下来，并且记住“被打断了”
// Startup must stay light: the knowledge base loads only on demand.
let page = makePage()
let knowledgeLoads = 0
page.loadKnowledgeBase = function () {
  knowledgeLoads++
  return Promise.resolve(true)
}
page.onInit()
check('onInit does not eager-load knowledge base', knowledgeLoads === 0, 'loads=' + knowledgeLoads)
page = makePage()
let cleared = 0
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
globalThis.setTimeout = function () {
  return { fake: true }
}
globalThis.clearTimeout = function () {
  cleared++
}
page.thinking = true
page.streamingText = '写到一半'
page.streamingMeta = '纯模型'
page.showKeyboard = true
page.typedPinyin = 'nihao'
page.armReplyWatchdog()
page.onHide()
check('onHide stops thinking', page.thinking === false)
check('onHide clears streaming text', page.streamingText === '' && page.streamingMeta === '')
check('onHide closes offline keyboard', page.showKeyboard === false && page.typedPinyin === '')
check('onHide disarms watchdog', cleared > 0, 'cleared=' + cleared)
check('onHide remembers interrupted reply', page.pausedReply === true)

// 回到前台：提示被打断
const before = page.messages.length
page.onShow()
check('onShow reports interrupted reply', page.messages.length === before + 1, String(page.messages.length))
check('onShow clears pausedReply', page.pausedReply === false)

// 空闲熄屏：没有回复在跑，就不该冒出提示
page = makePage()
page.onHide()
const idleBefore = page.messages.length
page.onShow()
check('idle onShow adds nothing', page.messages.length === idleBefore && page.pausedReply === false)

// 官方键盘模式下回到前台要重新接输入框
page = makePage()
page.useOfficialKeyboard = true
page.draftText = '你好'
const el = { value: '', blur: function () {} }
page.$element = function (id) {
  return id === 'chat-input' ? el : null
}
page.onShow()
check('onShow reseeds official input', el.value === '你好', JSON.stringify(el.value))

// 销毁时清掉看门狗
page = makePage()
cleared = 0
page.thinking = true
page.armReplyWatchdog()
page.onDestroy()
check('onDestroy disarms watchdog', cleared > 0, 'cleared=' + cleared)

globalThis.setTimeout = realSetTimeout
globalThis.clearTimeout = realClearTimeout

// 滚动偏移不能是 100000 这种不存在的值
const scrollBody = script.slice(script.indexOf('scrollToBottom()'), script.indexOf('scrollToBottom()') + 600)
check('no huge scroll offset', !/100000/.test(scrollBody))
page = makePage()
page.messages = new Array(24).fill({ id: 1, role: 'ai', text: 'x', meta: '' })
page.scrollToBottom()
check('scrollToBottom bounded', page.scrollTop > 0 && page.scrollTop < 10000, String(page.scrollTop))

// 手表聊天列表保持轻量，避免消息越多 UI diff 越慢。
check('MAX_MESSAGES is 12', /const MAX_MESSAGES = 12/.test(script))
page = makePage()
for (let i = 0; i < 40; i++) page.addMessage('ai', 'msg' + i, '')
check('message list capped', page.messages.length === 12, String(page.messages.length))

page = makePage()
globalThis.__tinyAiTestHistory = JSON.stringify(
  Array.from({ length: 20 }, function (_, i) { return { role: 'user', text: 'history' + i } })
)
page.loadChatHistory()
await Promise.resolve()
check(
  'restored history is capped to the recent 12 messages',
  page.messages.length === 12 && page.messages[0].text === 'history8' && page.messages[11].text === 'history19',
  page.messages.length + ' ' + (page.messages[0] && page.messages[0].text) + ' ' + (page.messages[11] && page.messages[11].text)
)
delete globalThis.__tinyAiTestHistory

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL LIFECYCLE CHECKS PASSED')
