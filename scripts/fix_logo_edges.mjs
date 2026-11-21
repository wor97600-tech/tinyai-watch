import fs from 'node:fs'
import zlib from 'node:zlib'

function decodePng(file) {
  const b = fs.readFileSync(file)
  let p = 8
  const idat = []
  let w = 0, h = 0
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString('ascii', p + 4, p + 8)
    const data = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4) }
    if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4, stride = w * bpp
  const out = Buffer.alloc(w * h * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const up = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (ft === 1) v += a
      else if (ft === 2) v += up
      else if (ft === 3) v += (a + up) >> 1
      else if (ft === 4) {
        const pp = a + up - c
        const pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c)
      }
      cur[i] = v & 255
    }
    cur.copy(out, y * stride)
    prev = cur
  }
  return { w, h, data: out }
}

function crcTable() {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
}
const T = crcTable()
function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = T[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const img = decodePng('src/assets/images/logo.png')
const { w, h } = img
const cx = (w - 1) / 2
const cy = (h - 1) / 2

function pxAt(x, y) {
  const xi = Math.min(w - 1, Math.max(0, x))
  const yi = Math.min(h - 1, Math.max(0, y))
  const i = (yi * w + xi) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}

// 双线性采样（按 alpha 预乘，避免边缘出现暗/白边）
function sample(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  let r = 0, g = 0, b = 0, a = 0
  for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const c = pxAt(x0 + dx, y0 + dy)
    const al = c[3] / 255
    r += c[0] * al * wt
    g += c[1] * al * wt
    b += c[2] * al * wt
    a += al * wt
  }
  if (a <= 0.0001) return [0, 0, 0, 0]
  return [r / a, g / a, b / a, a * 255]
}

// 找圆盘半径
let R = 0
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (pxAt(x, y)[3] > 200) {
      const d = Math.hypot(x - cx, y - cy)
      if (d > R) R = d
    }
  }
}

// 采样环的颜色（确认外圈是纯深蓝）
let maxBright = 0
for (let i = 0; i < 720; i++) {
  const ang = (i / 720) * Math.PI * 2
  const c = sample(cx + Math.cos(ang) * 53.5, cy + Math.sin(ang) * 53.5)
  maxBright = Math.max(maxBright, c[0], c[1], c[2])
}

const target = Math.min(cx, cy) + 0.5 // 铺满画布
const out = Buffer.alloc(w * h * 4)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    const dx = x - cx, dy = y - cy
    const d = Math.hypot(dx, dy)
    if (d <= R - 0.6) {
      const c = pxAt(x, y)
      let [r, g, b, a] = c
      // 清掉外侧的白色杂边：亮且半透明的像素改用环上的深蓝
      if (a < 255 && r > 140 && g > 140 && b > 140) {
        const ang = Math.atan2(dy, dx)
        const s = sample(cx + Math.cos(ang) * 53.5, cy + Math.sin(ang) * 53.5)
        r = s[0]; g = s[1]; b = s[2]
      }
      out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b); out[o + 3] = a
    } else {
      const ang = Math.atan2(dy, dx)
      const s = sample(cx + Math.cos(ang) * 53.5, cy + Math.sin(ang) * 53.5)
      const cover = Math.min(1, Math.max(0, target - d + 0.5))
      if (cover <= 0) { out[o + 3] = 0; continue }
      out[o] = Math.round(s[0]); out[o + 1] = Math.round(s[1]); out[o + 2] = Math.round(s[2])
      out[o + 3] = Math.round(cover * 255)
    }
  }
}

fs.writeFileSync('src/assets/images/logo.png', encodePng(w, h, out))
console.log('disc radius was ' + R.toFixed(2) + ', target ' + target.toFixed(2) + ', ring maxBright ' + maxBright.toFixed(0))
console.log('bytes ' + fs.statSync('src/assets/images/logo.png').size)
