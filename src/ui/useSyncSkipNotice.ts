import { useCallback, useEffect, useRef, useState } from 'react'

const SYNC_NOTICE_MS = 5000

/**
 * 手動更新をガードでスキップした理由の一時表示を管理する（純機構）。
 * message は空文字で非表示。show(msg) で表示し SYNC_NOTICE_MS 後に自動で消える。
 * clear() は収集開始時などに即座に消すため。アンマウント時にタイマーを必ずクリアする。
 * 表示テキストの見た目・位置は各画面が message を使って自前で描画する。
 */
export function useSyncSkipNotice(): {
  message: string
  show: (msg: string) => void
  clear: () => void
} {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const show = useCallback((msg: string) => {
    setMessage(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), SYNC_NOTICE_MS)
  }, [])
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setMessage('')
  }, [])
  return { message, show, clear }
}
