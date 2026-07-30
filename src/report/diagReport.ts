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

/** ユーザーが状況を書き足す欄の見出し（本文の先頭に置く＝最初に目に入る）。 */
const NOTE_HEADING = '■ 状況（お手数ですが、ここに書き足してください）'

/**
 * `mailto:` の本文が途切れないと見込める、エンコード後URL長の保守的な目安。
 *
 * `mailto:` の本文長の上限はOSでもメールアプリでも規格化されておらず、端末側で黙って
 * 切られることがある。切れたかどうかはユーザーにも我々にも見えないので、静かに落とすのが一番悪い。
 *
 * **⚠2026-07-30の実測で「長い時だけ警告する」設計は破棄した。** 日本語はパーセントエンコードで
 * 約3倍に膨らむため、**記録1件でも 2,917 文字**・10件で **15,688 文字**＝この目安を常に超える。
 * 100%出る警告は警告として機能しないので、**コピーを主動線に固定**し、切れうることは常に書く。
 * この定数と `mailtoMayTruncate` は、その判断根拠を `diagReport.test.ts` で固定するために残している
 * （UIの分岐には使わない。分岐に戻すなら、まず1件でも超える事実の方を疑うこと）。
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
 * メール本文。**これがそのまま送られる**（表示しているものと送るものを一致させる）。
 *
 * 記録が0件でも作る＝診断が残っていない不具合（表示崩れ等）も報告できる導線でありたい。
 */
export function buildDiagReportBody(opts: { diags: SubmitDiag[]; env: DiagEnv; nowIso: string }): string {
  const { diags, env, nowIso } = opts
  const records =
    diags.length === 0
      ? '（記録はありません）'
      : diags.map((d, i) => `--- ${i + 1} ---\n${formatSubmitDiag(d)}`).join('\n\n')
  return [
    NOTE_HEADING,
    '（例: 7/30の2限で「出席する」を押したら「出席を確認しています…」から進まず、CLASSでは未出席でした）',
    '',
    '',
    '■ アプリ・端末',
    formatDiagEnv(env),
    `書き出し ${nowIso}`,
    '',
    `■ 出席送信の記録（${diags.length}件）`,
    records,
    '',
    '― この本文がそのまま送られます。送りたくない行は送信前に消してください。',
  ].join('\n')
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
