import type { TimetableCollection } from '../collect/timetableMessage'
import { candidateToClassEvent, normCourseName, periodsKey, type BulletinEventCandidate } from './bulletinEvents'
import type { ClassEvent } from './classEvent'

/**
 * 掲示由来の休講の自動登録（211 積み荷②）が「一度登録したスロットを二度と勝手に戻さない」ために
 * 持つ台帳のキー生成・掃除と、候補の選別（純粋・RN非依存）。
 *
 * 🔴 台帳のキーは ClassEvent.id を使わない（`makeClassEventId` は createdAt を種に含むため、
 * 自動登録は毎回別idになり台帳が一致しない＝削除しても復活する。210で撤去した欠陥そのもの）。
 * キーは「スロット」＝(courseCode ?? 正規化courseName) | 'cancel' | date | periods昇順join。
 * ⚠ 台帳はこのスロットキーの有無だけで「登録済み」を判断する。既存 ClassEvent の有無は見ない
 * （利用者が削除・編集しても、スロットキーが記憶を持ち続けることで復活を防ぐ）。
 */

/** 休講スロットの台帳キー。 */
export function cancelSlotKey(courseCode: string | null, courseName: string, date: string, periods: number[]): string {
  return `${courseCode ?? normCourseName(courseName)}|cancel|${date}|${periodsKey(periods)}`
}

/**
 * date < today のキーを落とす（台帳の単調増加を防ぐ）。呼び出し側は自動登録のたび毎回これを通すこと
 * （「たまに掃除」にしない）。today/キー内日付とも 'YYYY-MM-DD'（文字列比較で日付順と一致する）。
 */
export function pruneExpiredLedgerKeys(keys: string[], today: string): string[] {
  return keys.filter((k) => {
    const date = k.split('|')[2]
    return typeof date === 'string' && date >= today
  })
}

/** 候補の科目が、収集済み時間割のどこかのコマに存在するか。コードがあればコード、無ければ名称で突合（reconcile と同じ規則）。 */
export function courseInTimetable(
  candidate: Pick<BulletinEventCandidate, 'courseCode' | 'courseName'>,
  timetables: TimetableCollection[] | null,
): boolean {
  if (!timetables) return false
  for (const col of timetables) {
    for (const slot of col.slots) {
      for (const cl of slot.classes) {
        const clCode = cl.courseCode || null
        if (candidate.courseCode && clCode) {
          if (candidate.courseCode === clCode) return true
        } else if (normCourseName(candidate.courseName) === normCourseName(cl.name)) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * 自動登録すべき候補を選ぶ（純粋）。判断基準は台帳のキーの有無のみ
 * （既存 ClassEvent の有無は見ない＝禁止事項1）。
 * - type は 'cancel' のみ（補講は対象外）
 * - 時間割に無い科目は対象外（禁止事項5・消せない休講を作らない）
 * - 同一同期内で複数候補が同じキーになった場合も1件だけ選ぶ（同名科目の別コード休講はキーが割れるので両方通る）
 * ClassEvent の id は手動経路（SubjectDetailScreen）と同じ規則（createdAt = sourceBulletinId）で
 * 決定論的に作る。手動で同じ候補を追加した場合と同一idになり、重複エントリを作らない。
 */
export function selectAutoRegisterCandidates(
  candidates: BulletinEventCandidate[],
  ledgerKeys: string[],
  timetables: TimetableCollection[] | null,
): { toAdd: ClassEvent[]; keysToAdd: string[] } {
  const ledger = new Set(ledgerKeys)
  const seen = new Set<string>()
  const toAdd: ClassEvent[] = []
  const keysToAdd: string[] = []
  for (const c of candidates) {
    if (c.type !== 'cancel') continue
    const key = cancelSlotKey(c.courseCode, c.courseName, c.date, c.periods)
    if (ledger.has(key) || seen.has(key)) continue
    if (!courseInTimetable(c, timetables)) continue
    seen.add(key)
    keysToAdd.push(key)
    toAdd.push(candidateToClassEvent(c, c.sourceBulletinId))
  }
  return { toAdd, keysToAdd }
}
