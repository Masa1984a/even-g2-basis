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

起動するといきなり全資産の折れ線が出る。

| 画面 | 内容 |
|---|---|
| 全資産(ルート) | 4資産を線種で重ね描き。線の右端に資産名、下に最新値 |
| BTC / ETH / PAXG / SOL | 資産ごとの単独グラフ(最新/平均/最大/最小) |

| 操作 | 動き |
|---|---|
| 下スクロール | 次の画面 |
| 上スクロール | 前の画面 |
| ダブルタップ(全資産) | **システム終了ダイアログ** (`shutDownPageContainer(1)`) |
| ダブルタップ(資産別) | 全資産へ戻る |

実機ではスクロール(`SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT`)で遷移する。
`CLICK_EVENT` も同じ「次へ」に割り当ててあるが、テンプルのタップでは発火しない。

Y軸はデータの値域にフィットさせ、グリッドは3〜5本になる刻み幅を自動で選ぶ。

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

### 公式シミュレータ (`@evenrealities/evenhub-simulator`)

```bash
node node_modules/@evenrealities/evenhub-simulator/bin/index.js "http://localhost:5173/" --automation-port 9898
```

`--automation-port` を付けると `http://127.0.0.1:<port>` に HTTP API が立ち、
`GET /api/screenshot/glasses`(576x288 のフレームバッファ PNG)、`GET /api/console`、
`POST /api/input`(`up`/`down`/`click`/`double_click`)がスクリプトから叩ける。
実機なしでレイアウト・イベント処理・ログを検証できて便利。

**既知の制約: `updateImageRawData` が常に `sendFailed` になる(0.7.3 / 0.8.0 で確認)。**
シミュレータ本体の stdout に `failed to decode image: The image format could not be
determined` と出る — シミュレータは `imageData` を PNG 等の**エンコード済み画像**として
デコードしようとするが、このアプリ(および SDK のドキュメント、実機)は**生のグレースケール
バイト配列**(1px=1byte)を送る仕様。実機ではこの生配列で正しく描画されることを確認済みなので、
本番コードをシミュレータ都合で変える必要はない。テキストコンテナ・レイアウト・イベント処理は
シミュレータでも正しく動く。グラフ画像だけはシミュレータで確認できないので、見た目の検証は
`preview.html` を使う(`src/chart.ts` を直接呼ぶので実機と同じ描画になる)。

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

**パッケージを作り直すたびに `app.json` の `version` を上げる。** 上げないと、Even Hub に
再アップロードして Beta group に push しても、スマホ側は古い WebView の中身を
キャッシュしたままになることがある。Beta Testing の公式ドキュメントにも
「再アップロードしても、明示的に再インストールするまで古いビルドが残る」旨の
記載がある。

```bash
npm run build
npx evenhub pack app.json dist -o myapp.ehpk
```

1. [開発者ポータル](https://hub.evenrealities.com/login) → 対象プロジェクト
2. **Beta groups** タブでグループを作り、自分のメールを追加
3. **Builds** タブで `.ehpk` をアップロードし、そのグループに push
4. スマホの Even Realities App → **Me → Beta tester** → **Install**
   (更新が反映されない場合は一度アンインストールしてから Install し直す)

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

## ストア公開 (Released)

Beta Testing で満足に動くことを確認したら、同じ `.ehpk` をそのまま提出できる。
状態は `Draft → Test → Submitted → Released` の一方向で進み、**Released になった
バージョンは二度と編集・差し替えできない**(修正は常に新しいバージョンを出す
fix-forward)。審査で見られる項目(App Submission & QA Guidelines 準拠):

- [x] `min_sdk_version` が現行フロア `0.0.12` 以上(このリポジトリは `0.0.13` 済み)
- [x] `name` が20文字以内で "Even" を含まない("Basis DRR" は該当なし)
- [ ] **ストアアイコン** — 開発者ポータルの 24x24 ピクセルエディタで作る。前景・背景とも
      モノクロ/グレースケールのみ(カラーは審査で弾かれる)
- [ ] **プライバシーポリシー** — 申請している権限(`network`)を説明する文書のURLが必要
- [ ] **スクリーンショット** — 実機の描画と一致している必要があり、公式ガイドは
      **シミュレータのスクリーンショット機能**で撮ることを求めている
      (`@evenrealities/evenhub-simulator`)。実機を目で撮った写真ではない
- [ ] **リリースノート** — `supported_languages`(en/ja)ごとに1〜3行。「初回リリース」
      ではなく何をするアプリかを書く

提出前の最終確認:

```bash
npx evenhub login                              # ポータル認証(package_id チェックに必要)
npx evenhub pack app.json dist -o myapp.ehpk -c  # -c で package_id の空き確認
```

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.ts` | SDK ブリッジ、コンテナ構築、イベント処理 |
| `src/chart.ts` | Canvas 描画(SDK 非依存。ブラウザでもそのまま動く) |
| `src/api.ts` | `/api/drr` 取得。URL 末尾スラッシュを正規化 |
| `src/log.ts` | スマホ画面 + コンソールへのログ |
| `src/preview.ts` | ブラウザ確認用ページ |
| `app.json` | Even Hub manifest。ビルド時に `dist/` へコピーされる |
