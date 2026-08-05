import { defineConfig, type Plugin } from 'vite'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// share.html が書き出した PNG を shots/ に保存するための dev 専用エンドポイント。
// 本番ビルドには入らない(configureServer は dev サーバーでしか呼ばれない)。
// canvas の dataURL をシェル経由で運ぶと巨大な base64 文字列を引き回すことになるため、
// ブラウザから直接 POST させる。
function saveShot(): Plugin {
  return {
    name: 'save-shot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only') }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(Buffer.concat(chunks).toString())
            // パス区切りを弾いて、shots/ の外に書けないようにする
            if (typeof name !== 'string' || /[\\/]/.test(name)) throw new Error('invalid name')
            const b64 = String(dataUrl).split(',')[1] ?? ''
            const out = here(`./shots/${name}`)
            mkdirSync(dirname(out), { recursive: true })
            writeFileSync(out, Buffer.from(b64, 'base64'))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: `shots/${name}` }))
          } catch (e) {
            res.statusCode = 400
            res.end(String(e))
          }
        })
      })
    },
  }
}

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
  plugins: [copyAppManifest(), saveShot()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        // index.html = グラス用アプリ本体、preview.html = ブラウザで描画を確認する開発用ページ、
        // share.html = 共有用画像の書き出し
        main: here('./index.html'),
        preview: here('./preview.html'),
        share: here('./share.html'),
      },
    },
  },
})
