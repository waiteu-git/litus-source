# 貢献ガイド / Contributing Guide

リタス（Litus）への関心をありがとうございます。リタスのソースコードは Apache License 2.0 で公開しています。**バグ報告・改善提案・Pull Request を歓迎します。**

## このリポジトリの位置づけ

公開リポジトリ `waiteu-git/litus-source` は、開発リポジトリ（非公開）から内部文書などを除いて同期している**公開ミラー**です。

- **Issue と Pull Request は litus-source に投稿してください。** 開発リポジトリは非公開なので、直接は見られません。
- 受け入れた PR は、メンテナが開発リポジトリへ適用します。コミットには `Co-authored-by:` であなたの名前を残します。次回のミラー同期で litus-source に反映します。
- **PR は「マージ」ではなく、適用が済んだ報告とともにクローズします。** 仕組みの都合で、貢献を無視したわけではありません。

## 貢献の種類

### 1. バグ報告・改善提案（Issue）

- Issue テンプレートを選んで投稿してください。
- バグ報告には、再現手順・期待する動作・実際の動作・環境（iOS/Android、端末、アプリのバージョン）を書いてください。
- LETUS と CLASS の画面が変わったことによる不具合の報告は、特に助かります。スクリーンショットを付ける時は、氏名・学籍番号・科目名などの個人情報を必ず隠してください。

### 2. セキュリティ・脆弱性の報告

**公開の Issue にしないでください。** GitHub の Security タブにある「Report a vulnerability」（非公開の脆弱性報告）からお願いします。修正と公表が済むまで、非公開で対応します。

### 3. Pull Request

1. litus-source を fork し、`main` からブランチを作ってください。
2. 変更は小さく絞ってください。大きな変更や設計に関わる変更は、**先に Issue で相談**してください。
3. `pnpm install && pnpm test && pnpm typecheck` がすべて通ることを確かめてください。
4. PR の説明に「何を・なぜ」変えたかを書いてください。

## 受け入れない変更

リタスは、大学のシステム（LETUS・CLASS）に負担をかけないことと、公正に使われることを最も大事にしています。次の変更は受け入れません。

- 読み直しの間隔を短くする変更や、負荷を抑える仕組み（間隔の制限・メンテナンス中の停止など）を緩める・外す変更
- 大学のサーバーへのリクエストを増やす変更（機能上どうしても必要な場合は、先に Issue で相談してください）
- 出席の送信とリアクションペーパーの提出の本体（このリポジトリには入れていません）
- 出席コードの自動連投・総当たり・代理出席など、不正な使い方を可能にする機能
- 成績など、今は読んでいない機微な情報を読む機能
- 大学の規程・利用規約・法令に触れうる機能

## 貢献のライセンス

貢献したコードや文書は、Apache License 2.0 の第5条により、Apache License 2.0 で公開されます。第三者のコードを含む場合は、その出どころとライセンスを PR に書いてください。

## 行動規範

礼儀を保ち、技術的な内容に集中してください。個人攻撃・ハラスメント・個人情報の投稿は禁止です。違反した投稿は削除し、以後の参加をお断りすることがあります。

## 質問

このガイドで判断がつかないことは、Issue で気軽に質問してください。

---

**English summary:** Litus is licensed under Apache-2.0. Issues and pull requests go to the public mirror `waiteu-git/litus-source`; accepted PRs are applied to the private development repository (crediting you with `Co-authored-by:`) and then closed. Report vulnerabilities privately via the Security tab. We do not accept changes that increase load on the university's systems, the attendance / reaction-paper submission code, or anything enabling proxy attendance or other misuse. Contributions are licensed under Apache-2.0 (Section 5).
