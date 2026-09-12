import { formatSubmitDiag, type SubmitDiag } from '../attendance/submitDiag'
import { formatVersionLabel } from '../appVersion'
import { devBadgeSuffix, type ReleaseStage } from '../releaseStage'

/**
 * 不具合報告のメール下書きを組み立てる（純粋・RN非依存・vitest対象）。
 *
 * **なぜ必要か**: 公開後、開発者はユーザー端末で何が起きているかを一切見られない。
 * 解析SDKは入れない方針で、Play vitals はクラッシュしか見えず、
 * 「出席が取れなかった」は原理的に見えない。一方で**証拠は既に端末内にある**
 * （`submitDiag` が出席送信の直近10件・`reactionDiag` がリアペ側）。
 * ベータ3人には「スクショを送って」で回してきたが、数百人には効かない。
 * ⇒ こちらから見に行けない以上、**向こうから持ってきてもらう**導線を用意する。
 *
 * **アプリから直接送信してはいけない**。規約（`docs/legal/terms-ja.md` とアプリ内 `TERMS_BODY`）は
 * 通信先を限定列挙しており、直接送信は新しい送信先の追加＝規約改定になる。ここが作るのは
 * `mailto:` の下書きだけで、送信はユーザーがメールアプリで行う＝**端末内完結の公約を破らない**。
 *
 * **PIIの基準は「見せてから送る」**。マスクの網羅性で守るのではなく、送信前に本文を全画面で
 * 見せてユーザーが読んでから送る。だから本文は**省略も折りたたみもしない**
 * （`formatSubmitDiag` の出力には科目名や `okBy` の前後40字が残る）。
 * 学籍番号・氏名・メールアドレスは含めない（含める理由がない）。広告ID・端末IDの類は
 * そもそも取得していない。IP・認証コード・5桁以上の数字は記録時点で既にマスクされている。
 */

/** 宛先。キャッチオール転送で稼働中。 */
export const DIAG_REPORT_TO = 'contact@waiteu.dev'

/** ユーザーが書いた状況の見出し（本文の先頭に置く＝最初に目に入る）。 */
const NOTE_HEADING = '■ 状況'

/**
 * 未記入のまま送られた時に本文へ残す印。
 *
 * **節ごと落とさない**＝受け取った側が「書かれなかった」のか「組み立てが壊れて消えた」のかを
 * 区別できなくなる。見出しが残っていれば、メールアプリ側で書き足す逃げ道も残る。
 */
const NOTE_EMPTY = '（未記入）'

/**
 * どの入口から開いたか。**本文に出席送信の記録を載せるかと、主動線がどちらかを決める。**
 *
 * - `attendance` = 出席の失敗カードのその場。記録を載せる＝本文が長くなるので**コピーが主動線**。
 * - `settings`   = 設定 >「不具合の報告」。**記録を載せない**＝mailto に収まるので**メールが主動線**。
 *
 * **なぜ入口で変えるか**: 多くの不具合に出席送信の記録は1行も関係ない（時間割が変・掲示が来ない・
 * ログインできない）。全部に付けているから本文が長くなり、長いから mailto を主動線にできず、
 * コピー＆貼り付けという重い手順を全員に強いていた。**記録が要るのは出席の不具合だけ。**
 *
 * 実測（2026-07-30）: 記録0件の本文 240字 → mailto URL **1,560字**（目安2,000内）。
 * 記録10件 → **15,688字**。日本語はパーセントエンコードで約3倍に膨らむ。
 */
export type DiagReportSource = 'settings' | 'attendance'

/**
 * `mailto:` の本文が途切れないと見込める、エンコード後URL長の保守的な目安。
 *
 * `mailto:` の本文長の上限はOSでもメールアプリでも規格化されておらず、端末側で黙って
 * 切られることがある。切れたかどうかはユーザーにも我々にも見えないので、静かに落とすのが一番悪い。
 *
 * **⚠「長い時だけ警告する」設計は2026-07-30に破棄した（復活させない）。** 日本語は
 * パーセントエンコードで約3倍に膨らむため、記録を載せる入口では**1件でも 2,917 文字**・
 * 10件で **15,688 文字**＝常に超える。100%出る警告は警告として機能しない。
 *
 * **⇒ 警告ではなく主動線の入れ替えに使う（2026-08-10）。** `mailtoMayTruncate` で
 * エンコード後の実長を測り、超えた時だけ「本文をコピー」を主動線へ、収まる時は
 * 「メールで送る」を主動線へ置く（`DiagReportSheet`）。**どちらでもボタンは両方出す。**
 * 記録を載せる入口は常に超えるので実質コピー固定、記録を載せない設定側は既定で収まり、
 * **入力欄に長く書かれた時だけ**コピーへ入れ替わる＝ここが分岐が意味を持つ唯一の面。
 * 入口で固定に戻してはいけない（設定側が収まるのは実測であって入口の性質ではない）。
 */
export const DIAG_MAILTO_SAFE_LIMIT = 2000

export type DiagEnv = {
  /** versionName（`Application.nativeApplicationVersion`）。 */
  appVersion: string | null
  /** versionCode / CFBundleVersion（`Application.nativeBuildVersion`）。 */
  buildNumber: string | null
  releaseStage: ReleaseStage
  /** 'Android' / 'iOS' など。 */
  os: string
  /** OS版（Androidは 15 のようなリリース名、iOSは 18.5）。 */
  osVersion: string | null
  /**
   * 端末機種。**取れないプラットフォームでは null**。
   * Androidは `Platform.constants` の Manufacturer/Model が取れる。
   * iOSは RN も expo-constants も正確な機種名を持たない（`deviceName` は
   * ユーザーが付けた端末名＝氏名が入りうるので**使わない**）ため、
   * iPhone / iPad の区別までに留める。
   */
  device: string | null
}

/**
 * Androidの機種名（`Platform.constants` の Manufacturer + Model）。
 *
 * Model が既にメーカー名で始まる端末（Xiaomi 系など）で「Xiaomi Xiaomi 14」と重複させない。
 * 逆に Samsung のように Model が型番だけ（`SM-S911B`）の端末はメーカー名が無いと読めないので、
 * 単純にどちらか一方を採るのではなく前方一致で判断する。
 */
export function formatAndroidDevice(manufacturer: unknown, model: unknown): string | null {
  const maker = typeof manufacturer === 'string' ? manufacturer.trim() : ''
  const name = typeof model === 'string' ? model.trim() : ''
  if (name === '') return maker === '' ? null : maker
  if (maker === '' || name.toLowerCase().startsWith(maker.toLowerCase())) return name
  return `${maker} ${name}`
}

/**
 * iOSの端末種別。**正確な機種名は返せない**。
 *
 * RNの `Platform.constants` にも expo-constants にも機種名は無く、
 * `Constants.deviceName` はユーザーが付けた端末名（「太郎のiPhone」＝氏名が入りうる）なので
 * **使ってはいけない**。正確な機種が要るなら `expo-device` の追加＝新規ネイティブ依存になるため、
 * 提出直前に prebuild/pod を動かすリスクを取らず iPhone / iPad の区別に留めている
 * （出席送信の切り分けにはOS版と画面種別で足りる）。
 */
export function iosDeviceFromIdiom(idiom: unknown): string | null {
  if (idiom === 'phone') return 'iPhone'
  if (idiom === 'pad') return 'iPad'
  return null
}

/** 環境情報を人が読める行にする（何が送られるか一目で分かる粒度）。 */
export function formatDiagEnv(env: DiagEnv): string {
  const version = `リタス ${formatVersionLabel(env.appVersion, env.buildNumber)}${devBadgeSuffix(env.releaseStage)}`
  const osLine = [env.os, env.osVersion].filter((s) => s != null && s !== '').join(' ')
  const platform = env.device ? `${osLine} / ${env.device}` : osLine
  return [version, platform].filter((s) => s !== '').join('\n')
}

/** 件名。どのビルドからの報告かが受信箱の一覧で分かるようにする。 */
export function buildDiagReportSubject(env: DiagEnv): string {
  const build = env.buildNumber != null && String(env.buildNumber).trim() !== '' ? String(env.buildNumber).trim() : '?'
  return `リタスの不具合報告（build ${build}）`
}

/**
 * 状況欄の書き方の手本。**本文ではなく入力欄のプレースホルダに置く**（2026-08-10）。
 *
 * ⚠例文は「出席以外も報告してよい」と伝えるだけでなく、**具体的に書く手本**を兼ねる。
 * 出席側の例文が効くのは「日付・画面・操作・期待と実際」が全部入っているから。
 * ⇒ 設定側も**例を並べず1例を詳しく**する（3つ並べると1つ1つが痩せて手本にならない）。
 * 日付は相対表現にしない（公開後は過去になるが、「日付を書いてほしい」という手本としては
 * 具体的な日付のほうが強い）。
 *
 * **なぜ本文から出したか**: 手本は書く前にだけ要る。本文に置くと、書き終えた後も
 * パーセントエンコードで約3倍に膨らんだまま mailto の尺を食い続ける
 * （この2行で日本語約70字＝URL約210字）。
 */
export function diagNotePlaceholder(source: DiagReportSource = 'attendance'): string {
  return source === 'settings'
    ? '例: 7/30から、時間割の水曜だけ何も表示されません。前の週に戻すと出ます'
    : '例: 7/30の2限で「出席する」を押したら「出席を確認しています…」から進まず、CLASSでは未出席でした'
}

/**
 * メール本文。**これがそのまま送られる**（表示しているものと送るものを一致させる）。
 *
 * 記録が0件でも作る＝診断が残っていない不具合（表示崩れ等）も報告できる導線でありたい。
 */
export function buildDiagReportBody(opts: {
  diags: SubmitDiag[]
  env: DiagEnv
  nowIso: string
  /** 既定は `attendance`＝記録を載せる側。**指定漏れは安全側（長くても切れないコピー主動線）へ倒す。** */
  source?: DiagReportSource
  /**
   * ユーザーがシートの入力欄に書いた状況。**書く場所をメールアプリの中からシート内へ移した**
   * （長い日本語の途中・スマホのキーボード・カーソル位置はメールアプリ任せ＝書く場所として最悪だった）。
   * 未記入・空白のみなら見出しを残して `（未記入）` を書く。
   */
  note?: string
  /**
   * 通知の計器の1行（N1 §4.6・ASCII のみ・科目名なし）。例: `notif att=10 dupe=0 legacy=0 next=09-14T10:30 asg=18 fail=0 open=1`。
   * 次の出席アラームの時刻（＝次の授業の時刻）が載る。送る前に全文が見える（「見せてから送る」の内側）。渡さなければ載せない。
   */
  notifLine?: string | null
}): string {
  const { diags, env, nowIso, source = 'attendance', note, notifLine } = opts
  const head = [
    NOTE_HEADING,
    // 前後の空白だけ落とし、**中の改行は保つ**（書いた通りに送る＝「見せてから送る」の一部）。
    (note ?? '').trim() || NOTE_EMPTY,
    '',
    '',
    '■ アプリ・端末',
    formatDiagEnv(env),
    ...(notifLine ? [notifLine] : []),
    `書き出し ${nowIso}`,
  ]
  // 設定から開いた時は記録を載せない＝本文が mailto に収まり「メールで送る」を主動線にできる。
  const records =
    source === 'settings'
      ? []
      : [
          '',
          `■ 出席送信の記録（${diags.length}件）`,
          diags.length === 0
            ? '（記録はありません）'
            : diags.map((d, i) => `--- ${i + 1} ---\n${formatSubmitDiag(d)}`).join('\n\n'),
        ]
  return [...head, ...records, '', '― この本文がそのまま送られます。送りたくない行は送信前に消してください。'].join(
    '\n',
  )
}

/**
 * `mailto:` URL。件名・本文は `encodeURIComponent`（空白は `%20` になり `+` にはならない＝
 * mailto の本文で `+` がそのまま文字として出てしまう事故を避けられる）。
 */
export function buildMailtoUrl(opts: { to: string; subject: string; body: string }): string {
  const q = `subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`
  return `mailto:${opts.to}?${q}`
}

/** 本文が長すぎて端末側で切られうるか。超えたらコピーを主動線にする。 */
export function mailtoMayTruncate(url: string, limit = DIAG_MAILTO_SAFE_LIMIT): boolean {
  return url.length > limit
}
