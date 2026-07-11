import { useRef } from 'react'
import { COLLECT_TIMETABLE_JS, OPEN_TIMETABLE_JS } from './injectedScripts'
import { parseCollectionMessage } from './timetableMessage'
import { saveTimetable } from '../storage/timetableStore'
import { saveTimetableRefreshedAt } from '../storage/refreshMetaStore'
import { saveCollectionHealth } from '../storage/collectionHealthStore'
import {
  createHealthObservation,
  observePageSignal,
  timetableHealth,
  type TimetableCollectDiag,
} from '../health/collectionSignals'
import { refreshAllNotifications } from '../notifications/notificationRefresh'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS時間割の headless 収集エンジン。共有骨格 ClassHeadlessCollector に時間割用の
 * メニュー発火JS・抽出JS・保存処理を差し込んだ薄いラッパ。table.classTable を1件以上取れた
 * ときだけ保存し、通知も貼り直す。
 * ヘルス(層2): 観測シグナルから分類した結果を finish 時に保存する（層1バナー用）。
 */
export default function TimetableSyncEngine({ onFinished }: { onFinished: () => void }) {
  const obs = useRef(createHealthObservation())
  const lastCollect = useRef<TimetableCollectDiag | null>(null)
  const parsedSlots = useRef(0)

  return (
    <ClassHeadlessCollector
      openJs={OPEN_TIMETABLE_JS}
      collectJs={COLLECT_TIMETABLE_JS}
      resultType="timetable"
      onSignal={(p) => {
        observePageSignal(obs.current, p)
        if (p.type === 'timetable') {
          lastCollect.current = {
            page: typeof p.page === 'string' ? p.page : undefined,
            tableCount: Array.isArray(p.tables) ? p.tables.length : 0,
            hasJigen: typeof p.jigen === 'string' && p.jigen.trim() !== '',
            pwd: typeof p.pwd === 'number' ? p.pwd : undefined,
            logout: typeof p.logout === 'number' ? p.logout : undefined,
            blen: typeof p.blen === 'number' ? p.blen : undefined,
          }
        }
      }}
      onData={async (raw) => {
        const result = parseCollectionMessage(raw)
        parsedSlots.current = result.collections.reduce((n, c) => n + c.slots.length, 0)
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
      onFinished={() => {
        saveCollectionHealth('timetable', timetableHealth(obs.current, lastCollect.current, parsedSlots.current)).catch(
          () => undefined,
        )
        onFinished()
      }}
    />
  )
}
