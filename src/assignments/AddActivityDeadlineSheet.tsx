import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { COLORS, DARK } from '../theme'
import { useUi } from '../ui/screen'
import { useKeyboardHeight } from '../ui/useKeyboardHeight'
import { parseDeadlineInput } from './manualAssignment'
import DeadlineFields, { type DeadlineValue } from './DeadlineFields'

/**
 * +追加で収集対象外URL(PDF resource等)を選んだときの締切入力ボトムシート。
 * 「保存して追加」でDeadlineFieldsの値をISOへ変換して渡す（形式不正はシート内エラーで閉じない）。
 * 「締切なしで追加」はdeadline=nullで即確定する。
 * 背景タップ・Android戻る・「キャンセル」はすべて onCancel＝何も追加せず閉じる
 * （旧実装は背景タップ/戻るが「締切なしで追加」に落ちて、開いたら必ず追加されてしまった）。
 */
export default function AddActivityDeadlineSheet({
  visible, presetTitle, presetCourseName, onSave, onSkip, onCancel,
}: {
  visible: boolean
  presetTitle: string
  presetCourseName: string
  onSave: (deadline: string | null) => void
  onSkip: () => void
  onCancel: () => void
}) {
  const ui = useUi()
  const dark = ui.dark
  const kbHeight = useKeyboardHeight()
  const [value, setValue] = useState<DeadlineValue>({ noDeadline: false, date: '', time: '23:59' })
  const [error, setError] = useState<string | null>(null)

  // シートを開くたびに初期化する。
  useEffect(() => {
    if (visible) { setValue({ noDeadline: false, date: '', time: '23:59' }); setError(null) }
  }, [visible])

  function save() {
    if (value.noDeadline) { onSave(null); return }
    const iso = parseDeadlineInput(value.date, value.time)
    if (!iso) { setError('締切の日付/時刻の形式を確認してください（例: 2026/07/15 23:59）'); return }
    onSave(iso)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, dark && { backgroundColor: DARK.card }, { marginBottom: kbHeight }]}>
        <Text style={[styles.course, dark && { color: COLORS.emeraldLight }]}>{presetCourseName || '追加'}</Text>
        <Text style={[styles.title, dark && { color: DARK.heading }]} numberOfLines={2}>{presetTitle || '（無題）'}</Text>
        <Text style={[styles.hint, dark && { color: DARK.label }]}>締切を設定できます（自動収集の対象外アクティビティです）。</Text>
        <DeadlineFields
          value={value}
          onChange={setValue}
          valueColor={dark ? DARK.value : '#123'}
          labelColor={dark ? DARK.label : '#5a6b64'}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveText}>保存して追加</Text>
        </Pressable>
        <View style={styles.subRow}>
          <Pressable style={styles.skipBtn} onPress={onCancel}>
            <Text style={[styles.skipText, dark && { color: DARK.label }]}>キャンセル</Text>
          </Pressable>
          <Pressable style={styles.skipBtn} onPress={onSkip}>
            <Text style={[styles.skipText, dark && { color: DARK.label }]}>締切なしで追加</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30, gap: 10 },
  course: { fontSize: 12, color: COLORS.emeraldDark, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#123', lineHeight: 24 },
  hint: { fontSize: 12, color: '#5a6b64' },
  error: { color: '#c0392b', fontSize: 13 },
  saveBtn: { backgroundColor: COLORS.cta, borderRadius: 14, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  subRow: { flexDirection: 'row' },
  skipBtn: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#5a6b64', fontSize: 14, fontWeight: '600' },
})
