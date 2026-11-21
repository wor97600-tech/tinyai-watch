import { tokenize } from './knowledge_base.js'
import { chatIntents, continuationFallbacks, dailyStatements, poetryPairs, questionMissReplies } from '../assets/chat_patterns.js'
import { memePatterns } from '../assets/meme_patterns.js'
import lookupTable from '../assets/lookup_table.js'

// 知识库命中阈值：高分直接作答，中分先确认最接近的条目。
const DIRECT_SCORE = 0.16
const NEAR_SCORE = 0.18
// 日常陈述命中时，知识库得明显更像才算数（否则日常层更贴题）。
const STRONG_SCORE = 0.3

// 这些 bigram 太常见，不能作为“真的聊到了同一个话题”的证据。
const STOP_BIGRAMS = {
  什么: 1,
  为什: 1,
  怎么: 1,
  么样: 1,
  怎样: 1,
  如何: 1,
  这个: 1,
  那个: 1,
  这些: 1,
  那些: 1,
  可以: 1,
  是不: 1,
  不是: 1,
  就是: 1,
  我们: 1,
  你们: 1,
  他们: 1,
  她们: 1,
  一个: 1,
  一下: 1,
  多少: 1,
  不能: 1,
  能不: 1,
  能够: 1,
  的话: 1,
  了吗: 1,
  的呢: 1,
  有没: 1,
  没有: 1,
  是什: 1,
  么是: 1,
  因为: 1,
  所以: 1,
  但是: 1,
  如果: 1,
  现在: 1,
  时候: 1,
  觉得: 1,
  最近: 1,
}

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六']

// 口语问法和知识条目的标题差得远时，直接用主题别名接上，避免“准吗”被匹配到别的条目。
const ENTRY_ALIASES = [
  { test: /准吗|准不准|准确吗|准确率高吗|靠谱吗|精确吗|错得多吗/, id: 'accuracy' },
  { test: /多轮|上下文记忆|记得刚才|记住刚才|记住上面|还记得|记住我|记得我|有记忆/, id: 'multi-turn' },
  { test: /语音输入|语音识别|对着手表说|说话给你|念出来|朗读|方言|口音/, id: 'voice-input' },
  { test: /识别图片|看懂图片|看图|照片|看视频/, id: 'image' },
  { test: /费电|耗电|耗不耗电|电量够/, id: 'battery' },
  { test: /跑得动|带得动|跑不动|性能够/, id: 'where-runs' },
  { test: /离线(能|可|用|使|跑)|断网(能|可)|不联网(能|可)/, id: 'need-network' },
  { test: /(编译|build).{0,4}(报错|失败|出错)|报错了/i, id: 'build-fail' },
  { test: /装不上|安装不上|安装失败|装不了|安装报错/, id: 'install-fail' },
  {
    test: /你(是)?怎么(学|训练)|怎么训练|什么框架|tensorflow|pytorch|keras|训练多久/i,
    id: 'train-model',
  },
  { test: /什么模型|用的模型|模型架构/, id: 'phase-two' },
  {
    test: /我(做|写|搞)了.{0,6}(项目|ai|助手)|这是(我|一个).{0,4}(项目|ai)/i,
    id: 'what-is-tinyai',
  },
]

function hashText(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash >>> 0
}

function pick(list, text) {
  if (!list || list.length === 0) {
    return ''
  }
  return list[hashText(text) % list.length]
}

function pad2(value) {
  return value < 10 ? '0' + value : String(value)
}

function normalizeText(text) {
  if (typeof text !== 'string') {
    return ''
  }
  let out = text.replace(/[\u200b-\u200f\ufeff]/g, '')
  out = out.replace(/\s+/g, ' ')
  return out.trim()
}

// 明确的创作请求才走字符模型；问“故事是什么意思”仍然走知识库。
const CREATIVE_REQUEST =
  /(接龙|续写|接着写|继续写|接一句|下一句|写诗|来首诗|作首诗|写.{0,8}诗|编.{0,3}故事|讲.{0,3}故事|说.{0,3}故事|来.{0,3}故事|写.{0,3}故事)/
const CREATIVE_CONTENT_QUESTION =
  /(故事|诗).{0,8}(是什么|什么意思|讲了什么|说的是什么|含义|怎么理解|讲什么)|什么是(故事|诗)/
const CREATIVE_CAPABILITY_QUESTION = /能连续写诗|写诗质量|写诗水平|作诗水平|故事讲得好吗/

export function isCreativeRequest(text) {
  const value = String(text || '')
  if (CREATIVE_CONTENT_QUESTION.test(value)) return false
  if (CREATIVE_CAPABILITY_QUESTION.test(value)) return false
  return CREATIVE_REQUEST.test(value)
}

// 问句判定：知识库没命中时，问句老实说没有，陈述句才交给接龙。
// 只看字面特征，不加载模型；宁可漏判（继续接龙），也不要误判把闲聊当提问。
const QUESTION_MARKERS =
  /(什么|怎么|为什么|为啥|哪儿|哪里|哪个|哪位|谁|多少|多久|多远|多大|多高|多重|几点|几号|几个|几次|是不是|能不能|会不会|可不可以|要不要|有没有|对不对|好不好|行不行|是什么|有多少|怎么办)/
// 第一人称情绪陈述不是提问：“我难受得不知道怎么办”是在说状态，不是在问。
const FIRST_PERSON_MOOD =
  /^(我|俺|自己)/
const MOOD_WORDS = /(累|烦|难过|伤心|焦虑|压力|睡不着|失眠|失恋|骂|委屈|哭|慌|怕)/
// 名词性提问（“水的化学式”“苹果用英语怎么说”）没有疑问词，靠这类“求事实”的词识别。
// 带“了/过”的多半是陈述（“我写了个公式”），不算提问。
const FACT_WORDS =
  /(化学式|公式|定义|原理|区别|翻译|怎么说|叫什么|全称|简称|缩写|拼写|读音|产地|首都|人口|面积|高度|长度|重量|多少钱)/

export function isQuestionLike(text) {
  const value = String(text || '').trim()
  if (value.length < 2) {
    return false
  }
  if (FIRST_PERSON_MOOD.test(value) && MOOD_WORDS.test(value)) {
    return false
  }
  if (/[?？]\s*$/.test(value)) {
    return true
  }
  if (/(吗|呢|嘛)\s*[?？]?\s*$/.test(value)) {
    return true
  }
  if (FACT_WORDS.test(value) && !/(了|过)/.test(value)) {
    return true
  }
  return QUESTION_MARKERS.test(value)
}

export function extractCreativeSeed(text) {
  const value = String(text || '')
  const wantsPoem = /诗/.test(value)
  const wantsStory = /故事/.test(value)
  let seed = value
    .replace(/^(能不能|可不可以|能否|能|可以|请|麻烦|帮我|给我|请你)/, '')
    .replace(
      /故事接龙|接龙|续写|接着写|继续写|接一句|下一句|写一首|写首|来一首|来首|作一首|作首|写诗|作诗|编一个|编个|讲一个|讲个|说一个|说个|来一个|来个|故事|诗歌|诗|给我|帮我|请你|请|慢速|神经网络|真推理|认真想|一下|关于|短/g,
      ''
    )
    .replace(/[^\u4e00-\u9fff]/g, '')
    .replace(/(吗|吧|呢|啊|呀|嘛)+$/g, '')
    .replace(/的$/, '')
  if (seed.length > 0) {
    return seed.length > 8 ? seed.slice(-8) : seed
  }
  if (wantsPoem) return '雨落在'
  if (wantsStory) return '那天晚上'
  return '后来'
}

function formatNumber(value) {
  if (value !== value || value === Infinity || value === -Infinity) {
    return '算不出来'
  }
  const rounded = Math.round(value * 10000) / 10000
  return String(rounded)
}

function normalizeOperator(raw) {
  if (raw === '加') {
    return '+'
  }
  if (raw === '减') {
    return '-'
  }
  if (raw === '乘' || raw === '乘以') {
    return '×'
  }
  if (raw === '除' || raw === '除以') {
    return '÷'
  }
  return raw
}

function applyOperator(left, operator, right) {
  if (operator === '+') {
    return left + right
  }
  if (operator === '-') {
    return left - right
  }
  if (operator === '*' || operator === '×') {
    return left * right
  }
  if (operator === '/' || operator === '÷') {
    if (right === 0) {
      return null
    }
    return left / right
  }
  return null
}

function matchIntent(text) {
  for (let i = 0; i < chatIntents.length; i++) {
    if (chatIntents[i].test.test(text)) {
      return chatIntents[i]
    }
  }
  return null
}

// 只保护明确的闲聊和第一人称情绪，不让“知识库怎么工作”这类真问题被“工作”误伤。
const CHAT_PRIORITY_PATTERNS = [
  /^(你好|您好|哈喽|嗨|hi|hello|嘿|早上好|早安|中午好|下午好|晚上好|在吗|在不在|有人吗)[！!。.？?~～]*$/i,
  /^(谢谢|多谢|感谢|谢啦|thanks|thank you)[！!。.？?~～]*$/i,
  /^(晚安|再见|拜拜|bye|下次聊|回头聊|先这样)[！!。.？?~～]*$/i,
  /^(在干嘛|干嘛呢|做什么呢|忙什么呢|你吃饭了吗|你吃了吗|你睡了吗|你醒了吗)[？?！!。.]*$/,
  /^(我喜欢你|我爱你|你喜欢我吗|你爱我吗|你喜欢什么|你有什么爱好|你爱好什么)[？?！!。.]*$/,
  /^(唱首歌|唱个歌|唱歌吗|你会唱歌吗|推荐一首歌|推荐首歌|好无聊|陪我下棋|陪我玩|给我讲个笑话|讲个笑话|有什么故事|故事好看吗)[？?！!。.]*$/,
  /^(我该怎么办|你觉得我该怎么办|你自己觉得好用吗)[？?！!。.]*$/,
  /^(我不开心|我不高兴|我很难过|我好难过|我睡不着|我失眠了|我失恋了|我喜欢一个人|今天好累|今天天气不错|工作好烦|老板今天骂我|明天考试)[！!。.？?]*$/,
  /^(今天|明天|最近|老板|工作|我|压力).{0,10}(不开心|难过|伤心|好烦|烦死|焦虑|压力|累死|好累|睡不着|失眠|睡不好|失恋|考试|骂我)/,
]

function isChatPriority(text) {
  for (let i = 0; i < CHAT_PRIORITY_PATTERNS.length; i++) {
    if (CHAT_PRIORITY_PATTERNS[i].test(text)) {
      return true
    }
  }
  return false
}

// 没有加载神经网络时（正常模式默认如此），用蒸馏查表的单字键判断
// “模型认识的汉字”，避免把 AI、锅、标点这类词表外字符塞进上下文导致接龙失败。
let lookupKnownChars = null

function knownLookupChars() {
  if (lookupKnownChars) {
    return lookupKnownChars
  }
  lookupKnownChars = Object.create(null)
  const levels = (lookupTable && lookupTable.levels) || []
  let keys = ''
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].keyLength === 1) {
      keys = levels[i].keys
      break
    }
  }
  for (let i = 0; i < keys.length; i++) {
    lookupKnownChars[keys[i]] = true
  }
  return lookupKnownChars
}

// 接龙/纯模型都是实验性输出，正文末尾统一加这个标记。
const EXPERIMENT_SUFFIX = '（实验性）'

// 上下文哈希：同一个上下文每次都挑同一个候选（可复现），不同上下文之间
// 起点又足够分散，避免整张表都倒向模型排第一的那个字。
function hashContext(context) {
  let hash = 0
  for (let i = 0; i < context.length; i++) {
    hash = (hash * 31 + context.charCodeAt(i)) & 0x7fffffff
  }
  return hash
}

// 模型偶尔会自己拼出「不知道」「没学过」这种话。这个项目的要求是
// 永远不许说这种死胡同，所以生成完要检查一遍，撞上了就重来或换兜底。
const DEAD_END_WORDS = [
  '没学会',
  '没学过',
  '不知道',
  '无法回答',
  '不明白',
  '未命中知识库',
  '答不上来',
  '我不太会',
  '不在行',
  '真不行',
  '唱不了',
  '帮不了',
  '推荐不了',
  '算不了',
]

function hasDeadEndWording(text) {
  const value = String(text || '')
  for (let i = 0; i < DEAD_END_WORDS.length; i++) {
    if (value.indexOf(DEAD_END_WORDS[i]) >= 0) {
      return DEAD_END_WORDS[i]
    }
  }
  return ''
}

// 候选的优先级：第 0 名 3 票、第 1 名 2 票、第 2 名 2 票、第 3 名 1 票。
const RANK_ORDER = [0, 0, 0, 1, 1, 2, 3]

// 同一个字在最近 4 个字里出现 2 次以上，就认为模型在原地打转。
function tooRepeated(char, recent) {
  if (!recent) {
    return false
  }
  const tail = recent.length > 4 ? recent.slice(-4) : recent
  let hits = 0
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] === char) {
      hits++
    }
  }
  return hits >= 2
}

// 生成速度：chars 个字用掉 elapsedMs 毫秒，换算成“字/秒”。
// 查表路径通常 <1ms，按 1ms 下限计算，所以会得到一个“≈几千字/秒”的保守值。
function formatSpeed(chars, elapsedMs) {
  if (!chars || chars <= 0) {
    return '0'
  }
  const seconds = Math.max(1, elapsedMs) / 1000
  const speed = chars / seconds
  if (speed >= 10000) {
    return Math.round(speed / 1000) + 'k'
  }
  if (speed >= 100) {
    return String(Math.round(speed))
  }
  if (speed >= 10) {
    return speed.toFixed(1)
  }
  return speed.toFixed(2)
}

export class ReplyEngine {
  constructor(options) {
    const opts = options || {}
    this.kb = opts.knowledgeBase || null
    this.predictor = opts.predictor || null
    this.now = typeof opts.now === 'function' ? opts.now : function () { return Date.now() }
    this.lastEntry = null
    this.recentPicks = []
    this.streamTimer = null
    this.lastReplyText = ''
    this.toyMode = false
    this.toyChars = 10
    // 轻量知识库的相似度低于这个值时不硬答，改走“接龙兜底”。
    // 0.45 对应界面上显示的 45%。
    this.continuationThreshold =
      typeof opts.continuationThreshold === 'number' ? opts.continuationThreshold : 0.45
  }

  setPredictor(predictor) {
    this.predictor = predictor
  }

  setKnowledgeBase(kb) {
    this.kb = kb
  }

  // 主入口：任何输入都必须返回一条可显示的回答。
  setToyMode(enabled) {
    this.toyMode = !!enabled
  }

  isToyMode() {
    return this.toyMode === true
  }

  toySeed(text) {
    let seed = text.replace(/[^\u4e00-\u9fff]/g, '')
    seed = this.filterKnownChars(seed)
    return seed.length > 0 ? seed : '今天天气'
  }

  toyReply(text) {
    if (!this.predictor) {
      return this.result('纯模型模式要先加载神经网络，等两秒再发一次。', '字符模型 · 未就绪', 'char_wait')
    }
    const seed = this.toySeed(text)
    const start = Date.now()
    const generated = this.generate(seed, this.toyChars, true)
    const elapsed = Math.max(1, Date.now() - start)
    if (!generated) {
      return this.result('模型没接出字来，换一句再试？', '纯模型 · 空', 'char_fallback')
    }
    return this.result(
      generated + EXPERIMENT_SUFFIX,
      '纯模型生成 · 真实推理 · ' +
        elapsed +
        'ms · ' +
        Math.round(elapsed / Math.max(1, generated.length)) +
        'ms/字 · ≈' +
        formatSpeed(generated.length, elapsed) +
        ' 字/秒',
      'toy'
    )
  }

  reply(rawText) {
    const text = normalizeText(rawText)
    if (text.length === 0) {
      return this.result('嗯？我这边没收到字，再说一遍？', '闲聊 · 本地规则', 'empty')
    }
    if (this.isToyMode()) {
      return this.toyReply(text)
    }

    const arithmetic = this.tryArithmetic(text)
    if (arithmetic) {
      return arithmetic
    }

    const time = this.tryTime(text)
    if (time) {
      return time
    }

    const poetry = this.tryPoetry(text)
    if (poetry) {
      return poetry
    }

    const continuation = this.tryContinuation(text)
    if (continuation) {
      return continuation
    }

    const meme = this.tryMeme(text)
    if (meme) {
      return meme
    }

    // 明确闲聊和第一人称情绪先走本地规则，避免“工作好烦”被知识库当成“知识库怎么工作”。
    if (isChatPriority(text)) {
      const priorityIntent = matchIntent(text)
      if (priorityIntent) {
        return this.result(this.pickFresh(priorityIntent.replies, text + '|i'), '闲聊 · 本地规则', 'chat')
      }
    }

    // 问句和日常陈述先判断，用来过滤知识库的“低分相近”猜测。
    const question = isQuestionLike(text)
    const dailyMatch = this.matchDailyStatement(text)

    // 普通聊天先查知识库：高置信命中直接答，不把可查的问题丢给字符模型。
    const entryBeforeKnowledge = this.lastEntry
    const knowledge = this.tryKnowledge(text)
    if (knowledge && this.shouldUseKnowledge(knowledge)) {
      // 低分的知识库命中只是猜测：问句和日常陈述宁可走各自的路，
      // 也别拿一条不相干的条目（问“吃了什么”答成模型结构）糊弄人。
      const isGuess = knowledge.mode === 'near'
      const weakStatementHit =
        !question && dailyMatch && typeof knowledge.score === 'number' && knowledge.score < STRONG_SCORE
      if (!(isGuess && (question || dailyMatch)) && !weakStatementHit) {
        return knowledge
      }
    }
    this.lastEntry = entryBeforeKnowledge

    const intent = matchIntent(text)
    if (intent) {
      // 同一句寒暄重复发也要换一句，别像复读机。
      return this.result(this.pickFresh(intent.replies, text + '|i'), '闲聊 · 本地规则', 'chat')
    }

    const carry = this.tryCarry(text)
    if (carry) {
      return carry
    }

    // 问句但知识库没命中：老实说没存，不再硬接龙把正经问题答成梦话。
    if (question) {
      return this.result(this.pickFresh(questionMissReplies, text + '|q'), '问句未命中 · 本地规则', 'unknown')
    }

    // 日常陈述（吃了什么、路上多挤、加班到几点）走本地短句，不丢给字符模型说梦话。
    if (dailyMatch) {
      return this.result(
        this.pickFresh(dailyMatch.replies, text + '|daily'),
        '日常 · 本地规则',
        'daily'
      )
    }

    // 没有知识库答案时，直接用字符接龙把话接下去。
    const fallback = this.continuationFallback(text, knowledge)
    if (fallback) {
      return fallback
    }

    return this.result('这句我还没接上，你换个说法再说一次？', '兜底 · 本地规则', 'empty')
  }

  // 轻量检索的分数就是界面上显示的相似度（0~1）；低于阈值时返回 false。
  // TF-IDF 旧知识库的分数量级不同，保持旧行为，避免误伤电脑端回归。
  shouldUseKnowledge(reply) {
    if (!this.kb || this.kb.isSimple !== true) {
      return true
    }
    if (typeof reply.score !== 'number') {
      return true
    }
    return reply.score >= this.continuationThreshold
  }

  result(text, meta, mode, extra) {
    let body = String(text)
    if (body.length > 160) {
      body = body.slice(0, 159) + '…'
    }
    const out = {
      text: body,
      meta: meta,
      mode: mode,
    }
    if (extra) {
      if (extra.entryId) {
        out.entryId = extra.entryId
      }
      if (typeof extra.score === 'number') {
        out.score = extra.score
      }
    }
    this.lastReplyText = body
    return out
  }

  tryArithmetic(text) {
    const matched = text.match(
      /^(?:算一下|计算|帮我算)?\s*(-?\d+(?:\.\d+)?)\s*(乘以|乘|除以|除|加|减|[+\-*/×÷])\s*(-?\d+(?:\.\d+)?)\s*(?:[=＝]\s*)?(?:等于|是)?\s*(?:几|多少)?\s*[?？]?\s*$/
    )
    if (!matched) {
      return null
    }
    const left = parseFloat(matched[1])
    const operator = normalizeOperator(matched[2])
    const right = parseFloat(matched[3])
    const value = applyOperator(left, operator, right)
    if (value === null) {
      return this.result('除数为 0 时没有数学结果。', '本地计算', 'arithmetic')
    }
    return this.result(
      formatNumber(left) + ' ' + operator + ' ' + formatNumber(right) + ' = ' + formatNumber(value),
      '本地计算',
      'arithmetic'
    )
  }

  tryTime(text) {
    if (!/(几点了|现在几点|现在时间|今天几号|今天几月|星期几|礼拜几|什么日期|今天什么日子)/.test(text)) {
      return null
    }
    const date = new Date(this.now())
    if (isNaN(date.getTime())) {
      return null
    }
    const clock = pad2(date.getHours()) + ':' + pad2(date.getMinutes())
    const day =
      date.getMonth() + 1 + '月' + date.getDate() + '日，星期' + WEEK_NAMES[date.getDay()]
    return this.result('现在 ' + clock + '，' + day + '。', '本地时间 · 设备时钟', 'time')
  }

  isNeuralRequest(text) {
    return /慢速|神经网络|真推理|认真想/.test(text)
  }

  // 古诗上句直接给下句。字符模型接古诗只会得到梦话，这类名句走规则更体面。
  // 问“谁写的/什么意思”不走这里，留给知识库和问句兜底。
  tryPoetry(text) {
    if (/(作者|谁写|出自|哪首|什么意思|意思|解释|赏析|讲什么)/.test(text)) {
      return null
    }
    for (let i = 0; i < poetryPairs.length; i++) {
      const pair = poetryPairs[i]
      if (text.indexOf(pair[0]) >= 0) {
        return this.result(pair[1] + '。', '古诗 · 本地规则', 'poetry')
      }
    }
    return null
  }

  // 日常陈述层：讲今天发生了什么，不是提问，知识库也没有对应条目。
  // 只用短句回应，偶尔反问一句，不套大道理。
  matchDailyStatement(text) {
    for (let i = 0; i < dailyStatements.length; i++) {
      if (dailyStatements[i].test.test(text)) {
        return dailyStatements[i]
      }
    }
    return null
  }

  tryContinuation(text) {
    const creative = isCreativeRequest(text)
    if (!creative) {
      return null
    }
    const neural = this.isNeuralRequest(text) || (creative && !!this.predictor)
    if (neural && !this.predictor) {
      return this.result(
        '慢速模式要先加载神经网络，等两秒再发一次。',
        '字符模型 · 未就绪',
        'char_wait'
      )
    }
    const seed = extractCreativeSeed(text)
    const displaySeed = seed.length > 0 ? seed : '今天天气'
    let contextSeed = this.filterKnownChars(seed)
    if (contextSeed.length === 0) {
      contextSeed = '今天天气'
    }
    const start = Date.now()
    const generated = this.generate(contextSeed, neural ? 8 : 6, neural)
    const elapsed = Math.max(1, Date.now() - start)
    if (!generated) {
      const line = pick(continuationFallbacks, displaySeed)
      return this.result(line, '兜底续写 · 非模型', 'char_fallback')
    }
    return this.result(
      generated + EXPERIMENT_SUFFIX,
      (neural ? '字符模型续写 · 真实推理' : '查表续写 · 模型蒸馏') +
        ' · ' +
        elapsed +
        'ms · ≈' +
        formatSpeed(generated.length, elapsed) +
        ' 字/秒',
      'char'
    )
  }

  // 词表里没有的字会让上下文变成一串 <unk>，先把它们剔掉，尽量用模型认识的字开头。
  filterKnownChars(text) {
    const map = this.predictor && this.predictor.charToIndex
    if (!map) {
      const known = knownLookupChars()
      let fallbackOut = ''
      for (let i = 0; i < text.length; i++) {
        if (known[text[i]]) {
          fallbackOut += text[i]
        }
      }
      return fallbackOut
    }
    let out = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '<') {
        continue
      }
      if (typeof map[ch] === 'number') {
        out += ch
      }
    }
    return out
  }

  generate(seed, count, neural) {
    const contextLength = (this.predictor && this.predictor.contextLength) || 8
    const base = seed.length >= contextLength ? seed.slice(-contextLength) : seed
    const attempts = neural ? 1 : 3
    let out = ''
    for (let attempt = 0; attempt < attempts; attempt++) {
      let context = base.length > 0 ? base : '你好'
      out = ''
      this.lastGenerateUsedModel = false
      for (let i = 0; i < count; i++) {
        const recent = seed + out
        let label = neural ? null : this.lookupNext(context, recent, i === 0, attempt)
        if (label === null) {
          label = this.nextValidLabel(context, recent)
          if (label) {
            this.lastGenerateUsedModel = true
          }
        }
        if (!label) {
          break
        }
        out += label
        context = (context + label).slice(-contextLength)
      }
      if (out && !hasDeadEndWording(out)) {
        return out
      }
    }
    return ''
  }

  // 知识库相似度不够时的兜底：把用户这句话当接龙开头，查表/模型接 6 个字。
  // 只回接出来的字，不再套「开头」格式；相似度和速度都放在气泡下面的 meta 里。
  continuationFallback(text, knowledge) {
    const seed = this.filterKnownChars(text)
    if (!seed) {
      return null
    }
    const start = Date.now()
    const generated = this.generate(seed, 6, false)
    const elapsed = Math.max(1, Date.now() - start)
    if (!generated) {
      return null
    }
    const similarity =
      knowledge && typeof knowledge.score === 'number'
        ? Math.round(knowledge.score * 100) + '%'
        : '未命中'
    return this.result(
      generated + EXPERIMENT_SUFFIX,
      '接龙兜底 · 相似度 ' +
        similarity +
        ' · ' +
        elapsed +
        'ms · ≈' +
        formatSpeed(generated.length, elapsed) +
        ' 字/秒',
      'char'
    )
  }

  // 模型蒸馏出来的查找表：O(log n) 次字符串比较，手表上也是微秒级。
  // 按 8 -> 6 -> 4 -> 3 -> 2 -> 1 的阶梯找：长键看得多、质量高，命中就用。
  // 每个上下文存的是模型的 top-4 候选（不是只有第一名），挑的时候按上下文
  // 哈希错开起点，再跳过最近重复过的字——这样既不会全表倒向「我」，
  // 同一个输入又是稳定的，测试能复现。
  // 返回值约定：null = 表里完全没这个上下文（可以退回神经网络）；
  // '' = 命中了但故意不写（在打转），直接停下，别为了一个字去跑 1 秒的前向。
  lookupNext(context, recent, first, salt) {
    const table = lookupTable
    if (!table || !context) {
      return null
    }
    const levels = table.levels || []
    const width = table.valueWidth || 1
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i]
      const len = level.keyLength
      if (context.length < len) {
        continue
      }
      const hit = this.lookupIn(level.keys, level.values, len, context.slice(-len), width)
      if (!hit) {
        continue
      }
      // 候选是模型排好序的，但别总是取第一名：按 3:2:2:1 的权重错开起点，
      // 第一名仍然最常被选中，只是不会一路贪心到底。
      // 第一个字用模型的第一名（开场最重要），后面才开始错开求变化。
      const offset = (hashContext(context) + (salt || 0) * 7919) & 0x7fffffff
      const start = first && !salt ? 0 : offset % RANK_ORDER.length
      const tried = {}
      let fallback = ''
      for (let k = 0; k < RANK_ORDER.length; k++) {
        const rank = RANK_ORDER[(start + k) % RANK_ORDER.length]
        if (tried[rank]) {
          continue
        }
        tried[rank] = true
        const ch = hit.charAt(rank % hit.length)
        if (!fallback) {
          fallback = ch
        }
        if (!tooRepeated(ch, recent)) {
          return ch
        }
      }
      // 四个候选都在打转：允许再写一个字，但别和上一个字连着一样。
      const last = recent ? recent.charAt(recent.length - 1) : ''
      return fallback === last ? '' : fallback
    }
    return null
  }

  lookupIn(keys, values, keyLength, key, valueWidth) {
    if (!keys || keys.length === 0) {
      return ''
    }
    const width = valueWidth || 1
    let low = 0
    let high = keys.length / keyLength - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const start = mid * keyLength
      const current = keys.slice(start, start + keyLength)
      if (current === key) {
        return values.slice(mid * width, mid * width + width)
      }
      if (current < key) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return ''
  }

  // 取 top-5 里模型认识的字：跳过 <unk>/<s>，避免一次“词表外”就把接龙掐断。
  // 顺便避开重复：模型贪心最爱的就是“我我我我”，所以先挑最近没出现过的，
  // 全都很重复才退回去用第一个。
  nextValidLabel(context, recent) {
    if (!this.predictor) {
      return ''
    }
    let first = ''
    try {
      const result = this.predictor.predict(context, 5)
      const top = result.top || []
      for (let k = 0; k < top.length; k++) {
        const item = top[k]
        const raw = item.rawLabel || item.label
        if (!raw || raw.indexOf('<') === 0 || item.label === '？') {
          continue
        }
        if (!first) {
          first = item.label
        }
        if (!tooRepeated(item.label, recent)) {
          return item.label
        }
      }
    } catch (error) {
      return first
    }
    return first
  }

  cancelStream() {
    if (this.streamTimer) {
      clearTimeout(this.streamTimer)
      this.streamTimer = null
    }
  }

  // 真正逐字生成：每算出一个字就立刻回调，再算下一个。
  // 以后换成 Transformer，只要把 step 里的 nextValidLabel 换成一次前向即可。
  streamContinuation(text, handlers) {
    const self = this
    const creative = isCreativeRequest(text)
    const neural = this.isNeuralRequest(text) || (creative && !!this.predictor)
    if (neural && !this.predictor) {
      if (handlers.onDone) {
        handlers.onDone(
          this.result('慢速模式要先加载神经网络，等两秒再发一次。', '字符模型 · 未就绪', 'char_wait')
        )
      }
      return
    }
    const seed = extractCreativeSeed(text)
    const displaySeed = seed.length > 0 ? seed : '今天天气'
    let contextSeed = this.filterKnownChars(seed)
    if (contextSeed.length === 0) {
      contextSeed = '今天天气'
    }
    const contextLength = (this.predictor && this.predictor.contextLength) || 8
    let context =
      contextSeed.length >= contextLength ? contextSeed.slice(-contextLength) : contextSeed
    if (context.length === 0) {
      context = '你好'
    }
    const suffix = EXPERIMENT_SUFFIX
    const start = Date.now()
    const chars = []
    let usedModel = false
    let computeMs = 0
    if (handlers.onStart) {
      handlers.onStart(neural ? '字符模型续写 · 真实推理' : '查表续写 · 模型蒸馏')
    }
    const finish = function () {
      self.streamTimer = null
      if (chars.length === 0 || hasDeadEndWording(chars.join(''))) {
        const line = pick(continuationFallbacks, displaySeed)
        const fallback = self.result(line, '兜底续写 · 非模型', 'char_fallback')
        if (handlers.onDone) {
          handlers.onDone(fallback)
        }
        return
      }
      const reply = self.result(
        chars.join('') + suffix,
        (neural ? '字符模型续写 · 真实推理' : '查表续写 · 模型蒸馏') +
          ' · ' +
          (Date.now() - start) +
          'ms · ' +
          Math.round((Date.now() - start) / chars.length) +
          'ms/字 · ≈' +
          formatSpeed(chars.length, Math.max(1, computeMs)) +
          ' 字/秒',
        'char'
      )
      if (handlers.onDone) {
        handlers.onDone(reply)
      }
    }
    const step = function () {
      if (chars.length >= (neural ? 8 : 6)) {
        finish()
        return
      }
      const computeStart = Date.now()
      const recent = contextSeed + chars.join('')
      let label = neural ? null : self.lookupNext(context, recent, chars.length === 0)
      if (label === null) {
        label = self.nextValidLabel(context, recent)
        if (label) {
          usedModel = true
        }
      }
      computeMs += Date.now() - computeStart
      if (!label) {
        finish()
        return
      }
      chars.push(label)
      context = (context + label).slice(-contextLength)
      if (handlers.onChunk) {
        handlers.onChunk(chars.join('') + suffix)
      }
      self.streamTimer = setTimeout(step, 0)
    }
    self.streamTimer = setTimeout(step, 0)
  }

  // 纯模型模式：每条消息都由本地神经网络续写，慢但真。
  streamToy(text, handlers) {
    const self = this
    if (!this.predictor) {
      if (handlers.onDone) {
        handlers.onDone(
          this.result('纯模型模式要先加载神经网络，等两秒再发一次。', '字符模型 · 未就绪', 'char_wait')
        )
      }
      return
    }
    const seed = this.toySeed(text)
    const contextLength = (this.predictor && this.predictor.contextLength) || 3
    let context = seed.length >= contextLength ? seed.slice(-contextLength) : seed
    if (context.length === 0) {
      context = '你好'
    }
    const suffix = EXPERIMENT_SUFFIX
    const genStart = Date.now()
    const chars = []
    let computeMs = 0
    if (handlers.onStart) {
      handlers.onStart('纯模型生成 · 真实推理')
    }
    const finish = function () {
      self.streamTimer = null
      if (chars.length === 0) {
        if (handlers.onDone) {
          handlers.onDone(self.result('模型没接出字来，换一句再试？', '纯模型 · 空', 'char_fallback'))
        }
        return
      }
      const elapsed = Date.now() - genStart
      const reply = self.result(
        chars.join('') + suffix,
        '纯模型生成 · 真实推理 · ' +
          elapsed +
          'ms · ' +
          Math.round(elapsed / chars.length) +
          'ms/字 · ≈' +
          formatSpeed(chars.length, Math.max(1, computeMs)) +
          ' 字/秒',
        'toy'
      )
      if (handlers.onDone) {
        handlers.onDone(reply)
      }
    }
    const step = function () {
      if (chars.length >= self.toyChars) {
        finish()
        return
      }
      const computeStart = Date.now()
      const label = self.nextValidLabel(context, seed + chars.join(''))
      computeMs += Date.now() - computeStart
      if (!label) {
        finish()
        return
      }
      if (hasDeadEndWording(chars.join('') + label)) {
        finish()
        return
      }
      chars.push(label)
      context = (context + label).slice(-contextLength)
      if (handlers.onChunk) {
        handlers.onChunk(chars.join('') + suffix)
      }
      self.streamTimer = setTimeout(step, 0)
    }
    self.streamTimer = setTimeout(step, 0)
  }

  replyStream(text, handlers) {
    const callbacks = handlers || {}
    const clean = normalizeText(text)
    if (this.isToyMode()) {
      this.streamToy(clean, callbacks)
      return
    }
    if (clean.length > 0 && isCreativeRequest(clean)) {
      this.streamContinuation(clean, callbacks)
      return
    }
    const reply = this.reply(text)
    if (callbacks.onDone) {
      callbacks.onDone(reply)
    }
  }

  tryKnowledge(text) {
    if (!this.kb) {
      return null
    }
    const alias = this.matchAlias(text)
    if (alias) {
      const entry = this.findEntryById(alias.id)
      if (entry) {
        this.lastEntry = { id: entry.id, question: entry.question, answer: entry.answer, score: 1 }
        return this.result(entry.answer, '知识库 · 主题命中', 'knowledge', {
          entryId: entry.id,
          score: 1,
        })
      }
    }
    let found = null
    try {
      found = this.kb.query(text, 2)
    } catch (error) {
      return null
    }
    const top = found && found.top ? found.top[0] : null
    if (!top) {
      return null
    }
    const index = this.findEntryIndex(top.id)
    const overlap = index >= 0 ? this.overlapCount(text, index) : 0
    const percent = Math.round(top.score * 100)
    // 轻量检索的打分尺度和 TF-IDF 不同，用更高的门槛避免常见字误命中。
    const simple = this.kb && this.kb.isSimple === true
    const directScore = simple ? 0.3 : DIRECT_SCORE
    const nearScore = simple ? 0.18 : NEAR_SCORE
    if (top.score >= directScore && overlap >= 1) {
      this.lastEntry = top
      return this.result(top.answer, '知识库 · 相似度 ' + percent + '%', 'knowledge', {
        entryId: top.id,
        score: top.score,
      })
    }
    if (top.score >= nearScore && overlap >= 1) {
      this.lastEntry = top
      return this.result(
        '最接近的一条是「' + top.question + '」：' + top.answer,
        '知识库 · 相近 ' + percent + '%',
        'near',
        { entryId: top.id, score: top.score }
      )
    }
    return null
  }

  matchAlias(text) {
    for (let i = 0; i < ENTRY_ALIASES.length; i++) {
      if (ENTRY_ALIASES[i].test.test(text)) {
        return ENTRY_ALIASES[i]
      }
    }
    return null
  }

  findEntryById(id) {
    const entries = this.kb && this.kb.entries ? this.kb.entries : []
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].id === id) {
        return entries[i]
      }
    }
    return null
  }

  findEntryIndex(id) {
    const entries = this.kb && this.kb.entries ? this.kb.entries : []
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].id === id) {
        return i
      }
    }
    return -1
  }

  overlapCount(text, entryIndex) {
    let document = null
    if (this.kb) {
      if (typeof this.kb.tokensForEntry === 'function') {
        document = this.kb.tokensForEntry(entryIndex)
      } else if (this.kb.entryTokens) {
        document = this.kb.entryTokens[entryIndex]
      }
    }
    if (!document || document.length === 0) {
      return 0
    }
    const queryTokens = tokenize(text)
    const wanted = Object.create(null)
    for (let i = 0; i < queryTokens.length; i++) {
      wanted[queryTokens[i]] = true
    }
    const seen = Object.create(null)
    let count = 0
    for (let i = 0; i < document.length; i++) {
      const term = document[i]
      if (!wanted[term] || seen[term]) {
        continue
      }
      if (term.charAt(0) === 'b') {
        if (STOP_BIGRAMS[term.slice(2)]) {
          continue
        }
      } else if (term.charAt(0) === 'w') {
        if (term.length < 4) {
          continue
        }
      } else {
        continue
      }
      seen[term] = true
      count++
    }
    return count
  }

  tryCarry(text) {
    if (!this.lastEntry) {
      return null
    }
    const shortPronoun = text.length <= 5 && /(它|他|她)/.test(text)
    const pointer = /^(这个|那个|还有呢|然后呢|上面那个|刚才那个)[呢吗]?[？?]?$/.test(text)
    const topicFollow = text.length <= 10 && /^(那|还有|然后|所以)/.test(text)
    if (!shortPronoun && !pointer && !topicFollow) {
      return null
    }
    return this.result(
      '还是刚才那个「' + this.lastEntry.question + '」：' + this.lastEntry.answer,
      '承接上文 · 知识库',
      'carry',
      { entryId: this.lastEntry.id, score: this.lastEntry.score }
    )
  }

  // 从候选里挑一条最近没说过的话，避免同一个话题反复同一句。
  pickFresh(list, seed) {
    if (!list || list.length === 0) {
      return ''
    }
    const start = hashText(seed) % list.length
    for (let i = 0; i < list.length; i++) {
      const candidate = list[(start + i) % list.length]
      if (this.recentPicks.indexOf(candidate) < 0) {
        this.recentPicks.push(candidate)
        if (this.recentPicks.length > 10) {
          this.recentPicks.shift()
        }
        return candidate
      }
    }
    return list[start]
  }

  // 热梗层：命中固定梗就本地回一句，避免掉进知识库或即兴模板。
  tryMeme(text) {
    for (let i = 0; i < memePatterns.length; i++) {
      const meme = memePatterns[i]
      if (!meme.test.test(text)) {
        continue
      }
      return this.result(
        this.pickFresh(meme.replies, text + '|meme'),
        '热梗 · 本地规则',
        'meme'
      )
    }
    return null
  }
}
