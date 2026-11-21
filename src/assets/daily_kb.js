// 日常话题知识库：和项目类条目分开维护，运行时和 knowledge_base.js 合并进同一个检索索引。
// 目标不是“什么都知道”，而是覆盖高频日常问法，让受限对话接得住。
export default [
  // 吃饭
  {
    id: 'd-eat-today',
    question: '今天吃什么',
    answer: '饿的时候别纠结，先吃点热的；实在选不出来，就去最熟的那家。',
    keywords: ['吃饭', '吃什么', '午饭', '晚饭'],
  },
  {
    id: 'd-eat-alone',
    question: '一个人吃什么',
    answer: '一个人也别凑合，一碗热汤面或者盖饭，比零食强。',
    keywords: ['一个人', '吃饭', '简单'],
  },
  {
    id: 'd-eat-breakfast',
    question: '早餐吃什么',
    answer: '有蛋白质有主食就行：鸡蛋加粥、牛奶加面包，都算合格。',
    keywords: ['早餐', '早上', '吃什么'],
  },
  {
    id: 'd-eat-late',
    question: '夜宵吃什么',
    answer: '尽量别太油太辣，粥、面、酸奶都比烧烤好睡。',
    keywords: ['夜宵', '晚上', '饿了'],
  },
  {
    id: 'd-eat-diet',
    question: '减肥吃什么',
    answer: '先保证蛋白质和蔬菜，主食减一点而不是断掉，饿狠了反而会反弹。',
    keywords: ['减肥', '吃', '热量'],
  },
  {
    id: 'd-cook-new',
    question: '新手做什么菜',
    answer: '从西红柿炒蛋、青椒肉丝开始，火候好掌握，失败了也能吃。',
    keywords: ['做饭', '新手', '菜'],
  },
  {
    id: 'd-leftovers',
    question: '剩菜能放多久',
    answer: '冷藏别超过一天，绿叶菜最好当顿吃完，热的时候要热透。',
    keywords: ['剩菜', '冰箱', '保存'],
  },
  {
    id: 'd-coffee',
    question: '咖啡喝多少合适',
    answer: '一天一两杯问题不大，下午三点后别再喝，不然晚上容易睡不着。',
    keywords: ['咖啡', '提神', '睡眠'],
  },
  {
    id: 'd-milk-tea',
    question: '奶茶热量高吗',
    answer: '高，尤其是加糖加奶盖的；想喝就点小杯、少糖。',
    keywords: ['奶茶', '热量', '糖'],
  },
  {
    id: 'd-spicy',
    question: '吃辣上火吗',
    answer: '辣本身不上火，但太辣会刺激肠胃，吃完多喝水、别马上躺下。',
    keywords: ['辣', '上火', '肠胃'],
  },

  // 天气与穿衣
  {
    id: 'd-wear-today',
    question: '今天穿什么',
    answer: '看早晚温差：外套加短袖最稳，热了脱、冷了穿。',
    keywords: ['穿什么', '衣服', '天气'],
  },
  {
    id: 'd-wear-cold',
    question: '降温穿什么',
    answer: '三层最实用：贴身排汗、中间保暖、外面挡风。',
    keywords: ['降温', '冷', '穿'],
  },
  {
    id: 'd-rain',
    question: '下雨要带伞吗',
    answer: '包里常备一把折叠伞，比每次赌天气靠谱。',
    keywords: ['下雨', '伞', '天气'],
  },
  {
    id: 'd-hot',
    question: '太热怎么办',
    answer: '少在正午出门，多喝水，空调别开太低，二十六度左右刚好。',
    keywords: ['热', '夏天', '空调'],
  },
  {
    id: 'd-cold',
    question: '太冷怎么办',
    answer: '手脚先保暖，睡前泡个脚，比多盖一床被子管用。',
    keywords: ['冷', '冬天', '保暖'],
  },
  {
    id: 'd-sun',
    question: '太阳大要防晒吗',
    answer: '要，阴天也有紫外线；帽子加防晒霜，比只打伞全面。',
    keywords: ['防晒', '太阳', '紫外线'],
  },

  // 睡眠与健康
  {
    id: 'd-cant-sleep',
    question: '睡不着怎么办',
    answer: '别硬躺，起来喝口水、把屏幕放下，困了再回床上。',
    keywords: ['睡不着', '失眠', '睡眠'],
  },
  {
    id: 'd-stay-up',
    question: '熬夜怎么补',
    answer: '补觉只能补一部分，第二天早点睡比周末猛睡更有效。',
    keywords: ['熬夜', '补觉', '睡眠'],
  },
  {
    id: 'd-wake-up',
    question: '早上起不来怎么办',
    answer: '把闹钟放远一点，起来先拉开窗帘见光，比按十次贪睡有用。',
    keywords: ['早起', '闹钟', '起床'],
  },
  {
    id: 'd-nap',
    question: '午睡多久合适',
    answer: '二十到三十分钟最好，睡太久起来更晕。',
    keywords: ['午睡', '休息', '困'],
  },
  {
    id: 'd-sit',
    question: '久坐怎么办',
    answer: '每小时起来走两分钟，接水、上厕所都算，别等腰疼才动。',
    keywords: ['久坐', '腰', '办公室'],
  },
  {
    id: 'd-steps',
    question: '每天走多少步',
    answer: '六千到八千步就不错，别为了凑一万步硬走。',
    keywords: ['走路', '步数', '运动'],
  },
  {
    id: 'd-cold-sick',
    question: '感冒了怎么办',
    answer: '多喝水多休息，发烧或症状加重就去医院，别硬扛。',
    keywords: ['感冒', '发烧', '生病'],
  },
  {
    id: 'd-headache',
    question: '头疼怎么办',
    answer: '先离开屏幕、喝点水、睡一觉；反复疼或者很剧烈，去医院。',
    keywords: ['头疼', '头痛', '不舒服'],
  },
  {
    id: 'd-water',
    question: '一天喝多少水',
    answer: '别等渴了才喝，一天一千五到两千毫升，出汗多就再加。',
    keywords: ['喝水', '水', '健康'],
  },
  {
    id: 'd-lose-weight',
    question: '怎么开始减肥',
    answer: '先从每天多走两千步、少喝一杯含糖饮料开始，能坚持比猛减重要。',
    keywords: ['减肥', '运动', '体重'],
  },

  // 工作
  {
    id: 'd-overtime',
    question: '加班好累',
    answer: '先分清是事多还是效率低；连续加班就值得和上面谈谈排期。',
    keywords: ['加班', '累', '工作'],
  },
  {
    id: 'd-boss-task',
    question: '老板临时加任务怎么办',
    answer: '先确认截止时间，再把手上的事排个优先级，让老板知道取舍。',
    keywords: ['老板', '任务', '优先级'],
  },
  {
    id: 'd-colleague',
    question: '同事甩锅怎么办',
    answer: '把沟通留痕，邮件或群里对齐分工，比事后吵更有用。',
    keywords: ['同事', '甩锅', '沟通'],
  },
  {
    id: 'd-interview',
    question: '面试怎么准备',
    answer: '把做过的项目按“背景、做法、结果”各写三句，比背题库管用。',
    keywords: ['面试', '找工作', '准备'],
  },
  {
    id: 'd-quit',
    question: '要不要辞职',
    answer: '先想清楚是环境问题还是能力问题；没找好下家就辞，压力会更大。',
    keywords: ['辞职', '换工作', '工作'],
  },
  {
    id: 'd-no-motivation',
    question: '工作没动力',
    answer: '把目标缩小到今天能做完的一件事，动起来之后动力才会回来。',
    keywords: ['动力', '工作', '疲惫'],
  },
  {
    id: 'd-meetings',
    question: '会议太多怎么办',
    answer: '能站着开就站着开，能十分钟解决就别约半小时；没议题的会可以不去。',
    keywords: ['会议', '开会', '效率'],
  },
  {
    id: 'd-late',
    question: '上班迟到怎么办',
    answer: '先到工位再解释，别在路上发长消息；下次把出门时间提前十分钟。',
    keywords: ['迟到', '上班', '通勤'],
  },
  {
    id: 'd-salary',
    question: '工资低怎么办',
    answer: '先把手上的事做出可量化的结果，再谈涨薪或跳槽，光抱怨没用。',
    keywords: ['工资', '涨薪', '收入'],
  },
  {
    id: 'd-remote',
    question: '远程办公怎么效率高',
    answer: '固定一个工作角落，按时开始按时结束，比在床上办公强很多。',
    keywords: ['远程', '居家', '办公'],
  },

  // 学习
  {
    id: 'd-cant-study',
    question: '学不进去怎么办',
    answer: '先学五分钟，允许自己只学五分钟；开始之后往往就能继续。',
    keywords: ['学习', '专注', '效率'],
  },
  {
    id: 'd-exam',
    question: '考试前怎么复习',
    answer: '先做一套真题找漏洞，再按漏洞复习，比从头看一遍快。',
    keywords: ['考试', '复习', '备考'],
  },
  {
    id: 'd-words',
    question: '背单词记不住',
    answer: '少量多次，早上背晚上回想，比一次背一百个有效。',
    keywords: ['背单词', '记忆', '英语'],
  },
  {
    id: 'd-reading',
    question: '读书读不进去',
    answer: '从你真正好奇的那本开始，读不下去就换，不用逼自己读完。',
    keywords: ['读书', '阅读', '书'],
  },
  {
    id: 'd-focus',
    question: '注意力不集中怎么办',
    answer: '把手机放远，一次只做一件事，二十五分钟休息五分钟。',
    keywords: ['注意力', '专注', '分心'],
  },
  {
    id: 'd-learn-code',
    question: '学编程从哪开始',
    answer: '先选一门语言做一个小东西，能跑起来比看十小时视频有用。',
    keywords: ['编程', '代码', '学习'],
  },
  {
    id: 'd-study-time',
    question: '每天学多久合适',
    answer: '能稳定学一小时，比周末突击八小时强；关键是别断。',
    keywords: ['学习', '时间', '计划'],
  },
  {
    id: 'd-notes',
    question: '笔记怎么做',
    answer: '别抄书，用自己的话写，加一个“以后怎么用”的备注。',
    keywords: ['笔记', '记录', '学习'],
  },

  // 情绪
  {
    id: 'd-bad-mood',
    question: '心情不好怎么办',
    answer: '先允许自己难受一会儿，再去做一件具体的小事，别在原地打转。',
    keywords: ['心情', '难过', '情绪'],
  },
  {
    id: 'd-stress',
    question: '压力大怎么办',
    answer: '把压力写下来，分成能做的和做不了的，只处理能做的。',
    keywords: ['压力', '焦虑', '情绪'],
  },
  {
    id: 'd-anxiety',
    question: '焦虑怎么办',
    answer: '焦虑常常来自“想太多做太少”，先做最小的一步，身体动起来会好一点。',
    keywords: ['焦虑', '紧张', '担心'],
  },
  {
    id: 'd-lonely',
    question: '孤独怎么办',
    answer: '给一个熟人发条消息，哪怕只是问一句在干嘛，比刷手机管用。',
    keywords: ['孤独', '一个人', '寂寞'],
  },
  {
    id: 'd-cry',
    question: '想哭怎么办',
    answer: '想哭就哭，哭完洗把脸；憋着不会让事情变好。',
    keywords: ['想哭', '难过', '情绪'],
  },
  {
    id: 'd-angry',
    question: '生气怎么办',
    answer: '先离开现场十分钟，等心跳慢下来再决定说什么。',
    keywords: ['生气', '愤怒', '情绪'],
  },
  {
    id: 'd-disappointed',
    question: '很失望怎么办',
    answer: '失望说明你原本有期待，把期待说清楚，下一次会好一点。',
    keywords: ['失望', '期待', '情绪'],
  },
  {
    id: 'd-internal',
    question: '内耗怎么办',
    answer: '内耗多半是选择太多又不敢选；给自己一个截止时间，选完就别回头。',
    keywords: ['内耗', '纠结', '想太多'],
  },
  {
    id: 'd-inferior',
    question: '自卑怎么办',
    answer: '把注意力从“我不如谁”换到“我今天做成了什么”，记录会改变看法。',
    keywords: ['自卑', '自信', '比较'],
  },
  {
    id: 'd-happy',
    question: '怎么让自己开心',
    answer: '做一件今天就能完成的小事，完成后允许自己夸一句。',
    keywords: ['开心', '快乐', '心情'],
  },

  // 关系
  {
    id: 'd-friend-fight',
    question: '吵架了怎么和好',
    answer: '先冷静，再把事实和感受分开说；真正的朋友经得起一次把话说明白。',
    keywords: ['吵架', '闹矛盾', '冷战', '关系'],
  },
  {
    id: 'd-parents',
    question: '父母催婚怎么办',
    answer: '别硬顶，也别敷衍；告诉他们你的计划和时间表，比吵一架有用。',
    keywords: ['父母', '催婚', '家人'],
  },
  {
    id: 'd-no-reply',
    question: '对象不回消息',
    answer: '先别脑补，给对方一点时间；真有疑问就直接问，别用冷处理试探。',
    keywords: ['对象', '消息', '恋爱'],
  },
  {
    id: 'd-long-distance',
    question: '异地恋怎么维持',
    answer: '固定联系节奏，分享具体的小事，比每天问“在干嘛”更稳。',
    keywords: ['异地', '恋爱', '感情'],
  },
  {
    id: 'd-breakup',
    question: '分手后很难受',
    answer: '难受是正常的，别急着找替代；给自己一点时间，也把联系方式先放一放。',
    keywords: ['分手', '失恋', '难受'],
  },
  {
    id: 'd-make-friends',
    question: '交不到朋友怎么办',
    answer: '从重复出现的场合开始：同事、同学、常去的店，见多了自然有话。',
    keywords: ['朋友', '社交', '认识'],
  },
  {
    id: 'd-social',
    question: '社恐怎么办',
    answer: '先把目标从“表现好”换成“说三句话”，完成就算赢。',
    keywords: ['社恐', '社交', '紧张'],
  },
  {
    id: 'd-gift',
    question: '送礼送什么',
    answer: '送对方用得上、又不太贵的东西；拿不准就送吃的。',
    keywords: ['送礼', '礼物', '人情'],
  },
  {
    id: 'd-confess',
    question: '要不要表白',
    answer: '先确认对方对你有基本的回应，再表白；表白是确认，不是赌博。',
    keywords: ['表白', '喜欢', '恋爱'],
  },
  {
    id: 'd-blind-date',
    question: '相亲要注意什么',
    answer: '准时、干净、少聊前任；多问对方喜欢什么，比自我介绍有用。',
    keywords: ['相亲', '见面', '恋爱'],
  },

  // 娱乐
  {
    id: 'd-bored',
    question: '周末无聊怎么办',
    answer: '出门走二十分钟，或者挑一部能看完的电影；别用刷手机填时间。',
    keywords: ['无聊', '周末', '打发时间'],
  },
  {
    id: 'd-no-show',
    question: '剧荒了怎么办',
    answer: '翻一部老片重看，或者换个类型；实在没有就去读书。',
    keywords: ['剧荒', '电视剧', '电影'],
  },
  {
    id: 'd-no-music',
    question: '歌荒了怎么办',
    answer: '从你最喜欢的一首歌的“相似推荐”里挑，比随机播放靠谱。',
    keywords: ['歌荒', '音乐', '歌'],
  },
  {
    id: 'd-game-tired',
    question: '游戏玩腻了',
    answer: '换个类型，或者干脆停一周；腻了不是你的问题，是游戏太像了。',
    keywords: ['游戏', '腻', '娱乐'],
  },
  {
    id: 'd-movie-alone',
    question: '一个人看电影奇怪吗',
    answer: '一点都不奇怪，一个人看电影反而更容易投入。',
    keywords: ['电影', '一个人', '娱乐'],
  },
  {
    id: 'd-short-video',
    question: '短视频停不下来',
    answer: '设个闹钟，到点就退出；或者把 App 挪到第二屏，增加一点阻力。',
    keywords: ['短视频', '手机', '上瘾'],
  },
  {
    id: 'd-instrument',
    question: '想学乐器',
    answer: '先租一个或者买个便宜的，练一个月还喜欢再升级。',
    keywords: ['乐器', '学', '兴趣'],
  },
  {
    id: 'd-photo',
    question: '怎么拍照好看',
    answer: '先保证画面干净，再注意光线；把人放在三分线上，比滤镜有用。',
    keywords: ['拍照', '摄影', '照片'],
  },

  // 旅行
  {
    id: 'd-weekend-go',
    question: '周末去哪玩',
    answer: '就近走走最划算，路上少花时间，玩的时间就多。',
    keywords: ['周末', '去哪', '玩'],
  },
  {
    id: 'd-short-trip',
    question: '短途旅行去哪',
    answer: '挑一个两小时内能到的地方，住一晚，比当天来回舒服。',
    keywords: ['短途', '旅行', '周边'],
  },
  {
    id: 'd-travel-pack',
    question: '旅行带什么',
    answer: '证件、充电器、常用药、一件外套，这四样别落下。',
    keywords: ['旅行', '行李', '带什么'],
  },
  {
    id: 'd-solo-travel',
    question: '一个人旅行安全吗',
    answer: '选成熟的路线，住正规酒店，晚上少去偏僻地方，把行程告诉一个熟人。',
    keywords: ['一个人', '旅行', '安全'],
  },
  {
    id: 'd-budget-trip',
    question: '预算不多怎么玩',
    answer: '错峰出行、住远一点、吃当地小馆，比省在门票上更划算。',
    keywords: ['预算', '旅行', '省钱'],
  },
  {
    id: 'd-hiking',
    question: '爬山要准备什么',
    answer: '水、能量棒、防风外套、头灯；下山比上山更费膝盖，护膝有用。',
    keywords: ['爬山', '徒步', '准备'],
  },
  {
    id: 'd-camping',
    question: '露营要注意什么',
    answer: '先看天气和营地规定，带够保暖和防潮的装备，垃圾一定带走。',
    keywords: ['露营', '户外', '装备'],
  },
  {
    id: 'd-business-trip',
    question: '出差要注意什么',
    answer: '证件和充电器放随身包，重要文件多存一份，别托运行李放电脑。',
    keywords: ['出差', '旅行', '工作'],
  },

  // 钱
  {
    id: 'd-no-save',
    question: '存不下钱怎么办',
    answer: '工资到账先转走一笔，剩下的再花；先存后花比记账更有效。',
    keywords: ['存钱', '工资', '理财'],
  },
  {
    id: 'd-track-money',
    question: '怎么记账',
    answer: '先记大额和固定支出，别追求每一笔都记，能坚持才重要。',
    keywords: ['记账', '花钱', '预算'],
  },
  {
    id: 'd-impulse',
    question: '总忍不住买东西',
    answer: '想买先放购物车一天，第二天还想要再买，大部分冲动会过去。',
    keywords: ['冲动消费', '买', '省钱'],
  },
  {
    id: 'd-rent',
    question: '房租太高怎么办',
    answer: '算清楚通勤成本再决定搬远一点；省下的房租别都花在路上。',
    keywords: ['房租', '租房', '通勤'],
  },
  {
    id: 'd-buy-or-not',
    question: '该不该买',
    answer: '问自己三个问题：现在用得上吗、有没有替代、三个月后还会用吗。',
    keywords: ['买', '消费', '决定'],
  },
  {
    id: 'd-invest',
    question: '理财怎么入门',
    answer: '先存够三到六个月生活费，再考虑低风险产品；不懂的别碰。',
    keywords: ['理财', '投资', '钱'],
  },
  {
    id: 'd-salary-plan',
    question: '工资怎么分配',
    answer: '一半生活、三成存起来、两成机动，比例可以调，但存的那份别动。',
    keywords: ['工资', '分配', '存钱'],
  },
  {
    id: 'd-sell-used',
    question: '二手怎么卖',
    answer: '拍清楚瑕疵、写清成色、定价参考同款成交价，比标高价慢慢降快。',
    keywords: ['二手', '卖', '闲置'],
  },

  // 生活
  {
    id: 'd-commute',
    question: '通勤太久怎么办',
    answer: '把路上时间固定成一件事：听书、补觉或者规划一天，别全用来刷手机。',
    keywords: ['通勤', '地铁', '上班'],
  },
  {
    id: 'd-move',
    question: '搬家要注意什么',
    answer: '提前打包贴标签，贵重物品自己拿，搬完先检查水电和门锁。',
    keywords: ['搬家', '打包', '租房'],
  },
  {
    id: 'd-rent-house',
    question: '租房要注意什么',
    answer: '看采光、隔音和水压，合同写清押金和维修责任，别只看照片。',
    keywords: ['租房', '合同', '房子'],
  },
  {
    id: 'd-package-lost',
    question: '快递丢了怎么办',
    answer: '先找快递员和驿站，再找平台客服；保留物流截图，通常能赔。',
    keywords: ['快递', '丢件', '客服'],
  },
  {
    id: 'd-phone-dead',
    question: '手机没电怎么办',
    answer: '开省电模式，关掉定位和后台；随身带个小充电宝最省心。',
    keywords: ['手机', '没电', '充电'],
  },
  {
    id: 'd-utility',
    question: '停水停电怎么办',
    answer: '先看小区通知和缴费记录，确认不是欠费；备一点水和充电宝。',
    keywords: ['停水', '停电', '物业'],
  },
  {
    id: 'd-neighbor',
    question: '邻居太吵怎么办',
    answer: '先礼貌沟通一次，说明具体时间段；没用再找物业，别一上来就吵。',
    keywords: ['邻居', '噪音', '物业'],
  },
  {
    id: 'd-pet',
    question: '想养宠物',
    answer: '先算时间、钱和出差安排；养了就是十几年的事，别只看可爱。',
    keywords: ['宠物', '猫', '狗'],
  },

  // 科技
  {
    id: 'd-phone-slow',
    question: '手机变卡了',
    answer: '先清存储、关后台自启，再考虑恢复出厂；还卡就是该换了。',
    keywords: ['手机', '卡', '变慢'],
  },
  {
    id: 'd-pc-slow',
    question: '电脑变慢怎么办',
    answer: '看开机启动项和磁盘空间，八成是这两个；加内存往往比换整机划算。',
    keywords: ['电脑', '慢', '卡'],
  },
  {
    id: 'd-password',
    question: '密码忘了怎么办',
    answer: '先走官方找回流程，别用来路不明的工具；重要账号开两步验证。',
    keywords: ['密码', '忘记', '账号'],
  },
  {
    id: 'd-backup',
    question: '数据怎么备份',
    answer: '重要文件至少存两份，一份本地一份别处；手机照片记得开自动备份。',
    keywords: ['备份', '数据', '照片'],
  },
  {
    id: 'd-screen-eye',
    question: '看屏幕久了眼睛疼',
    answer: '二十分钟看二十英尺外二十秒，屏幕亮度跟环境接近，别在黑暗里刷手机。',
    keywords: ['眼睛', '屏幕', '护眼'],
  },
  {
    id: 'd-slow-net',
    question: '网速慢怎么办',
    answer: '先重启路由，再测有线速度；如果只有 Wi-Fi 慢，多半是干扰或距离。',
    keywords: ['网络', '网速', '路由'],
  },
]
