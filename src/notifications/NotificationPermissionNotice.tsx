/**
 * 通知権限の回復導線（設定画面の行とホームのバナーで共有）。
 *
 * これが本件の主役。Android は同一インストール内で2回拒否されると以後
 * `requestPermissionsAsync` が無音で denied を返すだけになり（iOS は1回きり）、
 * **アプリからダイアログを再表示する手段が完全に失われる**。既に拒否した端末を救えるのは
 * OS の設定画面へ運ぶこの導線だけで、要求タイミングの修正は新規インストール向けの再発防止にすぎない。
 *
 * 導線が無かった頃、拒否した人に観測できたのは「アプリの設定はONなのに何も来ない」だけだった。
 */
import { useCallback, useEffect, useState } from 'react'
import { AppState, Linking, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '../ui/Text'
import { PressableCard } from '../ui/Pressable'
import { useUi } from '../ui/screen'
import { getNotificationPermission, requestNotificationPermission } from './notifier'
import {
  notificationPermissionAction,
  notificationPermissionNotice,
  type NotifPermission,
  type NotifPermissionAction,
} from './permissionState'

/**
 * @param active false なら何も描かない。ホームでは「通知に依存する設定が実際に有効なとき」
 * だけ true にする（通知を意図的に切っている人に常駐広告を出さないため）。
 */
export default function NotificationPermissionNotice({ active = true }: { active?: boolean }) {
  const ui = useUi()
  const [perm, setPerm] = useState<NotifPermission | null>(null)
  const [checked, setChecked] = useState(false)

  const refresh = useCallback(() => {
    getNotificationPermission()
      .then((p) => {
        setPerm(p)
        setChecked(true)
      })
      .catch(() => setChecked(true))
  }, [])

  useEffect(() => {
    refresh()
    // **subscribeForeground には載せない**。あれは PULSE_MIN_GAP_MS=5000 のデバウンスがあり、
    // 設定アプリで通知をONにして数秒で戻ると再取得されず「ONにしたのに警告が消えない」になる。
    // ここは素の AppState を直接購読する。
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const action: NotifPermissionAction = checked ? notificationPermissionAction(perm) : 'none'
  const notice = notificationPermissionNotice(action)
  if (!active || !notice) return null

  async function onPress() {
    if (action === 'request') {
      try {
        setPerm(await requestNotificationPermission())
      } catch {
        // 何もしない（次のフォアグラウンド復帰で取り直す）。
      }
      return
    }
    // openSettings: Linking は react-native 標準で manifest への権限宣言が要らない
    // （Play の権限一覧に影響しない）。
    Linking.openSettings().catch(() => undefined)
  }

  return (
    <PressableCard style={[ui.card, styles.box]} onPress={onPress} accessibilityRole="button">
      <Ionicons name="notifications-off-outline" size={18} color={ui.labelColor} />
      <View style={styles.body}>
        <Text style={[styles.text, { color: ui.valueColor }]}>{notice.body}</Text>
        <Text style={[styles.cta, { color: ui.accent }]}>{notice.cta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={ui.chevron} />
    </PressableCard>
  )
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  body: { flex: 1, gap: 3 },
  text: { fontSize: 13 },
  cta: { fontSize: 13, fontWeight: '600' },
})
