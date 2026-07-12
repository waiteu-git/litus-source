import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { COLORS, DARK } from '../theme'
import { useUi } from '../ui/screen'

export type DeadlineValue = { noDeadline: boolean; date: string; time: string }

function pad2(n: number) { return String(n).padStart(2, '0') }
function dateStr(d: Date) { return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` }
function addDays(base: Date, days: number) { return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days) }

export default function DeadlineFields({
  value, onChange, valueColor, labelColor,
}: {
  value: DeadlineValue
  onChange: (v: DeadlineValue) => void
  valueColor: string
  labelColor: string
}) {
  const ui = useUi()
  const inputStyle = { backgroundColor: ui.inputBg, borderColor: ui.colors.inputBorder }
  const placeholderColor = ui.dark ? DARK.label : '#9aa8a2'
  const chipStyle = ui.dark ? { backgroundColor: DARK.softBox, borderColor: DARK.inputBorder } : null
  const chipText = ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark
  const setPreset = (days: number) => onChange({ ...value, noDeadline: false, date: dateStr(addDays(new Date(), days)) })
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rowBetween}>
        <Text style={[styles.label, { color: labelColor }]}>締切</Text>
        <Pressable onPress={() => onChange({ ...value, noDeadline: !value.noDeadline })} style={[styles.toggle, chipStyle]}>
          <Text style={[styles.toggleText, value.noDeadline && { color: chipText }]}>締切なし</Text>
        </Pressable>
      </View>
      {!value.noDeadline ? (
        <>
          <View style={styles.presetRow}>
            <Preset label="今日" onPress={() => setPreset(0)} chipStyle={chipStyle} chipText={chipText} />
            <Preset label="明日" onPress={() => setPreset(1)} chipStyle={chipStyle} chipText={chipText} />
            <Preset label="1週間後" onPress={() => setPreset(7)} chipStyle={chipStyle} chipText={chipText} />
          </View>
          <View style={styles.dtRow}>
            <TextInput
              style={[styles.input, styles.dtDate, inputStyle, { color: valueColor }]}
              value={value.date}
              onChangeText={(t) => onChange({ ...value, date: t })}
              placeholder="2026/07/15"
              placeholderTextColor={placeholderColor}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[styles.input, styles.dtTime, inputStyle, { color: valueColor }]}
              value={value.time}
              onChangeText={(t) => onChange({ ...value, time: t })}
              placeholder="23:59"
              placeholderTextColor={placeholderColor}
              keyboardType="numbers-and-punctuation"
            />
          </View>
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
  toggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#eef5f2' },
  toggleText: { fontSize: 12, color: '#7c8b85', fontWeight: '600' },
  toggleOn: { color: COLORS.emeraldDark },
  presetRow: { flexDirection: 'row', gap: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#eef5f2', borderWidth: 1, borderColor: '#cfe0d9' },
  presetText: { fontSize: 12, color: COLORS.emeraldDark, fontWeight: '600' },
  dtRow: { flexDirection: 'row', gap: 8 },
  dtDate: { flex: 2 },
  dtTime: { flex: 1 },
  input: { backgroundColor: '#f1f8f5', borderWidth: 1, borderColor: '#cfe0d9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  noDl: { fontSize: 13 },
})
