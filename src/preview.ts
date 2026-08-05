// ブラウザで G2 のチャート描画を確認するためのプレビュー。実機・SDK は不要。
// 起動: npm run dev → http://localhost:5173/preview.html
import { paintChart, ASSETS, CHART_W, CHART_H, type Asset, type DrrRow } from './chart'
import { API_BASE, fetchDrr } from './api'

/** 実データが無いときに描画を確認するためのダミー系列。 */
function sampleRows(n = 40): DrrRow[] {
  const base: Record<Asset, number> = { BTC: 0.72, ETH: 0.81, PAXG: 0.55, SOL: 0.95 }
  const rows: DrrRow[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 5, 27 + i))
    const row: DrrRow = { date: d.toISOString().slice(0, 10) }
    for (const a of ASSETS) {
      row[a] = +(base[a] + Math.sin(i / 4 + ASSETS.indexOf(a)) * 0.12 + (Math.random() - 0.5) * 0.05).toFixed(3)
    }
    rows.push(row)
  }
  return rows
}

function panel(title: string, rows: DrrRow[], assets: Asset[]) {
  const out = document.getElementById('out')!
  for (const scale of [1, 2]) {
    const fig = document.createElement('figure')
    const cap = document.createElement('figcaption')
    cap.textContent = `${title} ${scale === 1 ? '(実寸)' : '(2倍)'}`
    const canvas = document.createElement('canvas')
    canvas.width = CHART_W
    canvas.height = CHART_H
    if (scale === 2) { canvas.style.width = CHART_W * 2 + 'px'; canvas.style.height = CHART_H * 2 + 'px' }
    paintChart(canvas.getContext('2d')!, rows, assets, CHART_W, CHART_H)
    fig.append(cap, canvas)
    out.append(fig)
  }
}

async function main() {
  const status = document.getElementById('status')!
  let rows: DrrRow[]
  try {
    rows = await fetchDrr()
    if (!rows.length) throw new Error('empty')
    status.textContent = `実データ ${rows.length}日分  (${API_BASE})`
  } catch (e) {
    rows = sampleRows()
    status.textContent = `ダミーデータ (実データ取得不可: ${e})`
  }

  panel('全資産', rows, ASSETS)
  for (const a of ASSETS) panel(a, rows, [a])
}

main()
