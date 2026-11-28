// 知识库分类路由的共享定义。构建脚本和手表运行时必须使用同一份领域顺序与哈希。

export const KB_DOMAINS = [
  'base',
  'food',
  'health',
  'emotion',
  'relation',
  'work',
  'study',
  'digital',
  'home',
  'travel',
  'consumer',
  'law',
  'science',
  'nature',
  'facts',
  'math',
  'physics',
  'chemistry',
  'biology',
  'geography',
  'history',
  'politics',
  'chinese',
  'english',
  'information',
  'technology',
  'music',
  'art',
  'pe',
  'labor',
  'practice',
]

export const KB_DOMAIN_LABELS = {
  base: '通用项目',
  food: '饮食起居',
  health: '身体健康',
  emotion: '情绪心理',
  relation: '人际关系',
  work: '工作职场',
  study: '学习考试',
  digital: '数码设备',
  home: '家务收纳',
  travel: '出行交通',
  consumer: '消费常识',
  law: '法律常识',
  science: '科学常识',
  nature: '动植物与自然',
  facts: '重要事实',
  math: '高中数学',
  physics: '高中物理',
  chemistry: '高中化学',
  biology: '高中生物',
  geography: '高中地理',
  history: '高中历史',
  politics: '思想政治',
  chinese: '高中语文',
  english: '高中英语',
  information: '信息技术',
  technology: '通用技术',
  music: '高中音乐',
  art: '高中美术',
  pe: '体育与健康',
  labor: '劳动教育',
  practice: '综合实践',
}

export const KB_ROUTE_STOP_TERMS = {
  什么: true,
  为什么: true,
  怎么: true,
  怎样: true,
  如何: true,
  可以: true,
  这个: true,
  那个: true,
  这些: true,
  那些: true,
  多少: true,
  问题: true,
  东西: true,
  事情: true,
  一下: true,
  是不是: true,
  有没有: true,
  能不能: true,
  要不要: true,
  怎么办: true,
  是什么: true,
}

export function normalizeKnowledgeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function fnv1a(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    // FNV-1a 的 16777619 乘法拆成移位相加，避免依赖 Math.imul。
    hash =
      (hash +
        (hash << 1) +
        (hash << 4) +
        (hash << 7) +
        (hash << 8) +
        (hash << 24)) |
      0
  }
  return hash >>> 0
}

function djb2Low16(text) {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return hash & 0xffff
}

export function hashNormalizedKnowledgeKey(text) {
  const value = String(text || '')
  return fnv1a(value) * 65536 + djb2Low16(value)
}

export function hashKnowledgeKey(value) {
  return hashNormalizedKnowledgeKey(normalizeKnowledgeKey(value))
}

export function isKnowledgeRouteStopTerm(value) {
  return KB_ROUTE_STOP_TERMS[normalizeKnowledgeKey(value)] === true
}

export function knowledgeDomainFromId(id) {
  const value = String(id || '')
  if (!value.startsWith('k2-')) {
    return 'base'
  }
  const domain = value.split('-')[1]
  return KB_DOMAINS.indexOf(domain) >= 0 ? domain : 'base'
}
