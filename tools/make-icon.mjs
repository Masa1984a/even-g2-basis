// ストアアイコン(24x24)を生成する。
//
// 審査仕様(design-guidelines / Store listing & visual assets):
//   - 1bit モノクロ。全画素が完全に on か off。中間調・アンチエイリアス不可
//   - 点灯画素はすべて 2x2 ブロックの一部であること。1px の線は検証に通らない
//   - 実質的なディテール予算は 12x12
//
// そこで 12x12 で設計し、最近傍で2倍に拡大する。こうすると点灯画素が必ず
// 偶数座標の 2x2 ブロックになるので、2x2 ルールを構造的に満たせる。
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT_DIR = join(dirname(fileURLToPath(new URL('.', import.meta.url))), 'assets')
const GRID = 12
const SCALE = 2

/** 手書きの b。縦のステムは全高、ボウルは中ほどからベースラインまで。 */
const VARIANTS = {
  // 素直な b。線が太く、小さくしても潰れない
  plain: [
    '.##.........',
    '.##.........',
    '.##.........',
    '.##.........',
    '.######.....',
    '.##...###...',
    '.##.....##..',
    '.##.....##..',
    '.##.....##..',
    '.##...###...',
    '.######.....',
    '............',
  ],
  // 右上がりに倒して手書きらしさを出したもの
  slanted: [
    '...##.......',
    '...##.......',
    '..##........',
    '..##........',
    '..######....',
    '..##...###..',
    '.##......##.',
    '.##......##.',
    '.##......##.',
    '.##....###..',
    '.######.....',
    '............',
  ],
  // 書き出しのはね(左上)と払い(右下)を足したもの
  script: [
    '.##.........',
    '####........',
    '.##.........',
    '.##.........',
    '.######.....',
    '.##...###...',
    '.##.....##..',
    '.##.....##..',
    '.##.....##..',
    '.##...###...',
    '.######..##.',
    '..........##',
  ],
}

// ─── 検証 ────────────────────────────────────────────────────────────────────

/** 2倍拡大後に「全点灯画素が 2x2 ブロックの一部か」を実際に確かめる。 */
function verify2x2(px, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[y * w + x] === 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue
      // 自身を含む4通りの 2x2 のどれかが全点灯ならOK
      const ok = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) =>
        on(x + dx, y + dy) && on(x + dx + 1, y + dy) &&
        on(x + dx, y + dy + 1) && on(x + dx + 1, y + dy + 1))
      if (!ok) return { ok: false, x, y }
    }
  }
  return { ok: true }
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** 8bit グレースケール PNG。値は 0 か 255 のみ(1bit 相当)。 */
function encodePng(px, w, h) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 0  // colour type: greyscale
  const raw = Buffer.alloc((w + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      raw[y * (w + 1) + 1 + x] = px[y * w + x] ? 255 : 0
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── 実行 ────────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true })

for (const [name, grid] of Object.entries(VARIANTS)) {
  if (grid.length !== GRID || grid.some(r => r.length !== GRID)) {
    throw new Error(`${name}: グリッドは ${GRID}x${GRID} で書くこと`)
  }

  const w = GRID * SCALE
  const h = GRID * SCALE
  const px = new Uint8Array(w * h)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (grid[y][x] !== '#') continue
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          px[(y * SCALE + dy) * w + (x * SCALE + dx)] = 1
        }
      }
    }
  }

  const v = verify2x2(px, w, h)
  if (!v.ok) throw new Error(`${name}: (${v.x},${v.y}) が 2x2 ブロックになっていない`)

  const out = join(OUT_DIR, `icon-b-${name}-24.png`)
  writeFileSync(out, encodePng(px, w, h))

  const lit = px.reduce((a, b) => a + b, 0)
  console.log(`\n=== ${name} === ${w}x${h}  点灯 ${lit}/${px.length}px  2x2検証 OK`)
  console.log(grid.map(r => '  ' + r.replace(/#/g, '██').replace(/\./g, '  ')).join('\n'))
  console.log(`  -> ${out}`)
}
