# ストア提出メモ

Even Hub の開発者ポータルに入力する内容をここに置いておく。
審査基準は [App Submission & QA Guidelines](https://hub.evenrealities.com/docs/ship/app-submission)。

## マニフェスト (app.json)

| 項目 | 値 | 審査基準との対応 |
|---|---|---|
| `package_id` | `com.masa1984a.basisdrr` | 逆ドメイン・小文字・ハイフンなし・2セグメント以上 ✓ |
| `name` | `Basis DRR` | 20文字以内、"Even" を含まない ✓ |
| `version` | `1.0.2` | 3桁 semver ✓ |
| `min_sdk_version` | `0.0.13` | 現行フロア `0.0.12` 以上 ✓ |
| `permissions` | `network` のみ | 実際に使用している権限だけ ✓ |
| `supported_languages` | `en`, `ja` | |

## プライバシーポリシー

https://basis-tracker-smoky.vercel.app/privacy

申請する `network` 権限の用途と、端末内 localStorage に保存する内容を英日で記載。
認証不要で読める(basis-tracker の middleware で除外済み)。

## リリースノート

初回リリースなので「initial release」ではなく、何をするアプリかを書く(公式の指示)。

### en

```
Track daily staking reward rates for basis.pro's BTC, ETH, PAXG and SOL right on your glasses.
Opens straight to a combined chart of all four assets; scroll for a per-asset view
with its average, high and low.
```

### ja

```
basis.proにおけるBTC・ETH・PAXG・SOL の日次ステーキング報酬率(DRR)をグラス上で確認できます。
起動すると4資産をまとめた折れ線が表示され、スクロールすると資産ごとの
平均・最高・最低を添えた個別グラフに切り替わります。
```

## スクリーンショット

`shots/screen-576x288-green.png` (576x288 = G2 のキャンバスと同じ)

**公式ガイドはシミュレータの撮影機能で撮ることを求めているが、現行のシミュレータでは
撮れない。** `updateImageRawData` が常に `sendFailed` になり画像コンテナが空のままになる
既知の不具合があるため(詳細は `BUGREPORT-simulator.md`、実機では正常に描画される)。

代わりに `share.html` で書き出している。チャートだけを引き伸ばすのではなく、実機と同じ
配置(ヘッダー + 288x144 のチャート + フッター)で合成しているので、「実機の描画と一致」
という審査条件を満たす:

1. `src/chart.ts` でネイティブ解像度 288x144 に描画 — 実機に送るのと同じピクセル
2. `LAYOUT`(`src/glass-text.ts`)の座標どおりに 576x288 へ合成 — main.ts と同じ定数
3. 4bit(16階調)に量子化 — ハードウェアと同じ処理
4. マイクロLEDの発色に合わせて緑に変換

テキストだけは近似になる。ファームウェアの LVGL フォントは配布されておらず等幅でもない
ため、同じ字形は再現できない。配置と内容は実機どおり。

書き出し方:

```bash
npm run dev
# http://localhost:5173/share.html を開く
# 範囲・倍率・発色を選んで「shots/ に保存」
```

書き出せる組み合わせ(`shots/` に git 管理下で置いてある):

| ファイル | 用途 |
|---|---|
| `screen-576x288-green.png` | **ストア提出用**。実機の画面まるごと |
| `screen-576x288-grey.png` | 同上のグレー版 |
| `chart-1152x576-green.png` | 記事や X 投稿の図版用。チャートだけを4倍 |
| `chart-1152x576-grey.png` | 同上のグレー版 |

倍率はニアレストネイバーの整数倍なのでにじまない。

審査で指摘された場合は、上記のシミュレータ不具合を説明する。

## アイコン

`assets/icon-b-*-24.png` (24x24)

開発者ポータルの 24x24 ピクセルエディタで作る想定。仕様上の制約:

- 1bit モノクロ。中間調・アンチエイリアス不可
- **点灯画素はすべて 2x2 ブロックの一部**であること。1px の線は検証に通らない
- 実質的なディテール予算は 12x12

`tools/make-icon.mjs` は 12x12 で設計して2倍に拡大するので、この 2x2 ルールを構造的に
満たす。生成時に全点灯画素を走査して実際に検証している。

```bash
node tools/make-icon.mjs
```

背景画像も別途必要(前景・背景の両方が必須、どちらもモノクロ/グレースケール)。
サイズはポータル側の指定を確認すること。

## 提出前チェック

- [x] `min_sdk_version` が `0.0.12` 以上
- [x] `name` が20文字以内で "Even" を含まない
- [x] プライバシーポリシーが公開URLで読める
- [x] 申請権限が実際に使われているものだけ
- [x] ルートのダブルタップでシステム終了ダイアログが出る
- [x] 5分ロックしても状態が保たれる(localStorage にキャッシュ)
- [ ] ストアアイコン(前景・背景)をポータルで登録
- [ ] スクリーンショットを登録
- [ ] リリースノートを en/ja で登録
- [ ] `npx evenhub login` してから `evenhub pack app.json dist -o myapp.ehpk -c` で
      `package_id` の空きを確認

## 注意

Released になったバージョンは**編集も差し替えもできない**(fix-forward)。
修正は常に上のバージョンを出す。`min_sdk_version` を上げる破壊的変更のときは、
古いファームウェアの利用者が前のバージョンに留まるようにする。
