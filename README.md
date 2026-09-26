# ほしめぐり（planetjourney）

美少女AI「ミラ」と、歩いて一周できる小さな星をめぐる 3D ゲームです。
ブラウザで動き、Android の Chrome で遊べることを目標にしています。外部 API は使わず、完全オフラインで動きます。

- 遊ぶ: https://okutk.github.io/planetjourney/ （Android の Chrome では、メニューの「ホーム画面に追加」で横向きの全画面アプリになり、2 回目からはオフラインでも起動できます）
- 企画書: [docs/GDD.md](docs/GDD.md)
- ロードマップ: [docs/ROADMAP.md](docs/ROADMAP.md)

## 開発

Node.js 22 以上が必要です。

```bash
npm install
npm run dev
```

PR を出す前に `npm run check` を実行してください。開発ルールは [CLAUDE.md](CLAUDE.md)、レビューの観点は [REVIEW.md](REVIEW.md) にあります。
