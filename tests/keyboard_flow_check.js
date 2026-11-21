// 键盘交互流程测试：把页面脚本抽出来，在 Node 里跑真实按键序列。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const uxPath = path.join(root, 'src', 'pages', 'Home', 'index.ux')
const source = fs.readFileSync(uxPath, 'utf8')

const script = source.slice(source.indexOf('<script>') + 8, source.indexOf('</script>'))
const body = script.replace(/^\s*import .*$/gm, '')

const header = [
  "import { getCandidates } from '../src/input/pinyin_engine.js'",
  "const parseBinaryModel = function () { throw new Error('stub parseBinaryModel') }",
  "class CharPredictor { constructor() {} }",
  'const knowledgeEntries = []',
  'const dailyEntries = []',
  'const dailyExtraEntries = []',
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
const tmpFile = path.join(tmpDir, 'keyboard_page_check.mjs')
fs.writeFileSync(tmpFile, header + body, 'utf8')

const mod = await import(pathToFileURL(tmpFile).href)
const pageDef = mod.default

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

function makePage() {
  const page = Object.assign({}, JSON.parse(JSON.stringify(pageDef.data)))
  for (const key of Object.keys(pageDef)) {
    if (key !== 'data') {
      page[key] = pageDef[key]
    }
  }
  // 截住发送，只记录文本
  page.sent = []
  page.submitText = function (raw) {
    page.sent.push(raw)
    page.draftText = ''
  }
  return page
}

function type(page, text) {
  for (const ch of text) {
    page.pressKey(ch)
  }
}

// 1. 中文输入 nihao
let page = makePage()
page.openKeyboard()
check('keyboard opens', page.showKeyboard === true)
type(page, 'nihao')
check('typed pinyin keeps raw letters', page.typedPinyin === 'nihao', page.typedPinyin)
check('candidate0 is 你好', page.cand0 === '你好', page.cand0)
check('candidates filled', [page.cand0, page.cand1, page.cand2].filter(Boolean).length >= 1)

page.pickCandidate(page.cand0)
check('candidate commits to draft', page.draftText === '你好', page.draftText)
check('pinyin cleared after commit', page.typedPinyin === '', page.typedPinyin)
check('candidates cleared after commit', page.cand0 === '')

// 2. 空格选第一个候选
page = makePage()
page.openKeyboard()
type(page, 'jintian')
page.pressSpace()
check('space picks first candidate', page.draftText === '今天', page.draftText)
check('space clears pinyin', page.typedPinyin === '')

// 3. 退格先删拼音，再删正文
page = makePage()
page.openKeyboard()
type(page, 'ni')
check('typed ni', page.typedPinyin === 'ni')
page.pressDelete()
check('backspace removes one pinyin letter', page.typedPinyin === 'n', page.typedPinyin)
page.pressDelete()
check('backspace empties pinyin', page.typedPinyin === '')
page.pressDelete()
check('backspace on empty pinyin keeps draft empty', page.draftText === '')

page.pickCandidate('你')
page.pressDelete()
check('backspace removes draft char when no pinyin', page.draftText === '', page.draftText)

// 4. 未知拼音当字母上屏
page = makePage()
page.openKeyboard()
type(page, 'zzzz')
page.pressSpace()
check('unknown pinyin committed as letters', page.draftText === 'zzzz', page.draftText)

// 5. 英文模式直接进正文
page = makePage()
page.openKeyboard()
page.toggleKbMode()
check('mode switches to EN', page.kbMode === 'EN')
type(page, 'ok')
check('EN types straight into draft', page.draftText === 'ok', page.draftText)
check('EN does not fill pinyin', page.typedPinyin === '')

// 6. 数字页直接进正文
page = makePage()
page.openKeyboard()
page.toggleKbPage()
check('page switches to numbers', page.kbPage === 'numbers')
type(page, '123')
check('numbers type into draft', page.draftText === '123', page.draftText)
page.toggleKbPage()
check('page switches back to letters', page.kbPage === 'letters')

// 7. 切换模式时未上屏的拼音不丢
page = makePage()
page.openKeyboard()
type(page, 'nihao')
page.toggleKbMode()
check('switching to EN keeps typed letters', page.draftText === 'nihao', page.draftText)

// 8. 发送：先提交拼音再发送
page = makePage()
page.openKeyboard()
type(page, 'xiexie')
page.sendFromKeyboard()
check('send commits candidate first', page.sent[0] === '谢谢', page.sent[0])
check('send closes keyboard', page.showKeyboard === false)

// 8.5 切数字页不丢拼音
page = makePage()
page.openKeyboard()
type(page, 'nihao')
page.toggleKbPage()
check('page switch keeps typed pinyin', page.draftText === 'nihao', page.draftText)
check('page switch clears pinyin bar', page.typedPinyin === '')

// 8.6 四字词能进候选
page = makePage()
page.openKeyboard()
type(page, 'shengri')
const four = [page.cand0, page.cand1, page.cand2].filter(Boolean)
check('four-char candidate reachable', four.indexOf('生日快乐') !== -1, four.join('/'))

// 9. 拼音长度上限
page = makePage()
page.openKeyboard()
type(page, 'a'.repeat(30))
check('pinyin capped at 24', page.typedPinyin.length === 24, String(page.typedPinyin.length))

// 10. 正文长度上限
page = makePage()
page.openKeyboard()
page.toggleKbMode()
type(page, 'x'.repeat(80))
check('draft capped at 60', page.draftText.length === 60, String(page.draftText.length))

// 11. 关闭键盘清空拼音
page = makePage()
page.openKeyboard()
type(page, 'nih')
page.closeKeyboard()
check('close clears pinyin', page.typedPinyin === '')
check('close clears candidates', page.cand0 === '')
check('close hides overlay', page.showKeyboard === false)

// 12. 点拼音条把字母当正文
page = makePage()
page.openKeyboard()
type(page, 'abc')
page.commitPinyinAsText()
check('pinyin bar commits letters', page.draftText === 'abc', page.draftText)

// 13. 顶部预览只留末尾 12 字
page = makePage()
page.openKeyboard()
type(page, 'a'.repeat(30))
page.commitPinyinAsText()
check('draft preview keeps tail', page.draftPreview.length === 11 && page.draftPreview.charAt(0) === '…', page.draftPreview)
check('draft preview follows delete', (function () {
  page.pressDelete()
  const t = page.draftText
  const want = t.length > 10 ? '…' + t.slice(t.length - 10) : t
  return page.draftPreview === want
})(), page.draftPreview)

// 14. 打开键盘时同步预览已有正文
page = makePage()
page.draftText = '你好'
page.openKeyboard()
check('open syncs preview', page.draftPreview === '你好', page.draftPreview)

// 15. 默认是离线键盘
page = makePage()
check('default source is self-drawn', page.useOfficialKeyboard === false)

// 16. 切到官方键盘：关掉自绘覆盖层，选择被记住
page = makePage()
page.openKeyboard()
check('overlay open before switch', page.showKeyboard === true)
page.setKeyboardSource(true)
check('switch sets official mode', page.useOfficialKeyboard === true)
check('switch closes overlay', page.showKeyboard === false)
check('switch label shows official', page.kbSourceLabel === '键盘：官方', page.kbSourceLabel)

// 17. 官方模式下点输入栏不弹离线键盘，也不做代码 focus
page = makePage()
page.setKeyboardSource(true)
let focused = 0
page.$element = function () {
  focused++
  return { focus: function () {}, value: '' }
}
page.openKeyboard()
check('official mode does not open overlay', page.showKeyboard === false)
await new Promise(function (r) { setTimeout(r, 5) })
check('official mode never calls focus()', focused === 0)

// 18. 切回离线键盘恢复覆盖层
page = makePage()
page.setKeyboardSource(true)
page.setKeyboardSource(false)
check('switch back to self-drawn', page.useOfficialKeyboard === false)
check('switch label shows offline', page.kbSourceLabel === '键盘：离线', page.kbSourceLabel)

// 16b. 一个键切换：按一次切一次，来回都对
page = makePage()
check('toggle starts on offline', page.useOfficialKeyboard === false && page.kbSourceLabel === '键盘：离线', page.kbSourceLabel)
page.toggleKeyboardSource()
check('one tap goes official', page.useOfficialKeyboard === true && page.kbSourceLabel === '键盘：官方', page.kbSourceLabel)
page.toggleKeyboardSource()
check('second tap goes back offline', page.useOfficialKeyboard === false && page.kbSourceLabel === '键盘：离线', page.kbSourceLabel)
check('toggle keeps choice persisted', page.kbSourceLabel === '键盘：离线', page.kbSourceLabel)
page.openKeyboard()
check('self-drawn overlay works again', page.showKeyboard === true)
type(page, 'ni')
check('self-drawn typing still works', page.typedPinyin === 'ni')

// 19. 切换时未上屏拼音落成正文，不丢字
page = makePage()
page.openKeyboard()
type(page, 'nihao')
page.setKeyboardSource(true)
check('switch commits pending pinyin', page.draftText === 'nihao', page.draftText)
check('switch clears pinyin bar', page.typedPinyin === '')

// 20. 官方键盘回调同步正文
page = makePage()
page.setKeyboardSource(true)
page.onInputChange({ value: '你好呀' })
check('official onchange syncs draft', page.draftText === '你好呀', page.draftText)
page.onInputChange('字符串事件')
check('official onchange accepts string', page.draftText === '字符串事件', page.draftText)
page.onInputChange({ detail: { value: '详情事件' } })
check('official onchange accepts detail', page.draftText === '详情事件', page.draftText)
page.onInputChange(null)
check('official onchange ignores garbage', page.draftText === '详情事件', page.draftText)

// 21. 官方模式发送优先读原生输入框里的实时文字
page = makePage()
page.setKeyboardSource(true)
page.draftText = '旧内容'
page.$element = function () {
  return { value: '新内容', focus: function () {} }
}
page.sendMessage()
check('official send reads live value', page.sent[0] === '新内容', page.sent[0])

// 22. 离线模式发送仍走 draftText
page = makePage()
page.draftText = '自绘内容'
page.sendMessage()
check('self-drawn send uses draftText', page.sent[0] === '自绘内容', page.sent[0])

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KEYBOARD FLOW CHECKS PASSED')
