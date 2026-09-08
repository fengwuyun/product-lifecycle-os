// 生成应用图标 build/icon.png（256x256）
// 设计：靛蓝渐变圆角方块 + 8 个白点组成生命周期环 + 顶部琥珀色"当前阶段"点 + 中心白点
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const S = 256

// ── PNG 编码 ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// ── 画布 ──
const px = new Uint8Array(S * S * 4)
function set(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  const sa = a / 255
  const da = px[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa <= 0) return
  px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa)
  px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa)
  px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa)
  px[i + 3] = Math.round(oa * 255)
}

// 靛蓝渐变圆角方块（对角线渐变 #5B54F0 → #3730A3）
const R = 58
function inRoundedRect(x, y) {
  const cx = Math.max(R, Math.min(S - R, x))
  const cy = Math.max(R, Math.min(S - R, y))
  const dx = x - cx, dy = y - cy
  return dx * dx + dy * dy <= R * R
}
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedRect(x, y)) continue
    const t = (x + y) / (2 * S)
    const r = Math.round(0x5b + (0x37 - 0x5b) * t)
    const g = Math.round(0x54 + (0x30 - 0x54) * t)
    const b = Math.round(0xf0 + (0xa3 - 0xf0) * t)
    set(x, y, r, g, b, 255)
  }
}

// 8 点生命周期环
const CX = 128, CY = 132, RING = 62
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2
  const dx = CX + RING * Math.cos(a)
  const dy = CY + RING * Math.sin(a)
  const isCurrent = i === 2
  const rad = isCurrent ? 13 : 9
  const color = isCurrent ? [0xfb, 0xbf, 0x24] : [0xff, 0xff, 0xff]
  for (let y = -rad - 2; y <= rad + 2; y++) {
    for (let x = -rad - 2; x <= rad + 2; x++) {
      const d = Math.sqrt(x * x + y * y)
      if (d <= rad) set(Math.round(dx + x), Math.round(dy + y), ...color, 255)
      else if (d <= rad + 1.6) set(Math.round(dx + x), Math.round(dy + y), ...color, Math.round(255 * (1 - (d - rad) / 1.6)))
    }
  }
}
// 中心点
for (let y = -12; y <= 12; y++) {
  for (let x = -12; x <= 12; x++) {
    const d = Math.sqrt(x * x + y * y)
    if (d <= 10) set(CX + x, CY + y, 255, 255, 255, 255)
    else if (d <= 11.5) set(CX + x, CY + y, 255, 255, 255, Math.round(255 * (1 - (d - 10) / 1.5)))
  }
}

// ── 输出 PNG ──
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0 // filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
const out = path.resolve(process.argv[2] || 'build/icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('icon written:', out, png.length, 'bytes')
