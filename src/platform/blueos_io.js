import storage from '@blueos.storage.storage'
import file from '@blueos.storage.file'
import { normalizeBinaryResult } from './binary_result.js'

const DEFAULT_TIMEOUT_MS = 2500

function stringifyFailure(data, code) {
  let text
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data)
  } catch (error) {
    text = String(data)
  }
  return 'code=' + code + ' data=' + text
}

function callWithCallbacks(invoke, params, label, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let settled = false
    const timer = setTimeout(function () {
      if (!settled) {
        settled = true
        reject(new Error(label + ' timeout after ' + (timeoutMs || DEFAULT_TIMEOUT_MS) + 'ms'))
      }
    }, timeoutMs || DEFAULT_TIMEOUT_MS)

    function succeed(data) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(data)
    }

    function fail(data, code) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      reject(new Error(label + ' failed: ' + stringifyFailure(data, code)))
    }

    const request = {}
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        request[key] = params[key]
      }
    }
    request.success = succeed
    request.fail = fail

    try {
      invoke(request)
    } catch (error) {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(label + ' threw: ' + error.message))
      }
    }
  })
}

export function storageAvailable() {
  return !!storage && typeof storage.set === 'function' && typeof storage.get === 'function'
}

export function storageSet(key, value) {
  return callWithCallbacks(storage.set, { key: key, value: value }, 'storage.set')
}

export function storageGet(key, defaultValue) {
  const params = { key: key }
  if (typeof defaultValue !== 'undefined') {
    params.default = defaultValue
  }
  return callWithCallbacks(storage.get, params, 'storage.get')
}

export function storageDelete(key) {
  const del = storage.delete || storage.del
  if (typeof del !== 'function') {
    return Promise.reject(new Error('storage.delete is unavailable'))
  }
  return callWithCallbacks(del, { key: key }, 'storage.delete')
}

export function storageGetSync(key) {
  if (typeof storage.getSync !== 'function') {
    throw new Error('storage.getSync is unavailable')
  }
  return storage.getSync({ key: key })
}

export function fileAvailable() {
  return !!file && typeof file.readText === 'function' && typeof file.readArrayBuffer === 'function'
}

export function fileReadText(uri, timeoutMs) {
  return callWithCallbacks(file.readText, { uri: uri }, 'file.readText', timeoutMs)
}

export function fileReadArrayBuffer(uri, timeoutMs) {
  return callWithCallbacks(file.readArrayBuffer, { uri: uri }, 'file.readArrayBuffer', timeoutMs).then(
    normalizeBinaryResult
  )
}

export function fileWriteText(uri, text, timeoutMs) {
  return callWithCallbacks(
    file.writeText,
    { uri: uri, text: text },
    'file.writeText',
    timeoutMs
  )
}

export function fileAccess(uri, timeoutMs) {
  return callWithCallbacks(file.access, { uri: uri }, 'file.access', timeoutMs)
}

export function fileDelete(uri, timeoutMs) {
  const del = file.delete || file.del
  if (typeof del !== 'function') {
    return Promise.reject(new Error('file.delete is unavailable'))
  }
  return callWithCallbacks(del, { uri: uri }, 'file.delete', timeoutMs)
}
