// グラスのテキストコンテナに流し込む文字列。
// main.ts(実機)と share.ts(共有画像)の両方から使うので、ここを唯一の正とする。
//
// ファームウェアのフォントは等幅ではないので、桁揃えには頼らない。
// 使う記号は design-guidelines が「確実に出る」と明記したものだけに絞る。
import { type Asset, type DrrRow, ASSETS, lastValue, statsOf } from './chart'

export function pct(v: number | null): string {
  return v == null ? '—' : v.toFixed(3) + '%'
}

export function allChartHeader(rows: DrrRow[]): string {
  const from = rows[0]?.date?.slice(5) ?? '—'
  const to = rows[rows.length - 1]?.date?.slice(5) ?? '—'
  return `全資産 DRR  ${from} → ${to}`
}

/** 画像が出なくても数値だけで読めるようにしておく(フォールバックを兼ねる)。 */
export function allChartFooter(rows: DrrRow[]): string {
  const pairs = ASSETS.map(a => `${a} ${pct(lastValue(rows, a))}`)
  return [
    `${pairs[0]}   ${pairs[1]}`,
    `${pairs[2]}   ${pairs[3]}`,
    'スクロール=資産別へ  ダブルタップ=終了',
  ].join('\n')
}

export function assetHeader(rows: DrrRow[], asset: Asset): string {
  const s = statsOf(rows, asset)
  return s ? `${asset} DRR (${s.n}日)  最新 ${s.last.toFixed(3)}%` : `${asset} — データなし`
}

export function assetFooter(rows: DrrRow[], asset: Asset): string {
  const s = statsOf(rows, asset)
  if (!s) return 'スクロール=次へ  ダブルタップ=全資産へ'
  return [
    `平均 ${s.avg.toFixed(3)}%  最大 ${s.max.toFixed(3)}%  最小 ${s.min.toFixed(3)}%`,
    'スクロール=次へ  ダブルタップ=全資産へ',
  ].join('\n')
}

// 画面内のコンテナ配置。main.ts の rebuildPageContainer と share.ts の合成で共有する。
export const LAYOUT = {
  header: { x: 0, y: 0, w: 576, h: 34 },
  chart: { x: 144, y: 40, w: 288, h: 144 },
  footer: { x: 0, y: 196, w: 576, h: 88 },
} as const
