import knowledgeEntries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import { KB_DATA_MANIFEST } from '../scripts/kb_data/manifest.mjs'
import { KB_CORPUS_MANIFEST } from '../scripts/kb_data/corpus_manifest.mjs'
import { loadKnowledgeManifest } from '../scripts/build_kb_1500.mjs'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'

const runtime = await loadKnowledgeManifest(KB_DATA_MANIFEST)
const corpus = await loadKnowledgeManifest(KB_CORPUS_MANIFEST)
const baseCount = knowledgeEntries.length + dailyEntries.length + dailyExtraEntries.length
const runtimeCount = baseCount + runtime.entries.length
const corpusCount = baseCount + corpus.entries.length

if (runtime.failures.length) throw new Error('runtime manifest invalid: ' + runtime.failures.slice(0, 5).join(' | '))
if (corpus.failures.length) throw new Error('corpus manifest invalid: ' + corpus.failures.slice(0, 5).join(' | '))
if (KB_RELEASE_MANIFEST.targetEntries !== 2500) throw new Error('watch release target must be 2500')
if (runtimeCount !== KB_RELEASE_MANIFEST.targetEntries) throw new Error('runtime sources must contain exactly 2500 entries; got ' + runtimeCount)
if (corpusCount < KB_RELEASE_MANIFEST.corpusEntries) throw new Error('stored corpus must contain at least ' + KB_RELEASE_MANIFEST.corpusEntries + ' entries; got ' + corpusCount)
if (corpusCount < runtimeCount) throw new Error('corpus must contain the runtime release subset')

const answers = new Map()
for (const entry of [...knowledgeEntries, ...dailyEntries, ...dailyExtraEntries, ...corpus.entries]) {
  const key = String(entry.answer || '').toLowerCase().replace(/\s+/g, '')
  const previous = answers.get(key)
  if (previous) throw new Error('duplicate normalized answer: ' + previous + ' / ' + entry.id)
  answers.set(key, entry.id)
}

const corpusIds = new Set(corpus.entries.map((entry) => entry.id))
for (const entry of runtime.entries) {
  if (!corpusIds.has(entry.id)) throw new Error('runtime entry missing from corpus: ' + entry.id)
}
console.log('KB CORPUS MANIFEST CHECK PASSED: runtime=' + runtimeCount + ', corpus=' + corpusCount)
