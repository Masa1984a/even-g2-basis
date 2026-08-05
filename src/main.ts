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
  type Asset, type DrrRow, ASSETS,
  SCREEN_W, SCREEN_H, CHART_W, CHART_H,
  lastValue, statsOf, renderChartBytes,
} from './chart'
import { API_BASE, fetchDrr } from './api'
import { log, setStatus } from './log'
import {
  LAYOUT, allChartHeader, allChartFooter, assetHeader, assetFooter,
} from './glass-text'

const REFRESH_MS = 5 * 60 * 1000
const CACHE_KEY = 'basis-drr.rows'
const VIEW_KEY = 'basis-drr.view'

// ─── Containers ──────────────────────────────────────────────────────────────

// createStartUpPageContainer / rebuildPageContainer は 1,000 文字まで。
// 全画面でも 400-500 字が目安で、超えるとスクロール扱いになり入力を奪われる。
const MAX_CONTENT = 480

function textProp(d: Partial<TextContainerProperty>): TextContainerProperty {
  const c = d.content
  if (c && c.length > MAX_CONTENT) {
    log('warn', `テキストが長すぎます (${c.length}字) — 切り詰めます`, d.containerName)
    d = { ...d, content: c.slice(0, MAX_CONTENT) }
  }
  return new TextContainerProperty(d)
}

const imgProp = (d: Partial<ImageContainerProperty>) => new ImageContainerProperty(d)

// コンテナIDはページ間で使い回す。textContainerUpgrade は ID と名前の完全一致が必要。
const ID = { catcher: 1, header: 2, chart: 3, footer: 4 } as const

/**
 * 画像ページの推奨レイアウト(公式ドキュメント準拠)。
 * 入力は「全画面の空テキストコンテナ」で受け、画像はその上に描く。
 * zOrderIndex は使わない — 使うと同一ページの全コンテナで必須になり
 * min_sdk_version も 0.0.12 以上に上がるため。省略時は「先に宣言した方が背面」。
 */
function chartPage(header: string, footer: string): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: 4,
    textObject: [
      // 先頭に宣言 = 背面。入力を受け取る唯一のコンテナ。
      textProp({
        containerID: ID.catcher, containerName: 'catcher',
        xPosition: 0, yPosition: 0, width: SCREEN_W, height: SCREEN_H,
        content: ' ', isEventCapture: 1,
      }),
      textProp({
        containerID: ID.header, containerName: 'header',
        xPosition: LAYOUT.header.x, yPosition: LAYOUT.header.y,
        width: LAYOUT.header.w, height: LAYOUT.header.h,
        content: header, isEventCapture: 0,
      }),
      textProp({
        containerID: ID.footer, containerName: 'footer',
        xPosition: LAYOUT.footer.x, yPosition: LAYOUT.footer.y,
        width: LAYOUT.footer.w, height: LAYOUT.footer.h,
        content: footer, isEventCapture: 0,
      }),
    ],
    imageObject: [
      imgProp({
        containerID: ID.chart, containerName: 'chart',
        xPosition: LAYOUT.chart.x, yPosition: LAYOUT.chart.y,
        width: LAYOUT.chart.w, height: LAYOUT.chart.h,
      }),
    ],
  })
}

// ─── Views ───────────────────────────────────────────────────────────────────

// ルート(index 0)は全資産の折れ線。以降はタップで資産別へ。
type View = { kind: 'all' } | { kind: 'asset'; asset: Asset }
const VIEWS: View[] = [
  { kind: 'all' },
  ...ASSETS.map(asset => ({ kind: 'asset' as const, asset })),
]

const viewLabel = (v: View) => (v.kind === 'all' ? '全資産' : v.asset)

// ─── Main ────────────────────────────────────────────────────────────────────

function loadCache(): DrrRow[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as DrrRow[]) : []
  } catch { return [] }
}

async function main() {
  log('info', 'bridge を待機中…')
  const bridge = await waitForEvenAppBridge()
  log('ok', 'bridge 準備完了')

  try {
    const dev = await bridge.getDeviceInfo()
    log('info', 'デバイス', dev ? { model: dev.model, battery: dev.status?.batteryLevel } : 'なし')
  } catch (e) { log('warn', 'getDeviceInfo 失敗', e) }

  // 起動直後は前回のキャッシュで描画し、ネットワークを待たせない
  // (スマホがロックされて再開したときも同じ経路で復帰する)
  let rows: DrrRow[] = loadCache()
  let idx = Number(localStorage.getItem(VIEW_KEY) ?? 0) || 0
  if (idx < 0 || idx >= VIEWS.length) idx = 0
  let rendering = false

  // 起動時は最小構成。グラフは直後の render() で rebuild して描く。
  const init = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [textProp({
      containerID: ID.catcher, containerName: 'catcher',
      xPosition: 0, yPosition: 0, width: SCREEN_W, height: SCREEN_H,
      content: '\nBasis DRR\n\nデータを取得中…',
      isEventCapture: 1,
    })],
  }))

  if (init !== StartUpPageCreateResult.success) {
    log('error', 'createStartUpPageContainer 失敗', StartUpPageCreateResult[init] ?? init)
    setStatus('起動失敗 — グラスの接続を確認してください')
    return
  }
  log('ok', '起動ページ作成', rows.length ? `キャッシュ ${rows.length}日分` : '空')

  async function showChart(assets: Asset[], header: string, footer: string) {
    const ok = await bridge.rebuildPageContainer(chartPage(header, footer))
    if (!ok) { log('error', 'rebuildPageContainer が false を返しました'); return }

    const bytes = renderChartBytes(rows, assets, CHART_W, CHART_H)
    const result = await bridge.updateImageRawData(new ImageRawDataUpdate({
      containerID: ID.chart, containerName: 'chart', imageData: bytes,
    }))

    if (ImageRawDataUpdateResult.isSuccess(result)) {
      log('ok', `画像送信 ${CHART_W}x${CHART_H}`, `${bytes.length}B`)
      return
    }
    // 画像が出せなくても数値は読めるよう、フッターに理由を出す
    log('error', 'updateImageRawData 失敗', result)
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: ID.footer, containerName: 'footer',
      content: `${footer}\n(グラフ描画に失敗: ${result})`,
    }))
  }

  async function render() {
    if (rendering) { log('warn', '描画中のため要求をスキップ'); return }
    if (!rows.length) return
    rendering = true
    const v = VIEWS[idx]
    setStatus(`表示中: ${viewLabel(v)}  (${idx + 1}/${VIEWS.length})  API: ${API_BASE}`)
    try {
      if (v.kind === 'all') await showChart(ASSETS, allChartHeader(rows), allChartFooter(rows))
      else await showChart([v.asset], assetHeader(rows, v.asset), assetFooter(rows, v.asset))
      log('ok', `描画完了: ${viewLabel(v)}`)
    } catch (e) {
      log('error', `描画失敗: ${viewLabel(v)}`, e)
    } finally {
      rendering = false
    }
  }

  function goTo(next: number) {
    idx = (next + VIEWS.length) % VIEWS.length
    localStorage.setItem(VIEW_KEY, String(idx))
    void render()
  }

  bridge.onEvenHubEvent((event: EvenHubEvent) => {
    const t = event.textEvent?.eventType ?? event.sysEvent?.eventType
    if (t == null || t === OsEventTypeList.IMU_DATA_REPORT) return
    log('info', 'イベント', OsEventTypeList[t] ?? t)

    switch (t) {
      case OsEventTypeList.CLICK_EVENT:
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
        goTo(idx + 1)
        break
      case OsEventTypeList.SCROLL_TOP_EVENT:
        goTo(idx - 1)
        break
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        // ルートページのダブルタップはシステム終了ダイアログを出すことが必須。
        // 独自UIを割り当てると審査で自動リジェクトされる。
        if (idx === 0) {
          log('info', '終了ダイアログを要求')
          void bridge.shutDownPageContainer(1)
        } else {
          goTo(0)
        }
        break
      case OsEventTypeList.FOREGROUND_ENTER_EVENT:
        log('info', '前面に復帰 — 再描画')
        void render()
        break
      default:
        break
    }
  })

  async function refresh(reason: string) {
    try {
      const next = await fetchDrr()
      if (!next.length) throw new Error('データが空です')
      rows = next
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* 容量超過は無視 */ }
      log('ok', `取得成功 (${reason})`, `${next.length}日分`)
      await render()
    } catch (e) {
      log('error', `取得失敗 (${reason})`, e)
      if (!rows.length) {
        await bridge.textContainerUpgrade(new TextContainerUpgrade({
          containerID: ID.catcher, containerName: 'catcher',
          content: `\nデータ取得に失敗しました\n\n${e}\n\n${API_BASE || '(VITE_API_BASE 未設定)'}`,
        }))
      }
    }
  }

  if (rows.length) await render()
  await refresh('起動時')
  setInterval(() => void refresh('定期更新'), REFRESH_MS)
}

main().catch(e => {
  log('error', '起動に失敗しました', e)
  setStatus('起動失敗')
})
