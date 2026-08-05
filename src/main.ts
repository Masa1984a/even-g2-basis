/// <reference types="vite/client" />
import {
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
  OsEventTypeList,
  StartUpPageCreateResult,
  ImageRawDataUpdateResult,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import {
  type Asset, type DrrRow, ASSETS, STYLE,
  SCREEN_W, CHART_W, CHART_H, BAND_LO, BAND_HI,
  seriesOf, lastValue, statsOf, renderChartBytes,
} from './chart'
import { API_BASE, fetchDrr } from './api'

const REFRESH_MS = 5 * 60 * 1000

// ─── Text rendering ──────────────────────────────────────────────────────────

function sparkline(series: (number | null)[], width: number): string {
  const blocks = '▁▂▃▄▅▆▇█'
  const tail = series.slice(-width)
  const vals = tail.filter((v): v is number => v != null)
  if (!vals.length) return '─'.repeat(width)
  const min = Math.min(...vals)
  const range = Math.max(...vals) - min || 1e-6
  return tail.map(v => {
    if (v == null) return ' '
    return blocks[Math.min(7, Math.max(0, Math.round(((v - min) / range) * 7)))]
  }).join('')
}

function pct(v: number | null): string {
  return v == null ? '  —  ' : v.toFixed(3) + '%'
}

function summaryText(rows: DrrRow[]): string {
  const lines = [
    `  資産別 DRR  (${rows.length}日分)`,
    '  ─────────────────────────────────────',
  ]
  for (const a of ASSETS) {
    const spark = sparkline(seriesOf(rows, a), 24)
    lines.push(`  ${a.padEnd(5)} ${pct(lastValue(rows, a))}  ${spark}`)
  }
  lines.push('')
  lines.push(`  最終 ${rows[rows.length - 1]?.date ?? '—'}    想定帯 ${BAND_LO}〜${BAND_HI}%`)
  lines.push('  タップ→全資産グラフ   ダブルタップ→先頭')
  return lines.join('\n')
}

function allChartHeader(rows: DrrRow[]): string {
  const from = rows[0]?.date?.slice(5) ?? '—'
  const to = rows[rows.length - 1]?.date?.slice(5) ?? '—'
  return `  全資産 DRR 推移   ${from} → ${to}`
}

function allChartLegend(rows: DrrRow[]): string {
  const c = ASSETS.map(a => `${STYLE[a].mark} ${a} ${pct(lastValue(rows, a))}`)
  return [
    `  ${c[0]}      ${c[1]}`,
    `  ${c[2]}      ${c[3]}`,
    '',
    '  タップ→資産別の個別グラフへ',
  ].join('\n')
}

function assetHeader(rows: DrrRow[], asset: Asset): string {
  const s = statsOf(rows, asset)
  if (!s) return `  ${asset} — データなし`
  return [
    `  ${asset} の DRR 推移   (${s.n}日)`,
    `  最新 ${s.last.toFixed(3)}%   平均 ${s.avg.toFixed(3)}%`,
  ].join('\n')
}

function assetFooter(rows: DrrRow[], asset: Asset): string {
  const s = statsOf(rows, asset)
  if (!s) return '  タップ→次へ'
  const inBand = s.last >= BAND_LO && s.last <= BAND_HI
  return [
    `  最大 ${s.max.toFixed(3)}%   最小 ${s.min.toFixed(3)}%`,
    `  想定帯 ${BAND_LO}〜${BAND_HI}% : ${inBand ? '内 ✓' : '外 ⚠'}`,
    '',
    '  タップ→次の資産   ダブルタップ→先頭',
  ].join('\n')
}

// ─── Containers ──────────────────────────────────────────────────────────────

const text = (d: Partial<TextContainerProperty>) => new TextContainerProperty(d)
const image = (d: Partial<ImageContainerProperty>) => new ImageContainerProperty(d)

const CHART_X = Math.floor((SCREEN_W - CHART_W) / 2)

/** ヘッダー + グラフ + フッターの共通レイアウトを組む。 */
async function showChartPage(
  bridge: EvenAppBridge,
  rows: DrrRow[],
  assets: Asset[],
  header: string,
  footer: string
) {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 3,
    textObject: [
      text({
        containerID: 1, containerName: 'header',
        xPosition: 0, yPosition: 0, width: SCREEN_W, height: 34,
        content: header, isEventCapture: 1,
      }),
      text({
        containerID: 3, containerName: 'footer',
        xPosition: 0, yPosition: 190, width: SCREEN_W, height: 96,
        content: footer, isEventCapture: 0,
      }),
    ],
    imageObject: [
      image({
        containerID: 2, containerName: 'chart',
        xPosition: CHART_X, yPosition: 40, width: CHART_W, height: CHART_H,
      }),
    ],
  }))

  const result = await bridge.updateImageRawData(new ImageRawDataUpdate({
    containerID: 2,
    containerName: 'chart',
    imageData: renderChartBytes(rows, assets, CHART_W, CHART_H),
  }))
  if (!ImageRawDataUpdateResult.isSuccess(result)) {
    console.warn('updateImageRawData failed:', result)
  }
}

async function showSummary(bridge: EvenAppBridge, rows: DrrRow[]) {
  await bridge.rebuildPageContainer(new RebuildPageContainer({
    containerTotalNum: 1,
    textObject: [text({
      containerID: 1, containerName: 'main',
      xPosition: 0, yPosition: 0, width: SCREEN_W, height: 288,
      content: summaryText(rows), isEventCapture: 1,
    })],
  }))
}

// ─── Views ───────────────────────────────────────────────────────────────────

// 一覧(テキスト) → 全資産グラフ → 資産ごとの個別グラフ
type View = { kind: 'summary' } | { kind: 'all' } | { kind: 'asset'; asset: Asset }
const VIEWS: View[] = [
  { kind: 'summary' },
  { kind: 'all' },
  ...ASSETS.map(asset => ({ kind: 'asset' as const, asset })),
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const bridge = await waitForEvenAppBridge()

  const init = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [text({
      containerID: 1, containerName: 'main',
      xPosition: 0, yPosition: 0, width: SCREEN_W, height: 288,
      content: '\n  Basis DRR\n\n  データを取得中...',
      isEventCapture: 1,
    })],
  }))

  if (init !== StartUpPageCreateResult.success) {
    console.error('createStartUpPageContainer failed:', init)
    return
  }

  let rows: DrrRow[] = []
  let idx = 0
  let rendering = false

  async function render() {
    if (rendering || !rows.length) return
    rendering = true
    try {
      const v = VIEWS[idx]
      if (v.kind === 'summary') {
        await showSummary(bridge, rows)
      } else if (v.kind === 'all') {
        await showChartPage(bridge, rows, ASSETS, allChartHeader(rows), allChartLegend(rows))
      } else {
        await showChartPage(bridge, rows, [v.asset], assetHeader(rows, v.asset), assetFooter(rows, v.asset))
      }
    } catch (e) {
      console.error('render failed:', e)
    } finally {
      rendering = false
    }
  }

  bridge.onEvenHubEvent((event: EvenHubEvent) => {
    const t = event.textEvent?.eventType ?? event.sysEvent?.eventType
    if (t == null || t === OsEventTypeList.IMU_DATA_REPORT) return

    if (t === OsEventTypeList.CLICK_EVENT || t === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      idx = (idx + 1) % VIEWS.length
    } else if (t === OsEventTypeList.SCROLL_TOP_EVENT) {
      idx = (idx - 1 + VIEWS.length) % VIEWS.length
    } else if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      idx = 0
    } else {
      return
    }
    void render()
  })

  try {
    rows = await fetchDrr()
    if (!rows.length) throw new Error('データが空です')
    await render()
  } catch (e) {
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1, containerName: 'main',
      content: `\n  データ取得に失敗しました\n\n  ${e}\n\n  API: ${API_BASE || '(VITE_API_BASE 未設定)'}/api/drr`,
    }))
  }

  setInterval(async () => {
    try {
      const next = await fetchDrr()
      if (next.length) { rows = next; await render() }
    } catch { /* 次の周期で再試行 */ }
  }, REFRESH_MS)
}

main().catch(console.error)
