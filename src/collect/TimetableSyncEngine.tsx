import { useRef } from 'react'
import { COLLECT_TIMETABLE_JS, OPEN_TIMETABLE_JS } from './injectedScripts'
import { parseCollectionMessage } from './timetableMessage'
import { pickCurrentSemester } from './semester'
import { saveTimetable } from '../storage/timetableStore'
import { notifyWidgetDataChanged } from '../widget/updateWidget'
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
        if (__DEV__) {
          // 開発時のみ。実機検証ではこの1行が頼りになる（2026-08-27にこれで3件の不具合を特定した）。
          // gstate: switched=切替が決着 / timeout=効かなかった / nosel=時間割ページに居ない
          try {
            const d = JSON.parse(raw) as Record<string, unknown>
            console.log(
              '[litus/timetable] page=%s gstate=%s gakki=%s tables=%s heads=%s → 保存=%d件',
              String(d.page), String(d.gstate), JSON.stringify(d.gakki),
              Array.isArray(d.tables) ? String(d.tables.length) : '?',
              JSON.stringify(d.heads),
              result.collections.length,
            )
          } catch {
            /* 計測が本体を壊さない */
          }
        }
        parsedSlots.current = result.collections.reduce((n, c) => n + c.slots.length, 0)
        if (result.error || result.collections.length === 0) return false
        try {
          // 学期「すべて」で前期・後期の2枚が返る。**両方を保存しない**＝消費側8モジュールが
          // collections を全走査するため、終わった学期の授業が今日の授業として出る（semester.ts の頭）。
          await saveTimetable(result.collections)
          await saveTimetableRefreshedAt()
          await refreshAllNotifications()
          notifyWidgetDataChanged()
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
