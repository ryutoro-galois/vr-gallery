# VR展示室（A-Frame + WebXR / Meta Quest 3 向け）

基本図形だけで作った小さなVR展示室です。ビルド不要の静的サイトなので、フォルダをそのままHTTPSで公開すれば動きます。

## 構成

```
vr-gallery/
├── index.html                  # 部屋・展示物・カメラ・コントローラー
├── js/app.js                   # exhibit / info-panel コンポーネント、VR開始ボタン
└── vendor/aframe-v1.7.1.min.js # A-Frame 1.7.1（同梱して固定）
```

| 依存 | バージョン | SHA-256 |
|---|---|---|
| A-Frame（three.js 同梱） | 1.7.1 | `d69d24e5cc6c8110cfcf567de47e8becc61718c0a38fb21d726889235f0fd56c` |

CDN を使わず `vendor/` に同梱しているので、勝手にバージョンが変わりません。取得元は
`https://cdn.jsdelivr.net/npm/aframe@1.7.1/dist/aframe-v1.7.1.min.js` です。
`shasum -a 256 vendor/aframe-v1.7.1.min.js` で上の値と一致するか確かめられます。

## 操作

| | PC（マウス） | Quest 3 |
|---|---|---|
| 見回す | ドラッグ | 頭を動かす（移動はなし） |
| 選ぶ | 展示物をクリック | 左右どちらかのレーザーを向けてトリガー |
| 説明を閉じる | パネルをクリック、または同じ展示物をもう一度選ぶ | パネルをトリガー、または同じ展示物をもう一度選ぶ |
| VR開始 | — | 画面左上の「VRを開始」 |

## 軽量化のための工夫

- 3Dモデルや画像ファイルは使わず、A-Frame の基本図形だけで作っています。
- 壁・床・天井は `flat` シェーダ（ライティング計算なし）で描画し、影もありません。
- コントローラーの標準モデル（GLB）は読み込まず（`model: false`）、小さな箱で代わりに表示します。
- 日本語は MSDF フォントを使わず、Canvas に描いてテクスチャとして表示します（フォントファイルは不要）。
- `foveationLevel: 1`（固定中心窩レンダリング）で Quest の描画負荷を下げています。

## 1. PCで確認する

```bash
cd vr-gallery
```

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。`localhost` は安全なコンテキストとして扱われるので HTTP で動きます。
ヘッドセットがない場合、「VRを開始」は押せない状態になり、マウスだけで操作できます。

## 2. HTTPSで公開する

WebXR は HTTPS（または localhost）でしか動きません。静的ファイルをそのまま置ければ、どのサービスでも構いません。

### A. GitHub Pages（おすすめ）

1. GitHub に新しいリポジトリを作り、`vr-gallery/` の中身（`index.html` がリポジトリ直下に来るように）をpushします。
   ```bash
   git init && git add . && git commit -m "VR gallery"
   ```
   ```bash
   git branch -M main && git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git && git push -u origin main
   ```
2. リポジトリの **Settings → Pages** で、Source を「Deploy from a branch」、Branch を `main` / `(root)` にして Save します。
3. 1〜2分待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます（HTTPS は自動で有効）。

※ 公開リポジトリにすると誰でも見られます。限定公開したい場合は下の B を使うか、アクセス制限のあるホスティングにしてください。

### B. Netlify Drop（アカウントだけで最短）

1. https://app.netlify.com/drop を開きます。
2. `vr-gallery` フォルダをドラッグ＆ドロップします。
3. 表示された `https://xxxx.netlify.app` が公開URLです。

（Cloudflare Pages や Vercel でも、ビルドコマンドなし・出力ディレクトリ＝ルートで同じように公開できます。）

## 3. Quest 3 実機で確認する

### 公開URLで確認する

1. Quest 3 で **Meta Quest ブラウザ** を開きます。
2. アドレスバーに公開URL（例：`https://<ユーザー名>.github.io/<リポジトリ名>/`）を入力します。
   長いURLは、PCから Meta Horizon アプリ経由で送るか、短縮URLを使うと楽です。
3. 左上に「準備完了」と出ていることを確認し、**「VRを開始」** を押します。
4. 「没入型VRの許可」ダイアログが出たら **許可** を選びます。
5. 次の項目を確認します。
   - [ ] 部屋の中央（青いリング）に立った状態で始まり、見回すと3つの展示物が見える
   - [ ] 左右のコントローラーからレーザーが出ている（左＝水色、右＝黄色）
   - [ ] レーザーを展示物に当てると光る
   - [ ] トリガーで説明パネルが展示物の上に、こちらを向いて出る（同時に少し振動する）
   - [ ] パネルにトリガーすると閉じる
   - [ ] スティックを倒しても移動しない
6. 終了は Meta ボタン（右コントローラー）→ ブラウザに戻る、で2D表示に戻ります。

### 開発中にPCのファイルをそのまま確認する（USB接続、任意）

公開せずに確認したい場合は、`adb reverse` を使うと Quest から PC の `localhost` に接続できます（localhost なので HTTPS 不要）。

1. Quest を開発者モードにし（Meta Horizon アプリ → デバイス → 開発者モード）、USBでPCに接続して「USBデバッグを許可」します。
2. PCで `python3 -m http.server 8000` を起動したまま、次を実行します。
   ```bash
   adb reverse tcp:8000 tcp:8000
   ```
3. Quest ブラウザで `http://localhost:8000` を開きます。

同じWi-Fiの `http://192.168.x.x:8000` のような URL は安全なコンテキストではないため、VRを開始できません（画面に「HTTPSが必要です」と出ます）。

### 困ったとき

- **「VRを開始」が押せない**：URL が `https://` か `localhost` か確認してください。
- **レーザーが出ない**：コントローラーを一度振るか、置いてから持ち直してください（ハンドトラッキングになっていると出ません）。
- **デバッグ**：Quest を USB 接続し、PC の Chrome で `chrome://inspect/#devices` を開くと Quest ブラウザのコンソールが見られます。

## 展示物を変えるには

`index.html` の各展示物の `exhibit` 属性を書き換えます。

```html
exhibit="title: タイトル; body: 説明文; color: #e8a33d"
```

本体は `a-box` / `a-sphere` / `a-cylinder` / `a-cone` / `a-torus` / `a-icosahedron` など、A-Frame の基本図形なら何でも使えます。説明文にセミコロン `;` は使えません。
