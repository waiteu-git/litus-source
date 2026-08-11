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
 * - 受動版フィンガープリント（§9・T8）も同じ集約器に相乗りする。各面の観測関数が既に受け取っている
 *   HTML から `docs.moodle.org/<NNN>/` の版セグメントを読むだけで、**追加リクエストは1本も出さない**。
 *   1サイクル集約の設計（T5）を崩さないよう、保存も finalize と同じ記録エントリ
 *   （recordScanCycleOutcome）が1回だけ行う。
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
import { fingerprintPage, type MoodleFingerprint } from './moodleFingerprint'

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
  /**
   * Dashboard 面の最新の判定（observeDashboard のたびに **置換** する）。
   *
   * Dashboard はサイクル内で唯一の面なのに複数回観測されうる（LetusSyncEngine の courses ステージは
   * 空振り時に WebView を作り直して COURSES_MAX_TRIES まで再試行し、そのたびに観測が流れる）。
   * codes へ追記すると1回目の失敗（SSO 中間ページ・ハイドレーション未完）が、2回目で同じ面が
   * 正常に読めても取り消せず、サイクル全体が汚染される。同一面の再観測は「上書き」が正しい。
   */
  dashboardCodes: DiagnosticCode[]
  /** このサイクルで COURSE_LOST_ALL_ASSIGNMENTS を発火した既知コース数（横断集計の分子）。 */
  lostCourseCount: number
  /** このサイクルで観測した既知コース（logged_in・前回シグネチャ>0）の総数（横断集計の分母）。 */
  trackedCourseCount: number
  /** LETUS に到達し結論の出るページ（logged_in / logged_out）を1つでも観測したか（記録可否ゲート）。 */
  reachedLetus: boolean
  /**
   * このサイクルで logged_in と結論の出たページを1つでも観測したか（LOGGED_OUT の取り消しゲート）。
   *
   * LOGGED_OUT は「ページの欠陥」ではなく **セッションの状態** なので、1ページの観測で確定させては
   * いけない。1サイクルは SSO 中間ページを踏みうる（courses ステージは空振り→再試行を設計として持ち、
   * 活動ページ巡回でも過渡的にログイン画面へ落ちうる）。集約器は追記専用なので、後続ページで同じ面が
   * 正常に読めても先行の LOGGED_OUT を取り消せず、サイクル全体が汚染される。ログイン済みのページを
   * 1枚でも読めていれば「ログアウトされている」は偽なので、finalize でこのフラグにより打ち消す。
   */
  sawLoggedIn: boolean
  /**
   * このサイクルで読めた受動版フィンガープリント（§9・T8）。版が読めた最初の観測だけを保持し、
   * 以降のページでは走査しない（同一サイクル内で稼働版が変わることはない＝数十ページへの
   * 正規表現走査を避ける）。版が読めなければ null のまま＝記録側が既存の観測を消さない。
   */
  fingerprint: MoodleFingerprint | null
}

export function createScanAccumulator(): ScanDiagnosticsAccumulator {
  return {
    codes: [],
    dashboardCodes: [],
    lostCourseCount: 0,
    trackedCourseCount: 0,
    reachedLetus: false,
    sawLoggedIn: false,
    fingerprint: null,
  }
}

/**
 * 1ページ分の認証状態をサイクル集約器へ反映する（各 observe* の共通入口）。
 * 「到達したか（reachedLetus）」と「ログイン済みを見たか（sawLoggedIn）」を必ず同時に更新する
 * ＝観測面を足したときに片方だけ配線し忘れることを防ぐ（面を足す＝両方に効く）。
 */
function noteAuthState(acc: ScanDiagnosticsAccumulator, pageAuthState: PageAuthState): void {
  if (pageAuthState !== 'unknown') acc.reachedLetus = true
  if (pageAuthState === 'logged_in') acc.sawLoggedIn = true
}

/**
 * 受動版フィンガープリント（§9・T8）をこのページから拾う。**追加リクエストは発生しない**
 * （既に取得済みの HTML を読むだけ）。
 *
 * logged_in と分類できたページに限定する: SSO/IdP のログインページやメンテ画面に紛れる
 * 無関係な docs リンクで稼働版を誤記録しないため（LTW background の分類ゲートと同じ）。
 * 版が読めない観測（version=null）は採用しない＝観測なしとして扱い、記録側が既存値を保つ。
 */
function observeFingerprint(
  acc: ScanDiagnosticsAccumulator,
  html: string,
  pageAuthState: PageAuthState,
): void {
  if (pageAuthState !== 'logged_in') return
  if (acc.fingerprint !== null) return
  const fp = fingerprintPage(html)
  if (fp.version !== null) acc.fingerprint = fp
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
  noteAuthState(acc, pageAuthState)
  observeFingerprint(acc, obs.html, pageAuthState)
  // 同一面の再観測は追記でなく置換（dashboardCodes の根拠参照）。再試行で健全に読めたら
  // 1回目の判定は消える＝「出す条件」と「消す条件」が同じ粒度で揃う。
  acc.dashboardCodes = [
    ...diagnoseAuthProbe({
      fetchOk: true,
      hasMcfg: hasMoodleConfig(obs.html),
      hasLoginMarker: hasLetusLoginMarker(obs.html),
    }),
    ...diagnoseDashboard({
      pageAuthState,
      courseAnchorCount: obs.courseAnchorCount,
      knownCourseCount: obs.knownCourseCount,
    }),
  ]
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
  noteAuthState(acc, pageAuthState)
  observeFingerprint(acc, obs.html, pageAuthState)
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
  noteAuthState(acc, pageAuthState)
  observeFingerprint(acc, obs.html, pageAuthState)
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
  // Dashboard 面は最新の判定だけを採る（置換済み）。観測順に合わせて先頭へ置く。
  const codes = [...acc.dashboardCodes, ...acc.codes]
  codes.push(
    ...diagnoseCourseLossAggregate({
      lostCourseCount: acc.lostCourseCount,
      trackedCourseCount: acc.trackedCourseCount,
    }),
  )
  // LOGGED_OUT はセッションの状態であってページの欠陥ではない。ログイン済みのページを1枚でも
  // 読めていれば「ログアウトされている」は偽なので、サイクル確定時に打ち消す（sawLoggedIn の根拠参照）。
  // これが無いと、SSO 中間ページを1枚踏んだだけのサイクルが LOGGED_OUT 付きで記録され、
  // reducer 側で LOGGED_OUT は閾値を待たず即 activeCodes へ載るため、収集が成功していてもバナーが出る。
  // 打ち消しの代償はサイクル途中で本当に失効した場合の検知が1サイクル遅れることだけ
  // （次サイクルは全ページ logged_out ＝ sawLoggedIn=false になり、閾値を待たず発火する）。
  const finalized = acc.sawLoggedIn ? codes.filter((code) => code !== 'LOGGED_OUT') : codes
  return Array.from(new Set(finalized))
}
