// 知识源清单：构建器按 KB_DOMAINS 的非 base 顺序合并这些模块。
// 每个模块继续导出 { domain, rows }，允许一个领域拆成多个小文件。
export const KB_DATA_MANIFEST = [
  { domain: 'food', files: ['./food.mjs', './food-reserve.mjs'] },
  { domain: 'health', files: ['./health.mjs', './health-reserve.mjs'] },
  { domain: 'emotion', files: ['./emotion.mjs'] },
  { domain: 'relation', files: ['./relation.mjs'] },
  { domain: 'work', files: ['./work.mjs'] },
  { domain: 'study', files: ['./study.mjs', './study-extra.mjs'] },
  { domain: 'digital', files: ['./digital.mjs', './digital-extra.mjs'] },
  { domain: 'home', files: ['./home.mjs'] },
  { domain: 'travel', files: ['./travel.mjs'] },
  { domain: 'consumer', files: ['./consumer.mjs'] },
  { domain: 'law', files: ['./law.mjs'] },
  // Keep the earliest entries in each expanded domain for the watch build; the full corpus drops these release-only caps.
  { domain: 'science', files: ['./science.mjs', './science/part-03.mjs'], releaseLimit: 201 },
  { domain: 'nature', files: ['./nature/part-01.mjs', './nature/part-02.mjs', './nature/part-03.mjs', './nature/reserve-ecology.mjs'], releaseLimit: 79 },
  { domain: 'facts', files: ['./facts/part-01.mjs', './facts/part-02.mjs', './facts/reserve-next.mjs'], releaseLimit: 22 },
  { domain: 'math', files: ['./math/part-01.mjs', './math/part-02.mjs', './math/part-03.mjs', './math/part-04.mjs', './math/reserve-foundations.mjs'], releaseLimit: 151 },
  { domain: 'physics', files: ['./physics/part-01.mjs', './physics/part-02.mjs', './physics/part-03.mjs', './physics/part-04.mjs', './physics/reserve-foundations.mjs', './physics/reserve-next.mjs'], releaseLimit: 243 },
  { domain: 'chemistry', files: ['./chemistry/part-01.mjs', './chemistry/part-02.mjs', './chemistry/part-03.mjs', './chemistry/part-04.mjs', './chemistry/part-05.mjs'], releaseLimit: 145 },
  { domain: 'biology', files: ['./biology/part-01.mjs', './biology/part-02.mjs', './biology/part-03.mjs', './biology/reserve-foundations.mjs'], releaseLimit: 197 },
  { domain: 'geography', files: ['./geography/part-01.mjs', './geography/part-02.mjs', './geography/reserve-next.mjs'] },
  { domain: 'history', files: ['./history/part-01.mjs'] },
  { domain: 'politics', files: ['./politics/part-01.mjs'] },
  { domain: 'chinese', files: ['./chinese/part-01.mjs'] },
  { domain: 'english', files: ['./english/part-01.mjs'] },
  { domain: 'information', files: ['./information/part-01.mjs'] },
  { domain: 'technology', files: ['./technology/part-01.mjs'] },
  { domain: 'music', files: ['./music/part-01.mjs', './music-reserve.mjs'] },
  { domain: 'art', files: ['./art/part-01.mjs'] },
  { domain: 'pe', files: ['./pe/part-01.mjs'] },
  { domain: 'labor', files: ['./labor/part-01.mjs'] },
  { domain: 'practice', files: ['./practice/part-01.mjs'] },
]

export default KB_DATA_MANIFEST
