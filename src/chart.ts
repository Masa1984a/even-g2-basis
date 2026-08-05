// G2 グラス用チャート描画。SDK に依存しないので、ブラウザでそのままプレビューできる。

export type Asset = 'BTC' | 'ETH' | 'PAXG' | 'SOL'
export const ASSETS: Asset[] = ['BTC', 'ETH', 'PAXG', 'SOL']

/** /api/drr の1行。資産キーは st を剥がした BTC/ETH/PAXG/SOL。 */
export type DrrRow = { date: string } & Partial<Record<Asset, number>>

// G2 の表示領域は 576x288。ImageContainer は幅 20~288 / 高さ 20~144 が上限。
export const SCREEN_W = 576
export const SCREEN_H = 288
export const CHART_W = 288
export const CHART_H = 144

// 想定レンジ(README 準拠: DRR = reward ÷ staked × 100、妥当域 0.5〜0.9%)
export const BAND_LO = 0.5
export const BAND_HI = 0.9

// 4bitグレースケール(緑16階調)では色で区別できないため、線種と明度で資産を分ける。
// 凡例はグラス側のテキストではなく画像内に直接描く。ファームウェアのフォントは
// 収録外の文字を黙って落とすため、破線を表す記号(╍ ┈ 等)が出ない可能性があるから。
export const STYLE: Record<Asset, { dash: number[]; grey: string }> = {
  BTC:  { dash: [],            grey: '#ffffff' },
  ETH:  { dash: [7, 4],        grey: '#e0e0e0' },
  PAXG: { dash: [2, 4],        grey: '#b0b0b0' },
  SOL:  { dash: [10, 4, 2, 4], grey: '#d0d0d0' },
}

export function seriesOf(rows: DrrRow[], asset: Asset): (number | null)[] {
  return rows.map(r => r[asset] ?? null)
}

export function lastValue(rows: DrrRow[], asset: Asset): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][asset]
    if (v != null) return v
  }
  return null
}

export function statsOf(rows: DrrRow[], asset: Asset) {
  const vals = seriesOf(rows, asset).filter((v): v is number => v != null)
  if (!vals.length) return null
  const sum = vals.reduce((a, b) => a + b, 0)
  return {
    last: vals[vals.length - 1],
    min: Math.min(...vals),
    max: Math.max(...vals),
    avg: sum / vals.length,
    n: vals.length,
  }
}

/** 描画する系列の値域から、想定帯を必ず含むY軸レンジを決める。 */
function yDomain(allVals: number[]): [number, number] {
  const lo = Math.min(BAND_LO, ...allVals)
  const hi = Math.max(BAND_HI, ...allVals)
  const pad = (hi - lo) * 0.12 || 0.1
  return [Math.max(0, lo - pad), hi + pad]
}

/** Canvas にチャートを描く。プレビューでも実機でも同じ絵になる。 */
export function paintChart(
  ctx: CanvasRenderingContext2D,
  rows: DrrRow[],
  assets: Asset[],
  w: number,
  h: number
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const allVals = assets.flatMap(a => seriesOf(rows, a)).filter((v): v is number => v != null)
  if (!allVals.length) {
    ctx.fillStyle = '#888'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('no data', w / 2, h / 2)
    return
  }

  // 複数資産のときは線の右端に資産名を書くので、その分だけ右余白を広げる。
  const multi = assets.length > 1
  const pad = { top: 6, right: multi ? 32 : 6, bottom: 14, left: 26 }
  const cw = w - pad.left - pad.right
  const ch = h - pad.top - pad.bottom
  const [dMin, dMax] = yDomain(allVals)

  const toX = (i: number) => pad.left + (i / Math.max(rows.length - 1, 1)) * cw
  const toY = (v: number) => pad.top + ch - ((v - dMin) / (dMax - dMin)) * ch

  // 想定レンジ帯
  ctx.fillStyle = 'rgba(255,255,255,0.13)'
  ctx.fillRect(pad.left, toY(BAND_HI), cw, toY(BAND_LO) - toY(BAND_HI))

  // Y軸グリッドとラベル(0.2%刻みの丸い値)
  ctx.strokeStyle = '#2a2a2a'
  ctx.fillStyle = '#909090'
  ctx.font = '9px monospace'
  ctx.textAlign = 'right'
  ctx.lineWidth = 1
  const step = 0.2
  for (let v = Math.ceil(dMin / step) * step; v <= dMax; v += step) {
    const y = toY(v)
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke()
    ctx.fillText(v.toFixed(1), pad.left - 3, y + 3)
  }

  // 軸
  ctx.strokeStyle = '#606060'
  ctx.beginPath()
  ctx.moveTo(pad.left, pad.top)
  ctx.lineTo(pad.left, pad.top + ch)
  ctx.lineTo(pad.left + cw, pad.top + ch)
  ctx.stroke()

  // X軸ラベル(始点と終点の日付)
  ctx.fillStyle = '#909090'
  ctx.textAlign = 'left'
  ctx.fillText(rows[0]?.date?.slice(5) ?? '', pad.left, h - 3)
  ctx.textAlign = 'right'
  ctx.fillText(rows[rows.length - 1]?.date?.slice(5) ?? '', pad.left + cw, h - 3)

  // 各資産の折れ線
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const ends: { asset: Asset; y: number }[] = []
  for (const a of assets) {
    const st = STYLE[a]
    ctx.strokeStyle = st.grey
    ctx.lineWidth = multi ? 1.5 : 2
    ctx.setLineDash(multi ? st.dash : [])
    ctx.beginPath()
    let drawing = false
    let lastY: number | null = null
    rows.forEach((r, i) => {
      const v = r[a]
      if (v == null) { drawing = false; return }
      const x = toX(i), y = toY(v)
      if (!drawing) { ctx.moveTo(x, y); drawing = true } else { ctx.lineTo(x, y) }
      lastY = y
    })
    ctx.stroke()
    if (lastY != null) ends.push({ asset: a, y: lastY })
  }
  ctx.setLineDash([])

  if (multi) drawEndLabels(ctx, ends, pad.left + cw + 3, pad.top, ch)
}

/** 線の右端に資産名を置く。値が近いと重なるので、上下に押し広げてから描く。 */
function drawEndLabels(
  ctx: CanvasRenderingContext2D,
  ends: { asset: Asset; y: number }[],
  x: number,
  top: number,
  ch: number
): void {
  const gap = 10
  const sorted = [...ends].sort((a, b) => a.y - b.y)

  // 上から順に最低間隔を確保し、はみ出した分を下から詰め直す
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + gap)
  }
  const overflow = sorted[sorted.length - 1]?.y - (top + ch)
  if (overflow > 0) {
    for (const e of sorted) e.y -= overflow
    for (let i = sorted.length - 2; i >= 0; i--) {
      sorted[i].y = Math.min(sorted[i].y, sorted[i + 1].y - gap)
    }
  }

  ctx.font = '9px sans-serif'
  ctx.textAlign = 'left'
  for (const e of sorted) {
    ctx.fillStyle = STYLE[e.asset].grey
    ctx.fillText(e.asset, x, Math.max(top + 6, e.y) + 3)
  }
}

/** グラスに送るグレースケール配列(1px=1byte)を作る。宿主側で4bitに量子化される。 */
export function renderChartBytes(rows: DrrRow[], assets: Asset[], w: number, h: number): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  paintChart(ctx, rows, assets, w, h)

  const rgba = ctx.getImageData(0, 0, w, h).data
  const grey = new Array<number>(w * h)
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    grey[p] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) | 0
  }
  return grey
}
