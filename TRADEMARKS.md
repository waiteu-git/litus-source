# 名前とアイコンの扱い / Trademarks

このリポジトリのソースコードは Apache License 2.0 で使えます。ただし、次のものは Apache License 2.0 の許諾に含みません（Apache License 2.0 の第6条も、名前や商標の使用を許諾していません）。

- 「リタス」「Litus」という名前
- アプリのアイコン（`assets/` にあるアイコン画像と、そこから作った画像）
- App Store と Google Play の掲載文・スクリーンショット

## 改変したアプリを配る場合

- 別の名前と別のアイコンを使ってください。
- 「東京理科大学の公式アプリではない」こと、「waiteu が配布するリタスではない」ことが、利用者に分かるようにしてください。
- 別のバンドル ID・パッケージ名を使ってください（`app.json` の `dev.waiteu.litus` は使えません）。
- 私（waiteu）のサーバーへ通信させないでください。宛先は環境変数で設定する作りになっており、何も設定しなければ通信しません（`.env.example` を参照）。

## 私が配布するリタスとの関係

私が責任を持つのは、私が App Store と Google Play で配布するリタスだけです。大学から要請があった時に私が止められるのも、このアプリだけです。第三者がこのソースコードから作って配ったアプリは、私の利用規約の対象外です。

---

**English summary:** The source code is licensed under Apache-2.0, but the names "リタス" / "Litus", the app icon, and the store listing materials are not. If you distribute a modified app, use a different name, icon, and bundle ID / package name, make clear that it is neither an official Tokyo University of Science app nor the Litus distributed by waiteu, and do not point it at waiteu's servers (endpoints are configured via environment variables and are unset by default).
