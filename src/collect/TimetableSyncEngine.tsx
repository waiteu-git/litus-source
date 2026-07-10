import { COLLECT_TIMETABLE_JS, OPEN_TIMETABLE_JS } from './injectedScripts'
import { parseCollectionMessage } from './timetableMessage'
import { saveTimetable } from '../storage/timetableStore'
import { saveTimetableRefreshedAt } from '../storage/refreshMetaStore'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS時間割の headless 収集エンジン。共有骨格 ClassHeadlessCollector に時間割用の
 * メニュー発火JS・抽出JS・保存処理を差し込んだ薄いラッパ。table.classTable を1件以上取れた
 * ときだけ保存し、通知も貼り直す。
 */
export default function TimetableSyncEngine({ onFinished }: { onFinished: () => void }) {
  return (
    <ClassHeadlessCollector
      openJs={OPEN_TIMETABLE_JS}
      collectJs={COLLECT_TIMETABLE_JS}
      resultType="timetable"
      onData={async (raw) => {
        const result = parseCollectionMessage(raw)
        if (result.error || result.collections.length === 0) return false
        try {
          await saveTimetable(result.collections)
          await saveTimetableRefreshedAt()
          await refreshAllNotifications()
        } catch {
          // 保存失敗でも完了扱い（次回再試行）。到達はしているので false で無駄打ちしない。
        }
        return true
      }}
      onFinished={onFinished}
    />
  )
}
