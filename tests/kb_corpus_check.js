import fs from 'node:fs'
import path from 'node:path'
import entries from '../src/assets/knowledge_base.js'
import dailyEntries from '../src/assets/daily_kb.js'
import dailyExtraEntries from '../src/assets/daily_kb_extra.js'
import { KB_DATA_MANIFEST } from '../scripts/kb_data/manifest.mjs'
import { KB_CORPUS_MANIFEST } from '../scripts/kb_data/corpus_manifest.mjs'
import { loadKnowledgeManifest } from '../scripts/build_kb_1500.mjs'
import { packEntries } from '../scripts/kb_pack.mjs'
import { SimpleKnowledgeBase } from '../src/ai/simple_kb.js'
import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'

const baseEntries = entries.concat(dailyEntries, dailyExtraEntries)
const runtime = await loadKnowledgeManifest(KB_DATA_MANIFEST)
const corpus = await loadKnowledgeManifest(KB_CORPUS_MANIFEST)
const runtimeEntries = baseEntries.concat(runtime.entries)
const corpusEntries = baseEntries.concat(corpus.entries)
const failures = []
const metrics = { runtimeEntries: runtimeEntries.length, corpusEntries: corpusEntries.length }
function check(label, condition, detail) {
  if (!condition) failures.push(label + (detail ? ': ' + detail : ''))
  console.log((condition ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  (' + detail + ')' : ''))
}
function normalized(text) { return String(text || '').toLowerCase().replace(/\s+/g, '') }
function bigrams(text) {
  const value=normalized(text)
  const result=new Set()
  for(let i=0;i+1<value.length;i++)result.add(value.slice(i,i+2))
  return result
}
function jaccard(a,b) {
  let common=0
  for(const value of a)if(b.has(value))common++
  return common/(a.size+b.size-common||1)
}
function percentile(sorted,ratio) {
  return sorted.length ? sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*ratio)-1)] : 0
}

check('runtime release is exactly the watch-test target', runtimeEntries.length === KB_RELEASE_MANIFEST.targetEntries, String(runtimeEntries.length))
check('stored offline corpus contains at least 5000 entries', corpusEntries.length >= 5000, String(corpusEntries.length))
check('runtime manifest loads without errors', runtime.failures.length === 0, runtime.failures.slice(0,5).join(' | '))
check('corpus manifest loads without errors', corpus.failures.length === 0, corpus.failures.slice(0,5).join(' | '))
if (corpusEntries.length < 5000 || runtime.failures.length || corpus.failures.length) {
  if (failures.length) throw new Error(failures.join('\n'))
}

const ids=new Set()
const questions=new Set()
let duplicateIds=0
let duplicateQuestions=0
for(const entry of corpusEntries){
  if(ids.has(entry.id))duplicateIds++
  ids.add(entry.id)
  const key=normalized(entry.question)
  if(questions.has(key))duplicateQuestions++
  questions.add(key)
}
check('global IDs are unique',duplicateIds===0,String(duplicateIds))
check('normalized questions are unique',duplicateQuestions===0,String(duplicateQuestions))

const corpusIdSet=new Set(corpusEntries.map(entry=>entry.id))
check('all active release entries exist in the stored corpus',runtimeEntries.every(entry=>corpusIdSet.has(entry.id)))
const corpusKb=new SimpleKnowledgeBase(packEntries(corpusEntries))
metrics.buildMs=corpusKb.getStats().buildMs
metrics.keywordCount=corpusKb.getStats().keywordCount
metrics.domainCounts={}
for(const entry of corpusEntries){const domain=entry.id.startsWith('k2-')?entry.id.split('-')[1]:'base';metrics.domainCounts[domain]=(metrics.domainCounts[domain]||0)+1}

let selfHits=0
for(const entry of corpusEntries){if(corpusKb.query(entry.question,1).top[0]?.id===entry.id)selfHits++}
metrics.selfHits=selfHits
check('corpus self-hit rate is 100%',selfHits===corpusEntries.length,selfHits+'/'+corpusEntries.length)

const questionBigrams=corpusEntries.map(entry=>bigrams(entry.question))
let nearDuplicates=0
const nearSamples=[]
for(let i=0;i<corpusEntries.length;i++)for(let j=i+1;j<corpusEntries.length;j++){
  const score=jaccard(questionBigrams[i],questionBigrams[j])
  if(score>=0.75){nearDuplicates++;if(nearSamples.length<8)nearSamples.push(corpusEntries[i].question+' / '+corpusEntries[j].question+' '+score.toFixed(2))}
}
metrics.nearDuplicates=nearDuplicates
check('near-duplicate question pairs at Jaccard >= 0.75 are zero',nearDuplicates===0,nearSamples.join(' | ')||'0')

const crossWhitelist=new Set([
  'x-eye-dry|k2-health-dry-eyes','k2-health-dry-eyes|x-eye-dry',
  'k2-emotion-burnout|k2-work-burnout','k2-work-burnout|k2-emotion-burnout',
])
let falseCross=0
let whitelistedCross=0
const crossSamples=[]
const crossStart=Date.now()
for(let i=0;i<corpusEntries.length;i++){
  const prepared=corpusKb.prepareQuery(corpusEntries[i].question)
  let bestScore=0,bestIndex=-1
  for(let j=0;j<corpusEntries.length;j++){
    if(i===j)continue
    const score=corpusKb.scorePrepared(prepared,j)
    if(score>bestScore){bestScore=score;bestIndex=j}
  }
  if(bestScore>=0.3){
    const pair=corpusEntries[i].id+'|'+corpusEntries[bestIndex].id
    if(crossWhitelist.has(pair))whitelistedCross++
    else{falseCross++;if(crossSamples.length<8)crossSamples.push(corpusEntries[i].question+' -> '+corpusEntries[bestIndex].question+' '+bestScore.toFixed(3))}
  }
}
metrics.crossCheckMs=Date.now()-crossStart
metrics.falseCross=falseCross
metrics.whitelistedCross=whitelistedCross
check('false-cross rate is at most 0.5%',falseCross/corpusEntries.length<=0.005,falseCross+'/'+corpusEntries.length+' in '+metrics.crossCheckMs+'ms '+crossSamples.join(' | '))
check('cross whitelist has no more than 20 pairs',crossWhitelist.size<=20,String(crossWhitelist.size))

const latencies=[]
for(const entry of corpusEntries)latencies.push(corpusKb.query('我想知道'+entry.question,3).elapsedMs)
latencies.sort((a,b)=>a-b)
metrics.queryMs={p50:percentile(latencies,0.5),p95:percentile(latencies,0.95),max:latencies.at(-1)||0}
console.log('Corpus metrics: '+JSON.stringify(metrics))

if(failures.length)throw new Error(failures.join('\n'))
const reportPath=path.resolve('docs/knowledge/kb_corpus_report.json')
fs.writeFileSync(reportPath,JSON.stringify({generatedAt:'2026-11-28',...metrics},null,2)+'\n','utf8')
console.log('Wrote '+reportPath)
console.log('ALL FULL CORPUS CHECKS PASSED')
