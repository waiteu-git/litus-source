/**
 * 「学期の授業回が終わった科目に、出席案内を出し続けない」ための純粋ロジック。
 *
 * findActiveClass / isInActiveClassPeriod は時間割テンプレの曜日・時刻だけで判定するため日付を持たず、
 * 学期が終わっていても毎週その時間帯になれば必ず該当を返していた。ここで科目ごとの
 * 「最終授業日」と「追加の予定（期末・追試・補講・教室変更など）」を起こし、述語として注入する。
 *
 * 判定は徹底して fail-open（迷ったら出す）。案内を余分に出す害より、
 * 出席できるはずの回で案内が消える害のほうが大きい。
 *
 * **🔴裁定（2026-08-06・再litigate不要）＝隔週の休み週（weeklyPattern / isOn）では案内を止めない。**
 * ユーザーが「今週は休み」と登録していても、出席案内は出す。理由は上の fail-open と同じ非対称:
 *   - 止めて間違える（登録が古い・その週に補講が入った）→ **出席を逃す。取り返しがつかない**
 *   - 出して間違える → 「受付中かも」を見て開き、何も無いと分かるだけ
 * 文言が「受付中**かも**」と断定していないのも、この向きに合わせた設計。
 * ⚠この裁定を覆すなら**4面まとめて**変えること。片方だけ厳しくすると、同じ授業について
 * ウィジェットとアプリ本体が食い違う（現状は computeHomeBanner も courseActive だけを見ている）。
 *
 * **この述語を通す面の数え上げ（2026-08-06で全て閉じた）**。1箇所直しただけでは効かないので、
 * 出席案内を出す面を足したらここに1行足すこと:
 *   1. 画面（HomeScreen / AttendanceFab → useCourseActive → computeHomeBanner）… build 104
 *   2. 予約通知（notificationRefresh → computeAttendanceAlarms）… 2026-08-06
 *   3. ホーム画面ウィジェット（widgetData → buildWidgetModel → isInActiveClassPeriod）… 2026-08-06
 *   4. 出席エンジンの起動条件（AttendanceEngineProvider → isInActiveClassPeriod）… 2026-08-06
 * 数え終わったことは `grep -rn "isInActiveClassPeriod(\|findActiveClass(" src/` で確認できる。
 * isInActiveClassPeriod は述語が**必須引数**なので、通し忘れたまま新しい面を足すと型エラーになる。
 * findActiveClass の isOn は後方互換で省略可のままなので、**呼び出し側を目で見ること**
 * （現在の非テスト呼び出しは computeHomeBanner の1本だけで、そこは通っている）。
 */
import type { AttendanceCourseStats } from '../parsers/attendanceStats'
import { parseBulletinEvents, type BulletinEventCandidate } from '../timetableEvents/bulletinEvents'
import { makeupOccurrences, type ClassEvent } from '../timetableEvents/classEvent'
import { classPeriodStatus, type AcademicCalendar } from '../health/academicCalendar'
import { dateToYmd } from '../timetableEvents/eventDateValue'
import type { BulletinItem } from '../storage/bulletinDigestSerialize'
import { resolveTermDates } from './attendanceTerm'

/** 学期の通常回が終わった後もその日その科目に授業がある、と分かっている予定。 */
export type ExtraPlan = { courseCode: string | null; courseName: string; date: string }

/** isCourseActiveOn に渡す入力一式。空＝学期終了が「不明」＝全科目まだ授業がある扱い（fail-open）。 */
export type CourseTermInfo = {
  termEnds: Record<string, string>
  /** 名前キーの出所コード（''＝コード無しの科目が作った＝誰から引いてもよい）。 */
  nameOwners: Record<string, string>
  extraPlans: ExtraPlan[]
  /** 遠隔配信の学年暦。null＝未配信/壊れ/古い ⇒ **従来どおりの挙動へ倒す**（fail-open）。 */
  calendar: AcademicCalendar | null
}

/**
 * 出欠各回（'MM/DD'）から科目ごとの最終授業日（'YYYY-MM-DD'）を起こす。
 * 鍵は科目コードと科目名の両方（呼び出し側はコード優先で引く）。
 *
 * 日付のある回が1回以下の科目は鍵を作らない。出欠が取れていない/パースが退化した科目を
 * 「今日が最終回」と誤判定して案内を消してしまうのを避けるため（fail-open）。
 */
/**
 * `courseTermEnds` に加えて、**各名前キーがどの科目コードから作られたか**を返す。
 * 🔴 名前は同一性の鍵として弱い（2026-08-28 監査 CONFIRMED）。前期「英語３」(1111111)の
 * 終了日が、後期の同名別コード「英語３」(2222222)へ流用され、**後期の科目が丸ごと沈黙**した
 * （アラーム・バナー・ウィジェット・エンジン起動すべて）。
 * ⚠ かといって名前キーを消してはいけない＝**時間割側にコードが無い経路**で必要（既存テストが
 * 明示的に守っている）。⇒ 消さずに**出所を持たせ、別科目の答えを流用する時だけ拒む**。
 * 値 '' はコードの無い科目が作ったキー＝どの科目から引いてもよい。
 */
export function courseTermEndsWithOwners(
  courses: AttendanceCourseStats[],
  now: Date,
): { termEnds: Record<string, string>; nameOwners: Record<string, string> } {
  const out: Record<string, string> = {}
  const owners: Record<string, string> = {}
  for (const c of courses) {
    const resolved = resolveTermDates(c.sessions, now)
    if (resolved.length < 2) continue
    let last = resolved[0].full
    for (const r of resolved) if (r.full.getTime() > last.getTime()) last = r.full
    const end = dateToYmd(last)
    if (c.courseCode) out[c.courseCode] = end
    if (c.courseName) {
      out[c.courseName] = end
      owners[c.courseName] = c.courseCode ?? ''
    }
  }
  return { termEnds: out, nameOwners: owners }
}

/** 登録済みイベントから追加の予定を平坦化する。休講(cancel)自体は予定ではないので含めない。 */
export function extraPlansFromEvents(events: ClassEvent[]): ExtraPlan[] {
  const out: ExtraPlan[] = []
  for (const e of events) {
    // makeup は makeupOccurrences 側で拾う（休講内包の補講と同じ経路にまとめる）。
    if (e.type === 'cancel' || e.type === 'makeup') continue
    out.push({ courseCode: e.courseCode, courseName: e.courseName, date: e.date })
  }
  const byId = new Map(events.map((e) => [e.id, e]))
  for (const m of makeupOccurrences(events)) {
    out.push({ courseCode: byId.get(m.sourceId)?.courseCode ?? null, courseName: m.courseName, date: m.date })
  }
  return out
}

/** 掲示由来の候補から追加の予定を平坦化する（補講と休講内包補講のみ。掲示から期末・追試は起こせない）。 */
export function extraPlansFromCandidates(cands: BulletinEventCandidate[]): ExtraPlan[] {
  const out: ExtraPlan[] = []
  for (const c of cands) {
    if (c.type === 'makeup') out.push({ courseCode: c.courseCode, courseName: c.courseName, date: c.date })
    if (c.makeup) out.push({ courseCode: c.courseCode, courseName: c.courseName, date: c.makeup.date })
  }
  return out
}

/**
 * 保存済みデータから述語の入力一式を組む。**入力源を増やす時はここだけを直す。**
 *
 * 画面（useCourseActive）と予約通知（notificationRefresh）が各々で組むと、
 * 片方にだけ入力源が足されて静かにズレる。判定（isCourseActiveOn）を1本にしても、
 * 入力の組み立てが2本あればズレは戻ってくる。
 */
export function buildCourseTermInfo(a: {
  courses: AttendanceCourseStats[]
  events: ClassEvent[]
  bulletins: BulletinItem[]
  now: Date
  calendar: AcademicCalendar | null
}): CourseTermInfo {
  const cands = a.bulletins.flatMap((b) => parseBulletinEvents(b))
  const { termEnds, nameOwners } = courseTermEndsWithOwners(a.courses, a.now)
  return {
    termEnds,
    nameOwners,
    calendar: a.calendar,
    extraPlans: [...extraPlansFromEvents(a.events), ...extraPlansFromCandidates(cands)],
  }
}

/**
 * その日その科目の出席案内をまだ出すか。
 * 最終授業日が分からなければ出す／最終授業日までは出す／過ぎていても同日に追加の予定があれば出す。
 */
export function isCourseActiveOn(a: {
  courseCode: string
  courseName: string
  dateKey: string
  termEnds: Record<string, string>
  /** 🔴必須。省略可能にすると呼び出し側は必ず省略し、同じ欠陥が戻る（このファイルの既存方針）。 */
  nameOwners: Record<string, string>
  extraPlans: ExtraPlan[]
  /** 🔴必須（同上）。null で明示的に「暦なし」を渡す。 */
  calendar: AcademicCalendar | null
}): boolean {
  const hasExtraPlan = () =>
    a.extraPlans.some(
      (p) => p.date === a.dateKey && (p.courseCode ? p.courseCode === a.courseCode : p.courseName === a.courseName),
    )
  // 🔴 学期間（前期終了〜後期開始）は出席の案内を出さない（2026-08-28 ユーザー要望）。
  // ⚠ ただし**その日に補講・期末の予定があれば出す**＝学期間に実在する授業まで消さない。
  // 暦が無い/壊れている/古いときは 'unknown' が返るのでここは素通り＝従来どおり（fail-open）。
  if (classPeriodStatus(a.calendar, a.dateKey) === 'between') return hasExtraPlan()
  // コードで引けたらそれが答え。引けない時だけ名前へ落ちるが、🔴**その名前キーが
  // コード付きの別科目から作られていたら使わない**（2026-08-28 監査）。情報が無い側へ倒す＝
  // fail-open で鳴る。「生きている授業を黙って殺す」より「終わった授業で鳴る」方が軽い。
  const byCode = a.courseCode ? a.termEnds[a.courseCode] : undefined
  const owner = a.nameOwners[a.courseName]
  // 名前キーを拒むのは「**聞く側にコードがあり、かつその名前キーが別のコードから作られた**」時だけ。
  // ⚠聞く側にコードが無い（時間割側でコードが取れない経路）なら、名前が唯一の手掛かりなので使う。
  // ここを塞ぐと『科目名でも最終授業日を引ける』が壊れる（既存テストが守っている実在の経路）。
  const nameUsable = !a.courseCode || owner === undefined || owner === '' || owner === a.courseCode
  const end = byCode ?? (nameUsable ? a.termEnds[a.courseName] : undefined)
  if (!end) return true
  if (a.dateKey <= end) return true
  return hasExtraPlan()
}
