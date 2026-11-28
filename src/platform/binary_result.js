// BlueOS 不同固件对 file.readArrayBuffer 的成功回调有两种常见形状：
// ArrayBuffer / TypedArray 直出，或 { buffer: ... } 包装。统一在 I/O 边界解包。

function isArrayBuffer(value) {
  if (!value || typeof ArrayBuffer === 'undefined') return false
  if (value instanceof ArrayBuffer) return true
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]'
}

function isArrayBufferView(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(value)
  }
  return (
    isArrayBuffer(value.buffer) &&
    typeof value.byteLength === 'number' &&
    typeof value.byteOffset === 'number'
  )
}

function isDirectBinaryBytes(value) {
  return isArrayBuffer(value) || isArrayBufferView(value) || Array.isArray(value)
}

function isBinaryPayload(value) {
  return (
    isDirectBinaryBytes(value) ||
    (value && typeof value === 'object' && typeof value.length === 'number')
  )
}

export function normalizeBinaryResult(data) {
  let value = data
  // 只解常见的宿主包装层，最多三层，避免误拆业务对象。
  for (let depth = 0; depth < 3; depth++) {
    if (!value || typeof value !== 'object' || isDirectBinaryBytes(value)) {
      return value
    }

    // 先看宿主包装字段；有些固件会在包一层的同时附带 length。
    if (isBinaryPayload(value.buffer)) {
      value = value.buffer
      continue
    }
    if (isBinaryPayload(value.data)) {
      value = value.data
      continue
    }
    if (isBinaryPayload(value.result)) {
      value = value.result
      continue
    }

    // 没有包装字段时，才把带 length 的宿主数组当作原始字节。
    return value
  }
  return value
}