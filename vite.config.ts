import { defineConfig, type Plugin } from 'vite'
import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// app.json は evenhub pack が参照する manifest。配信物にも同じ内容を置きたいが、
// public/ に複製を作ると二重管理になるのでビルド後にコピーして単一の正を保つ。
function copyAppManifest(): Plugin {
  return {
    name: 'copy-app-manifest',
    closeBundle() {
      if (existsSync(here('./app.json'))) {
        copyFileSync(here('./app.json'), here('./dist/app.json'))
      }
    },
  }
}

export default defineConfig({
  plugins: [copyAppManifest()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        // index.html = グラス用アプリ本体、preview.html = ブラウザで描画を確認する開発用ページ
        main: here('./index.html'),
        preview: here('./preview.html'),
      },
    },
  },
})
