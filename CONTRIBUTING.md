# 貢献ガイド / Contributing Guide

リタス（Litus）への関心をありがとうございます。本プロジェクトは source-available（オープンソースではありません）ですが、**バグ報告・改善提案・Pull Request を歓迎します**。このガイドは、貢献を円滑かつ法的に安全に受け入れるための取り決めです。

## このリポジトリの位置づけ（重要）

公開リポジトリ `waiteu-git/litus-source` は、開発リポジトリ（非公開）から内部文書等を除いて同期している**公開ミラー**です。そのため:

- **Issue・Pull Request は litus-source に投稿してください**（開発リポジトリは非公開のため直接アクセスできません）。
- 受け入れられた PR は、メンテナが開発リポジトリへ適用し（コミットに `Co-authored-by:` であなたのクレジットを記録します）、次回のミラー同期で litus-source に反映されます。**PR そのものは「マージ」ではなく、適用完了の報告とともにクローズされます** — 仕組み上の都合で、貢献が無視されたわけではありません。

## 貢献の種類

### 1. バグ報告・改善提案（Issue）

- Issue テンプレートを選んで投稿してください。
- バグ報告には、再現手順・期待される動作・実際の動作・環境（iOS/Android、端末、アプリバージョン）を含めてください。
- LETUS / CLASS の画面構造変化による不具合の報告は特に助かります（スクリーンショットを添付する場合は、氏名・学籍番号・科目名等の個人情報を必ずマスクしてください）。

### 2. セキュリティ・脆弱性の報告

**公開 Issue にしないでください。** GitHub の Security タブ →「Report a vulnerability」（プライベート脆弱性報告）からお願いします。修正・開示まで非公開で対応します。

### 3. Pull Request

貢献の準備・提出に必要な fork・改変・改変内容の公開（fork リポジトリと PR）は、[LICENSE](LICENSE) の「■ 貢献」節の**貢献目的の例外として明示的に許可されています**（それ以外の目的での複製・再配布・ビルド済みアプリの配布は引き続き禁止です）。

1. litus-source を fork し、`main` からトピックブランチを作成してください。
2. 変更は小さく焦点を絞ってください。大きな変更や設計に関わる変更は、**先に Issue で相談**してください（手戻り防止のため）。
3. `pnpm install && pnpm test && pnpm typecheck` が全て通ることを確認してください。
4. PR の説明に「何を・なぜ」変えたのかを記載してください。
5. PR テンプレートの**権利許諾への同意チェックボックスにチェックを入れてください**（下記「貢献の権利許諾」への明示的な同意として扱います。チェックのない PR はレビューを開始できません）。

### 受け入れられない変更

本プロジェクトは大学システム（LETUS・CLASS）への負荷配慮と公正な利用を運営上の最重要事項としています。以下の変更は受け入れません:

- 収集間隔の短縮、スロットル・メンテナンスガード等の負荷制御の緩和・撤去
- 大学サーバーへのリクエスト数を増加させる変更（機能上必要な場合は Issue で事前相談）
- 出席コードの自動連投・総当たり・代理出席等、不正利用を可能にする機能
- CLASS の成績等、現在アクセスしていない機微情報へのアクセス追加（恒久方針）
- 大学の規程・利用規約・法令に抵触しうる機能

## 貢献の権利許諾 / Contribution License Grant

本プロジェクトに Issue・Pull Request その他の方法で貢献（コード、ドキュメント、翻訳、画像その他の資料を含む）を提出した時点で、貢献者は以下のすべてに同意したものとみなします:

1. **原著作性の保証** — 貢献は貢献者自身が作成したものであり、第三者の著作権その他の権利を侵害しないこと。第三者のコードを含む場合は、その旨とライセンスを PR 内で明示すること。
2. **権利の許諾** — 著作権者（waiteu）に対し、貢献を利用・複製・改変・翻案・頒布・公衆送信・サブライセンスし、また本プロジェクトのライセンス条件を将来変更する場合にも貢献を当該条件の下で利用できる、無償・非独占・取消不能・地域および期間の制限のない権利を許諾すること（App Store / Google Play 等での配布を含む）。
3. **著作者人格権の不行使** — 貢献者は、著作権者および著作権者が許諾した者に対して、貢献に関する著作者人格権を行使しないこと。
4. **ライセンスの適用** — 貢献が本プロジェクトの [LICENSE](LICENSE)（source-available）の下で公開されること。

貢献者としてのクレジットは Git のコミット履歴（`Co-authored-by` を含む）により記録されます。

**English summary:** By submitting a contribution (code, documentation, or other material) to this project via issue, pull request, or any other means, you (a) certify that the contribution is your own original work and does not infringe third-party rights; (b) grant the copyright holder (waiteu) a royalty-free, non-exclusive, irrevocable, worldwide, perpetual license to use, reproduce, modify, adapt, distribute, publicly transmit, and sublicense the contribution — including distribution via the App Store / Google Play — and to use it under any future license terms of this project; (c) agree not to assert moral rights against the copyright holder or its licensees; and (d) agree that your contribution will be published under this project's [LICENSE](LICENSE). Contributors are credited via Git commit history. In case of any discrepancy between the Japanese and English texts, the Japanese text shall prevail.

## 行動規範

礼儀を保ち、技術的な内容に集中してください。個人攻撃・ハラスメント・個人情報の投稿は禁止です。違反する投稿は削除し、以後の参加をお断りすることがあります。

## 質問

このガイドで判断がつかないことがあれば、Issue で気軽に質問してください。
