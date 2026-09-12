/**
 * 計器の1行を集める（RN 層・N1 §4.6）。整形は純粋層 notifInstrument.ts。
 * 読むのは OS の保留中の予約（デモ中も実の予約＝D2 の確認に使う）・当日の受付open 済み・起動してからの予約失敗の数だけ。
 * 読めなければ `notif err`（数を騙らない）。製品版の設定画面には出さない（下書きを開いた時だけ）。
 */
import { getScheduledNotificationsSnapshot } from '../notifications/notifier'
import { loadAnnouncedSlots } from '../storage/announcedSlotsStore'
import { scheduleFailures } from '../notifications/attendanceNotifState'
import { formatNotifLine } from '../notifications/notifInstrument'

export async function collectNotifDiagLine(now: Date = new Date()): Promise<string> {
  try {
    const [pending, announced] = await Promise.all([
      getScheduledNotificationsSnapshot(),
      loadAnnouncedSlots().catch(() => [] as string[]),
    ])
    return formatNotifLine({ pending, failures: scheduleFailures(), announced, now })
  } catch {
    return 'notif err'
  }
}
