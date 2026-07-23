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

## 貢献

バグ報告・改善提案・Pull Request を歓迎します。窓口は公開ミラー [litus-source](https://github.com/waiteu-git/litus-source) です。手順と取り決め（ミラー運用でのPRの扱い・提出時の権利許諾を含む）は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。脆弱性の報告は公開Issueではなく、GitHubのプライベート脆弱性報告（Securityタブ）からお願いします。

**貢献目的の例外**: 本リポジトリは source-available で複製・再配布を原則禁止していますが、**貢献の準備・提出に必要な fork・改変・改変内容の公開（fork リポジトリと PR）は [LICENSE](LICENSE) の「■ 貢献」節で明示的に許可しています**。貢献者が規約違反になることはありません。なお、fork を配布手段として使うこと（ビルド済みアプリ・APK の配布を含む）は引き続き禁止です。

## ライセンス

本リポジトリは、ユーザーがアプリの動作（取得するデータや送信先）を自ら確認できるようにするため、ソースコードを公開しています（source-available）。**オープンソースソフトウェアではありません。**

閲覧・監査、および動作確認目的での自身の環境でのビルド・実行のみ許可しています。コードの複製・他ソフトウェアへの転用・再配布（アプリストアへの公開を含む）・商用利用は禁止です。詳細は [LICENSE](LICENSE) を参照してください。

加えて、本ソフトウェアのコード・技術を用いた、CLASS/LETUS/大学システムへの過度な負荷、出席コードの自動連投・総当たり、代理出席・なりすまし、大学規程・法令違反の利用を禁止します。利用に関する一切の責任は利用者が負い、本ソフトウェアは無保証・免責です。本ライセンスは日本法に準拠します（詳細・裁判管轄は [LICENSE](LICENSE)）。

Copyright © 2026 waiteu. All rights reserved.／本ライセンス適用日: **2026-07-06 (JST)**

### 個別許諾

本ライセンスの複製・改変・再配布の禁止条項にかかわらず、GitHub ユーザー haya9924 氏が開発するアプリ「cabetus」（github.com/haya9924/cabetus）に限り、複製・改変・再配布を許諾する。**本許諾は LETUS 関連のコードに限り、CLASS および出席関連のコードは対象外**とする。本許諾は上記の個人・アプリに対する個別の例外であり、本ライセンスの他の条項を変更するものではない。（許諾日: 2026-07-08 ／ LETUS 限定への改定: 2026-07-10）
