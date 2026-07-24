#!/usr/bin/env node
/**
 * assets/icon.png（ブランドの稲妻マーク・翠ベタ塗り on 白・アルファ無し）から、
 * Android 通知の small icon 用の白抜き PNG（assets/notification-icon.png）を生成する。
 *
 * ステータスバーの small icon は**アルファチャンネルだけ**を使う。したがって
 * 「形はアルファで表し、不透明部の RGB は純白」でなければならない。元素材は colorType 2
 * （アルファ無し）なので、翠インクの被覆率をアルファへ変換して作り直す。
 *
 * 仕様は docs/notification-icon-spec.md（正方形・96px以上・アルファ付き・非インタレース・
 * 24dp キャンバスに 2dp パディング相当の透明マージン）。
 *
 * 依存ゼロ（node:zlib と node:fs だけ）。package.json は変更しない。
 *
 *   node scripts/make-notification-icon.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'assets/icon.png')
const OUT = join(ROOT, 'assets/notification-icon.png')

/** 出力サイズ。96px が xxxhdpi の生成サイズなので、その2倍を原本にして縮小品質を稼ぐ。 */
const SIZE = 192
/** 24dp キャンバスに 2dp パディング＝絵柄は中央 (24-4)/24 に収める。 */
const ARTWORK = Math.round((SIZE * 20) / 24)

/** インク色（src/theme.palette.ts の COLORS.emerald）。被覆率の逆算に使う。 */
const INK = { r: 0x0f, g: 0x9e, b: 0x75 }

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function readChunks(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) throw new Error('not a PNG')
  }
  const chunks = []
  let o = 8
  while (o < buf.length) {
    const len = buf.readUInt32BE(o)
    const type = buf.toString('ascii', o + 4, o + 8)
    chunks.push({ type, data: buf.subarray(o + 8, o + 8 + len) })
    o += 12 + len
  }
  return chunks
}

/** PNG のスキャンライン filter を解いて raw バイト列を返す。 */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const ft = raw[p++]
    const line = raw.subarray(p, p + stride)
    p += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (ft !== 0) throw new Error('unsupported filter ' + ft)
      cur[x] = v & 0xff
    }
  }
  return out
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: None（可逆・単純／小アイコンは十分小さい）
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colorType 6 = RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace: none（isValidNotificationIconHeader が要求する）
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- 1. 元素材を読む -------------------------------------------------------
const src = readFileSync(SRC)
const chunks = readChunks(src)
const ihdr = chunks.find((c) => c.type === 'IHDR').data
const sw = ihdr.readUInt32BE(0)
const sh = ihdr.readUInt32BE(4)
const bitDepth = ihdr[8]
const colorType = ihdr[9]
if (bitDepth !== 8 || colorType !== 2 || ihdr[12] !== 0) {
  throw new Error(`unexpected source format: depth=${bitDepth} colorType=${colorType} interlace=${ihdr[12]}`)
}
const idat = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)))
const pix = unfilter(idat, sw, sh, 3)

// --- 2. 翠インクの被覆率をアルファへ ---------------------------------------
// 白地 (255) と インク (INK.r=15) の線形合成なので、赤チャンネルが最もコントラストが高い。
//   pixel = a*INK + (1-a)*white  →  a = (255 - r) / (255 - INK.r)
const alpha = new Float32Array(sw * sh)
const span = 255 - INK.r
for (let i = 0; i < sw * sh; i++) {
  const a = (255 - pix[i * 3]) / span
  alpha[i] = a < 0 ? 0 : a > 1 ? 1 : a
}

// --- 3. 絵柄の外接矩形を求めて、余白を仕様どおりに取り直す ------------------
let minX = sw, minY = sh, maxX = -1, maxY = -1
for (let y = 0; y < sh; y++) {
  for (let x = 0; x < sw; x++) {
    if (alpha[y * sw + x] > 0.02) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
if (maxX < 0) throw new Error('source artwork is empty')
const bw = maxX - minX + 1
const bh = maxY - minY + 1
const scale = ARTWORK / Math.max(bw, bh)
const dw = Math.round(bw * scale)
const dh = Math.round(bh * scale)
const offX = Math.round((SIZE - dw) / 2)
const offY = Math.round((SIZE - dh) / 2)

// --- 4. ボックスフィルタで縮小し、RGBA を書く ------------------------------
const out = Buffer.alloc(SIZE * SIZE * 4) // 既定は全ゼロ＝完全透明
for (let y = 0; y < dh; y++) {
  const y0 = minY + (y * bh) / dh
  const y1 = minY + ((y + 1) * bh) / dh
  for (let x = 0; x < dw; x++) {
    const x0 = minX + (x * bw) / dw
    const x1 = minX + ((x + 1) * bw) / dw
    let sum = 0
    let n = 0
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
      for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
        sum += alpha[sy * sw + sx]
        n++
      }
    }
    const a = n > 0 ? sum / n : 0
    const o = ((offY + y) * SIZE + (offX + x)) * 4
    // 不透明部の RGB は純白。形はアルファだけで表す（tint 色はOS側が付ける）。
    out[o] = 255
    out[o + 1] = 255
    out[o + 2] = 255
    out[o + 3] = Math.round(a * 255)
  }
}

writeFileSync(OUT, encodePng(SIZE, SIZE, out))
console.log(
  `wrote ${OUT}\n  source bbox=${bw}x${bh} at (${minX},${minY})\n  artwork=${dw}x${dh} in ${SIZE}x${SIZE} (margin ${offX}px/${offY}px)`,
)
