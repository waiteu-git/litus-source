# リタス（Litas）

東京理科大学の学生向け非公式モバイルアプリ（iOS / Android）。LETUSの課題締切通知と、CLASSの時間割・出席リマインドをスマホ単体で提供する。

- 初版 **v1.0.0** を2026年9月（後期開始）公開目標で開発中
- 事前登録: https://lms.waiteu.dev/app
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
