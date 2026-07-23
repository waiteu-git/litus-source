/**
 * LETUS スキャンサイクルの自己診断配線（spec§4.4）。純粋・RN非依存。
 *
 * diagnose.ts の純関数は「上流が算出済みの count/flag」を要求する。本モジュールは、収集レイヤー
 * （LetusSyncEngine / CourseUpdateEngine / AssignmentCollector）が各面で得た生シグナル（取得HTML・
 * アンカー数・前回シグネチャ長・抽出フラグ）を diagnose.ts の入力へ写像し、1スキャンサイクル分の
 * 診断コードを集約する。実際の保存（recordScanOutcome）は storage 側（diagnosticsStateStore）の責務。
 *
 * 設計:
 * - HTML から導出する3シグナル（M.cfg 有無・ログインマーカー・format-* マーカー）だけがこの層の
 *   「DOM 依存」であり、いずれも版跨ぎで安定なアンカー（原則1）。個別セレクタは診断に使わない。
 * - accumulator は 1 サイクル（Dashboard→コース群→活動群）を貫いて可変集約する。per-course の
 *   COURSE_LOST_ALL_ASSIGNMENTS を件数化し、finalize 時に diagnoseCourseLossAggregate へ橋渡しする
 *   （単一コースの正当な非表示と全コース一斉喪失を件数で区別する横断層・§4.3）。
 * - reachedLetus: LETUS に到達し結論の出るページ（logged_in / logged_out）を1つでも観測したか。
 *   これが false のサイクル（WebView がロードに至らない・全ページ unknown）は「不完全サイクル」で、
 *   記録すると lastGoodAt を誤って更新する。記録側（recordScanCycleOutcome）がこのフラグで中立
 *   スキップする（§5.3 の呼び出し側契約）。
 */

import {
  diagnoseActivityPage,
  diagnoseAuthProbe,
  diagnoseCourseLossAggregate,
  diagnoseCoursePage,
  diagnoseDashboard,
  type DiagnosticCode,
  type PageAuthState,
} from './diagnose'
import { hasLetusLoginMarker } from './collectionSignals'

/** 取得HTMLに Moodle の `M.cfg = {...}` インラインJSONがあるか（Moodleページの存在アンカー・§4.3）。 */
export function hasMoodleConfig(html: string): boolean {
  return /\bM\.cfg\s*=\s*\{/.test(html)
}

/**
 * コースページ認識マーカー（body 等の `format-<name>` クラス）を持つか。Moodle のコース形式クラス
 * （format-topics/format-weeks 等）は BS4→BS5 を跨いで維持される版跨ぎ安定クラスで、レイアウト破損
 * （ページ自体が非認識）と内容喪失（ページは読めるが活動が消えた）を切り分ける（§4.3 diagnoseCoursePage）。
 */
export function hasCourseFormatMarker(html: string): boolean {
  return /class\s*=\s*["'][^"']*\bformat-[a-z]/i.test(html)
}

/**
 * 取得HTMLからページ単位の認証状態を導出する（diagnose.ts の共通ゲート入力・§4.2）。
 * ログインマーカー（パスワード欄/SSOリダイレクト断片）を M.cfg より優先する: 学外SSO/IdP の
 * ログインページは Moodle でない（M.cfg 無し）が、それは NOT_A_MOODLE_PAGE でなく logged_out。
 */
export function classifyFetchedPage(html: string): PageAuthState {
  if (hasLetusLoginMarker(html)) return 'logged_out'
  if (hasMoodleConfig(html)) return 'logged_in'
  return 'unknown'
}

/** 提出状態抽出器を持つモジュール型（extractSubmissionStatus が実ロジックを持つ型）。 */
const SUPPORTED_STATUS_MODULES: ReadonlySet<string> = new Set(['assign', 'quiz'])

/** `/mod/<type>/view.php` の <type> を小文字で返す。抽出不能なら null。 */
export function moduleTypeFromUrl(url: string): string | null {
  const m = /\/mod\/([a-z0-9]+)\/view\.php/i.exec(url)
  return m ? m[1].toLowerCase() : null
}

/** 1スキャンサイクルの診断集約器（可変・サイクル1回に1つ生成）。 */
export interface ScanDiagnosticsAccumulator {
  /** これまでに発火した per-page 診断コード（重複可・finalize で dedupe）。 */
  codes: DiagnosticCode[]
  /** このサイクルで COURSE_LOST_ALL_ASSIGNMENTS を発火した既知コース数（横断集計の分子）。 */
  lostCourseCount: number
  /** このサイクルで観測した既知コース（logged_in・前回シグネチャ>0）の総数（横断集計の分母）。 */
  trackedCourseCount: number
  /** LETUS に到達し結論の出るページ（logged_in / logged_out）を1つでも観測したか（記録可否ゲート）。 */
  reachedLetus: boolean
}

export function createScanAccumulator(): ScanDiagnosticsAccumulator {
  return { codes: [], lostCourseCount: 0, trackedCourseCount: 0, reachedLetus: false }
}

export interface DashboardObservation {
  /** Dashboard（my/courses.php）の取得HTML。 */
  html: string
  /** HTMLから抽出できた /course/view.php アンカー数（parseMyCourses().length 等）。 */
  courseAnchorCount: number
  /** storage に既に保存されている既知コース数（今回のスキャンで上書きする前の値）。 */
  knownCourseCount: number
}

/** Dashboard 面を観測して診断コードを集約する（diagnoseAuthProbe ＋ diagnoseDashboard）。 */
export function observeDashboard(acc: ScanDiagnosticsAccumulator, obs: DashboardObservation): void {
  const pageAuthState = classifyFetchedPage(obs.html)
  if (pageAuthState !== 'unknown') acc.reachedLetus = true
  acc.codes.push(
    ...diagnoseAuthProbe({
      fetchOk: true,
      hasMcfg: hasMoodleConfig(obs.html),
      hasLoginMarker: hasLetusLoginMarker(obs.html),
    }),
  )
  acc.codes.push(
    ...diagnoseDashboard({
      pageAuthState,
      courseAnchorCount: obs.courseAnchorCount,
      knownCourseCount: obs.knownCourseCount,
    }),
  )
}

export interface CoursePageObservation {
  /** コースページ（course/view.php）の取得HTML。 */
  html: string
  /** HTMLから抽出できた /mod/<type>/view.php アンカー数（computeCourseSignature().length）。 */
  modAnchorCount: number
  /** 前回スナップショットのシグネチャ件数。null = 初回（prev 無し）。 */
  prevSignatureLen: number | null
}

/** コース面を観測して診断コードを集約する。既知コースの喪失は横断集計へも積む。 */
export function observeCoursePage(acc: ScanDiagnosticsAccumulator, obs: CoursePageObservation): void {
  const pageAuthState = classifyFetchedPage(obs.html)
  if (pageAuthState !== 'unknown') acc.reachedLetus = true
  const codes = diagnoseCoursePage({
    pageAuthState,
    modAnchorCount: obs.modAnchorCount,
    prevSignatureLen: obs.prevSignatureLen,
    hasCourseMarker: hasCourseFormatMarker(obs.html),
  })
  acc.codes.push(...codes)
  // 横断集計の母数は「今回 logged_in で観測した既知コース（prev>0）」。その中で全課題喪失
  // （COURSE_LOST_ALL_ASSIGNMENTS）を分子に積む＝全コース一斉喪失を件数で捕える（§4.3）。
  if (pageAuthState === 'logged_in' && obs.prevSignatureLen !== null && obs.prevSignatureLen > 0) {
    acc.trackedCourseCount += 1
    if (codes.includes('COURSE_LOST_ALL_ASSIGNMENTS')) acc.lostCourseCount += 1
  }
}

export interface ActivityPageObservation {
  /** 活動ページ（mod/<type>/view.php）の取得HTML。 */
  html: string
  /** 活動ページのURL（モジュール型の判定に使う）。 */
  url: string
  /** 締切キーワードが本文から見つかったか（parseAssignmentPage().keywordFound）。 */
  keywordFound: boolean
  /** 日付がパースできたか（parseAssignmentPage().dateParsed）。 */
  dateParsed: boolean
  /** 提出状態が unknown 以外に解決したか（parseAssignmentPage().statusResolved）。 */
  statusResolved: boolean
}

/** 活動面を観測して診断コードを集約する（diagnoseActivityPage）。 */
export function observeActivityPage(acc: ScanDiagnosticsAccumulator, obs: ActivityPageObservation): void {
  const pageAuthState = classifyFetchedPage(obs.html)
  if (pageAuthState !== 'unknown') acc.reachedLetus = true
  const moduleType = moduleTypeFromUrl(obs.url)
  const moduleSupported = moduleType !== null && SUPPORTED_STATUS_MODULES.has(moduleType)
  acc.codes.push(
    ...diagnoseActivityPage({
      pageAuthState,
      keywordFound: obs.keywordFound,
      dateParsed: obs.dateParsed,
      statusResolved: obs.statusResolved,
      moduleType,
      moduleSupported,
    }),
  )
}

/**
 * サイクル全体の診断コードを確定する。per-page コードに横断集計（COURSES_MAJORITY_LOST）を足し、
 * 出現順を保って dedupe する（recordScanOutcome も内部で dedupe するが、ここで確定した集合を
 * 呼び出し側/テストが検査できるようにする）。
 */
export function finalizeScanCodes(acc: ScanDiagnosticsAccumulator): DiagnosticCode[] {
  const codes = [...acc.codes]
  codes.push(
    ...diagnoseCourseLossAggregate({
      lostCourseCount: acc.lostCourseCount,
      trackedCourseCount: acc.trackedCourseCount,
    }),
  )
  return Array.from(new Set(codes))
}
