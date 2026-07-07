import { useEffect, useState } from 'react'
import AssignmentCollector from './AssignmentCollector'

/**
 * タブ入場（authed）後に1回だけ課題を自動収集する。起動直後のタブ描画と競合しないよう
 * 2秒遅延で開始。LETUSのみに触るため出席/時間割のCLASS WebViewとは競合しない。
 * コーススナップショット未収集なら候補0件で即終了（保存も通知もスキップ）。
 */
export default function BackgroundAssignmentRefresh() {
  const [active, setActive] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setActive(true), 2000)
    return () => clearTimeout(t)
  }, [])

  if (!active || finished) return null
  return <AssignmentCollector onFinished={() => setFinished(true)} />
}
