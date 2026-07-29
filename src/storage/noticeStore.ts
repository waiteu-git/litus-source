import { Storage } from './asyncStorage'
import { createWriteQueue } from './writeQueue'

/**
 * お知らせ帯を「×」で消したときの既読キー（＝そのときの文面のハッシュ）。
 * 文面が変われば別のハッシュになるため、新しいお知らせは既読でも再表示される
 * （同一性の基準は src/health/notice.ts の noticeHash）。
 * 読めなければ null＝未読扱い（お知らせは出る側＝fail-open）。
 */
const KEY = 'notice.dismissed.v1'

const enqueueWrite = createWriteQueue()

export function loadDismissedNoticeHash(): Promise<string | null> {
  return Storage.getItem(KEY)
}

export function saveDismissedNoticeHash(hash: string): Promise<void> {
  return enqueueWrite(() => Storage.setItem(KEY, hash))
}
