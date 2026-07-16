import { useState } from 'react'
import { Pressable, StyleSheet, Switch, View } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Text } from '../ui/Text'
import { COLORS, DARK } from '../theme'
import { useUi } from '../ui/screen'
import {
  dateToDeadlineDateString,
  dateToDeadlineTimeString,
  deadlineValueToDate,
} from './deadlinePickerValue'

export type DeadlineValue = { noDeadline: boolean; date: string; time: string }

function dateStr(d: Date) { return dateToDeadlineDateString(d) }
function addDays(base: Date, days: number) { return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days) }

/**
 * 締切の入力欄。日付・時刻はテキスト入力ではなくネイティブピッカー
 * （Material日付カレンダー／時刻ダイアル）で選ぶ。DeadlineValue の形は従来どおり
 * 文字列（"YYYY/MM/DD"・"HH:mm"）なので呼び出し側（3画面）は無改修。
 */
export default function DeadlineFields({
  value, onChange, valueColor, labelColor,
}: {
  value: DeadlineValue
  onChange: (v: DeadlineValue) => void
  valueColor: string
  labelColor: string
}) {
  const ui = useUi()
  const [picker, setPicker] = useState<'date' | 'time' | null>(null)
  const fieldStyle = { backgroundColor: ui.inputBg, borderColor: ui.colors.inputBorder }
  const placeholderColor = ui.dark ? DARK.label : '#9aa8a2' // design-allow 旧TextInput時代のプレースホルダ色を踏襲
  const chipStyle = ui.dark ? { backgroundColor: DARK.softBox, borderColor: DARK.inputBorder } : null
  const chipText = ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark
  const setPreset = (days: number) => onChange({ ...value, noDeadline: false, date: dateStr(addDays(new Date(), days)) })

  function onPicked(event: DateTimePickerEvent, d: Date | undefined) {
    const which = picker
    // Androidはダイアログを閉じるたびにonChangeが来る。先に閉じてから反映（再表示ループ防止）。
    setPicker(null)
    if (event.type !== 'set' || !d || !which) return
    if (which === 'date') onChange({ ...value, noDeadline: false, date: dateToDeadlineDateString(d) })
    else onChange({ ...value, noDeadline: false, time: dateToDeadlineTimeString(d) })
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rowBetween}>
        <Text style={[styles.label, { color: labelColor }]}>締切あり</Text>
        <Switch
          value={!value.noDeadline}
          onValueChange={(v) => onChange({ ...value, noDeadline: !v })}
          trackColor={{ true: COLORS.emerald, false: ui.pick(ui.colors.softBoxBg, ui.colors.softBoxBg, ui.colors.inputBorder) }}
          thumbColor={COLORS.white}
        />
      </View>
      {!value.noDeadline ? (
        <>
          <View style={styles.presetRow}>
            <Preset label="今日" onPress={() => setPreset(0)} chipStyle={chipStyle} chipText={chipText} />
            <Preset label="明日" onPress={() => setPreset(1)} chipStyle={chipStyle} chipText={chipText} />
            <Preset label="1週間後" onPress={() => setPreset(7)} chipStyle={chipStyle} chipText={chipText} />
          </View>
          <View style={styles.dtRow}>
            <Pressable
              style={[styles.field, styles.dtDate, fieldStyle]}
              onPress={() => setPicker('date')}
              accessibilityRole="button"
              accessibilityLabel="締切の日付を選択"
            >
              <Text style={[styles.fieldText, { color: value.date ? valueColor : placeholderColor }]}>
                {value.date || '日付を選択'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.field, styles.dtTime, fieldStyle]}
              onPress={() => setPicker('time')}
              accessibilityRole="button"
              accessibilityLabel="締切の時刻を選択"
            >
              <Text style={[styles.fieldText, { color: value.time ? valueColor : placeholderColor }]}>
                {value.time || '23:59'}
              </Text>
            </Pressable>
          </View>
          {picker ? (
            <DateTimePicker
              value={deadlineValueToDate(value, new Date())}
              mode={picker}
              is24Hour
              onChange={onPicked}
            />
          ) : null}
        </>
      ) : (
        <Text style={[styles.noDl, { color: labelColor }]}>締切を設定しません</Text>
      )}
    </View>
  )
}

function Preset({
  label,
  onPress,
  chipStyle,
  chipText,
}: {
  label: string
  onPress: () => void
  chipStyle: { backgroundColor: string; borderColor: string } | null
  chipText: string
}) {
  return (
    <Pressable style={[styles.preset, chipStyle]} onPress={onPress}>
      <Text style={[styles.presetText, { color: chipText }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  presetRow: { flexDirection: 'row', gap: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#cfe0d9' },
  presetText: { fontSize: 12, color: COLORS.emeraldDark, fontWeight: '600' },
  dtRow: { flexDirection: 'row', gap: 8 },
  dtDate: { flex: 2 },
  dtTime: { flex: 1 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'center' },
  fieldText: { fontSize: 15 },
  noDl: { fontSize: 13 },
})
