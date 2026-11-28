import { getCandidates, normalizePinyin, MAX_PINYIN_LENGTH } from '../src/input/pinyin_engine.js'

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

function first(value) {
  return getCandidates(value, 5)[0] || ''
}

check('normalize keeps ascii lower-case', normalizePinyin('NiHao') === 'nihao')
check('normalize maps ü to v', normalizePinyin('nü') === 'nv')
check('normalize strips separators', normalizePinyin('ni-hao!') === 'nihao')
check('normalize caps length', normalizePinyin('a'.repeat(40)).length === MAX_PINYIN_LENGTH)
check('nihao -> 你好', first('nihao') === '你好', first('nihao'))
check('nih -> 你好', first('nih') === '你好', first('nih'))
check('ni -> 你', first('ni') === '你', first('ni'))
check('jintian -> 今天', first('jintian') === '今天', first('jintian'))
check('woaini -> 我爱你', first('woaini') === '我爱你', first('woaini'))
check('nihaoma -> 你好吗', first('nihaoma') === '你好吗', first('nihaoma'))
check('xiexie -> 谢谢', first('xiexie') === '谢谢', first('xiexie'))
check('unknown pinyin is committed as text', first('zzzz') === 'zzzz', first('zzzz'))
check('candidate limit is respected', getCandidates('ni', 3).length <= 3, String(getCandidates('ni', 3).length))
check('candidate list has no duplicates', new Set(getCandidates('ni', 5)).size === getCandidates('ni', 5).length)
check('empty input has no candidates', getCandidates('', 5).length === 0)
check('wuli includes 物理', getCandidates('wuli', 5).includes('物理'), getCandidates('wuli', 5).join('/'))
check('shengwu includes 生物', getCandidates('shengwu', 5).includes('生物'), getCandidates('shengwu', 5).join('/'))
check('zhiwu includes 植物', getCandidates('zhiwu', 5).includes('植物'), getCandidates('zhiwu', 5).join('/'))
check('zhishi includes 知识', getCandidates('zhishi', 5).includes('知识'), getCandidates('zhishi', 5).join('/'))
check('xinqing includes 心情', getCandidates('xinqing', 5).includes('心情'), getCandidates('xinqing', 5).join('/'))
check('yinliao includes 饮料', getCandidates('yinliao', 5).includes('饮料'), getCandidates('yinliao', 5).join('/'))
check('qiandao includes 签到', getCandidates('qiandao', 5).includes('签到'), getCandidates('qiandao', 5).join('/'))
check('daoshu includes 导数', getCandidates('daoshu', 5).includes('导数'), getCandidates('daoshu', 5).join('/'))

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length > 0) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL PINYIN ENGINE CHECKS PASSED')
