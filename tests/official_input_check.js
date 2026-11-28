// 官方键盘输入链路回归：非受控输入框 + thinking 看门狗。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const uxPath = path.join(root, 'src', 'pages', 'Home', 'index.ux')
const source = fs.readFileSync(uxPath, 'utf8')
const template = source.slice(source.indexOf('<template>'), source.indexOf('</template>'))

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

// ---- 模板层：原生输入框必须是非受控的 ----
const nativeInput = template.slice(template.indexOf('id="chat-input"'), template.indexOf('id="chat-input"') + 400)
check('native input has no value binding', !/value="\{\{\s*draftText\s*\}\}"/.test(nativeInput))
check('native input listens to oninput', /oninput="onInputChange"/.test(nativeInput))
check('native input still listens to onchange', /onchange="onInputChange"/.test(nativeInput))

// ---- 脚本层 ----
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
  'const storageGet = async function () { return "" }',
  'const storageSet = async function () {}',
  'const charModelQMeta = {}',
  '',
].join('\n')

const tmpDir = path.join(root, '.tmp')
fs.mkdirSync(tmpDir, { recursive: true })
const tmpFile = path.join(tmpDir, 'official_input_page.mjs')
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

check('has clearOfficialInput', typeof pageDef.clearOfficialInput === 'function')
check('has seedOfficialInput', typeof pageDef.seedOfficialInput === 'function')
check('has releaseOfficialInputFocus', typeof pageDef.releaseOfficialInputFocus === 'function')

// 发完一条必须：先清空原生框，再把焦点放掉（否则第二次点不弹键盘）
function makeNative(log, initial) {
  return {
    value: initial,
    blur: function () {
      log.push('blur:' + this.value)
    },
  }
}

let page = makePage()
const clearLog = []
const clearEl = makeNative(clearLog, '旧消息')
page.$element = function (id) {
  return id === 'chat-input' ? clearEl : null
}
page.useOfficialKeyboard = true // 只有官方键盘模式下才碰原生框
page.clearOfficialInput()
check('clearOfficialInput empties native value', clearEl.value === '', JSON.stringify(clearEl.value))
check(
  'clearOfficialInput clears then blurs',
  clearLog.length >= 1 && clearLog[0] === 'blur:',
  JSON.stringify(clearLog)
)

// 发完一条不能留残影：卸掉输入框重建，同时挡掉补发的旧 onchange
check(
  'template remounts native input',
  /if="\{\{\s*useOfficialKeyboard && inputActive\s*\}\}"/.test(nativeInput)
)

page = makePage()
const leftoverEl = makeNative([], '上一句')
page.$element = function (id) {
  return id === 'chat-input' ? leftoverEl : null
}
page.useOfficialKeyboard = true
page.clearOfficialInput()
check('clear suppresses input sync', page.suppressInputSync === true)
check('clear unmounts native input', page.inputActive === false)
check('clear empties native value', leftoverEl.value === '', JSON.stringify(leftoverEl.value))

page = makePage()
page.suppressInputSync = true
page.draftText = ''
page.onInputChange({ value: '旧话' })
check('suppressed onInputChange ignored', page.draftText === '', page.draftText)
page.suppressInputSync = false
page.onInputChange({ value: '新话' })
check('normal onInputChange syncs', page.draftText === '新话', page.draftText)

// 切回离线键盘要把系统输入法收掉
page = makePage()
const switchLog = []
const switchEl = makeNative(switchLog, '草稿')
page.$element = function (id) {
  return id === 'chat-input' ? switchEl : null
}
page.setKeyboardSource(true)
switchEl.value = '草稿' // 模拟用户在系统输入法里打了字
switchLog.length = 0
page.setKeyboardSource(false)
check(
  'switching back to offline blurs native input',
  switchLog.length >= 1 && switchLog[0].indexOf('blur') === 0,
  JSON.stringify(switchLog)
)
check('switching back to offline keeps draft', page.draftText === '草稿', page.draftText)

check('has armReplyWatchdog', typeof pageDef.armReplyWatchdog === 'function')
check('has disarmReplyWatchdog', typeof pageDef.disarmReplyWatchdog === 'function')

// thinking 时不静默丢弃
page = makePage()
page.setKeyboardSource(true)
page.thinking = true
page.draftText = '你好'
page.submitText('你好')
check('thinking gate keeps draft', page.draftText === '你好', page.draftText)
check('thinking gate shows hint', /还在说/.test(String(page.errorMessage)), String(page.errorMessage))

// 看门狗：超时后强制复位 thinking
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
let captured = null
let cleared = 0
const scheduled = []
globalThis.setTimeout = function (fn, delay) {
  captured = fn
  const task = { fake: true, fn: fn, delay: delay }
  scheduled.push(task)
  return task
}
globalThis.clearTimeout = function () {
  cleared++
}
page = makePage()
page.thinking = true
page.armReplyWatchdog()
check('watchdog armed', typeof captured === 'function')
const before = page.messages.length
captured()
check('watchdog resets thinking', page.thinking === false)
check('watchdog adds fallback message', page.messages.length === before + 1, String(page.messages.length))
check('watchdog clears streaming', page.streamingText === '')

// 整句“知识库”必须先同步显示用户气泡和统计中的状态，不能等统计完成才渲染。
scheduled.length = 0
page = makePage()
page.useOfficialKeyboard = true
page.submitText('知识库')
const immediateUserMessages = page.messages.filter(function (message) { return message.role === 'user' })
check('knowledge command immediately adds one user bubble', immediateUserMessages.length === 1 && immediateUserMessages[0].text === '知识库')
check('knowledge command immediately shows thinking state', page.thinking === true && page.streamingText === '统计知识库…')
check('knowledge command also removes old native input immediately', page.inputActive === false)
check('knowledge command schedules deferred UI work', scheduled.length >= 3, String(scheduled.length))
page.cancelKnowledgeStats()
page.cancelOfficialInputClear()
page.disarmReplyWatchdog()

// 发送普通消息时，加载知识库必须等到首轮界面更新之后。
scheduled.length = 0
captured = null
page = makePage()
page.useOfficialKeyboard = true
let loadCalls = 0
page.loadKnowledgeBase = function () { loadCalls++; return Promise.resolve(true) }
const oldInput = makeNative([], '鲸鱼是鱼吗')
page.$element = function () { return page.inputActive ? oldInput : null }
page.sendMessage()
check('normal send immediately displays message and thinking', page.messages[0]?.text === '鲸鱼是鱼吗' && page.thinking && !page.streamingText)
check('normal send waits before loading knowledge', loadCalls === 0)
check('normal send immediately removes stale native input', !page.inputActive && oldInput.value === '')
const deferredStart = captured
check('normal send arms deferred reply', typeof deferredStart === 'function')
let buildReplyCalls = 0
page.buildReply = function () { buildReplyCalls++ }
deferredStart()
check('deferred reply loads knowledge once', loadCalls === 1)
await Promise.resolve()
const replyBuildTimer = scheduled[scheduled.length - 1]
check(
  'reply waits for the UI to render before synchronous matching',
  !!replyBuildTimer && typeof replyBuildTimer.delay === 'number' && replyBuildTimer.delay >= 120,
  String(replyBuildTimer && replyBuildTimer.delay)
)
if (replyBuildTimer && typeof replyBuildTimer.fn === 'function') replyBuildTimer.fn()
check('reply starts only after the render wait', buildReplyCalls === 1, String(buildReplyCalls))
page.cancelOfficialInputClear()
page.disarmReplyWatchdog()

// 正常结束时收起看门狗
captured = null
page = makePage()
page.thinking = true
page.armReplyWatchdog()
page.finishReply('好的', '规则')
check('finishReply disarms watchdog', page.thinking === false && cleared > 0, 'cleared=' + cleared)

globalThis.setTimeout = realSetTimeout
globalThis.clearTimeout = realClearTimeout

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL OFFICIAL INPUT CHECKS PASSED')
