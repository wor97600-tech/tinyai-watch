const CJK_START = 0x4e00
const CJK_END = 0x9fff

function isCjk(code) {
  return code >= CJK_START && code <= CJK_END
}

function isAsciiWord(code) {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 46
  )
}

export function tokenize(text) {
  const tokens = []
  if (typeof text !== 'string' || text.length === 0) {
    return tokens
  }
  let previousCjk = ''
  let asciiBuffer = ''

  function flushAscii() {
    if (asciiBuffer.length > 0) {
      tokens.push('w:' + asciiBuffer.toLowerCase())
      asciiBuffer = ''
    }
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (isCjk(code)) {
      flushAscii()
      const ch = text[i]
      tokens.push('u:' + ch)
      if (previousCjk) {
        tokens.push('b:' + previousCjk + ch)
      }
      previousCjk = ch
    } else if (isAsciiWord(code)) {
      previousCjk = ''
      asciiBuffer += text[i]
    } else {
      flushAscii()
      previousCjk = ''
    }
  }
  flushAscii()
  return tokens
}
