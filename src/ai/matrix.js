export function createFloatArray(length) {
  if (typeof Float32Array === 'function') {
    return new Float32Array(length)
  }
  const out = []
  for (let i = 0; i < length; i++) {
    out.push(0)
  }
  return out
}

export function createMatrix(rows, cols) {
  checkPositiveInt(rows, 'rows')
  checkPositiveInt(cols, 'cols')
  return createFloatArray(rows * cols)
}

function checkPositiveInt(value, name) {
  if (typeof value !== 'number' || value <= 0 || Math.floor(value) !== value) {
    throw new Error('Invalid ' + name + ': ' + value)
  }
}

function checkArray(value, name) {
  if (!value || typeof value.length !== 'number') {
    throw new Error('Invalid array: ' + name)
  }
}

export function vecAdd(a, b) {
  checkArray(a, 'a')
  checkArray(b, 'b')
  if (a.length !== b.length) {
    throw new Error('Vector size mismatch: ' + a.length + ' vs ' + b.length)
  }
  const out = createFloatArray(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] + b[i]
  }
  return out
}

export function matMul(a, rowsA, colsA, b, rowsB, colsB) {
  checkArray(a, 'a')
  checkArray(b, 'b')
  checkPositiveInt(rowsA, 'rowsA')
  checkPositiveInt(colsA, 'colsA')
  checkPositiveInt(rowsB, 'rowsB')
  checkPositiveInt(colsB, 'colsB')
  if (colsA !== rowsB) {
    throw new Error(
      'Matrix size mismatch: (' + rowsA + 'x' + colsA + ') * (' + rowsB + 'x' + colsB + ')'
    )
  }
  if (a.length < rowsA * colsA || b.length < rowsB * colsB) {
    throw new Error('Matrix data is shorter than declared dimensions')
  }
  const out = createFloatArray(rowsA * colsB)
  for (let i = 0; i < rowsA; i++) {
    const rowOffset = i * colsA
    const outOffset = i * colsB
    for (let k = 0; k < colsA; k++) {
      const av = a[rowOffset + k]
      const bOffset = k * colsB
      for (let j = 0; j < colsB; j++) {
        out[outOffset + j] += av * b[bOffset + j]
      }
    }
  }
  return out
}

export function matVec(weights, rows, cols, vector) {
  const out = createFloatArray(rows)
  return matVecInto(weights, rows, cols, vector, out)
}

export function matVecInto(weights, rows, cols, vector, out) {
  checkArray(weights, 'weights')
  checkArray(vector, 'vector')
  checkArray(out, 'out')
  checkPositiveInt(rows, 'rows')
  checkPositiveInt(cols, 'cols')
  if (vector.length !== cols) {
    throw new Error('matVec size mismatch: vector ' + vector.length + ' vs cols ' + cols)
  }
  if (weights.length < rows * cols) {
    throw new Error('matVec weights are shorter than declared dimensions')
  }
  if (out.length < rows) {
    throw new Error('matVec output is shorter than rows')
  }
  for (let r = 0; r < rows; r++) {
    const offset = r * cols
    let sum = 0
    for (let c = 0; c < cols; c++) {
      sum += weights[offset + c] * vector[c]
    }
    out[r] = sum
  }
  return out
}

export function addBiasInPlace(values, bias, rows, cols) {
  checkArray(values, 'values')
  checkArray(bias, 'bias')
  checkPositiveInt(rows, 'rows')
  checkPositiveInt(cols, 'cols')
  if (values.length < rows * cols) {
    throw new Error('addBias values are shorter than declared dimensions')
  }
  if (bias.length !== cols) {
    throw new Error('addBias size mismatch: bias ' + bias.length + ' vs cols ' + cols)
  }
  for (let r = 0; r < rows; r++) {
    const offset = r * cols
    for (let c = 0; c < cols; c++) {
      values[offset + c] += bias[c]
    }
  }
  return values
}

export function reluInPlace(values) {
  checkArray(values, 'values')
  for (let i = 0; i < values.length; i++) {
    if (values[i] < 0) {
      values[i] = 0
    }
  }
  return values
}

export function softmaxInPlace(values) {
  checkArray(values, 'values')
  if (values.length === 0) {
    throw new Error('softmax requires at least one value')
  }
  let max = values[0]
  for (let i = 1; i < values.length; i++) {
    if (values[i] > max) {
      max = values[i]
    }
  }
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    const e = Math.exp(values[i] - max)
    values[i] = e
    sum += e
  }
  if (!(sum > 0) || !isFinite(sum)) {
    const uniform = 1 / values.length
    for (let i = 0; i < values.length; i++) {
      values[i] = uniform
    }
    return values
  }
  for (let i = 0; i < values.length; i++) {
    values[i] = values[i] / sum
  }
  return values
}

export function argMax(values) {
  checkArray(values, 'values')
  if (values.length === 0) {
    throw new Error('argMax requires at least one value')
  }
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) {
      best = i
    }
  }
  return best
}

export function toArray(values) {
  const out = []
  for (let i = 0; i < values.length; i++) {
    out.push(values[i])
  }
  return out
}

function nearlyEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance
}

function arraysNearlyEqual(a, b, tolerance) {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (!nearlyEqual(a[i], b[i], tolerance)) {
      return false
    }
  }
  return true
}

function formatArray(values, digits) {
  const parts = []
  for (let i = 0; i < values.length; i++) {
    parts.push(Number(values[i]).toFixed(digits))
  }
  return '[' + parts.join(', ') + ']'
}

export function runMatrixSelfTest() {
  const checks = []

  const vecA = [1, 2, 3]
  const vecB = [0.1, 0.2, 0.3]
  const vecSum = vecAdd(vecA, vecB)
  checks.push({
    name: '向量加法',
    ok: arraysNearlyEqual(vecSum, [1.1, 2.2, 3.3], 1e-6),
    expected: '[1.1, 2.2, 3.3]',
    actual: formatArray(vecSum, 4),
  })

  const a = [1, 2, 3, 4, 5, 6]
  const b = [7, 8, 9, 10, 11, 12]
  const product = matMul(a, 2, 3, b, 3, 2)
  checks.push({
    name: '矩阵乘法 2x3 * 3x2',
    ok: arraysNearlyEqual(product, [58, 64, 139, 154], 1e-6),
    expected: '[58, 64, 139, 154]',
    actual: formatArray(product, 1),
  })

  const biased = addBiasInPlace(product, [0.5, -0.5], 2, 2)
  checks.push({
    name: '矩阵加偏置',
    ok: arraysNearlyEqual(biased, [58.5, 63.5, 139.5, 153.5], 1e-6),
    expected: '[58.5, 63.5, 139.5, 153.5]',
    actual: formatArray(biased, 2),
  })

  const reluValues = reluInPlace([-1, 0, 2, -3])
  checks.push({
    name: 'ReLU',
    ok: arraysNearlyEqual(reluValues, [0, 0, 2, 0], 1e-6),
    expected: '[0, 0, 2, 0]',
    actual: formatArray(reluValues, 1),
  })

  const softmaxValues = softmaxInPlace([1, 2, 3])
  const softmaxExpected = [0.09003057, 0.24472847, 0.66524096]
  let softmaxSum = 0
  for (let i = 0; i < softmaxValues.length; i++) {
    softmaxSum += softmaxValues[i]
  }
  checks.push({
    name: 'Softmax',
    ok:
      arraysNearlyEqual(softmaxValues, softmaxExpected, 1e-6) &&
      nearlyEqual(softmaxSum, 1, 1e-6),
    expected: '[0.0900, 0.2447, 0.6652] sum=1',
    actual: formatArray(softmaxValues, 4) + ' sum=' + softmaxSum.toFixed(6),
  })

  checks.push({
    name: 'argMax',
    ok: argMax(softmaxValues) === 2,
    expected: '2',
    actual: String(argMax(softmaxValues)),
  })

  let dimensionCheckOk = false
  try {
    matMul([1, 2], 1, 2, [1, 2], 1, 2)
  } catch (error) {
    dimensionCheckOk = true
  }
  checks.push({
    name: '尺寸错误检查',
    ok: dimensionCheckOk,
    expected: '抛出错误',
    actual: dimensionCheckOk ? '已抛出错误' : '未抛出错误',
  })

  let passed = 0
  for (let i = 0; i < checks.length; i++) {
    if (checks[i].ok) {
      passed++
    }
  }
  return {
    ok: passed === checks.length,
    checks: checks,
    passed: passed,
    total: checks.length,
  }
}
