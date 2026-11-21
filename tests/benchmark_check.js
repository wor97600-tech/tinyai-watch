import {
  runBenchmark,
  runBenchmarkAsync,
  cancelBenchmark,
  formatBenchmark,
} from '../src/ai/benchmark.js'

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

// 同步版：只跑固定少量次数，测试用
const syncResult = runBenchmark()
check('sync mac rate positive', syncResult.macPerSec > 0, (syncResult.macPerSec / 1e6).toFixed(2) + 'M/s')
check('sync has three phases', syncResult.phases.length === 3, String(syncResult.phases.length))
check('sync phase timings', syncResult.phases.every((p) => p.ms > 0 && p.runs > 0))
check(
  'estimate decreases with size',
  syncResult.estimates[0].tokensPerSec > syncResult.estimates[1].tokensPerSec &&
    syncResult.estimates[1].tokensPerSec > syncResult.estimates[2].tokensPerSec
)
check(
  'int8 bytes equal params',
  syncResult.estimates.every((item) => item.int8Bytes === item.params)
)
const summary = formatBenchmark(syncResult)
check('summary mentions chars per second', summary.indexOf('字/秒') >= 0, summary)

// 异步分片版：页面真正用的路径，必须能跑完
const asyncResult = await new Promise(function (resolve) {
  runBenchmarkAsync({ minMs: 15 }, { onDone: resolve })
})
check('async benchmark completes', !!asyncResult && asyncResult.macPerSec > 0, asyncResult ? (asyncResult.macPerSec / 1e6).toFixed(2) + 'M/s' : 'none')
check('async has three phases', asyncResult.phases.length === 3, String(asyncResult.phases.length))

// 取消：清空/退出时不能再回调
let cancelled = false
runBenchmarkAsync({ minMs: 5000 }, {
  onDone: function () {
    cancelled = true
  },
})
cancelBenchmark()
await new Promise(function (resolve) {
  setTimeout(resolve, 50)
})
check('cancel stops benchmark', cancelled === false)

console.log('')
console.log(summary)
console.log('Checks: ' + checks + ', failures: ' + failures.length)
if (failures.length) {
  console.log('FAILED: ' + failures.join(' | '))
  process.exit(1)
}
console.log('ALL BENCHMARK CHECKS PASSED')
