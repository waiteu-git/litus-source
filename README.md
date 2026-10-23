# リタス（Litus）

東京理科大学の学生向け非公式モバイルアプリ（iOS / Android）。LETUSの課題締切通知と、CLASSの時間割・出席リマインドをスマホ単体で提供する。

- 配信中（日本のみ。最新の版は各ストアのページで確認できます）
  - [App Store](https://apps.apple.com/jp/app/id6799900160)（2026-09-01 配信開始）
  - [Google Play](https://play.google.com/store/apps/details?id=dev.waiteu.litus)（2026-09-04 にオープンテストで配信開始・2026-09-24 に製品版）
- 前身・関連: [LETUS Task Watcher](https://lms.waiteu.dev)（Chrome拡張。バックエンドを共用）

## 開発

```sh
pnpm install
pnpm start        # expo start
pnpm test         # vitest（純粋ロジック層）
pnpm typecheck    # tsc --noEmit
```

- React Native（Expo managed・TypeScript）
- 引継ぎ・設計資料: `docs/handover.md` から辿る

## 貢献

バグ報告・改善提案・Pull Request を歓迎します。窓口は公開ミラー [litus-source](https://github.com/waiteu-git/litus-source) です。手順は [CONTRIBUTING.md](CONTRIBUTING.md) にあります。脆弱性の報告は、公開の Issue ではなく GitHub の非公開の脆弱性報告（Security タブ）からお願いします。

## ライセンス

ソースコードは [Apache License 2.0](LICENSE) で使えます（2026-10-15 から。それより前のコミットは、当時の source-available ライセンスのままです）。

- 「リタス」「Litus」の名前とアイコンは、このライセンスに含みません。改変したアプリを配る場合は [TRADEMARKS.md](TRADEMARKS.md) を読んでください。
- 出席の送信とリアクションペーパーの提出の本体は、このリポジトリに入れていません。
- 私のサーバーの宛先は環境変数で設定します。何も設定せずにビルドしたアプリは、私のサーバーへ通信しません（[.env.example](.env.example)）。

Copyright 2026 waiteu
