/**
 * CLASS / LETUS の定時メンテナンス時間帯の判定（純粋・RN非依存）。
 * 端末ローカル時刻（日本の学生前提＝JST）で判定する。境界は [開始, 終了)。
 * - CLASS: 02:00–04:00
 * - LETUS: 04:00–05:30
 * この時間帯に各システムへアクセス（収集）しようとしても失敗するため、
 * 事前にメンテナンス表示へ倒してムダな収集・エラーを避ける。
 */

export type MaintenanceSystem = 'class' | 'letus'

type Window = { system: MaintenanceSystem; startMin: number; endMin: number; label: string }

const WINDOWS: Window[] = [
  { system: 'class', startMin: 2 * 60, endMin: 4 * 60, label: '2:00–4:00' },
  { system: 'letus', startMin: 4 * 60, endMin: 5 * 60 + 30, label: '4:00–5:30' },
]

/** その時刻にメンテナンス中のシステム。どちらでもなければ null。 */
export function maintenanceSystemAt(date: Date): MaintenanceSystem | null {
  const min = date.getHours() * 60 + date.getMinutes()
  for (const w of WINDOWS) {
    if (min >= w.startMin && min < w.endMin) return w.system
  }
  return null
}

/** 表示用の時間帯ラベル（例: '2:00–4:00'）。 */
export function maintenanceWindowLabel(system: MaintenanceSystem): string {
  return WINDOWS.find((w) => w.system === system)?.label ?? ''
}

/** 表示用のシステム名（'class' → 'CLASS' / 'letus' → 'LETUS'）。表示名の単一の真実。 */
export function systemDisplayName(system: MaintenanceSystem): 'CLASS' | 'LETUS' {
  return system === 'letus' ? 'LETUS' : 'CLASS'
}
