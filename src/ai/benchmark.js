import { matVecInto, createFloatArray } from './matrix.js'

// 手表端速度探针：测 JS 每秒能做多少次乘加（MAC），
// 再按 2×参数量/字 估算不同规模模型在真机上的出字速度。
// 注意：必须分片跑。以前一次性 while 循环会把 UI 线程堵住几秒，
// 手表看门狗会直接把应用杀掉（“刚点就跑分就死机”）。

let benchToken = 0

export function cancelBenchmark() {
  benchToken++
}

function fillArray(array, seed) {
  let value = seed % 97
  for (let i = 0; i < array.length; i++) {
    value = (value * 1103515245 + 12345) % 2147483648
    array[i] = (value % 2000) / 1000 - 1
  }
}

function buildMatVecPhase(id, rows, cols, seed) {
  const weights = createFloatArray(rows * cols)
  fillArray(weights, seed)
  const vector = createFloatArray(cols)
  fillArray(vector, cols + seed)
  const out = createFloatArray(rows)
  for (let i = 0; i < 2; i++) {
    matVecInto(weights, rows, cols, vector, out)
  }
  return {
    id: id,
    mac: rows * cols,
    rows: rows,
    cols: cols,
    runOnce: function () {
      matVecInto(weights, rows, cols, vector, out)
    },
  }
}

function buildAttentionPhase(contextSize, dim, seed) {
  const q = createFloatArray(contextSize * dim)
  const k = createFloatArray(contextSize * dim)
  fillArray(q, seed)
  fillArray(k, seed + 7)
  const scores = createFloatArray(contextSize * contextSize)
  const runOnce = function () {
    for (let i = 0; i < contextSize; i++) {
      for (let j = 0; j < contextSize; j++) {
        let acc = 0
        const qi = i * dim
        const ki = j * dim
        for (let t = 0; t < dim; t++) {
          acc += q[qi + t] * k[ki + t]
        }
        scores[i * contextSize + j] = acc
      }
    }
  }
  for (let i = 0; i < 2; i++) {
    runOnce()
  }
  return {
    id: 'attention',
    mac: contextSize * contextSize * dim,
    context: contextSize,
    dim: dim,
    runOnce: runOnce,
  }
}

function buildPhases() {
  return [
    buildMatVecPhase('hidden', 128, 128, 11),
    buildMatVecPhase('ffn', 512, 128, 23),
    buildAttentionPhase(24, 128, 37),
  ]
}

function summarize(phases, totalMs) {
  let macPerSec = 0
  const results = []
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    const rate = (phase.mac * phase.runs) / (phase.ms / 1000)
    if (rate > macPerSec) {
      macPerSec = rate
    }
    results.push({
      id: phase.id,
      rows: phase.rows,
      cols: phase.cols,
      context: phase.context,
      dim: phase.dim,
      runs: phase.runs,
      ms: phase.ms,
      macPerRun: phase.mac,
      macPerSec: rate,
    })
  }
  const estimates = [2500000, 5000000, 10000000].map(function (params) {
    return {
      params: params,
      int8Bytes: params,
      tokensPerSec: macPerSec / (2 * params),
    }
  })
  return {
    macPerSec: macPerSec,
    phases: results,
    estimates: estimates,
    elapsedMs: totalMs,
  }
}

// 同步版：只给电脑端测试用，固定跑少量次数，不会长时间阻塞。
export function runBenchmark(options) {
  const opts = options || {}
  const started = Date.now()
  const phases = buildPhases()
  const measured = []
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    const t0 = Date.now()
    for (let run = 0; run < 4; run++) {
      phase.runOnce()
    }
    const ms = Math.max(1, Date.now() - t0)
    measured.push({
      id: phase.id,
      rows: phase.rows,
      cols: phase.cols,
      context: phase.context,
      dim: phase.dim,
      mac: phase.mac,
      runs: 4,
      ms: ms,
    })
  }
  return summarize(measured, Date.now() - started)
}

// 异步分片版：每次只跑一次算子，然后让出 UI 线程，手表不会假死。
export function runBenchmarkAsync(options, handlers) {
  const opts = options || {}
  const done = handlers || {}
  const minMs = opts.minMs || 40
  const token = ++benchToken
  const phases = buildPhases()
  const measured = []
  const started = Date.now()
  let index = 0

  const finish = function () {
    if (token !== benchToken) {
      return
    }
    const result = summarize(measured, Date.now() - started)
    if (done.onDone) {
      done.onDone(result)
    }
  }

  const runPhase = function () {
    if (token !== benchToken) {
      return
    }
    // 兜底：总耗时超过 4 秒就带着已测到的数据收工，绝不拖住页面。
    if (index >= phases.length || Date.now() - started > 4000) {
      finish()
      return
    }
    const phase = phases[index++]
    let runs = 0
    let workMs = 0
    const tick = function () {
      if (token !== benchToken) {
        return
      }
      // 每片最多干 12ms，然后让出 UI；用真实计算时间做分母，
      // 不受 setTimeout 最小间隔影响。
      const sliceStart = Date.now()
      let inSlice = 0
      do {
        phase.runOnce()
        runs++
        inSlice++
      } while (Date.now() - sliceStart < 12 && inSlice < 500)
      workMs += Math.max(1, Date.now() - sliceStart)
      if (workMs >= minMs || runs >= 20000) {
        measured.push({
          id: phase.id,
          rows: phase.rows,
          cols: phase.cols,
          context: phase.context,
          dim: phase.dim,
          mac: phase.mac,
          runs: runs,
          ms: workMs,
        })
        setTimeout(runPhase, 0)
        return
      }
      setTimeout(tick, 0)
    }
    setTimeout(tick, 0)
  }

  setTimeout(runPhase, 0)
}

export function formatBenchmark(result) {
  const millions = (result.macPerSec / 1000000).toFixed(1)
  const parts = []
  for (let i = 0; i < result.estimates.length; i++) {
    const item = result.estimates[i]
    const speed =
      item.tokensPerSec < 0.1 ? '不足 0.1' : item.tokensPerSec.toFixed(1)
    parts.push(item.params / 1000000 + 'M 约 ' + speed + ' 字/秒')
  }
  return (
    '本机 JS 约 ' +
    millions +
    'M 乘加/秒；估算 ' +
    parts.join('，') +
    '。跑分耗时 ' +
    result.elapsedMs +
    'ms。'
  )
}
