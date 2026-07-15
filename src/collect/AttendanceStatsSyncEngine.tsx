import { useRef } from 'react'
import { OPEN_ATTENDANCE_STATS_JS, COLLECT_ATTENDANCE_STATS_JS } from './injectedScripts'
import { parseAttendanceStatsMessage } from './attendanceStatsMessage'
import { saveAttendanceStats } from '../storage/attendanceStatsStore'
import { saveAttendanceDiag } from '../storage/attendanceDiagStore'
import ClassHeadlessCollector from './ClassHeadlessCollector'

/**
 * CLASS「学生出欠状況確認」の headless 収集エンジン。共有骨格に出欠用のメニュー発火JS・抽出JS・
 * 保存処理を差し込んだ薄いラッパ。1科目以上取れたときだけ保存する。reboot/timeout/メンテガード/
 * 出席絶対優先は ClassHeadlessCollector から継承。
 *
 * navOnce: 出欠状況ページは着地時AJAXで表を描画する場合があり（実地採取2026-07-12）、描画前は
 * 着地ガード（td.colSizeFixed）が偽のため、onLoadEnd毎のOPEN再注入だとメニュー再クリック→
 * 遷移やり直しループに落ちる（掲示が Xut12401 で踏んだ穴と同型）。メニューは一度だけ発火し、
 * 着地・描画は collectJs の再抽出ポーリングに任せる。
 * maxTries=Infinity（=25秒の全体タイムアウトを唯一のバックストップにする着地駆動ポーリング）:
 * 既定4回だと遅い実機では着地前に尽きて静かに終了する（v79実機で出欠が一度も取れなかった直接原因）。
 * さらに COLLECT はページ未描画でも空HTMLを必ず post するため、SSO入場中の各 onLoadEnd が撃つ
 * 早撃ちCOLLECTの空結果が共有 triesRef を食い、有限上限だと着地前に枯渇し得る（並走チェーン問題）。
 * 上限を撤廃し「着地して表が描画された瞬間の抽出成功」か「25秒経過」でのみ終える。fallbackは
 * セッションがあっても保証人ページへ弾かれ使えないため未指定（実測2026-07-15）。
 *
 * 【一時デバッグ】onSignal/onData/onFinished で収集の途中経過を診断文字列に集約し保存する
 * （saveAttendanceDiag）。実機でだけ落ちる原因（メニュー発火の可否・着地ページ・セッション競合・
 * 抽出サイズ・パース件数）を科目詳細で読めるようにする。※原因特定後に撤去する。
 */
export default function AttendanceStatsSyncEngine({ onFinished }: { onFinished: () => void }) {
  const diag = useRef({
    loads: 0,
    stages: [] as string[],
    flags: new Set<string>(),
    lastPage: '',
    statsMsgs: 0,
    blen: 0,
    pwd: 0,
    htmlLen: 0,
    parsed: -2, // -2=未到達, -1=パースエラー, >=0=件数
    saved: false,
  })

  return (
    <ClassHeadlessCollector
      openJs={OPEN_ATTENDANCE_STATS_JS}
      collectJs={COLLECT_ATTENDANCE_STATS_JS}
      resultType="attendanceStats"
      navOnce
      maxTries={Number.POSITIVE_INFINITY}
      onSignal={(p) => {
        const d = diag.current
        const type = typeof p.type === 'string' ? p.type : ''
        if (type === 'page') {
          d.loads += 1
          if (typeof p.url === 'string') d.lastPage = (p.url.split('/').pop() as string) || p.url
          if (p.hasMaintenance) d.flags.add('maint')
          if (p.hasMultiScreen) d.flags.add('multi')
          if (p.hasSystemError) d.flags.add('syserr')
          if (p.hasSsoStale) d.flags.add('ssostale')
          if (p.hasPasswordInput) d.flags.add('login')
          if (p.hasEnterSplash) d.flags.add('splash')
          if (p.hasClassMenu) d.flags.add('menu')
        } else if (type === 'nav') {
          const stage = typeof p.stage === 'string' ? p.stage : '?'
          d.stages.push(stage + (p.ok === false ? '!' : ''))
        } else if (type === 'attendanceStats') {
          d.statsMsgs += 1
          if (typeof p.page === 'string' && p.page) d.lastPage = p.page as string
          if (typeof p.blen === 'number') d.blen = p.blen
          if (typeof p.pwd === 'number') d.pwd = p.pwd
          if (typeof p.html === 'string') d.htmlLen = (p.html as string).length
        } else if (type === 'error') {
          d.flags.add('err')
        }
      }}
      onData={async (raw) => {
        const result = parseAttendanceStatsMessage(raw)
        diag.current.parsed = result.error ? -1 : result.courses.length
        if (result.error || result.courses.length === 0) return false
        try {
          await saveAttendanceStats(result.courses)
          diag.current.saved = true
        } catch {
          // 保存失敗でも到達済みなので完了扱い（無駄打ちしない）。
        }
        return true
      }}
      onFinished={() => {
        const d = diag.current
        const line =
          `loads=${d.loads} page=${d.lastPage || '?'} flags=${[...d.flags].join(',') || '-'} ` +
          `nav=${d.stages.join('>') || '-'} statsMsgs=${d.statsMsgs} blen=${d.blen} pwd=${d.pwd} ` +
          `htmlLen=${d.htmlLen} parsed=${d.parsed} saved=${d.saved}`
        saveAttendanceDiag(line).catch(() => undefined)
        onFinished()
      }}
    />
  )
}
