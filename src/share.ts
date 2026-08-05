// ストア掲載 / X 共有用に、グラスの画面をそのまま書き出すページ。
//
// 出力は G2 のキャンバスと同じ 576x288。チャートだけを引き伸ばすのではなく、
// 実機と同じ配置(ヘッダー + 288x144 のチャート + フッター)で合成する。
// ストア審査は「実機の描画と一致していること」を求めるため。
//
// 処理順:
//   1. src/chart.ts でネイティブ 288x144 に描く — 実機に送るのと同じピクセル
//   2. LAYOUT の座標どおりに 576x288 のキャンバスへ合成
//   3. 4bit(16階調)に量子化 — ハードウェアがやることと同じ
//   4. 緑に変換 — マイクロLEDの発色に合わせる
//
// テキストだけは近似になる。ファームウェアの LVGL フォントは配布されておらず、
// 等幅でもないため、同じ字形は再現できない。配置とチャートの画素は実機どおり。
import { paintChart, ASSETS, SCREEN_W, SCREEN_H, CHART_W, CHART_H, type DrrRow } from './chart'
import { LAYOUT, allChartHeader, allChartFooter } from './glass-text'
import { API_BASE, fetchDrr } from './api'

/** グラスの発色。純緑よりわずかに柔らかい。 */
function tint(level: number): [number, number, number] {
  return [Math.round(level * 0.13), level, Math.round(level * 0.16)]
}

const FONT_PX = 15
const LINE_H = 20
const PAD_X = 8

/** テキストコンテナの中身を近似して描く。左寄せ・上寄せ、\n で改行。 */
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number }
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.w, box.h)
  ctx.clip()
  ctx.fillStyle = '#ffffff'
  ctx.font = `${FONT_PX}px system-ui, -apple-system, "Segoe UI", "Yu Gothic UI", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  text.split('\n').forEach((line, i) => {
    ctx.fillText(line, box.x + PAD_X, box.y + 4 + i * LINE_H)
  })
  ctx.restore()
}

/** 実機の画面を 576x288 で合成する(量子化・発色変換の前段)。 */
function composeScreen(rows: DrrRow[]): HTMLCanvasElement {
  const screen = document.createElement('canvas')
  screen.width = SCREEN_W
  screen.height = SCREEN_H
  const ctx = screen.getContext('2d')!

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)

  // チャートは実機に送るのと同じ 288x144 で描き、等倍で貼る
  const chart = document.createElement('canvas')
  chart.width = CHART_W
  chart.height = CHART_H
  paintChart(chart.getContext('2d')!, rows, ASSETS, CHART_W, CHART_H)
  ctx.drawImage(chart, LAYOUT.chart.x, LAYOUT.chart.y)

  drawTextBlock(ctx, allChartHeader(rows), LAYOUT.header)
  drawTextBlock(ctx, allChartFooter(rows), LAYOUT.footer)

  return screen
}

/**
 * 4bit 量子化と発色変換。ハードウェアがやることと同じ。
 *
 * `transparent` のときは黒を透明にする。グラスのディスプレイは発光式で、
 * 黒い画素は「光っていない」= 素通し。したがって透過の方が実機の見え方に近い。
 * 色は最大輝度で固定して明るさをアルファで表すので、どんな背景に重ねても
 * 加算的な発光として自然に見える。
 */
function quantize(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  green: boolean,
  transparent: boolean
) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const [fr, fg, fb] = green ? tint(255) : [255, 255, 255]
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const level = Math.round((lum / 255) * 15) // 16階調
    const v = Math.round((level / 15) * 255)
    if (transparent) {
      d[i] = fr; d[i + 1] = fg; d[i + 2] = fb
      d[i + 3] = v
    } else if (green) {
      const [r, g, b] = tint(v)
      d[i] = r; d[i + 1] = g; d[i + 2] = b
      d[i + 3] = 255
    } else {
      d[i] = v; d[i + 1] = v; d[i + 2] = v
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** チャートだけを 288x144 で描く(テキストの枠を含めない)。 */
function composeChartOnly(rows: DrrRow[]): HTMLCanvasElement {
  const chart = document.createElement('canvas')
  chart.width = CHART_W
  chart.height = CHART_H
  paintChart(chart.getContext('2d')!, rows, ASSETS, CHART_W, CHART_H)
  return chart
}

/**
 * `screen` は実機の画面まるごと(576x288 基準) — ストア提出用。
 * `chart` はチャートだけ(288x144 基準) — 記事や X 投稿で図版として使う用。
 */
export type Mode = 'screen' | 'chart'

function renderShareImage(
  rows: DrrRow[],
  canvas: HTMLCanvasElement,
  green: boolean,
  scale: number,
  mode: Mode,
  transparent: boolean
) {
  const screen = mode === 'screen' ? composeScreen(rows) : composeChartOnly(rows)
  const w = screen.width
  const h = screen.height
  quantize(screen.getContext('2d')!, w, h, green, transparent)

  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  // 透過のときは黒で塗りつぶさない。塗ると背景が不透明になってしまう。
  if (transparent) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  } else {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(screen, 0, 0, canvas.width, canvas.height)
}

async function main() {
  const canvas = document.getElementById('out') as HTMLCanvasElement
  const status = document.getElementById('status')!
  const greenBox = document.getElementById('green') as HTMLInputElement
  const scaleSel = document.getElementById('scale') as HTMLSelectElement
  const modeSel = document.getElementById('mode') as HTMLSelectElement
  const alphaBox = document.getElementById('alpha') as HTMLInputElement
  const dl = document.getElementById('download') as HTMLAnchorElement
  const save = document.getElementById('save') as HTMLButtonElement
  const dims = document.getElementById('dims')!

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

  function filename() {
    const green = greenBox.checked ? 'green' : 'grey'
    const alpha = alphaBox.checked ? '-alpha' : ''
    return `${modeSel.value}-${canvas.width}x${canvas.height}-${green}${alpha}.png`
  }

  function draw() {
    renderShareImage(
      rows, canvas, greenBox.checked, Number(scaleSel.value),
      modeSel.value as Mode, alphaBox.checked
    )
    // 透過の確認用に、キャンバスの下に市松模様を敷く
    canvas.classList.toggle('checker', alphaBox.checked)
    dl.href = canvas.toDataURL('image/png')
    dl.download = filename()
    dims.textContent = `${canvas.width} x ${canvas.height}`
  }

  // dev サーバーの /__save-shot に POST して shots/ に保存する(vite.config.ts のプラグイン)
  save.addEventListener('click', async () => {
    save.disabled = true
    try {
      const res = await fetch('/__save-shot', {
        method: 'POST',
        body: JSON.stringify({ name: filename(), dataUrl: canvas.toDataURL('image/png') }),
      })
      const j = await res.json()
      status.textContent = res.ok ? `保存しました: ${j.path}` : `保存に失敗: ${JSON.stringify(j)}`
    } catch (e) {
      status.textContent = `保存に失敗: ${e}`
    } finally {
      save.disabled = false
    }
  })

  greenBox.addEventListener('change', draw)
  scaleSel.addEventListener('change', draw)
  modeSel.addEventListener('change', draw)
  alphaBox.addEventListener('change', draw)
  draw()
}

main()
