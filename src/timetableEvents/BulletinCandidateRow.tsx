import { View, Pressable, StyleSheet } from 'react-native'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { COLORS } from '../theme'
import { candidateToClassEvent, type CandidateView } from './bulletinEvents'
import { cellBadgeText } from './eventLabels'

/**
 * 掲示由来の予定候補1件の行（タグ「掲示より」＋内容＋状態別の右側要素）。
 * 科目詳細画面「各回の予定」と掲示詳細画面の両方から使う共有プレゼンテーション部品。
 */
export default function BulletinCandidateRow(props: {
  view: CandidateView
  onAdd: () => void
  onAppendMakeup: () => void
}) {
  const { view: v, onAdd, onAppendMakeup } = props
  const ui = useUi()
  return (
    <View style={styles.candRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.candHead}>
          <View style={[styles.candTag, { backgroundColor: ui.pillBg }]}>
            <Text style={[styles.candTagText, { color: ui.pillText }]}>掲示より</Text>
          </View>
          <Text style={[styles.eventText, { color: ui.valueColor }]} numberOfLines={1}>
            {cellBadgeText(candidateToClassEvent(v.candidate, v.candidate.sourceBulletinId))}
          </Text>
        </View>
        <Text style={[styles.eventSub, { color: ui.labelColor }]}>
          {v.candidate.date} ・ {v.candidate.periods.join('・')}限
          {v.candidate.makeup ? ` ・ 補講 ${v.candidate.makeup.date}` : ''}
        </Text>
      </View>
      {v.state === 'added' ? (
        <Text style={[styles.candDone, { color: ui.labelColor }]}>追加済み</Text>
      ) : v.state === 'makeupAppend' ? (
        <Pressable style={styles.candBtn} onPress={onAppendMakeup}>
          <Text style={styles.candBtnText}>補講を追記</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.candBtn} onPress={onAdd}>
          <Text style={styles.candBtnText}>追加</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  candRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.emerald,
    borderStyle: 'dashed',
  },
  candHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  candTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  candTagText: { fontSize: 10, fontWeight: '800' },
  eventText: { fontSize: 14, fontWeight: '600' },
  eventSub: { fontSize: 12, marginTop: 2 },
  candDone: { fontSize: 12, fontWeight: '700' },
  candBtn: { backgroundColor: COLORS.emerald, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  candBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
})
