/**
 * 各回イベント（休講/補講/小テスト/中間/期末/教室変更）を通知予約枠の形へ変換する（純粋・RN非依存）。
 *
 * **なぜ独立モジュールなのか**: この変換は notificationRefresh.ts の中に private 関数として埋まっていた。
 * あちらは AsyncStorage 由来のストアを import するため vitest から読めず、**この層だけテストが無かった**。
 * その結果「イベントを kind:'deadline-24h' へ潰す」バグが型検査もテストも通り抜け、
 * 休講通知が「締切まで24時間 / 「◯◯ 休講（日付）」の締切が近づいています」として届いていた
 * （2026-07-17 修正）。純粋層に出してテストで固定する。
 */
import { buildClassEventNotifications } from '../timetableEvents/eventSchedule'
import type { ClassEvent } from '../timetableEvents/classEvent'
import type { ScheduledNotification } from './schedule'

export function classEventNotifications(events: ClassEvent[], now: Date): ScheduledNotification[] {
  return buildClassEventNotifications(events, now).map((n) => ({
    kind: 'class-event',
    eventId: n.id,
    title: n.title,
    body: n.body,
    fireAt: n.fireAt.toISOString(),
  }))
}
