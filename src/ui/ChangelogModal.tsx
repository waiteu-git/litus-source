import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { useUi } from './screen'
import { sortChangelogDesc, type ChangelogEntry } from '../changelog'

/** 変更履歴の全件表示（下からのスライドシート）。 */
export default function ChangelogModal({
  visible,
  entries,
  onClose,
}: {
  visible: boolean
  entries: ChangelogEntry[]
  onClose: () => void
}) {
  const ui = useUi()
  const sorted = sortChangelogDesc(entries)
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/* 地色は不透明トークン。翠のcardBg(半透明ガラス)は画面グラデ地の上に置く前提で、
          他画面コンテンツの上に敷く全画面シートでは下が透けて可読性が落ちる。 */}
      <View style={[styles.sheet, { backgroundColor: ui.colors.screenSolid, borderColor: ui.colors.cardBorder }]}>
        <View style={styles.headRow}>
          <Text style={[styles.headTitle, { color: ui.heading }]}>変更履歴</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.close, { color: ui.labelColor }]}>閉じる</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {sorted.map((entry) => (
            <View key={entry.build} style={styles.entry}>
              <Text style={[styles.entryTitle, { color: ui.valueColor }]}>
                build {entry.build}（{entry.date}）
              </Text>
              {entry.items.map((item, i) => (
                <Text key={i} style={[styles.item, { color: ui.labelColor }]}>
                  ・{item}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, padding: 18 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headTitle: { fontSize: 17, fontWeight: '700' },
  close: { fontSize: 14, fontWeight: '600' },
  scrollContent: { paddingBottom: 30 },
  entry: { marginBottom: 16 },
  entryTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  item: { fontSize: 13, lineHeight: 19 },
})
