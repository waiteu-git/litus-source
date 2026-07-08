# リタス（Litus）

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

## ライセンス

本リポジトリは、ユーザーがアプリの動作（取得するデータや送信先）を自ら確認できるようにするため、ソースコードを公開しています（source-available）。**オープンソースソフトウェアではありません。**

閲覧・監査、および動作確認目的での自身の環境でのビルド・実行のみ許可しています。コードの複製・他ソフトウェアへの転用・再配布（アプリストアへの公開を含む）・商用利用は禁止です。詳細は [LICENSE](LICENSE) を参照してください。

Copyright © 2026 waiteu. All rights reserved.／本ライセンス適用日: **2026-07-06 (JST)**

### 個別許諾

本ライセンスの複製・改変・再配布の禁止条項にかかわらず、GitHub ユーザー haya9924 氏が開発するアプリ「cabetus」（github.com/haya9924/cabetus）に限り、複製・改変・再配布を許諾する。本許諾は上記の個人・アプリに対する個別の例外であり、本ライセンスの他の条項を変更するものではない。（許諾日: 2026-07-08）
