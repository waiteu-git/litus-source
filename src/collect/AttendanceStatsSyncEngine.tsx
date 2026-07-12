import { OPEN_ATTENDANCE_STATS_JS, COLLECT_ATTENDANCE_STATS_JS } from './injectedScripts'
import { parseAttendanceStatsMessage } from './attendanceStatsMessage'
import { saveAttendanceStats } from '../storage/attendanceStatsStore'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS「学生出欠状況確認」の headless 収集エンジン。共有骨格に出欠用のメニュー発火JS・抽出JS・
 * 保存処理を差し込んだ薄いラッパ。1科目以上取れたときだけ保存する。reboot/timeout/メンテガード/
 * 出席絶対優先は ClassHeadlessCollector から継承。
 */
export default function AttendanceStatsSyncEngine({ onFinished }: { onFinished: () => void }) {
  return (
    <ClassHeadlessCollector
      openJs={OPEN_ATTENDANCE_STATS_JS}
      collectJs={COLLECT_ATTENDANCE_STATS_JS}
      resultType="attendanceStats"
      onData={async (raw) => {
        const result = parseAttendanceStatsMessage(raw)
        if (result.error || result.courses.length === 0) return false
        try {
          await saveAttendanceStats(result.courses)
        } catch {
          // 保存失敗でも到達済みなので完了扱い（無駄打ちしない）。
        }
        return true
      }}
      onFinished={onFinished}
    />
  )
}
