import { formatVersionLabel } from '../appVersion'
import { devBadgeSuffix, type ReleaseStage } from '../releaseStage'

/**
 * 不具合報告のフォールバック（mailto下書き・本文コピー）の組み立て（純粋・RN非依存・vitest対象）。
 *
 * **なぜ在るか**: 主動線は`src/report/feedbackApi.ts`によるletus-apiへの直接送信
 * （`FeedbackSheet.tsx`）。自宅鯖の可用性は本番クラウドほど読めないため、送信に失敗した時だけ
 * ここのmailto/コピー機構へフォールバックする。設計の正典＝
 * `docs/design/2026-09-13-feedback-selfhost-design.md`。
 *
 * 環境情報の収集・整形（`DiagEnv`・`formatDiagEnv`等）は`src/report/feedback.ts`からも
 * 参照される共通部分としてここに残す。
 */

/** フォールバック（mailto）の宛先。キャッチオール転送で稼働中。 */
export const DIAG_REPORT_TO = 'contact@waiteu.dev'

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
 * Androidの機種名（`Platform.constants` の Manufacturer/Model）。
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
 * 提出直前に prebuild/pod を動かすリスクを取らず iPhone / iPad の区別に留めている。
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

/**
 * `mailto:` URL。件名・本文は `encodeURIComponent`（空白は `%20` になり `+` にはならない＝
 * mailto の本文で `+` がそのまま文字として出てしまう事故を避けられる）。
 */
export function buildMailtoUrl(opts: { to: string; subject: string; body: string }): string {
  const q = `subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`
  return `mailto:${opts.to}?${q}`
}

/**
 * `mailto:` の本文が途切れないと見込める、エンコード後URL長の保守的な目安。
 * 本文長の上限はOSでもメールアプリでも規格化されておらず、端末側で黙って切られることがある。
 */
export const DIAG_MAILTO_SAFE_LIMIT = 2000

/** 本文が長すぎて端末側で切られうるか。超えたらコピーを主動線にする。 */
export function mailtoMayTruncate(url: string, limit = DIAG_MAILTO_SAFE_LIMIT): boolean {
  return url.length > limit
}
