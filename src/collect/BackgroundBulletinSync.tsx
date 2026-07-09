import { useEffect, useState } from 'react'
import BulletinSyncEngine from './BulletinSyncEngine'
import { isBulletinStale, loadBulletinRefreshedAt } from '../storage/refreshMetaStore'

// 起動直後の描画やLETUS同期と競合しないよう、少し待ってから開始する。
const START_DELAY_MS = 6000

// この起動で掲示収集を実施/確定したか（プロセス内フラグ・永続化しない）。
const session = { done: false }

/**
 * 起動時に一度だけCLASS掲示を収集する。タブは既定で時間割が前面＝出席WebViewは未マウントの隙に
 * 済ませる（bottom-tabsは遅延マウントのため、ユーザーが出席タブを開くまで出席WebViewは無い）。
 * 出席が前面のあいだは BulletinSyncEngine 側が即abortする。以降の最新化はインフォの手動更新のみ。
 */
export default function BackgroundBulletinSync() {
  const [active, setActive] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (session.done || finished) return
    let cancelled = false
    const t = setTimeout(() => {
      loadBulletinRefreshedAt()
        .then((at) => {
          if (cancelled) return
          if (isBulletinStale(at)) setActive(true)
          else {
            session.done = true
            setFinished(true)
          }
        })
        .catch(() => {
          if (!cancelled) setActive(true)
        })
    }, START_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [finished])

  if (!active || finished || session.done) return null
  return (
    <BulletinSyncEngine
      onFinished={() => {
        session.done = true
        setActive(false)
        setFinished(true)
      }}
    />
  )
}
