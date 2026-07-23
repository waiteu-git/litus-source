# Moodle 5.2 実DOM fixture（LETUS Moodle 5.x 耐性回帰用）

BS5世代（Moodle 5.0〜5.3・Bootstrap5＋再設計Dashboard）に対する回帰fixture。
合成マークアップではなく、公開デモサイトの**実HTML**をトリムしたもの。設計 spec
`docs/2026-07-23-moodle5-resilience-spec.md`（T1／T2）に対応。

現行 LETUS は Moodle 4.5.8 / Classic / Bootstrap 4。この fixture は「LETUS が 5.x に上がった
将来」を CI で常時再現し、コースページ・課題ページのパーサがどこで壊れるかを実測で固定するための
ものである。

## 由来・複製元

- **一次採取**: 隣接プロジェクト lms-task-watcher（LTW）が `school.moodledemo.net`（Mount
  Orange・Moodle 5.2・毎時リセットの公開デモサイト）から curl（cookie jar＋logintoken）で
  デモ学生 `student` としてログインし取得した**生HTML**（＝WebViewの背景fetchが見るもの・
  クライアント描画前）。採取日 **2026-07-18**。
- **本リポへの複製**: LTW `src/core/fixtures/moodle/{assign52_ja,assign52_en,course52_raw,my52_raw}.html`
  を **2026-07-23** に無改変コピー（`feature/moodle5-fixtures`）。トリムは LTW 採取時のもの。
- **個人情報**: 含まない。公開デモサイトのデモデータのみ。**TUS 実機由来の内容は一切含まない**。
- URL 中の id（62/724 等）はデモサイトの毎時リセットで揮発する値。**構造が正典**であり id の実値に
  意味はない。

## トリム方針（LTW 採取時）

- 各ファイル内の `<!-- 中略 -->` / `<!-- 後略 -->` コメント位置で head・ナビ・フッタ・スクリプト塊・
  無関係ブロックを削除（60KB目安）。
- パーサが消費する構造は原文のまま維持: body開始タグ（class一覧）・`M.cfg = {...}` 行・全アンカー・
  activity-dates・提出ステータステーブル・活動一覧の li 構造。
- `course52_raw.html` のみ、行頭空白（インデント）だけを機械的に除去。タグ・属性・テキスト・改行は
  原文どおりで、正規表現／DOM どちらのパースにも影響しない。

## ファイル台帳と物証

| ファイル | 面 | このfixtureが証明する事実 |
|---|---|---|
| `course52_raw.html` | `/course/view.php?id=62`（EN） | **5.2 でも活動一覧は SSR 維持**。`/mod/*/view.php` の一意アンカー20件・assign 4件。→ コースページの課題スキャン（`letusLinks.ts`／`courseUpdates.ts`／`INJECT_COURSE_ADD_BUTTONS_JS`）は 5.2 でも生存する。構造変化は `.activityinstance` 廃止→`.activity-item`（詳細は `moodle52Resilience.test.ts`）。 |
| `my52_raw.html` | `/my/`（Dashboard・EN） | **RAW Dashboard に `course/view.php` アンカー0件**＝BS5 世代はコース発見面が全面クライアント描画。`data-totalcoursecount="19"`（SSR は登録数を知っているのにアンカーは出さない）。→ `parseMyCourses` が 0 件を返す＝**最大の実破損**。T5（ハイドレーション待ち）／T3（`DASHBOARD_UNREADABLE`）の題材。 |
| `my52_hydrated.html` | `/my/courses.php`（**ハイドレーション後**・EN） | 同じ Dashboard 面の**クライアント描画完了後**の実DOM（2026-07-24 に本部セッションがアプリ内ブラウザで `student` ログインし採取・SHA-256照合で転送検証・`sesskey` 値は SANITIZEDKEY に無害化）。`course/view.php` アンカー20件（カード画像+コース名の2重リンク×ユニーク10コース=「In progress」フィルタ表示分・全19コース中）。→ **T5 が待っているのはこの状態**＝RAW の 0 件と対で「待てば取れる」を緑テストで固定。採取時の実測: 描画完了まで**4秒超**かかる場面あり＝T5 の budget 3s では取り逃す場合があるが、その場合も診断（`DASHBOARD_UNREADABLE`）が鳴る設計で網は破れない。トリム方針は既存と同一（M.cfg 行＋body 属性＋`#region-main` を保持・ナビ/言語メニュー/フッタ/スクリプト塊を省略）。 |
| `assign52_ja.html` | `/mod/assign/view.php?id=724`（`?lang=ja`） | JA ラベル「開始:」「期限:」・日付書式「2023年 12月 12日(火曜日) 00:00」・未提出値「まだ提出されていません。」。→ Litus 現行 `letus.ts` は締切・状態とも解決する（LTW と異なり Litus は「まだ提出されていません」を not_submitted 判定済み）。 |
| `assign52_en.html` | 同ページ（EN） | EN ラベル「Opened:」「Due:」・書式「Tuesday, 12 December 2023, 12:00 AM」＝**現行 regex でパース不能**（キーワードは見つかるが日付が取れない）→ `DEADLINE_KEYWORD_NO_DATE` 診断の題材。未提出値「No submissions have been made yet」も未対応。TUS LETUS は日本語運用なので実害は低いが、文言/日付 OR 拡張（T7）の入力。 |

## 関連

- 4.5.8（現行）実 DOM は課題ページ側に既存: `../assign-submitted-real.html`／
  `../assign-not-submitted-real.html`／`../letus-assign-body-real.html`（TUS 実機由来）。
- **コースページの実 4.5.8 DOM は本リポに無い**（`../course-bs4-representative.html` は構造再現の
  代表フィクスチャで実採取ではない）。実 4.5.8 コースページの採取はユーザーの LETUS ログイン
  セッションが要るため未取得＝T2 の残ギャップとして記録。
