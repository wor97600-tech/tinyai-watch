const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64ToBytes(text) {
  if (typeof text !== 'string') {
    throw new Error('base64 input must be a string')
  }
  const out = []
  let accumulator = 0
  let bits = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '=') {
      break
    }
    const value = ALPHABET.indexOf(ch)
    if (value < 0) {
      continue
    }
    accumulator = (accumulator << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((accumulator >> bits) & 0xff)
    }
  }
  return out
}
