// X 等での共有用に、全資産チャートをグラスの見え方で書き出すページ。
//
// 実機に忠実であることを優先し、次の順で処理する:
//   1. src/chart.ts でネイティブ解像度(288x144)に描く — 実機に送るのと同じピクセル
//   2. 4bit(16階調)に量子化 — ハードウェアがやることと同じ
//   3. ニアレストネイバーで整数倍に拡大 — にじませない
//   4. 緑に変換 — マイクロLEDの発色に合わせる
//
// つまりこれは「それっぽく作ったモック」ではなく、実機に送られる画素の忠実な再現。
import { paintChart, ASSETS, CHART_W, CHART_H, type DrrRow } from './chart'
import { API_BASE, fetchDrr } from './api'

const SCALE = 4
const OUT_W = CHART_W * SCALE
const OUT_H = CHART_H * SCALE

/** グラスの発色。純緑よりわずかに柔らかい。 */
function tint(level: number): [number, number, number] {
  return [Math.round(level * 0.13), level, Math.round(level * 0.16)]
}

function renderShareImage(rows: DrrRow[], canvas: HTMLCanvasElement, green: boolean) {
  // 1. ネイティブ解像度で描く
  const src = document.createElement('canvas')
  src.width = CHART_W
  src.height = CHART_H
  const sctx = src.getContext('2d')!
  paintChart(sctx, rows, ASSETS, CHART_W, CHART_H)

  // 2. 4bit 量子化 + 4. 緑変換
  const img = sctx.getImageData(0, 0, CHART_W, CHART_H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const level = Math.round((lum / 255) * 15) // 16階調
    const v = Math.round((level / 15) * 255)
    if (green) {
      const [r, g, b] = tint(v)
      d[i] = r; d[i + 1] = g; d[i + 2] = b
    } else {
      d[i] = v; d[i + 1] = v; d[i + 2] = v
    }
    d[i + 3] = 255
  }
  sctx.putImageData(img, 0, 0)

  // 3. ニアレストネイバーで拡大
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, OUT_W, OUT_H)
  ctx.drawImage(src, 0, 0, OUT_W, OUT_H)
}

async function main() {
  const canvas = document.getElementById('out') as HTMLCanvasElement
  const status = document.getElementById('status')!
  const greenBox = document.getElementById('green') as HTMLInputElement
  const dl = document.getElementById('download') as HTMLAnchorElement

  let rows: DrrRow[] = []
  try {
    rows = await fetchDrr()
    if (!rows.length) throw new Error('empty')
    const from = rows[0].date
    const to = rows[rows.length - 1].date
    status.textContent = `実データ ${rows.length}日分 (${from} 〜 ${to})  ${API_BASE}`
  } catch (e) {
    status.textContent = `データ取得に失敗しました: ${e}`
    return
  }

  function draw() {
    renderShareImage(rows, canvas, greenBox.checked)
    dl.href = canvas.toDataURL('image/png')
    dl.download = `even-g2-drr-${rows[rows.length - 1].date}.png`
  }

  greenBox.addEventListener('change', draw)
  draw()
}

main()
