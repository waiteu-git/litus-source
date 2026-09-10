# リタス（Litus）

東京理科大学の学生向け非公式モバイルアプリ（iOS / Android）。LETUSの課題締切通知と、CLASSの時間割・出席リマインドをスマホ単体で提供する。

- **v1.0.1** を配信中（日本のみ）
  - [App Store](https://apps.apple.com/jp/app/id6799900160)（2026-09-01 配信開始）
  - [Google Play](https://play.google.com/store/apps/details?id=dev.waiteu.litus)（2026-09-04 配信開始・**オープンテスト**）
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

**fork について**: 公開ミラー（およびその fork）の fork や GitHub 上での閲覧・表示など、GitHub の利用規約 D.5 に基づく行為は誰でも行えます。本ライセンスはこれを制限しません（大学のシステムへの過度な負荷などを禁じる「利用制限」だけは、これらの行為にも適用されます）。それ以外の利用には、GitHub の上か外かを問わず [LICENSE](LICENSE) が適用されます（他のソフトウェアへの組み込み・再配布・ストアへの公開・商用利用・貢献目的以外の改変は禁止。fork やその Releases・Pages を使ってビルド済みアプリ・APK を配布することもできません）。**本プロジェクトへの貢献の準備・提出に必要な範囲に限り、改変と、その改変を fork リポジトリ、および公開ミラー宛ての PR として公開することを、LICENSE の「■ 貢献」節で明示的に許可しています**。この範囲で行う限り、貢献者が規約違反になることはありません。

## ライセンス

本リポジトリは、ユーザーがアプリの動作（取得するデータや送信先）を自ら確認できるようにするため、ソースコードを公開しています（source-available）。**オープンソースソフトウェアではありません。**

本ライセンスが許可するのは、閲覧・監査と、動作確認目的での自身の環境でのビルド・実行のみです（これとは別に、fork や GitHub 上での閲覧・表示など GitHub の利用規約 D.5 に基づく行為は誰でも行えます。貢献目的の例外は「貢献」を参照）。他のソフトウェアへの組み込み・転用・再配布（アプリストアへの公開を含む）・商用利用は禁止です。詳細は [LICENSE](LICENSE) を参照してください。

加えて、GitHub 上で行う場合を含め、本ソフトウェアのコード・技術を用いた、CLASS/LETUS/大学システムへの過度な負荷、出席コードの自動連投・総当たり、スクレイピングの乱用、代理出席・なりすまし、大学規程・法令違反の利用を禁止します。利用に関する一切の責任は利用者が負い、本ソフトウェアは無保証・免責です。本ライセンスは日本法に準拠します（詳細・裁判管轄は [LICENSE](LICENSE)）。

Copyright © 2026 waiteu. All rights reserved.／本ライセンス適用日: **2026-07-06 (JST)**（最終改定: 2026-09-10）

### 個別許諾

本ライセンスの複製・改変・再配布の禁止条項にかかわらず、GitHub ユーザー haya9924 氏が開発するアプリ「cabetus」（github.com/haya9924/cabetus）に限り、複製・改変・再配布を許諾する。**本許諾は LETUS 関連のコードに限り、CLASS および出席関連のコードは対象外**とする。本許諾は上記の個人・アプリに対する個別の例外であり、本ライセンスの他の条項を変更するものではない。（許諾日: 2026-07-08 ／ LETUS 限定への改定: 2026-07-10）
