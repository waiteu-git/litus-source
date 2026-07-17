import { useRef } from 'react'
import { OPEN_ATTENDANCE_STATS_JS, COLLECT_ATTENDANCE_STATS_JS } from './injectedScripts'
import { parseAttendanceStatsMessage } from './attendanceStatsMessage'
import { saveAttendanceStats } from '../storage/attendanceStatsStore'
import { saveCollectionHealth } from '../storage/collectionHealthStore'
import {
  attendanceStatsHealth,
  createHealthObservation,
  observePageSignal,
  type AttendanceStatsCollectDiag,
} from '../health/collectionSignals'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS「学生出欠状況確認」の headless 収集エンジン。共有骨格に出欠用のメニュー発火JS・抽出JS・
 * 保存処理を差し込んだ薄いラッパ。1科目以上取れたときだけ保存する。reboot/timeout/メンテガード/
 * 出席絶対優先/CLASS排他リース（直列化）は ClassHeadlessCollector から継承。
 *
 * navOnce: 出欠状況ページは着地時AJAXで表を描画する場合があり（実地採取2026-07-12）、描画前は
 * 着地ガード（td.colSizeFixed）が偽のため、onLoadEnd毎のOPEN再注入だとメニュー再クリック→
 * 遷移やり直しループに落ちる（掲示が Xut12401 で踏んだ穴と同型）。メニューは一度だけ発火し、
 * 着地・描画は collectJs の再抽出ポーリングに任せる。
 * maxTries=Infinity（=25秒の全体タイムアウトを唯一のバックストップにする着地駆動ポーリング）:
 * 既定4回だと遅い実機では着地前に尽きて静かに終了する（v79実機で出欠が一度も取れなかった直接原因）。
 * さらに COLLECT はページ未描画でも空HTMLを必ず post するため、SSO入場中の各 onLoadEnd が撃つ
 * 早撃ちCOLLECTの空結果が共有 triesRef を食い、有限上限だと着地前に枯渇し得る。上限を撤廃し
 * 「着地して表が描画された瞬間の抽出成功」か「25秒経過」でのみ終える。fallbackは
 * セッションがあっても保証人ページへ弾かれ使えないため未指定（実測2026-07-15）。
 *
 * 健康記録（2026-07-17追加）: 掲示/時間割/課題は onSignal＋saveCollectionHealth で失敗理由を残すのに
 * **出欠だけ何も残していなかった**ため、「授業中に取れない」を推測でしか語れなかった（ユーザー報告）。
 * 完了時に必ず health を保存する＝多重画面競合(blocked)・未着地(blocked)・構造変更(structure_drift)が
 * 事実として残る。
 */
export default function AttendanceStatsSyncEngine({ onFinished }: { onFinished: () => void }) {
  const obs = useRef(createHealthObservation())
  const diag = useRef<AttendanceStatsCollectDiag | null>(null)
  const parsedCount = useRef(0)

  return (
    <ClassHeadlessCollector
      openJs={OPEN_ATTENDANCE_STATS_JS}
      collectJs={COLLECT_ATTENDANCE_STATS_JS}
      resultType="attendanceStats"
      navOnce
      maxTries={Number.POSITIVE_INFINITY}
      onSignal={(p) => {
        observePageSignal(obs.current, p)
        if (p.type === 'page' && typeof p.url === 'string') {
          diag.current = { ...(diag.current ?? {}), page: (p.url.split('/').pop() as string) || p.url }
        }
        if (p.type === 'attendanceStats') {
          diag.current = {
            ...(diag.current ?? {}),
            htmlLen: typeof p.html === 'string' ? p.html.length : 0,
            rows: typeof p.rows === 'number' ? p.rows : 0,
            pwd: typeof p.pwd === 'number' ? p.pwd : 0,
            blen: typeof p.blen === 'number' ? p.blen : 0,
            page: typeof p.page === 'string' && p.page ? p.page : diag.current?.page,
          }
        }
      }}
      onData={async (raw) => {
        const result = parseAttendanceStatsMessage(raw)
        if (result.error || result.courses.length === 0) return false
        parsedCount.current = result.courses.length
        try {
          await saveAttendanceStats(result.courses)
        } catch {
          // 保存失敗でも到達済みなので完了扱い（無駄打ちしない）。
        }
        return true
      }}
      onFinished={() => {
        // 成功・失敗にかかわらず理由を残す（ここが無いと授業中の失敗が永遠に不可視になる）。
        saveCollectionHealth(
          'attendanceStats',
          attendanceStatsHealth(obs.current, diag.current, parsedCount.current),
        ).catch(() => undefined)
        onFinished()
      }}
    />
  )
}
