import type { DrrRow } from './chart'

// 末尾スラッシュの有無で `//api/drr` になると Vercel のリダイレクトを踏み、
// リダイレクト応答には CORS ヘッダーが付かないため fetch が失敗する。ここで吸収する。
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '')
  .trim()
  .replace(/\/+$/, '')

/** basis-tracker の公開API。middleware で認証除外済みなので認証情報は不要。 */
export async function fetchDrr(): Promise<DrrRow[]> {
  const res = await fetch(`${API_BASE}/api/drr`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  return (j.data ?? []) as DrrRow[] // 既に日付昇順
}
