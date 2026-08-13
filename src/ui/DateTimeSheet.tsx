import { useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Text } from './Text'
import { COLORS, DARK } from '../theme'
import { useUi } from './screen'
import { pickerPresentation } from './dateTimePickerPresentation'

/**
 * 日付/時刻ピッカーの唯一の生成点（ラチェット: dateTimePickerGuard.test.ts）。
 *
 * 画面側の体験は両OSで同じ「押したら選べて、選び終わったら閉じる」に揃える。
 * Android は素の DateTimePicker が既にそうなっているので **触らない**。iOS だけ、
 * インライン埋め込みという性質を自前モーダルで包んで同じ体験に寄せる
 * （`display` を変えるだけでは常駐する性質は消えない）。
 *
 * 呼び出し規約: `open` が false の間は何も描かない。iOS 版は開くたびにマウントされるので、
 * ドラフト（スピナーで回している途中の値）は開き直すと必ず初期値へ戻る。
 */
export default function DateTimeSheet(props: {
  open: boolean
  /** 初期値。閉じている間は参照されない（毎レンダー新しい Date を渡してよい）。 */
  value: Date
  mode: 'date' | 'time'
  is24Hour?: boolean
  /** 確定。呼び出し側は **先に閉じてから** 値を反映すること（Androidの再表示ループ防止）。 */
  onConfirm: (d: Date) => void
  onCancel: () => void
  /** iOS モーダルの見出し（Android では使われない）。 */
  title?: string
}) {
  if (!props.open) return null
  if (pickerPresentation(Platform.OS) === 'modalSpinner') return <IosDateTimeSheet {...props} />
  return (
    <DateTimePicker
      value={props.value}
      mode={props.mode}
      is24Hour={props.is24Hour}
      onChange={(e, d) => (e.type === 'set' && d ? props.onConfirm(d) : props.onCancel())}
    />
  )
}

/**
 * iOS 専用。spinner を自前のボトムシートに入れ、確定/キャンセルを明示する。
 * spinner は回すたびに onChange が来るので、ドラフトに溜めて「完了」でだけ確定する
 * （回している途中の値が画面へ反映され続けるのを防ぐ）。
 * 表記が英語になっていた不具合があるので locale を明示する。
 */
function IosDateTimeSheet({
  value,
  mode,
  is24Hour,
  onConfirm,
  onCancel,
  title,
}: {
  value: Date
  mode: 'date' | 'time'
  is24Hour?: boolean
  onConfirm: (d: Date) => void
  onCancel: () => void
  title?: string
}) {
  const ui = useUi()
  // 開くたびにマウントされるので、初期値をそのまま持つだけでよい（同期の useEffect は不要）。
  const [draft, setDraft] = useState(value)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="閉じる" />
      <View style={[styles.sheet, ui.dark && { backgroundColor: DARK.card }]}>
        <View style={[styles.bar, { borderBottomColor: ui.inputBorder }]}>
          <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.action, { color: ui.labelColor }]}>キャンセル</Text>
          </Pressable>
          <Text style={[styles.title, { color: ui.valueColor }]}>
            {title ?? (mode === 'date' ? '日付を選択' : '時刻を選択')}
          </Text>
          <Pressable onPress={() => onConfirm(draft)} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.action, styles.done]}>完了</Text>
          </Pressable>
        </View>
        <DateTimePicker
          value={draft}
          mode={mode}
          is24Hour={is24Hour}
          display="spinner"
          locale="ja-JP"
          themeVariant={ui.dark ? 'dark' : 'light'}
          onChange={(_e, d) => {
            if (d) setDraft(d)
          }}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  // 既存のボトムシート（AddActivityDeadlineSheet）と同じスクリム。
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }, // design-allow
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    backgroundColor: COLORS.white,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 15, fontWeight: '600' },
  action: { fontSize: 15 },
  done: { color: COLORS.emerald, fontWeight: '700' },
})
