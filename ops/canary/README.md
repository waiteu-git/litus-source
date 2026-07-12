# litus-canary (Stage B)

CLASS/LETUS の4面（掲示・時間割・出席・LETUS課題）を storageState 付き Playwright で
**読み取り専用**巡回し、litus の `src/parsers`・`src/health` を**直接 import して再利用**し、
**構造drift**を検知する開発者カナリア。全ユーザーで収集が静かに壊れる前に開発者が先回りで
気づくためのもの。

- 設計: `docs/superpowers/specs/2026-07-12-canary-stage-b-design.md`
- 実装計画: `docs/superpowers/plans/2026-07-12-canary-stage-b.md`
- litus repo 内に同居するため vendor 同期は不要（判定・パースは litus src が単一の真実）。
- 対になる無認証の軽量生存監視は `lms-task-watcher/ops/canary.sh`（Stage A）に併存。

## 仕組み

```
Playwright(headless, storageState) → 各面へ遷移 → page.content() で生HTML
  → litus src/parsers/* で件数を解析（直 import）
  → 同一セレクタで containerPresent/rawItemCount を抽出
  → litus src/health/classifyCollectionHealth で判定（直 import）
  → structure_drift / not_logged_in のみ #ops-alerts へ通知、drift は生HTMLを保存
```

判定・パースは litus 本体と同一コード（`../../../src/...`）。カナリア固有はナビゲーションと
HTML→シグナル抽出のみ。litus の parsers/health を変えれば自動でカナリアにも反映される。

## import 解決の前提

カナリア自身の依存（playwright / tsx / node-html-parser）は `ops/canary/node_modules` から、
`src/parsers/*` が内部で使う `node-html-parser` は **litus root の `node_modules`** から解決される
（`src/parsers/bulletin.ts` からの相対 walk-up）。したがって pi では **litus root に
node-html-parser が存在すること**が要件（下記セットアップ参照）。

## セットアップ

### storageState 作成（デスクトップ・ディスプレイ必須）

ヘッドレスの pi ではログインできないため、ディスプレイのあるデスクトップで手動 MFA
ログインして cookie を作り、pi へコピーする。

```bash
cd ops/canary
npm i && npx playwright install chromium
npm run capture                   # ブラウザで CLASS/LETUS に手動ログイン → Enter
# 出力: ~/ops/storageState.json
scp ~/ops/storageState.json pi@<pi-host>:/home/pi/ops/storageState.json
```

storageState は**リポジトリに入れない**（`.gitignore` 済）。Conditional Access で失効
した場合はカナリアが `not_logged_in` を通知するので、その時に再キャプチャ＋再コピー。

### pi セットアップ（1コマンド）

litus を pi に取得済み（`git clone`/`git pull`）で、`~/ops/ops.env`（OPS_WEBHOOK_URL）と
`~/ops/storageState.json`（デスクトップから scp 済み）がある前提で、以下を実行するだけ。

```bash
cd ~/litus/ops/canary && bash deploy-pi.sh
```

`deploy-pi.sh` が行うこと: litus root へ `node-html-parser` を1つ導入（重い全依存は不要）、
canary 依存＋chromium 導入、`~/ops/canary-fixtures`・`logs` 作成、前提ファイルの存在チェック、
cron 登録（JST 08:00/20:00・重複回避）。完了後に手動スモークを促す。

```bash
npm run smoke                     # 資格情報不要の疎通確認（LETUS公開ログインページ）
npm run canary                    # 本番スモーク（storageState 必須）
```

### cron（pi・1日2回、JST 08:00 / 20:00）

メンテ帯（CLASS 2:00–4:00 / LETUS 4:00–5:30）は run.mjs が JST 判定で自動 skip するが、
cron 時刻自体も帯を避ける。pi の TZ に依存せず run.mjs 内で JST を強制している。

```cron
0 8,20 * * * cd /home/pi/litus/ops/canary && /usr/bin/npm run canary >> /home/pi/ops/logs/canary.log 2>&1
```

## 通知（#ops-alerts）

- **通知するのは異常時のみ**: `structure_drift`（パーサ修正が必要）/ `not_logged_in`
  （storageState 失効）。加えて日曜に週次ハートビート。
- 正常（ok / empty_valid）と一時的 blocked はログのみ・通知しない。
- 終了コード: 0=正常/skip、2=drift、3=失効。

## drift を検知したら（復旧ワークフロー）

1. 通知の fixture パス（`~/ops/canary-fixtures/<面>-<UTC>.html`）を pi から取得。
2. litus の該当 `src/**/__fixtures__/` に投入。
3. 失敗する回帰テストを書く → パーサを直す → `pnpm test` 緑。
4. ビルド（ローカル Gradle / JDK17）→ 配布。カナリアは自動で最新 src を使う（再同期不要）。

## テスト

```bash
npm test                          # signals/util の純粋テスト（node:test・litus src fixture 直読み）
npm run smoke                     # 資格情報不要の実TUS疎通（browser→html→litus判定）
```

`npm run smoke` は認証前パイプライン（chromium 起動・実 LETUS 到達・litus 判定 import）を
検証済み。**認証後のナビゲーション**（各収集面への到達）は storageState が要るため自動テスト
対象外で、`npm run canary` の本番スモークで確認する。

## 初回ライブ検証チェックリスト（storageState 作成後・唯一の未検証領域）

純粋ロジック（HTML→判定）は fixture でテスト済みだが、**実サイトへのナビゲーションは
storageState が要るため未検証**。初回 `npm run canary` で以下を確認する。

1. **CLASS の直リンク到達**（最重要リスク）: 本実装は各 xhtml へ `page.goto` で直接遷移する。
   CLASS は JSF（ViewState）のため、直リンクがポータル/エラーに落ちる可能性がある。その場合
   health は **`blocked`（沈黙・誤driftにはならない）** になる。ログで bulletin/timetable が
   毎回 `blocked` なら、litus 同様に**ポータルのメニュー click で postback 遷移する実装へ
   差し替え**が必要（メニュー DOM は実ログインセッションで採取する）。
2. **LETUS 2ホップ**: courses→course→activity を辿れているか。`empty_valid` 連発なら
   `parseMyCourses`/`extractLinksFromHtml` のセレクタか到達を確認。
3. **メンテ帯 skip**: JST 2:00–5:30 に走らせると即 `maintenance window; skip`。
4. **通知経路**: 一度わざと drift を作る（例: `STORAGE_STATE` を空ページに向ける）と
   `#ops-alerts` に届くか確認。

誤 drift 通知は health 側の `offTarget`/`blocked` ガードで基本的に出ない設計。上記1で
CLASS が blocked になっても**誤報ではなくログのみ**なので、平常運用の妨げにはならない。

## ディレクトリ

```
run.mjs               エントリ（メンテ帯ガード→4面巡回→通知/保存/HB）
capture-login.mjs     手動 MFA キャプチャ（headed・デスクトップ）
lib/                  load/signals/browser/notify/fixtures/env
surfaces/             bulletin/timetable/letus/attendance のナビゲーション
（litus src/parsers・src/health を直接 import。vendor なし）
```
