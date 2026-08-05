// グラス側は 576x288 のテキスト/画像しか出せないので、失敗の詳細はスマホの WebView に出す。
// Even Hub アプリの Developer Mode コンソールでも読めるよう console にも流す。

type Level = 'info' | 'ok' | 'warn' | 'error'

const MAX_LINES = 200
let listEl: HTMLElement | null = null

function ensureEl(): HTMLElement | null {
  if (listEl) return listEl
  listEl = document.getElementById('log')
  return listEl
}

function stamp(): string {
  return new Date().toTimeString().slice(0, 8)
}

export function log(level: Level, msg: string, detail?: unknown): void {
  const text = detail === undefined ? msg : `${msg} — ${format(detail)}`
  const line = `[${stamp()}] ${text}`

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  const el = ensureEl()
  if (!el) return
  const li = document.createElement('li')
  li.className = level
  li.textContent = line
  el.prepend(li)
  while (el.childElementCount > MAX_LINES) el.lastElementChild?.remove()
}

function format(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (typeof v === 'object' && v !== null) {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

/** 画面上部の常設ステータス行(接続状態や現在の画面など)。 */
export function setStatus(text: string): void {
  const el = document.getElementById('status')
  if (el) el.textContent = text
}
