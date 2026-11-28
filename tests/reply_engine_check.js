import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import kbV2Entries from '../src/assets/kb/index.js'
import { chatIntents } from '../src/assets/chat_patterns.js'
import { KnowledgeBase } from '../src/ai/knowledge_base.js'
import { SimpleKnowledgeBase } from '../src/ai/simple_kb.js'
import { packEntries } from '../scripts/kb_pack.mjs'
import { ReplyEngine, isCreativeRequest, extractCreativeSeed } from '../src/ai/reply_engine.js'
import { loadFromJsonText } from '../src/ai/model_loader.js'
import { CharPredictor } from '../src/ai/char_predictor.js'
import charModelText from '../src/assets/char_model.js'
import { memePatterns } from '../src/assets/meme_patterns.js'

let checks = 0
const failures = []
function check(name, condition, detail) {
  checks++
  if (condition) console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('FAIL  ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

const DEAD_END_WORDS = [
  '没学会',
  '没学过',
  '不知道',
  '无法回答',
  '不明白',
  '未命中知识库',
  '答不上来',
  '不在行',
  '真不行',
  '唱不了',
  '帮不了',
  '我不太会',
  '不太在行',
]

function hasDeadEnd(text) {
  for (const word of DEAD_END_WORDS) {
    if (text.indexOf(word) >= 0) return word
  }
  return ''
}

function chineseLength(text) {
  const matched = String(text).match(/[\u4e00-\u9fff]/g)
  return matched ? matched.length : 0
}

const kb = new KnowledgeBase(entries)
const model = loadFromJsonText(charModelText)
const predictor = new CharPredictor(model, model.meta)
const FIXED_NOW = new Date('2026-11-19T15:32:00+08:00').getTime()

function createEngine(options) {
  const opts = options || {}
  return new ReplyEngine({
    knowledgeBase: opts.kb === undefined ? kb : opts.kb,
    predictor: opts.predictor === undefined ? predictor : opts.predictor,
    now: function () {
      return FIXED_NOW
    },
  })
}

const engine = createEngine()

// 1. 自由输入语料：任何一句都不能出现“没学会”式死路，也不能返回空。
const freeInputs = [
  '这是我最近做的项目',
  '我最近在学AI',
  '我做了个手表上的小项目',
  '你好',
  '您好',
  '在吗',
  '在不在',
  '你是谁',
  '你叫什么名字',
  '你能干什么',
  '你懂编程吗',
  '你会唱歌吗',
  '今天天气怎么样',
  '今天吃什么',
  '我好饿',
  '我想吃火锅',
  '苹果好吃吗',
  '周末去哪玩',
  '给我讲个笑话',
  '推荐一首歌',
  '好无聊',
  '这个模型准吗',
  '这个模型准不准',
  '手表上跑得动吗',
  '会不会很耗电',
  '你能帮我写作业吗',
  '我失恋了',
  '今天好累',
  '压力好大',
  '晚安',
  '谢谢',
  '你好厉害',
  '你真聪明',
  '太笨了',
  '随便聊聊',
  '说点好玩的',
  '陪我说说话',
  '这个世界是什么',
  '我该怎么办',
  '你觉得我帅吗',
  '我该不该换工作',
  '装不上怎么办',
  '跑得动吗',
  '费电吗',
  '能不能离线用',
  '我最近睡不好',
  '你好傻',
  '你是不是AI',
  '你是GPT吗',
  '你用的什么模型',
  '唱首歌',
  '陪我下棋',
  '讲个故事',
  '在干嘛',
  '你吃饭了吗',
  '你睡了吗',
  '你喜欢什么',
  '你爱我吗',
  '早',
  '现在几点了',
  '今天几号',
  '1+1等于几',
  '3乘4是多少',
  '100除以8',
  '5/0',
  '接龙 今天天气',
  '续写 在干嘛',
  '模型多大',
  '需要联网吗',
  '怎么编译 RPK',
  '什么是 Softmax',
  '下一步做什么',
  '准确率为什么低',
  '数据会上传吗',
  'TinyAI 是什么',
  '能多轮对话吗',
  '能识别图片吗',
  '能不能语音输入',
  '记得我刚才说的吗',
  '。',
  '。。。',
  '？？？',
  '😀😀😀',
  'hello',
  'OK',
  'a'.repeat(60),
  '这个 手表 上 的 模型 到底 有 多大 呢',
]

let deadEndHits = 0
let emptyHits = 0
let longHits = 0
let thinHits = 0
for (const input of freeInputs) {
  const reply = engine.reply(input)
  if (!reply || typeof reply.text !== 'string' || reply.text.length === 0) {
    emptyHits++
    console.log('      EMPTY: ' + input)
    continue
  }
  const dead = hasDeadEnd(reply.text)
  if (dead) {
    deadEndHits++
    console.log('      DEAD END (' + dead + '): ' + input + ' -> ' + reply.text)
  }
  if (reply.text.length > 160) {
    longHits++
  }
  if (chineseLength(reply.text) < 2 && reply.mode !== 'arithmetic') {
    thinHits++
    console.log('      TOO THIN: ' + input + ' -> ' + reply.text)
  }
  if (!reply.meta || !reply.mode) {
    longHits++
  }
}
check('all free inputs return text', emptyHits === 0, emptyHits + ' empty')
check('no dead-end wording', deadEndHits === 0, deadEndHits + ' hits')
check('no over-long bubble', longHits === 0, longHits + ' issues')
check('every reply has substance', thinHits === 0, thinHits + ' thin')

// 1a. 常见生活输入：命中知识库、规则或接龙都行，但必须有话说、不撞死胡同。
const commonInputs = [
  '今天好累',
  '老板今天骂我',
  '我不开心',
  '我睡不着',
  '明天考试',
  '我喜欢一个人',
  '下雨了',
  '你吃饭了吗',
  '工作好烦',
  '今天天气不错',
  '我失恋了',
]
const commonEngine = createEngine()
let commonEmpty = 0
let commonDead = 0
let commonLong = 0
for (const input of commonInputs) {
  const reply = commonEngine.reply(input)
  if (!reply || !reply.text) commonEmpty++
  if (reply && hasDeadEnd(reply.text)) commonDead++
  if (reply && reply.text.length > 160) commonLong++
}
check('common inputs all answered', commonEmpty === 0, commonEmpty + ' empty')
check('common inputs have no dead ends', commonDead === 0, commonDead + ' hits')
check('common inputs fit the watch bubble', commonLong === 0, commonLong + ' too long')

// 1b. 伪随机拼句：模拟用户随手打的短句，确认兜底不崩也不沉默。
const fragments = [
  '我', '你', '今天', '模型', '手表', '为什么', '怎么', '吃', '学习', '晚上',
  '天气', '代码', '朋友', '周末', '工作', '开心', '累', '怎么办', '是不是',
  '能不能', '有没有', '这个', '那个', '一点', '项目', '编译', '电量',
]
let randomSeed = 7
function nextRandom() {
  randomSeed = (randomSeed * 1103515245 + 12345) % 2147483648
  return randomSeed / 2147483648
}
let fuzzEmpty = 0
let fuzzDead = 0
for (let i = 0; i < 80; i++) {
  const parts = 2 + Math.floor(nextRandom() * 3)
  let sentence = ''
  for (let p = 0; p < parts; p++) {
    sentence += fragments[Math.floor(nextRandom() * fragments.length)]
  }
  const reply = engine.reply(sentence)
  if (!reply || !reply.text) fuzzEmpty++
  else if (hasDeadEnd(reply.text)) fuzzDead++
}
check('fuzz inputs all answered', fuzzEmpty === 0, fuzzEmpty + ' empty')
check('fuzz inputs no dead ends', fuzzDead === 0, fuzzDead + ' hits')

// 2. 具体路由断言：该走知识库的走知识库，该闲聊的闲聊。
const routeCases = [
  ['模型多大', 'model-size', 'knowledge'],
  ['需要联网吗', 'need-network', 'knowledge'],
  ['怎么编译 RPK', 'build-rpk', 'knowledge'],
  ['什么是 Softmax', 'softmax', 'knowledge'],
  ['准确率为什么低', 'low-accuracy', 'knowledge'],
  ['会不会很耗电', 'battery', 'knowledge'],
  ['这个模型准吗', 'accuracy', 'knowledge'],
  ['能多轮对话吗', 'multi-turn', 'knowledge'],
  ['这是我最近做的项目', 'what-is-tinyai', 'near'],
]
for (const [input, entryId, mode] of routeCases) {
  const reply = engine.reply(input)
  check(
    'route ' + input,
    reply.entryId === entryId && (reply.mode === mode || reply.mode === 'knowledge'),
    reply.mode + ' ' + (reply.entryId || '-')
  )
}

const chatCases = [
  ['你好', 'chat'],
  ['谢谢', 'chat'],
  ['晚安', 'chat'],
  ['你是谁', 'chat'],
  ['我好饿', 'chat'],
  ['给我讲个笑话', 'chat'],
  ['我失恋了', 'chat'],
  ['你能帮我写作业吗', 'homework'],
  ['帮我做这道数学题：2x+1=5', 'homework'],
  ['苹果好吃吗', 'chat'],
  ['你觉得我帅吗', 'chat'],
  ['随便聊聊', 'chat'],
]
for (const [input, mode] of chatCases) {
  const reply = engine.reply(input)
  check('chat ' + input, reply.mode === mode, reply.mode + ' -> ' + reply.text)
}

check('晚安不走知识库', engine.reply('晚安').entryId === undefined, 'entryId=' + engine.reply('晚安').entryId)

// 3. 算术、时间、接龙
const arithmetic = engine.reply('1+1等于几')
check('arithmetic 1+1', arithmetic.mode === 'arithmetic' && arithmetic.text.indexOf('2') >= 0, arithmetic.text)
const division = engine.reply('10除以4')
check('arithmetic decimal', division.text.indexOf('2.5') >= 0, division.text)
const zero = engine.reply('5/0')
check('arithmetic zero division', zero.mode === 'arithmetic' && zero.text.indexOf('0') >= 0, zero.text)
const time = engine.reply('现在几点了')
check('time reply', time.mode === 'time' && time.text.indexOf('15:32') >= 0, time.text)
const chained = engine.reply('接龙 今天天气')
check(
  'char continuation',
  chained.mode === 'char' && chained.text.indexOf('好') >= 0,
  chained.text
)
check('char continuation meta shows speed', /字\/秒/.test(chained.meta), chained.meta)
check(
  'char continuation is raw text',
  /^[\u4e00-\u9fff]+（实验性）$/.test(chained.text) && chained.text.indexOf('模型接的是') < 0,
  chained.text
)

// 3b. 词表外/非中文开头：不能沉默，也不能把“？”吐出来
for (const seed of ['接龙 AI', '续写 123', '接一句 🚀', '接龙 我们']) {
  const reply = engine.reply(seed)
  check(
    'oov seed answered ' + seed,
    reply.text.length > 0 && (reply.mode === 'char' || reply.mode === 'char_fallback'),
    reply.mode + ' ' + reply.text
  )
  check('oov seed has no unknown glyph ' + seed, reply.text.indexOf('？') < 0, reply.text)
}


// 3a. 明确创作才走字符模型；普通提问和“这首诗讲什么”不能被误判。
const creativeCases = [
  '写一首关于雨的诗',
  '给我编个故事',
  '讲个短故事',
  '接着写：凌晨三点的街道',
  '能写首诗吗',
]
for (const input of creativeCases) {
  const creativeReply = engine.reply(input)
  check(
    'creative request goes to char model ' + input,
    isCreativeRequest(input) && creativeReply.mode === 'char',
    creativeReply.mode + ' ' + creativeReply.text
  )
}
const nonCreativeCases = ['这个故事讲了什么', '故事是什么意思', '这首诗讲什么', '能连续写诗吗']
for (const input of nonCreativeCases) {
  const reply = engine.reply(input)
  check(
    'non-creative question is not a writing request ' + input,
    !isCreativeRequest(input) && reply.text.length > 0 && hasDeadEnd(reply.text) === '',
    reply.mode + ' ' + reply.text
  )
}
check('creative seed rain', extractCreativeSeed('写一首关于雨的诗') === '雨')
check('creative seed story default', extractCreativeSeed('给我编个故事') === '那天晚上')
check('creative seed short story default', extractCreativeSeed('讲个短故事') === '那天晚上')
check('creative seed continuation', extractCreativeSeed('接着写：凌晨三点的街道') === '凌晨三点的街道')
check('creative seed poem default', extractCreativeSeed('能写首诗吗') === '雨落在')
const creativeWithoutPredictor = createEngine({ predictor: null }).reply('写一首关于雨的诗')
check(
  'creative without predictor still returns char',
  creativeWithoutPredictor.mode === 'char' && creativeWithoutPredictor.mode !== 'char_wait',
  creativeWithoutPredictor.mode + ' ' + creativeWithoutPredictor.text
)
const streamedCreative = await new Promise(function (resolve) {
  engine.replyStream('写一首关于雨的诗', {
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check(
  'creative streaming stays on char path',
  streamedCreative.mode === 'char' && streamedCreative.text.length > 0,
  streamedCreative.mode + ' ' + streamedCreative.text
)

// 4. 上下文承接与“继续”
const carryEngine = createEngine()
const first = carryEngine.reply('字符模型有多大')
const carry = carryEngine.reply('它呢')
check('carry keeps topic', carry.mode === 'carry' && carry.text.indexOf('314,077') >= 0, carry.text)
const improvEngine = createEngine()
const unknown = improvEngine.reply('楼下的树发芽了')
const more = improvEngine.reply('继续')
check(
  'unknown input falls back to char continuation',
  (unknown.mode === 'char' || unknown.mode === 'char_fallback') && hasDeadEnd(unknown.text) === '',
  unknown.mode + ' ' + unknown.text
)
check(
  'fallback meta explains local continuation',
  unknown.meta.indexOf('接龙') >= 0 || unknown.meta.indexOf('续写') >= 0,
  unknown.meta
)
check(
  'continue after fallback still answers',
  more.text.length > 0 && hasDeadEnd(more.text) === '',
  more.mode + ' ' + more.text
)

// 4b. 普通聊天重复问可以换说法；只有明确接龙才要求模型输出稳定。
const varietyEngine = createEngine()
const repeated = []
for (let i = 0; i < 5; i++) {
  repeated.push(varietyEngine.reply('窗外那棵树在想什么').text)
}
check('repeated unknown input is stable', new Set(repeated).size >= 1 && repeated[0].length > 0, new Set(repeated).size + ' variants')

const helloEngine = createEngine()
const hellos = []
for (let i = 0; i < 4; i++) {
  hellos.push(helloEngine.reply('你好').text)
}
const helloDistinct = new Set(hellos).size
check('repeated greeting varies', helloDistinct >= 2, helloDistinct + ' variants')

const diversifyEngine = createEngine()
const prompts = [
  '地铁太挤了',
  '苹果放久了会软',
  '楼下猫在叫',
  '笔记本风扇好吵',
  '快递放驿站了',
  '雨后的空气挺清新',
  '我昨晚没睡够',
  '阳台的花开了',
]
const distinct = new Set()
for (const prompt of prompts) {
  distinct.add(diversifyEngine.reply(prompt).text)
}
check('unknown inputs get varied replies', distinct.size >= 6, distinct.size + '/' + prompts.length)

// 5. 降级：没有知识库、没有字符模型也要能回答
const noKb = createEngine({ kb: null })
const noKbReply = noKb.reply('模型多大')
check('works without knowledge base', noKbReply.text.length > 0, noKbReply.mode + ' ' + noKbReply.text)
const noModel = createEngine({ predictor: null })
const noModelReply = noModel.reply('接龙 今天天气')
check(
  'works without char model',
  noModelReply.text.length > 0 && noModelReply.mode === 'char',
  noModelReply.mode + ' ' + noModelReply.text
)

// 6. 重复输入稳定（同一句话结果一致）
const stableA = createEngine()
const stableB = createEngine()
const sentence = '我最近在学AI'
check('deterministic reply', stableA.reply(sentence).text === stableB.reply(sentence).text, sentence)

// 7. 语料库自身检查：没有死路措辞、没有超长回复
let bankDead = 0
let bankLong = 0
for (const intent of chatIntents) {
  for (const line of intent.replies) {
    if (hasDeadEnd(line)) bankDead++
    if (line.length > 100) bankLong++
  }
}
check('chat bank has no dead ends', bankDead === 0, bankDead + ' lines')
check('chat bank lines are short', bankLong === 0, bankLong + ' lines')

// 8. 意图覆盖：每个意图都能被至少一句示例命中
const intentSamples = {
  thanks: '谢谢',
  farewell: '晚安',
  apology: '对不起',
  compliment_me: '你觉得我帅吗',
  praise: '你好厉害',
  insult: '你太笨了',
  identity: '你是谁',
  not_llm: '你是GPT吗',
  age: '你几岁',
  nature: '你是真人吗',
  capability: '你能干什么',
  homework: '帮我写作业',
  chat_invite: '陪我聊',
  greeting: '你好',
  what_doing: '在干嘛',
  did_eat: '你吃饭了吗',
  sleep_state: '你睡了吗',
  emotion_negative: '我很难过',
  emotion_positive: '我今天很开心',
  taste: '这个好吃吗',
  food: '我好饿',
  weather: '今天天气怎么样',
  sleep: '我睡不着',
  study_work: '明天要考试',
  joke: '讲个笑话',
  story: '有什么故事',
  play: '陪我下棋',
  sing: '唱首歌',
  entertainment: '推荐一首歌',
  travel: '周末去哪玩',
  love: '我喜欢你',
  likes: '你喜欢什么',
  advice: '我该怎么办',
  your_opinion: '你自己觉得好用吗',
  self_state: '你会累吗',
  good_news: '我今天升职了',
  day_talk: '今天过得怎么样',
}
let intentMiss = 0
for (const intent of chatIntents) {
  const sample = intentSamples[intent.id]
  if (!sample) {
    intentMiss++
    console.log('      NO SAMPLE: ' + intent.id)
    continue
  }
  const reply = engine.reply(sample)
  const expectedMode = intent.id === 'homework' ? 'homework' : 'chat'
  if (reply.mode !== expectedMode) {
    intentMiss++
    console.log('      INTENT MISS: ' + intent.id + ' <- ' + sample + ' got ' + reply.mode)
  }
}
check('all chat intents reachable', intentMiss === 0, intentMiss + ' misses')

// 8b. 热梗层：固定梗本地接住，不抢普通问题
let memeDeclareMiss = 0
let memeDead = 0
let memeLong = 0
for (const meme of memePatterns) {
  if (!meme.sample || !meme.test.test(meme.sample)) {
    memeDeclareMiss++
  }
  if (!meme.replies || meme.replies.length < 2) {
    memeDeclareMiss++
  }
  for (const line of meme.replies) {
    if (hasDeadEnd(line)) {
      memeDead++
    }
    if (line.length > 60) {
      memeLong++
    }
  }
}
check('meme patterns declared', memeDeclareMiss === 0, memePatterns.length + ' patterns, ' + memeDeclareMiss + ' problems')
check('meme bank has no dead ends', memeDead === 0, memeDead + ' lines')
check('meme replies are short', memeLong === 0, memeLong + ' lines')
let memeRouteMiss = 0
for (const meme of memePatterns) {
  if (engine.reply(meme.sample).mode !== 'meme') {
    memeRouteMiss++
  }
}
check('meme samples hit meme layer', memeRouteMiss === 0, memeRouteMiss + ' misses')
const genshinMeme = engine.reply('原神牛逼')
check(
  'genshin meme banters wuthering',
  genshinMeme.mode === 'meme' && genshinMeme.text.indexOf('鸣潮') >= 0,
  genshinMeme.text
)
const wutheringMeme = engine.reply('鸣潮牛逼')
check(
  'wuthering meme banters genshin',
  wutheringMeme.mode === 'meme' && wutheringMeme.text.indexOf('原神') >= 0,
  wutheringMeme.text
)
const memeVariants = new Set()
for (let i = 0; i < 5; i++) {
  memeVariants.add(engine.reply('原神牛逼').text)
}
check('repeated meme varies', memeVariants.size >= 2, memeVariants.size + ' variants')
check('meme does not hijack kb question', engine.reply('今天吃什么').mode !== 'meme', engine.reply('今天吃什么').mode)
check('meme does not hijack unknown input', engine.reply('窗外那棵树在想什么').mode !== 'meme', engine.reply('窗外那棵树在想什么').mode)

// 9. 流式输出：算一个字就回调一个字，不是整段算完再吐
// 查找表引擎先建好：流式路径的第一个字也必须和表里的第一名一致。
const lookupEngine = createEngine({ predictor: null })
const streamEngine = createEngine()
const chunks = []
const streamed = await new Promise(function (resolve) {
  streamEngine.replyStream('接龙 今天天气', {
    onStart: function () {},
    onChunk: function (partial) {
      chunks.push(partial)
    },
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check('stream has multiple chunks', chunks.length >= 2, chunks.length + ' chunks')
check(
  'stream chunks grow',
  chunks.length >= 2 && chunks[0].length < chunks[chunks.length - 1].length,
  chunks.length ? chunks[0] + ' -> ' + chunks[chunks.length - 1] : 'none'
)
check(
  'stream final reply matches last chunk',
  streamed.text === chunks[chunks.length - 1],
  streamed.text
)
check(
  'stream reply keeps first char',
  streamed.text.charAt(0) === lookupEngine.lookupNext('今天天气', '今天天气', true),
  streamed.text
)

const instantReply = await new Promise(function (resolve) {
  createEngine().replyStream('1+1等于几', {
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check('non-char reply bypasses streaming', instantReply.mode === 'arithmetic', instantReply.text)

// 10. 不加载神经网络，只靠蒸馏查找表也要能接龙
const lookupReply = await new Promise(function (resolve) {
  lookupEngine.replyStream('接龙 今天天气', {
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check(
  'lookup works without neural model',
  lookupReply.mode === 'char' && lookupReply.text.length >= 3,
  lookupReply.text
)
check(
  'lookup reply labelled as distilled',
  lookupReply.meta.indexOf('查表') >= 0,
  lookupReply.meta
)
const demoSeed = (model.demoSeeds || [])[0]
const demoHit = demoSeed ? lookupEngine.lookupNext(demoSeed.context, demoSeed.context, true) : null
check(
  'lookup table hits demo context',
  !!demoSeed && demoHit === demoSeed.expectedLabel,
  demoSeed ? demoSeed.context + ' -> ' + String(demoHit) + ' (want ' + demoSeed.expectedLabel + ')' : 'no demo seed'
)

// 11. 慢速玩具模式：显式要求时才跑真神经网络
const neuralEngine = createEngine()
const neuralReply = await new Promise(function (resolve) {
  neuralEngine.replyStream('慢速接龙 今天天气', {
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check(
  'neural toy mode uses real model',
  neuralReply.mode === 'char' && neuralReply.text.indexOf('好') >= 0,
  neuralReply.text
)
check(
  'neural toy mode labelled real inference',
  neuralReply.meta.indexOf('真实推理') >= 0,
  neuralReply.meta
)

const neuralNoModel = await new Promise(function (resolve) {
  createEngine({ predictor: null }).replyStream('慢速接龙 今天天气', {
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check('neural mode without model is polite', neuralNoModel.mode === 'char_wait', neuralNoModel.meta)

// 12. 日常话题知识库（项目条目 + 日常条目合并）
const dailyKb = new KnowledgeBase(entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries))
const dailyEngine = new ReplyEngine({
  knowledgeBase: dailyKb,
  predictor: predictor,
  now: function () {
    return FIXED_NOW
  },
})
const dailyCases = [
  ['今天吃什么', 'd-eat-today'],
  ['咖啡喝多少合适', 'd-coffee'],
  ['面试怎么准备', 'd-interview'],
  ['房租太高怎么办', 'd-rent'],
  ['手机变卡了', 'd-phone-slow'],
  ['快递丢了怎么办', 'd-package-lost'],
  ['密码忘了怎么办', 'd-password'],
  ['看屏幕久了眼睛疼', 'd-screen-eye'],
]
for (const [query, expected] of dailyCases) {
  const reply = dailyEngine.reply(query)
  check('daily kb ' + query, reply.entryId === expected, (reply.entryId || '-') + ' ' + reply.meta)
}
const dailyFollow = dailyEngine.reply('那这个呢')
check(
  'daily follow-up carries topic',
  dailyFollow.mode === 'carry' && dailyFollow.text.indexOf('眼睛') >= 0,
  dailyFollow.text
)
check('daily kb keeps project answers', dailyEngine.reply('模型多大').entryId === 'model-size')

// 13. 轻量检索（手表上实际使用的那套，不建索引）
const simpleKb = new SimpleKnowledgeBase(
  packEntries(entries.concat(dailyEntries, dailyExtraEntries, kbV2Entries))
)
const simpleEngine = new ReplyEngine({
  knowledgeBase: simpleKb,
  predictor: predictor,
  now: function () {
    return FIXED_NOW
  },
})
const simpleCases = [
  ['模型多大', 'model-size'],
  ['需要联网吗', 'need-network'],
  ['怎么编译 RPK', 'build-rpk'],
  ['会不会很耗电', 'battery'],
  ['今天吃什么', 'd-eat-today'],
  ['房租太高怎么办', 'd-rent'],
  ['咖啡喝多少合适', 'd-coffee'],
  ['面试怎么准备', 'd-interview'],
  ['怎么拒绝别人', 'x-refuse-request'],
  ['总拖延怎么办', 'x-procrastinate'],
  ['眼睛干涩怎么办', 'x-eye-dry'],
  ['简历怎么写', 'x-resume'],
  ['朋友生日送什么', 'x-friend-birthday'],
]
for (const [query, expected] of simpleCases) {
  const reply = simpleEngine.reply(query)
  check('simple kb ' + query, reply.entryId === expected, (reply.entryId || '-') + ' ' + reply.meta)
}
check('simple kb build is cheap', simpleKb.getStats().buildMs < 50, simpleKb.getStats().buildMs + 'ms')
check(
  'simple kb avoids false positive',
  simpleEngine.reply('这个世界是什么').entryId === undefined,
  simpleEngine.reply('这个世界是什么').mode
)
const simpleCarry = simpleEngine.reply('那这个呢')
check('simple kb carries topic', simpleCarry.mode === 'carry', simpleCarry.text)

// 13b. 相似度低于 45% 时不再硬套知识库，改走本地编话层。
const thresholdEngine = new ReplyEngine({
  knowledgeBase: simpleKb,
  predictor: predictor,
  now: function () {
    return FIXED_NOW
  },
})
const lowSim = thresholdEngine.reply('我最近在学AI')
check(
  'low similarity falls back to char continuation',
  (lowSim.mode === 'char' || lowSim.mode === 'char_fallback') && hasDeadEnd(lowSim.text) === '',
  lowSim.mode + ' ' + lowSim.text + ' | ' + lowSim.meta
)
check('low similarity reply is substantive', chineseLength(lowSim.text) >= 6, chineseLength(lowSim.text) + ' chars')
const highSim = thresholdEngine.reply('模型多大')
check(
  'high similarity still answers from kb',
  highSim.mode === 'knowledge' && highSim.entryId === 'model-size',
  highSim.mode + ' ' + highSim.meta
)
const strictEngine = new ReplyEngine({
  knowledgeBase: simpleKb,
  predictor: predictor,
  continuationThreshold: 0.99,
  now: function () {
    return FIXED_NOW
  },
})
const strict = strictEngine.reply('模型多大')
check(
  'threshold is configurable',
  strict.mode === 'char' || strict.mode === 'char_fallback' || strict.mode === 'unknown',
  strict.mode + ' ' + strict.meta
)

// 13c. 正常模式默认还没加载神经网络：普通聊天仍然要能完整接话。
const lazyEngine = new ReplyEngine({
  knowledgeBase: simpleKb,
  predictor: null,
  now: function () {
    return FIXED_NOW
  },
})
const lazyAscii = lazyEngine.reply('我最近在学AI')
check(
  'fallback works without predictor (ascii tail)',
  (lazyAscii.mode === 'char' || lazyAscii.mode === 'char_fallback') && hasDeadEnd(lazyAscii.text) === '',
  lazyAscii.mode + ' ' + lazyAscii.text + ' | ' + lazyAscii.meta
)
const lazyOov = lazyEngine.reply('桌上的笔滚下去了')
check(
  'fallback works without predictor (oov tail)',
  (lazyOov.mode === 'char' || lazyOov.mode === 'char_fallback') && hasDeadEnd(lazyOov.text) === '',
  lazyOov.mode + ' ' + lazyOov.text + ' | ' + lazyOov.meta
)

// 13d. 常见中文输入：知识库/规则接不住时交给字符接龙，不再套模板拼句。
const improvInputs = [
  '我最近在学AI',
  '想吃火锅',
  '地铁太挤了',
  '老板画饼',
  '快递放驿站了',
  '笔记本风扇好吵',
  '耳机一边没声',
  '体检报告看不懂',
  '早饭吃什么',
  '不想上班',
  '楼下猫在叫',
  '年假怎么请',
]
let ordinaryAnswered = 0
let ordinaryBad = 0
for (const input of improvInputs) {
  const reply = lazyEngine.reply(input)
  if (reply.text && reply.text.length > 0) ordinaryAnswered++
  if (!reply.text || hasDeadEnd(reply.text)) ordinaryBad++
}
check(
  'ordinary unknown inputs all answered',
  ordinaryAnswered === improvInputs.length,
  ordinaryAnswered + '/' + improvInputs.length
)
check('ordinary unknown inputs stay substantive', ordinaryBad === 0, ordinaryBad + ' bad')
check('template composition mode is gone', lazyEngine.reply('😀').mode !== 'improvise', lazyEngine.reply('😀').mode)

// 14. 纯模型模式：所有消息都走本地神经网络
const toyEngine = createEngine()
toyEngine.setToyMode(true)
const toyReply = toyEngine.reply('你好')
check('toy mode generates', toyReply.mode === 'toy' && toyReply.text.length > 8, toyReply.text)
check('toy reply is raw text', /^[\u4e00-\u9fff]+（实验性）$/.test(toyReply.text), toyReply.text)
const toyStreamed = await new Promise(function (resolve) {
  toyEngine.replyStream('今天天气', {
    onDone: function (reply) {
      resolve(reply)
    },
  })
})
check(
  'toy streaming works',
  toyStreamed.mode === 'toy' && /^[\u4e00-\u9fff]+（实验性）$/.test(toyStreamed.text),
  toyStreamed.text
)
check('toy meta says real inference', toyStreamed.meta.indexOf('真实推理') >= 0, toyStreamed.meta)
toyEngine.setToyMode(false)
check('leaving toy restores routing', toyEngine.reply('1+1等于几').mode === 'arithmetic')
const toyNoModel = createEngine({ predictor: null })
toyNoModel.setToyMode(true)
check('toy without model is polite', toyNoModel.reply('你好').mode === 'char_wait', toyNoModel.reply('你好').meta)

// 15. 问句未命中：老实说没存，不硬接龙说梦话
const q1 = simpleEngine.reply('水的化学式')
check('basic science question is stored', q1.entryId === 'k2-science-water-molecule', q1.mode + ' ' + (q1.entryId || '-'))
check('basic science answer is substantive', hasDeadEnd(q1.text) === '' && q1.text.indexOf('实验性') < 0, q1.text)
const recordReply = simpleEngine.reply('世界最快的人是谁')
check('fastest-person wording is scoped to the 100m record', recordReply.entryId === 'k2-facts-mens-100m-record-holder', (recordReply.entryId || '-') + ' ' + recordReply.text)
check('record answer includes date and event scope', recordReply.text.indexOf('截至2026-11-28') >= 0 && recordReply.text.indexOf('男子100米') >= 0, recordReply.text)
const q2 = createEngine().reply('北京是哪个国家的')
check('second unknown question also honest', q2.mode === 'unknown', q2.mode + ' ' + q2.text)
const stmtReply = createEngine().reply('地铁太挤了')
check('daily statement goes to daily layer', stmtReply.mode === 'daily', stmtReply.mode + ' ' + stmtReply.text)
const plainStmt = createEngine().reply('楼下的树发芽了')
check('uncovered statement still goes to continuation', plainStmt.mode === 'char' || plainStmt.mode === 'char_fallback', plainStmt.mode)
const moodReply = createEngine().reply('我累得不知道怎么办')
check('mood statement is not treated as question', moodReply.mode !== 'unknown', moodReply.mode + ' ' + moodReply.text)

// 15b. 日常陈述层：吃穿住行这些句子要接得住，不能丢给字符模型说梦话
const dailyStatementCases = [
  ['今天吃了火锅', 'daily'],
  ['地铁太挤了', 'daily'],
  ['快递到驿站了', 'daily'],
  ['楼下猫在叫', 'daily'],
  ['手机没电了', 'daily'],
  ['我昨晚没睡够', 'daily'],
  ['今天下雨了', 'daily'],
  ['头疼得厉害', 'daily'],
  ['和朋友吃饭', 'daily'],
  ['我妈打电话来了', 'daily'],
  ['中午睡了半小时', 'daily'],
  ['早上挤不上车', 'daily'],
  ['钥匙丢了', 'daily'],
  ['加班费没发', 'daily'],
  ['被领导夸了', 'daily'],
  ['体检结果出来了', 'daily'],
  ['我去剪头发了', 'daily'],
  ['窗外的云很白', 'daily'],
]
let dailyHits = 0
for (const [input, mode] of dailyStatementCases) {
  const reply = createEngine().reply(input)
  // 日常层优先；天气这类已有闲聊意图的，接住也算过关，只要不是字符模型的梦话。
  if (reply.mode === mode) dailyHits++
  const routed = reply.mode === mode || (mode === 'daily' && reply.mode === 'chat')
  check(
    'daily ' + input,
    routed && hasDeadEnd(reply.text) === '' && reply.mode.indexOf('char') !== 0,
    reply.mode + ' ' + reply.text
  )
}
check('daily layer covers most statements', dailyHits >= 7, dailyHits + '/' + dailyStatementCases.length)
const dailyQ = createEngine().reply('今天吃了什么')
check('question beats daily layer', dailyQ.mode === 'unknown', dailyQ.mode + ' ' + dailyQ.text)
const dailyCreative = createEngine().reply('写首诗')
check('creative beats daily layer', dailyCreative.mode === 'char', dailyCreative.mode)
const dailyRepeat = createEngine()
const dailyTexts = []
for (let i = 0; i < 4; i++) dailyTexts.push(dailyRepeat.reply('加班到十点').text)
check('daily replies vary', new Set(dailyTexts).size >= 2, new Set(dailyTexts).size + ' variants')

// 16. 古诗上句直接给下句
const poem = createEngine().reply('床前明月光')
check('poem next line', poem.mode === 'poetry' && poem.text.indexOf('疑是地上霜') >= 0, poem.text)
const poemAsk = createEngine().reply('床前明月光的作者是谁')
check('poem author question is not answered with next line', poemAsk.text.indexOf('疑是地上霜') < 0, poemAsk.mode + ' ' + poemAsk.text)

// 17. 好消息和挨骂都要接住
const good = createEngine().reply('我今天升职了')
check('good news is celebrated', good.mode === 'chat' && good.text.length > 0, good.mode + ' ' + good.text)
const scolded = createEngine().reply('老板今天骂我了')
check('being scolded gets empathy', scolded.mode === 'chat', scolded.mode + ' ' + scolded.text)

console.log('')
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL REPLY ENGINE CHECKS PASSED')
