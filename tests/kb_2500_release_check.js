import { KB_RELEASE_MANIFEST } from '../scripts/kb_release_manifest.mjs'
import { KB_DATA_MANIFEST } from '../scripts/kb_data/manifest.mjs'

let failures = 0
function check(name, condition, detail) {
  if (condition) console.log('PASS  ' + name + (detail ? '  (' + detail + ')' : ''))
  else {
    failures++
    console.error('FAIL  ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

const expectedReleaseLimits = {
  science: 201,
  nature: 79,
  facts: 22,
  math: 151,
  physics: 243,
  chemistry: 145,
  biology: 197,
}
const extensionEntries = KB_DATA_MANIFEST.reduce(function (sum, item) {
  return sum + Number(item.releaseLimit || 0)
}, 0)
const limitsMatch = Object.keys(expectedReleaseLimits).every(function (domain) {
  const item = KB_DATA_MANIFEST.find(function (candidate) { return candidate.domain === domain })
  return item && item.releaseLimit === expectedReleaseLimits[domain]
})

check('watch test release target is exactly 2500 entries', KB_RELEASE_MANIFEST.targetEntries === 2500, String(KB_RELEASE_MANIFEST.targetEntries))
check('minimum supported release count is 2500', KB_RELEASE_MANIFEST.minEntries === 2500, String(KB_RELEASE_MANIFEST.minEntries))
check('science domain release caps preserve the selected priority order', limitsMatch, JSON.stringify(expectedReleaseLimits))
check('declared caps retain the intended science breadth', extensionEntries === 1038, String(extensionEntries))
check('the 5000-entry offline reserve remains a separate corpus target', KB_RELEASE_MANIFEST.corpusEntries === 5000, String(KB_RELEASE_MANIFEST.corpusEntries))

if (failures) {
  console.error('\nKB 2500 RELEASE CHECK FAILED: ' + failures + ' failure(s)')
  process.exitCode = 1
} else {
  console.log('\nKB 2500 RELEASE CHECK PASSED')
}
