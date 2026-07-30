import { StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { PressableRow } from '../ui/Pressable'
import { RADIUS, SPACE, TYPE } from '../ui/scale'
import type { ExamCountdownItem } from './examCountdown'

/**
 * ホーム「試験カウントダウン」カード。手動登録の試験（小テスト/中間/期末）を残り日数で大きく見せる。
 * 課題の締切はここに混ぜない（従来どおり「直近の締切」セクションが担う・2026-07-24裁定）。
 * 並びと候補条件は buildExamCountdown が単独で決める＝ここは描画のみ。
 *
 * デザイン規約: 同種反復の行なので個別カード化せずフラット行＋区切り線。意味色は「異常＝色」の原則で
 * 本日=danger / 3日以内=warn / それ以遠は無彩色。色は単独で意味を担わせず、必ずアイコン＋文言を併用する。
 */
export default function ExamCountdownCard({
  items,
  onPressItem,
}: {
  items: ExamCountdownItem[]
  onPressItem: (item: ExamCountdownItem) => void
}) {
  const ui = useUi()
  // 対象0件ならセクションごと描画しない（他セクションと同じ挙動）。
  if (items.length === 0) return null

  const toneColors = (tone: ExamCountdownItem['tone']) =>
    tone === 'red'
      ? { fg: ui.colors.danger, bg: ui.colors.dangerBg }
      : tone === 'amber'
        ? { fg: ui.colors.warn, bg: ui.colors.warnBg }
        : { fg: ui.valueColor, bg: ui.softBoxBg }

  return (
    <View style={ui.card}>
      <View style={styles.head}>
        <Text style={[styles.headLabel, { color: ui.labelColor }]}>試験カウントダウン</Text>
        <View style={[styles.countPill, { backgroundColor: ui.pillBg }]}>
          <Text style={[styles.countPillText, { color: ui.pillText }]}>{items.length}件</Text>
        </View>
      </View>
      {items.map((it, i) => {
        const tone = toneColors(it.tone)
        return (
          <PressableRow
            key={it.eventId}
            onPress={() => onPressItem(it)}
            accessibilityRole="button"
            accessibilityLabel={`${it.daysLabel} ${it.typeLabel} ${it.title} ${it.dateLabel}`}
            style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
          >
            {/* 残り日数（このカードの主役）。トーン付きの面＋文言で、色が読めなくても日数が伝わる。 */}
            <View style={[styles.daysBox, { backgroundColor: tone.bg }]}>
              <Text style={[styles.daysText, { color: tone.fg }]} numberOfLines={1}>
                {it.daysLabel}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.metaRow}>
                <Ionicons name="school-outline" size={13} color={ui.labelColor} />
                <Text style={[styles.typeLabel, { color: ui.labelColor }]}>{it.typeLabel}</Text>
                <Text style={[styles.dateLabel, { color: ui.labelColor }]} numberOfLines={1}>
                  {it.dateLabel}
                </Text>
              </View>
              <Text style={[styles.title, { color: ui.valueColor }]} numberOfLines={1}>
                {it.title}
              </Text>
              {it.subtitle ? (
                <Text style={[styles.subtitle, { color: ui.labelColor }]} numberOfLines={1}>
                  {it.subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={ui.chevron} />
          </PressableRow>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.s2 },
  headLabel: { ...TYPE.label, letterSpacing: 0.3 },
  countPill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.s2, paddingVertical: 1 },
  countPillText: { ...TYPE.caption, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s2 },
  // 残り日数の面。行ごとに幅が変わると左端が揃わないので固定幅（「残り100日」まで収まる幅）。
  daysBox: { width: 92, borderRadius: RADIUS.md, paddingHorizontal: SPACE.s1, paddingVertical: SPACE.s1 + 2, alignItems: 'center', justifyContent: 'center' },
  daysText: { ...TYPE.title },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1 },
  typeLabel: { ...TYPE.caption, fontWeight: '700' },
  dateLabel: { ...TYPE.caption, marginLeft: SPACE.s1 },
  title: { ...TYPE.dense, marginTop: 2 },
  subtitle: { ...TYPE.caption, marginTop: 2 },
})
