// 静态检查：键盘模板里点到的每个方法都必须在页面脚本里存在。
import fs from 'node:fs'

const file = './src/pages/Home/index.ux'
const source = fs.readFileSync(file, 'utf8')

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

const scriptEnd = source.indexOf('</script>')
const script = source.slice(0, scriptEnd)
const template = source.slice(source.indexOf('<template>'), source.indexOf('</style>'))

// 页面方法：export default 里 4 空格缩进的方法名
const methods = new Set()
const methodRe = /^ {4}([A-Za-z_$][\w$]*)\(/gm
let m
while ((m = methodRe.exec(script)) !== null) {
  methods.add(m[1])
}

// 模板里所有 onclick
const handlers = new Set()
const onclickRe = /onclick="([A-Za-z_$][\w$]*)/g
while ((m = onclickRe.exec(template)) !== null) {
  handlers.add(m[1])
}

const missing = []
handlers.forEach(function (name) {
  if (!methods.has(name)) {
    missing.push(name)
  }
})

check('keyboard handlers are all defined', missing.length === 0, missing.join(','))
check('has 26-key letters', /row1: \[[^\]]*'q'[^\]]*'p'[^\]]*\]/.test(script))
check('row1 is 10 keys', (script.match(/row1: \[([^\]]*)\]/) || ['', ''])[1].split(',').length === 10)
check('row2 is 9 keys', (script.match(/row2: \[([^\]]*)\]/) || ['', ''])[1].split(',').length === 9)
check('row3 is 9 keys (含逗号句号)', (script.match(/row3: \[([^\]]*)\]/) || ['', ''])[1].split(',').length === 9)
check('26 letters total', (function () {
  const letters = []
  ;['row1', 'row2', 'row3'].forEach(function (key) {
    const mm = script.match(new RegExp(key + ": \\[([^\\]]*)\\]"))
    if (!mm) return
    mm[1].split(',').forEach(function (item) {
      const ch = item.trim().replace(/'/g, '')
      if (/^[a-z]$/.test(ch)) letters.push(ch)
    })
  })
  return letters.length === 26 && new Set(letters).size === 26
})())
check('comma and period sit on letters page', /row3: \[[^\]]*'，'[^\]]*'。'[^\]]*\]/.test(script))
// 默认必须是离线键盘，官方输入法只是可选路径
check('default keyboard is self-drawn', /useOfficialKeyboard: false/.test(script))
check(
  'has keyboard source switch',
  methods.has('setKeyboardSource') &&
    methods.has('applyKeyboardSource') &&
    methods.has('loadKeyboardSource')
)
check('has source switch control in template', template.indexOf('class="kb-source"') !== -1)
check(
  'keyboard switch is a single toggle button',
  (template.match(/onclick="toggleKeyboardSource"/g) || []).length === 1 &&
    template.indexOf('onclick="setKeyboardSource(') === -1,
  'toggle=' + (template.match(/onclick="toggleKeyboardSource"/g) || []).length
)
check(
  'keyboard switch sits at the top of the chat page',
  template.indexOf('class="kb-source"') < template.indexOf('class="chat-scroll"')
)
check(
  'close row has only one button',
  (template.match(/class="kb-close"/g) || []).length === 1 && template.indexOf('kb-switch') === -1
)
check('trace log removed from header', template.indexOf('class="trace"') === -1 && script.indexOf('traceText') === -1)
check(
  'system ime carrier is a visible native input',
  /id="chat-input"[\s\S]{0,300}class="input-native"/.test(template) &&
    template.indexOf('show="false"') === -1
)
check(
  'one input capsule serves both keyboard sources',
  (template.match(/class="input-wrap"/g) || []).length === 1 &&
    /class="input-wrap" onclick="openKeyboard">[\s\S]{0,600}id="chat-input"/.test(template)
)
check(
  'native input is only mounted in official mode',
  /id="chat-input"[\s\S]{0,160}if="\{\{ useOfficialKeyboard(?: && inputActive)? \}\}"/.test(template)
)
check(
  'input bar is shared by both keyboard sources',
  template.indexOf('<div class="input-wrap" onclick="openKeyboard"') !== -1
)
check(
  'no programmatic focus on native input',
  script.indexOf('focusOfficialInput') === -1 && script.indexOf('.focus()') === -1
)
check(
  'key rows are statically bound (no $item in handlers)',
  !/onclick="pressKey\(\$item\)/.test(template)
)
check(
  'all 26 letters appear as static keys',
  (function () {
    const letters = 'qwertyuiopasdfghjklzxcvbnm'.split('')
    return letters.every(function (ch) {
      return template.indexOf("onclick=\"pressKey('" + ch + "')\"") !== -1
    })
  })()
)
check(
  'no focus call at startup',
  !/onInit\(\) \{[\s\S]{0,600}focus\(/.test(script)
)
check(
  'keyboard is a same-page view (no overlay)',
  /<div class="view kb-view"( if="\{\{ showKeyboard \}\}")?>/.test(template)
)
check(
  'only one view exists at a time',
  template.indexOf('class="view kb-view" if="{{ showKeyboard }}"') !== -1
)
check(
  'chat view hidden while keyboard open',
  template.indexOf('class="view chat-view" if="{{ !showKeyboard }}"') !== -1
)
check(
  'no fixed/absolute positioning left',
  !/position:\s*(fixed|absolute)/.test(source)
)
check(
  'letter rows only render on letters page',
  (template.match(/class="kb-row kb-row[123]" if="\{\{ !candExpanded && kbPage === 'letters' \}\}"/g) || []).length === 3
)
check(
  'number rows only render on numbers page',
  (template.match(/class="kb-row kb-row[123]" if="\{\{ !candExpanded && kbPage === 'numbers' \}\}"/g) || []).length === 3
)
check('candidate slots are 3', (template.match(/class="kb-cand"/g) || []).length === 3)
check('candidate slots flex evenly', /\.kb-cand \{[^}]*flex: 1/.test(source))
check('has candidate expand button', template.indexOf('class="kb-cand-more"') !== -1 && methods.has('expandCandidates'))
check('has 12 candidate slots', (function () {
  for (let i = 0; i < 12; i++) {
    if (template.indexOf('onclick="pickCandidate(cand' + i + ')"') === -1) return false
  }
  return true
})())

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL KEYBOARD UX CHECKS PASSED')
