// 生成离线拼音数据（全部来自 MIT 开源项目）：
//   单字拼音: mozillazg/pinyin-data
//   词语拼音: mozillazg/phrase-pinyin-data
//   词频排序: fxsjy/jieba dict.txt
// 输出 src/assets/pinyin_data.js，格式与 pinyin_engine.js 约定一致。
import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('.tmp/opendict')
const OUT = path.resolve('src/assets/pinyin_data.js')

const CHAR_LIMIT = 4600
const WORD_LIMIT = 6000
const CHAR_PER_GROUP = 14
const WORD_PER_GROUP = 6
const BOOST = 90000

// 手表聊天高频词：语料频率排不进前列，但日常一定会用到，单独提权。
const EVERYDAY = (
  '你好 您好 早上好 晚上好 中午好 晚安 早安 再见 拜拜 谢谢 多谢 不客气 对不起 没关系 抱歉 ' +
  '好的 好啊 行 可以 不行 没问题 知道了 明白 懂了 是的 不是 对的 错了 也许 可能 应该 ' +
  '吃饭 吃了吗 早饭 午饭 晚饭 喝水 睡觉 起床 上班 下班 加班 开会 出差 请假 放假 休息 ' +
  '回家 出门 到了 路上 堵车 打车 坐车 地铁 公交 开车 骑车 走路 散步 跑步 锻炼 运动 健身 ' +
  '今天 明天 昨天 后天 前天 早上 上午 中午 下午 晚上 夜里 现在 刚才 马上 等会 一会 时候 ' +
  '时间 几点 多久 多久了 什么时候 星期几 周末 周一 周二 周三 周四 周五 周六 周日 ' +
  '天气 下雨 下雪 刮风 晴天 阴天 冷 热 好热 好冷 温度 空气 雾霾 太阳 月亮 星星 ' +
  '手机 手表 充电 没电 电量 网络 信号 消息 微信 电话 打电话 发消息 视频 音乐 电影 电视 ' +
  '喜欢 讨厌 开心 难过 生气 累了 好累 困了 饿了 渴了 无聊 有意思 没意思 好玩 好看 好听 ' +
  '想你 爱你 想你了 想我 在吗 在不在 干嘛 干什么 怎么了 为什么 怎么样 好不好 行不行 ' +
  '多少钱 便宜 贵 买单 付款 红包 工资 加班费 存钱 花钱 借钱 还钱 ' +
  '爸爸 妈妈 儿子 女儿 老婆 老公 孩子 家里 爸妈 家人 朋友 同学 同事 老板 老师 医生 ' +
  '工作 项目 会议 报告 方案 需求 修改 完成 提交 上线 测试 版本 功能 问题 解决 讨论 ' +
  '知道 不知道 觉得 认为 希望 想要 需要 记得 忘了 试试 看看 听听 想想 说说 问问 ' +
  '一下 一会儿 一点 有点 很多 太少 差不多 当然 其实 反正 随便 都行 好吧 算了 ' +
  '健康 感冒 发烧 头疼 咳嗽 医院 吃药 打针 体检 睡觉了 洗澡 刷牙 洗脸 理发 剪头发 ' +
  '加油 厉害 牛 牛逼 厉害啊 太棒了 真棒 不错 挺好 完美 加油啊 恭喜 生日快乐 新年快乐 ' +
  '情人节 春节 中秋 国庆 生日 节日 礼物 约会 见面 一起 等我 等我一下 我马上到 快到了'
).split(/\s+/).filter(Boolean)

// 第二批日常词：家人称呼、快递外卖、手表/手机、支付这些聊天里绕不开的词。
const EVERYDAY2 = (
  '小姐姐 阿姨 叔叔 舅舅 姑姑 表哥 表姐 表妹 堂哥 室友 邻居 男朋友 女朋友 ' +
  '快递 外卖 超市 商场 药店 银行 停车 加油站 充电宝 耳机 充电器 数据线 鼠标 键盘 屏幕 电池 ' +
  '闹钟 日历 备忘录 提醒 拍照 照片 相册 录音 语音 表情 点赞 评论 转发 关注 粉丝 直播 短视频 ' +
  '游戏 笑话 段子 预报 温度 风力 湿度 空气质量 紫外线 转账 余额 支付 密码 账号 登录 注册 ' +
  '下载 安装 更新 卸载 流量 套餐 话费 表盘 表带 戴好 摘下来 出门了 到家了 我到了 在路上'
).split(/\s+/).filter(Boolean)

const TONE = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'a': 'a',
  'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e', 'e': 'e',
  'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'i': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o', 'o': 'o',
  'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'u': 'u',
  'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v', 'ü': 'v', 'v': 'v',
  'ń': 'n', 'ň': 'n', 'ǹ': 'n', 'n': 'n',
  'ḿ': 'm', 'm': 'm',
  'ê': 'e',
}

function normalize(syllable) {
  const raw = String(syllable || '').trim().toLowerCase()
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (TONE[ch] !== undefined) {
      out += TONE[ch]
    } else if (ch >= 'a' && ch <= 'z') {
      out += ch
    }
  }
  return out
}

const isHan = (ch) => /[\u4e00-\u9fff]/.test(ch)
const allHan = (word) => {
  for (let i = 0; i < word.length; i++) {
    if (!isHan(word[i])) return false
  }
  return word.length > 0
}

// ---------- 1. 单字拼音 ----------
const charReadings = new Map()
const charLines = fs.readFileSync(path.join(SRC_DIR, 'char_pinyin.txt'), 'utf8').split('\n')
for (const line of charLines) {
  if (!line || line[0] === '#') continue
  const hash = line.indexOf('#')
  const body = hash >= 0 ? line.slice(0, hash) : line
  const colon = body.indexOf(':')
  if (colon < 0) continue
  const code = body.slice(0, colon).trim()
  if (!code.startsWith('U+')) continue
  const cp = parseInt(code.slice(2), 16)
  if (!(cp >= 0x4e00 && cp <= 0x9fff)) continue
  const ch = String.fromCodePoint(cp)
  const list = body.slice(colon + 1).split(',')
  const readings = []
  for (const item of list) {
    const p = normalize(item)
    if (p && p.length >= 1 && p.length <= 6 && readings.indexOf(p) === -1) {
      readings.push(p)
    }
    if (readings.length >= 3) break
  }
  if (readings.length > 0) charReadings.set(ch, readings)
}

// ---------- 2. 词语拼音 ----------
const phraseReadings = new Map()
const phraseLines = fs.readFileSync(path.join(SRC_DIR, 'phrase_pinyin.txt'), 'utf8').split('\n')
for (const line of phraseLines) {
  if (!line || line[0] === '#') continue
  const colon = line.indexOf(':')
  if (colon <= 0) continue
  const word = line.slice(0, colon).trim()
  if (!allHan(word) || word.length < 2 || word.length > 4) continue
  const parts = line.slice(colon + 1).trim().split(/\s+/)
  const syls = []
  for (const part of parts) {
    const p = normalize(part)
    if (!p) continue
    syls.push(p)
  }
  if (syls.length !== word.length) continue
  if (!phraseReadings.has(word)) phraseReadings.set(word, syls)
}

// ---------- 3. 词频 ----------
const wordFreq = new Map()
const charFreq = new Map()
const dictLines = fs.readFileSync(path.join(SRC_DIR, 'jieba_dict.txt'), 'utf8').split('\n')
for (const line of dictLines) {
  if (!line) continue
  const parts = line.split(' ')
  if (parts.length < 2) continue
  const word = parts[0]
  const freq = parseInt(parts[1], 10)
  if (!freq || !allHan(word) || word.length > 4) continue
  if (word.length >= 2) {
    const prev = wordFreq.get(word) || 0
    if (freq > prev) wordFreq.set(word, freq)
  }
  for (let i = 0; i < word.length; i++) {
    charFreq.set(word[i], (charFreq.get(word[i]) || 0) + freq)
  }
}

// 常用虚词/高频字提权：整串切词时每个音节取第一个候选，靠它决定像不像人话。
const CHAR_BOOST = (
  '吧吗呢啊哦嗯呀哈' +
  '的了是在我你他她它们这那哪谁什么怎为因所如但而或和跟把被给让' +
  '有没不就都也还很太要会能想说去来吃睡买做看听' +
  '一二三四五六七八九十上下中大小多少天时分点年月日今明昨早晚午' +
  '对错行可以请谢起意知道觉希望需应现刚马还再又才已经过' +
  '见面对事情话钱车饭水累忙空好玩学工作家朋友老师医生病药电脑网手'
)
// 提权只作用于这个字的第一个读音（pinyin-data 里排第一的通常就是常用读音），
// 否则“会”会把 kuai 也顶上去，切词就出“会点”这种怪词。
const charRank = new Map()
CHAR_BOOST.split('').forEach(function (ch, index) {
  if (charRank.has(ch)) return
  charRank.set(ch, index)
})

function rankOf(ch, pinyin) {
  if (!charRank.has(ch)) return 1000000
  const readings = charReadings.get(ch)
  if (!readings || readings[0] !== pinyin) return 1000000
  return charRank.get(ch)
}

function isPrimaryReading(ch, pinyin) {
  const readings = charReadings.get(ch)
  return !!readings && readings[0] === pinyin
}

function sortCharsFor(pinyin) {
  return function (a, b) {
    // 一个字有多个读音时，常用读音（pinyin-data 里的第一个）排前面。
    // 否则“会”会把 kuai 顶掉，“长”会把 chang 顶掉。
    const pa = isPrimaryReading(a, pinyin) ? 0 : 1
    const pb = isPrimaryReading(b, pinyin) ? 0 : 1
    if (pa !== pb) return pa - pb
    const ra = rankOf(a, pinyin)
    const rb = rankOf(b, pinyin)
    if (ra !== rb) return ra - rb
    const fa = charFreq.get(a) || 0
    const fb = charFreq.get(b) || 0
    if (fb !== fa) return fb - fa
    return a.codePointAt(0) - b.codePointAt(0)
  }
}

// ---------- 4. 选词 ----------
function pinyinOf(word, allowGuess) {
  const known = phraseReadings.get(word)
  if (known) return known
  const guess = []
  for (let i = 0; i < word.length; i++) {
    const readings = charReadings.get(word[i])
    if (!readings) return null
    if (readings.length !== 1 && !allowGuess) return null
    guess.push(readings[0])
  }
  return guess
}

const wordCandidates = []
const dropped = []
for (const [word, freq] of wordFreq) {
  if (word.length < 2 || word.length > 4) continue
  // 允许用“首选读音”猜拼音：否则只要词里有一个多音字（司/活/行…），
  // 整个词就被丢掉，公司、生活、姐姐这类常用词全进不来。
  const syls = pinyinOf(word, true)
  if (!syls) continue
  wordCandidates.push({ word, freq, pinyin: syls.join('') })
}
for (const word of EVERYDAY) {
  if (word.length < 2 || word.length > 4 || !allHan(word)) {
    dropped.push(word + '(格式)')
    continue
  }
  const syls = pinyinOf(word, true)
  if (!syls) {
    dropped.push(word + '(缺字)')
    continue
  }
  wordCandidates.push({ word, freq: BOOST + (wordFreq.get(word) || 0), pinyin: syls.join('') })
}
for (const word of EVERYDAY2) {
  if (word.length < 2 || word.length > 4 || !allHan(word)) {
    dropped.push(word + '(格式2)')
    continue
  }
  const syls = pinyinOf(word, true)
  if (!syls) {
    dropped.push(word + '(缺字2)')
    continue
  }
  wordCandidates.push({ word, freq: BOOST + (wordFreq.get(word) || 0), pinyin: syls.join('') })
}
wordCandidates.sort((a, b) => b.freq - a.freq)

const words = []
const seenWordKey = new Set()
for (const item of wordCandidates) {
  if (words.length >= WORD_LIMIT) break
  const key = item.pinyin + '|' + item.word
  if (seenWordKey.has(key)) continue
  seenWordKey.add(key)
  words.push(item)
}

// ---------- 5. 选字 ----------
const neededChars = new Set()
for (const item of words) {
  for (let i = 0; i < item.word.length; i++) neededChars.add(item.word[i])
}
const charList = [...charReadings.keys()].sort(sortCharsFor(''))
const chosenChars = []
for (const ch of charList) {
  if (chosenChars.length >= CHAR_LIMIT) break
  if ((charFreq.get(ch) || 0) <= 0) continue
  chosenChars.push(ch)
}
for (const ch of charRank.keys()) {
  if (chosenChars.indexOf(ch) === -1 && charReadings.has(ch)) chosenChars.push(ch)
}
for (const ch of neededChars) {
  if (chosenChars.indexOf(ch) === -1 && chosenChars.length < CHAR_LIMIT + 600) {
    chosenChars.push(ch)
  }
}

// ---------- 6. 组装分组 ----------
const charGroups = {}
const wordGroups = {}

const charBucket = {}
for (const ch of chosenChars) {
  const readings = charReadings.get(ch)
  for (const p of readings) {
    const g = p[0]
    if (!charBucket[g]) charBucket[g] = {}
    if (!charBucket[g][p]) charBucket[g][p] = []
    if (charBucket[g][p].indexOf(ch) === -1) charBucket[g][p].push(ch)
  }
}
for (const g of Object.keys(charBucket)) {
  const lines = []
  for (const p of Object.keys(charBucket[g])) {
    const list = charBucket[g][p]
    list.sort(sortCharsFor(p))
    lines.push(p + '\t' + list.slice(0, CHAR_PER_GROUP).join(''))
  }
  charGroups[g] = '\n' + lines.join('\n') + '\n'
}

const wordBucket = {}
for (const item of words) {
  const g = item.pinyin[0]
  if (!wordBucket[g]) wordBucket[g] = {}
  if (!wordBucket[g][item.pinyin]) wordBucket[g][item.pinyin] = []
  wordBucket[g][item.pinyin].push(item.word)
}
for (const g of Object.keys(wordBucket)) {
  const lines = []
  for (const p of Object.keys(wordBucket[g])) {
    lines.push(p + '\t' + wordBucket[g][p].slice(0, WORD_PER_GROUP).join('|'))
  }
  wordGroups[g] = '\n' + lines.join('\n') + '\n'
}

const header = [
  '// 离线拼音数据（开源，MIT）：',
  '//   单字拼音 - mozillazg/pinyin-data',
  '//   词语拼音 - mozillazg/phrase-pinyin-data',
  '//   词频排序 - fxsjy/jieba dict.txt',
  '// 每项是“拼音\\t候选”的紧凑文本，启动后按需建索引，运行时不联网。',
].join('\n')

const body =
  header +
  '\n\nexport const charGroups = ' + JSON.stringify(charGroups) +
  '\n\nexport const wordGroups = ' + JSON.stringify(wordGroups) + '\n'

fs.writeFileSync(OUT, body, 'utf8')

let charTotal = 0
for (const g of Object.keys(charGroups)) {
  for (const line of charGroups[g].split('\n')) {
    if (line) charTotal += line.split('\t')[1].length
  }
}
let wordTotal = 0
for (const g of Object.keys(wordGroups)) {
  for (const line of wordGroups[g].split('\n')) {
    if (line) wordTotal += line.split('\t')[1].split('|').length
  }
}
console.log('chars=' + charTotal + ' words=' + wordTotal + ' bytes=' + Buffer.byteLength(body))
if (dropped.length) console.log('dropped=' + dropped.join(','))
// 自检：把提权词的实际拼音打出来，方便人工核对多音字
const check = ['吃饭', '睡觉', '再见', '晚安', '手机', '上班', '堵车', '红包']
for (const w of check) {
  const syls = pinyinOf(w, true)
  console.log('  ' + w + ' -> ' + (syls ? syls.join(' ') : 'MISSING'))
}

