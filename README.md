# MD ⇔ DOCX 変換ツール

Pandoc を変換エンジンとして使う Markdown ⇔ Word (.docx) 相互変換の Web アプリです。

## 特徴

- Markdown → Word: `server/reference.docx` (Word 標準テーマに準拠) をスタイル定義として使うため、
  見出しなどの書式が Word の標準テーマから崩れません。自社テンプレートを使いたい場合は、
  変換画面から任意の `.docx` テンプレートをアップロードして上書きできます。
- Word → Markdown: GitHub Flavored Markdown (GFM) で出力します。画像が含まれる場合は
  Markdown ファイルと画像フォルダをまとめた ZIP をダウンロードします。
- Markdown 内で相対パス参照している画像は、変換画面で画像ファイルを一緒にアップロードすると
  正しく埋め込まれます。参照されているのに見つからない画像がある場合は、無言で消えることなく
  警告として表示されます。
- アップロードした画像ファイルの拡張子や大文字小文字が Markdown 側の参照と完全一致していなくても
  (例: 本文は `chart.png` 参照だがファイルは `chart.PNG`、あるいは `photo.jpg` 参照だが
  実体は `photo.png`)、ファイル名の主要部分が一致していれば同一画像とみなして保持します。
- Markdown 内に mermaid・PlantUML・Graphviz(dot)などフローチャート/図をコードで記述した
  フェンスコードブロックがある場合、変換前に確認ダイアログを表示します。Word には
  これらを図として描画する機能が無く、コードのテキストとしてそのまま出力される旨を伝えた上で、
  続行するかどうかをユーザーが選べます。

## 既知の制限事項

- **コードブロックの言語タグ**: Word (.docx) 形式には「コードの言語」という概念が無いため、
  \`\`\`python のような言語指定は Word へ変換する際に失われます (コード自体やその他の書式は保持されます)。
- **引用文内にネストしたリスト**: 引用 (`>`) の中に箇条書きを入れると、Pandoc の Word 変換の制約により
  リスト部分の引用インデントが外れることがあります。通常の見出し・表・画像・リスト・脚注などは
  問題なく変換されます。

## ローカルでの実行

前提: Node.js 18+ と Pandoc がインストールされていること。

```bash
npm install
npm start
```

`http://localhost:3000` を開いてください。

Pandoc の実行ファイルが `PATH` に無い場合は、環境変数 `PANDOC_PATH` にフルパスを設定してください。

```bash
PANDOC_PATH="/path/to/pandoc" npm start
```

## Docker での実行 (Web デプロイ向け)

```bash
docker build -t md-docx-converter .
docker run -p 3000:3000 md-docx-converter
```

Render / Railway / Fly.io など、Docker デプロイに対応したホスティングであれば
そのままデプロイできます (Pandoc バイナリが必要なため、Vercel などの Node.js のみの
サーバーレス環境ではなく Docker 対応のホストを推奨します)。

## reference.docx (スタイルテンプレート) の更新方法

1. Word で `server/reference.docx` を開き、見出しスタイルなどを編集して保存する。
2. もしくは `pandoc --print-default-data-file reference.docx > server/reference.docx` で
   Pandoc 同梱の最新テンプレートに戻す。

## 広告(AdSense)の設定方法

広告枠は最初から4箇所(ページ上部バナー・左右サイドバー・変換結果の下・ページ下部フッター)を
[public/index.html](public/index.html) に用意済みです。サイドバーの2枠は画面幅が狭い場合
(1180px以下、スマホ・タブレット等)は自動的に非表示になります。

現時点では `ca-pub-YOUR_ADSENSE_PUBLISHER_ID` / `YOUR_..._SLOT_ID` はプレースホルダーです。
実際に広告を表示するには:

1. サイトを実ドメインにデプロイする(AdSenseの審査には実際にアクセスできるURLが必要です)。
2. [Google AdSense](https://www.google.com/adsense/) にサイトを登録し、審査を通す。
3. 審査通過後、AdSense管理画面で発行される **パブリッシャーID** (`ca-pub-` で始まる文字列) を
   `public/index.html` 内の `ca-pub-YOUR_ADSENSE_PUBLISHER_ID` という文字列すべてに置き換える
   (`<head>` 内のスクリプトタグ1箇所 + 各 `data-ad-client` 属性)。
4. 広告ユニットを4つ(横長バナー×3、縦長スカイスクレイパー×2用に2つ)作成し、
   それぞれのスロットIDを `YOUR_TOP_BANNER_SLOT_ID` / `YOUR_LEFT_RAIL_SLOT_ID` /
   `YOUR_RESULT_SLOT_ID` / `YOUR_RIGHT_RAIL_SLOT_ID` / `YOUR_BOTTOM_BANNER_SLOT_ID` と
   置き換える。
5. [public/ads.txt](public/ads.txt) を、AdSense管理画面の「サイト」→ ads.txt に表示される
   1行(`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0` のような形式)に
   書き換える。これが無いと広告収益が正しく計上されない/警告が出ます。

プレースホルダーのままでも広告スクリプトの読み込みに失敗するだけで、変換機能自体には
影響しません([public/ads.js](public/ads.js) は try/catch で保護されています)。
