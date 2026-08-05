# even-g2-basis

[basis-tracker](https://github.com/Masa1984a/basis-tracker) の資産別DRR(BTC/ETH/PAXG/SOL)を
Even Realities G2 スマートグラスに表示するアプリ。

## 仕組み

```
basis-tracker (Vercel)          このアプリ (Vercel)        Even G2
  /api/drr  ──── HTTPS ────►  index.html (WebView)  ──BLE──►  グラス
  資産別DRRの公開API            Even Hub SDK が橋渡し           576x288 / 緑16階調
```

`/api/drr` は basis-tracker の middleware で認証除外された公開APIなので認証情報は不要。
別オリジンから読むため CORS ヘッダーを付与済み。

## 画面

タップで巡回、ダブルタップで先頭に戻る。

| 画面 | 内容 |
|---|---|
| 一覧 | 資産別の最新DRR + スパークライン(テキスト) |
| 全資産 | 4資産を線種で重ね描き |
| BTC / ETH / PAXG / SOL | 資産ごとの単独グラフ(最大/最小/平均、想定帯の内外判定) |

グラスは緑16階調で色を使えないため、資産は**線種と明度**で区別する。
ImageContainer の上限が 288x144 なので、グラフはその実寸で読めるように設計している。

## 開発

```bash
npm install
cp .env.example .env.local   # VITE_API_BASE を basis-tracker の URL に設定
npm run dev
```

- グラス用アプリ: http://localhost:5173/
- 描画プレビュー: http://localhost:5173/preview.html (実機・SDK不要。API が届かなければダミーデータで描画)

## デプロイ (Vercel)

Vite の静的サイトとしてそのまま乗る。**`VITE_API_BASE` はビルド時に埋め込まれる**ため、
`.env.local` (git 管理外) ではなく Vercel の Environment Variables に設定すること。

| 設定 | 値 |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variable | `VITE_API_BASE` = `https://basis-tracker-smoky.vercel.app` |

環境変数を変更したら **Redeploy が必要**(ビルド時に焼き込まれるため)。

## 実機で開く (Prototype mode)

```bash
npx evenhub qr -u "https://<デプロイ先>/"
```

1. Even Hub で開発者アカウントにログイン
2. Even Hub アプリ → 右上メニュー → **My plugin** → **Prototype mode** を有効化
3. 上のQRをスキャン

社内ネットワーク等でポートを開けられない場合、ローカルの dev server ではなく
デプロイ済みの公開URLを指すQRを使えば LAN を経由せずに読み込める。

## パッケージ化 (ストア提出用)

```bash
npm run build
npm run pack     # -> out.ehpk
```

`app.json` の `permissions.network.whitelist` に取得先ドメインを列挙する必要がある。
ここが漏れると実機で fetch がブロックされる。

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.ts` | SDK ブリッジ、コンテナ構築、イベント処理 |
| `src/chart.ts` | Canvas 描画(SDK 非依存。ブラウザでもそのまま動く) |
| `src/api.ts` | `/api/drr` 取得。URL 末尾スラッシュを正規化 |
| `src/preview.ts` | ブラウザ確認用ページ |
| `app.json` | Even Hub manifest。ビルド時に `dist/` へコピーされる |
