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

## 画面と操作

| 画面 | 内容 |
|---|---|
| 一覧(ルート) | 資産別の最新DRR + スパークライン(テキスト) |
| 全資産 | 4資産を線種で重ね描き |
| BTC / ETH / PAXG / SOL | 資産ごとの単独グラフ(最大/最小/平均、想定帯の内外判定) |

| 操作 | 動き |
|---|---|
| タップ / 下スワイプ | 次の画面 |
| 上スワイプ | 前の画面 |
| ダブルタップ(ルート) | **システム終了ダイアログ** (`shutDownPageContainer(1)`) |
| ダブルタップ(他画面) | ルートへ戻る |

ルートページのダブルタップは終了ダイアログを出すことが必須で、独自UIを割り当てると
審査で自動リジェクトされる([Page Lifecycle](https://hub.evenrealities.com/docs/build/page-lifecycle))。

## グラス向けの制約と対処

- **色が使えない**(緑16階調)。資産は線種と明度で区別する。
- **ImageContainer は 288x144 まで**。グラフはその実寸で読めるよう設計している。
- **ファームウェアのフォントは等幅ではなく、収録外の文字は黙って落とされる**。
  そのため凡例は**画像内に直接描画**している(画像内の文字はこの制限を受けない)。
  テキスト側で使う記号は design-guidelines が明記した `▁▂▃▄▅▆▇█` などに限定する。
- **全画面テキストがあふれるとファームウェアがスクロール表示に切り替え、タップを奪う**。
  行数と文字数(目安 400-500 字)に余裕を持たせる。
- **画像ページの入力**は、全画面の空テキストコンテナ(`content: ' '`, `isEventCapture: 1`)を
  画像の背面に置いて受ける。`zOrderIndex` は使わない(使うと同一ページ全コンテナで必須になり
  `min_sdk_version` も 0.0.12 以上に上がる)。省略時は「先に宣言した方が背面」。

## デバッグ

グラスには失敗の詳細を出せないので、**スマホの WebView 画面にログを表示**する。
Even Hub アプリの Developer Mode コンソールでも同じ内容が読める。
`updateImageRawData` の結果コードもここに出るので、画像が出ないときはまずこれを見る。

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

## 実機での配布段階

| 段階 | 審査 | 実態 |
|---|---|---|
| Local Testing (QRサイドロード) | 不要 | スマホがロックされると落ちる。開発中の確認用。 |
| Private Testing | 不要 | 5分もたない |
| **Beta Testing** | **不要** | **Released と同一の挙動**。個人で常用するならこれ。 |
| Released | あり(手動審査) | ストア一般公開 |

### Beta Testing の手順

```bash
npm run build
npx evenhub pack app.json dist -o myapp.ehpk
```

1. [開発者ポータル](https://hub.evenrealities.com/login) → 対象プロジェクト
2. **Beta groups** タブでグループを作り、自分のメールを追加
3. **Builds** タブで `.ehpk` をアップロードし、そのグループに push
4. スマホの Even Realities App → **Me → Beta tester** → **Install**

`app.json` の `permissions.network.whitelist` に取得先ドメインを列挙する必要がある。
ここが漏れると実機で fetch がブロックされる。

### 提出前チェック(公式のQAルーブリック)

1. アプリを開いてスマホを5分ロック → 復帰時に状態が保たれている
2. ルートのダブルタップでシステム終了ダイアログが出る
3. 権限を拒否したときに破綻しない
4. 終了後に純正アプリ(Conversate 等)が正常に起動する
5. 起動直後のコンソールにエラーがない

1 に備えて、取得したデータと表示中の画面は localStorage に保存し、
復帰時はキャッシュから即描画してからネットワークを叩く作りにしている。

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.ts` | SDK ブリッジ、コンテナ構築、イベント処理 |
| `src/chart.ts` | Canvas 描画(SDK 非依存。ブラウザでもそのまま動く) |
| `src/api.ts` | `/api/drr` 取得。URL 末尾スラッシュを正規化 |
| `src/log.ts` | スマホ画面 + コンソールへのログ |
| `src/preview.ts` | ブラウザ確認用ページ |
| `app.json` | Even Hub manifest。ビルド時に `dist/` へコピーされる |
