import { useState, type ComponentProps, type ReactNode } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { PressableRow } from '../ui/Pressable'
import { RADIUS, SPACE, TYPE } from '../ui/scale'
import { COLORS } from '../theme'
import type { TodayScheduleItem } from '../timetableEvents/eventSelectors'
import { eventTypeLabel } from '../timetableEvents/eventLabels'
import type { ExamCountdownItem } from './examCountdown'
import { computeTileRows } from './tileLayout'

type IconName = ComponentProps<typeof Ionicons>['name']

/**
 * ホーム「クイックタイル」セクション。旧8セクション（今日の変更・LETUS新着・試験カウントダウン・
 * CLASS掲示・直近の締切・このあとの授業・出席登録・インフォ）を1つのグループへ統合し、横長2種＋
 * 半幅6種の固定割付（computeTileRows）で並べる（設計書
 * docs/superpowers/specs/2026-09-18-home-cognitive-load-design.md）。
 * データ取得・ナビゲーション判断は呼び出し側（HomeScreen）が担い、ここは受け取ったpropsを
 * 組み立てて描画するだけ。
 */
export type QuickTilesSectionProps = {
  /** 今日の変更（横長）。0件ならタイルごと非表示。 */
  todayItems: TodayScheduleItem[]
  /** LETUS新着（横長・直近1件のプレビュー＋件数に圧縮）。0件ならタイルごと非表示。 */
  newsRows: { url: string; name: string; count: number; latestTitle: string; latestAt: number }[]
  newsTotal: number
  onPressNews: (r: { url: string; name: string }) => void
  /** 試験カウントダウン（半幅・直近1件＋展開）。0件ならタイルごと非表示。 */
  countdownItems: ExamCountdownItem[]
  onPressCountdown: (item: ExamCountdownItem) => void
  /** CLASS掲示（半幅・件数のみ）。常に表示（0件でも空状態文言を出す）。 */
  bulletinCount: number
  bulletinEmptyText: string
  onPressBulletin: () => void
  /** 直近の締切（半幅・件数のみ）。0件ならタイルごと非表示。 */
  deadlineCount: number
  onPressDeadlines: () => void
  /** このあとの授業（半幅・件数のみ）。0件ならタイルごと非表示。 */
  laterClassesCount: number
  onPressLaterClasses: () => void
  /** 出席登録（半幅・常設ショートカット）。常に表示。 */
  attendanceSubtitle: string
  onPressAttendance: () => void
  /** インフォ（半幅・常設ショートカット）。常に表示。 */
  onPressInfo: () => void
}

type TileMeta = { key: string; wide: boolean }
type Tile = TileMeta & { node: ReactNode }

/** どのタイルが今日存在するか＋横長/半幅だけを決める（中身は作らない）。中身は伸び判定が
 * 出そろってから renderTileNode で作る＝手動改行を伸びた日だけ外せるようにするため。 */
function buildTileMeta(props: QuickTilesSectionProps): TileMeta[] {
  const tiles: (TileMeta | null)[] = [
    props.todayItems.length > 0 ? { key: 'todayChanges', wide: true } : null,
    props.newsRows.length > 0 ? { key: 'letusNews', wide: true } : null,
    props.countdownItems.length > 0 ? { key: 'examCountdown', wide: false } : null,
    { key: 'bulletins', wide: false },
    props.deadlineCount > 0 ? { key: 'deadlines', wide: false } : null,
    props.laterClassesCount > 0 ? { key: 'laterClasses', wide: false } : null,
    { key: 'attendance', wide: false },
    { key: 'info', wide: false },
  ]
  return tiles.filter((t): t is TileMeta => t !== null)
}

// 手動改行が要るか判定するための実寸見積り。列幅＝画面幅 - 両端余白(SPACE.s4×2)を、伸びていない
// 半幅タイルなら2枚+タイル間隙(SPACE.s2)で割り、伸びた（単独行の）タイルならそのまま使う。
// そこからタイル自身の内側余白(ui.cardのpadding=14×2)・アイコン幅(36)・アイコンと文字の間隙(SPACE.s2)
// を引いたものが、文字を置ける実際の幅。全角(CJK)前提で1文字≈フォントサイズ(px)と見積る
// （実機実測: 15pt×7字=105pt が 390pt級の半幅列とほぼ一致・詳細はexam/laterClassesの各コメント）。
// 見積りには8%の余裕を持たせ、境界付近では改行する側に倒す（孤立1文字より、余白が少し多い方がまし）。
const TILE_CARD_PADDING = 14
const TILE_ICON_WIDTH = 36

function halfTileTextColumnWidth(windowWidth: number, stretched: boolean): number {
  const outer = windowWidth - SPACE.s4 * 2
  const columnOuter = stretched ? outer : (outer - SPACE.s2) / 2
  return columnOuter - TILE_CARD_PADDING * 2 - TILE_ICON_WIDTH - SPACE.s2
}

function fitsOneLine(text: string, fontSize: number, windowWidth: number, stretched: boolean): boolean {
  const required = [...text].length * fontSize * 1.08
  return required <= halfTileTextColumnWidth(windowWidth, stretched)
}

/** 半幅タイルのうち、その日は自分が奇数の余りで単独行へ伸びている（＝横長として描画される）か。
 * 伸びていなくても、実際の列幅（端末幅から算出）に文字が収まるなら手動改行は使わない。 */
function renderTileNode(key: string, stretched: boolean, windowWidth: number, props: QuickTilesSectionProps): ReactNode {
  switch (key) {
    case 'todayChanges':
      return <TodayChangesTile items={props.todayItems} />
    case 'letusNews':
      return (
        <LetusNewsTile
          top={props.newsRows[0]}
          total={props.newsTotal}
          onPress={() => props.onPressNews(props.newsRows[0])}
        />
      )
    case 'examCountdown':
      return <ExamCountdownTile items={props.countdownItems} onPressItem={props.onPressCountdown} />
    case 'bulletins':
      return (
        <HalfTile
          icon="megaphone-outline"
          title="CLASS掲示"
          subtitle={props.bulletinCount > 0 ? `未読${props.bulletinCount}件` : props.bulletinEmptyText}
          onPress={props.onPressBulletin}
        />
      )
    case 'deadlines':
      return (
        <HalfTile
          icon="alert-circle-outline"
          title="直近の締切"
          subtitle={`${props.deadlineCount}件`}
          onPress={props.onPressDeadlines}
        />
      )
    case 'laterClasses':
      return (
        <HalfTile
          icon="time-outline"
          // 実際の列幅に「このあとの授業」(7字・15pt)が収まるなら改行しない。収まらない狭い端末
          // （390pt級）では自然折り返しだと「授/業」と1字孤立するため語で改行する。
          title={fitsOneLine('このあとの授業', 15, windowWidth, stretched) ? 'このあとの授業' : 'このあとの\n授業'}
          subtitle={`${props.laterClassesCount}件`}
          onPress={props.onPressLaterClasses}
        />
      )
    case 'attendance':
      return (
        <HalfTile
          icon="flash-outline"
          title="出席登録"
          subtitle={props.attendanceSubtitle}
          onPress={props.onPressAttendance}
        />
      )
    case 'info':
      return (
        <HalfTile
          icon="newspaper-outline"
          title="インフォ"
          // laterClassesと同じ理由。「学食・キャンパス情報」(10字・12pt)が実際の列幅に収まらない
          // 場合だけ、語中で折れる自然折り返し（「…情」/「報」）を避けて語で改行する。
          subtitle={
            fitsOneLine('学食・キャンパス情報', 12, windowWidth, stretched)
              ? '学食・キャンパス情報'
              : '学食・キャンパス\n情報'
          }
          onPress={props.onPressInfo}
        />
      )
    default:
      return null
  }
}

export default function QuickTilesSection(props: QuickTilesSectionProps) {
  const { width: windowWidth } = useWindowDimensions()
  const meta = buildTileMeta(props)
  if (meta.length === 0) return null

  // 1回目: 横長/半幅の並びだけで行割付し、半幅のうち単独行（＝奇数の余りで伸びた）タイルを特定する。
  const metaRows = computeTileRows(meta.map((t) => ({ wide: t.wide, item: t })))
  const stretchedKeys = new Set(metaRows.filter((row) => row.length === 1 && !row[0].wide).map((row) => row[0].key))

  const tiles: Tile[] = meta.map((t) => ({
    ...t,
    node: renderTileNode(t.key, stretchedKeys.has(t.key), windowWidth, props),
  }))
  // 2回目: 実際に描画するタイル（伸び判定込みの中身）で同じ並びを行割付する。wideの並びは不変なので
  // 行の切れ目は1回目と必ず一致する。
  const rows = computeTileRows(tiles.map((t) => ({ wide: t.wide, item: t })))

  return (
    <>
      {rows.map((row, i) => (
        <View key={row.map((t) => t.key).join('-')} style={i > 0 ? qtStyles.gapTop : undefined}>
          {row.length === 2 ? (
            <View style={qtStyles.tileRow}>
              {row.map((t) => (
                <View key={t.key} style={qtStyles.halfSlot}>
                  {t.node}
                </View>
              ))}
            </View>
          ) : (
            row[0].node
          )}
        </View>
      ))}
    </>
  )
}

/** 今日の変更（横長）。休講/補講/教室変更/小テスト等を1件ずつ列挙する。現行HomeScreen.tsxの
 * todayChangesセクションと同一内容・同一スタイル値をこのファイルへ移設したもの。 */
function TodayChangesTile({ items }: { items: TodayScheduleItem[] }) {
  const ui = useUi()
  return (
    <View style={ui.card}>
      <View style={qtStyles.cardHead}>
        <Text style={[qtStyles.cardHeadLabel, { color: ui.labelColor }]}>今日の変更</Text>
      </View>
      <View style={qtStyles.todayGroup}>
        {items.map((it, i) => (
          <View key={`te-${i}`} style={qtStyles.todayEvRow}>
            <View
              style={[
                qtStyles.todayEvTag,
                {
                  backgroundColor:
                    it.kind === 'cancel' || it.kind === 'roomChange' ? ui.colors.info : (EVENT_TONE[it.kind] ?? COLORS.eventNeutral),
                },
              ]}
            >
              <Text
                style={[
                  qtStyles.todayEvTagText,
                  { color: it.kind === 'cancel' || it.kind === 'roomChange' ? ui.pick(COLORS.white, COLORS.white, COLORS.ink) : COLORS.white },
                ]}
              >
                {eventTypeLabel(it.kind)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[qtStyles.todayEvTitle, { color: ui.valueColor }]} numberOfLines={1}>
                {it.courseName}
              </Text>
              <Text style={[qtStyles.todayEvSub, { color: ui.labelColor }]} numberOfLines={1}>
                {eventSubText(it)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

// 今日の予定タグの色（タイプ別）。旧HomeScreen.tsxの同名定数をそのまま移設。
const EVENT_TONE: Record<string, string> = {
  makeup: COLORS.cta,
  quiz: COLORS.eventQuiz,
  midterm: COLORS.eventExam,
  final: COLORS.eventExam,
  other: COLORS.eventNeutral,
}

/** 今日の予定1件のサブ行（時限＋教室/補足）。教室変更は「→ 教室」、それ以外は「・ 教室」で付す。
 * 旧HomeScreen.tsxの同名関数をそのまま移設。 */
function eventSubText(it: TodayScheduleItem): string {
  const base = `${it.periods.join('・')}限`
  const room = it.room ? (it.kind === 'roomChange' ? ` → ${it.room}` : ` ・ ${it.room}`) : ''
  const note = it.note ? ` ・ ${it.note}` : ''
  return `${base}${room}${note}`
}

/** LETUS新着（横長）。直近1件のプレビュー＋総件数に圧縮する（現行は全件列挙）。 */
function LetusNewsTile({
  top,
  total,
  onPress,
}: {
  top: { name: string; latestTitle: string }
  total: number
  onPress: () => void
}) {
  const ui = useUi()
  return (
    <PressableRow style={[ui.card]} onPress={onPress} accessibilityRole="button">
      <View style={qtStyles.cardHead}>
        <Text style={[qtStyles.cardHeadLabel, { color: ui.labelColor }]}>LETUS新着</Text>
        <View style={[qtStyles.countPill, { backgroundColor: ui.pillBg }]}>
          <Text style={[qtStyles.countPillText, { color: ui.pillText }]}>{total}件</Text>
        </View>
      </View>
      <Text style={[qtStyles.newsTitle, { color: ui.valueColor }]} numberOfLines={1}>
        {top.name || 'LETUSコース'}
      </Text>
      <Text style={[qtStyles.newsSub, { color: ui.labelColor }]} numberOfLines={1}>
        {top.latestTitle}
      </Text>
    </PressableRow>
  )
}

/** 試験カウントダウン（半幅）。直近1件を表示し、残りがあれば「ほかN件を表示」で展開する。
 * 半幅の狭さに合わせ、固定幅の日数ボックスとchevronを持たない縦積みの独自レイアウト
 * （日数ボックス＋種別・日付／タイトル／補足）。行の描画はこのコンポーネント内で完結する。 */
function ExamCountdownTile({
  items,
  onPressItem,
}: {
  items: ExamCountdownItem[]
  onPressItem: (item: ExamCountdownItem) => void
}) {
  const ui = useUi()
  const [expanded, setExpanded] = useState(false)

  const toneColors = (tone: ExamCountdownItem['tone']) =>
    tone === 'red'
      ? { fg: ui.colors.danger, bg: ui.colors.dangerBg }
      : tone === 'amber'
        ? { fg: ui.colors.warn, bg: ui.colors.warnBg }
        : { fg: ui.valueColor, bg: ui.softBoxBg }

  const [first, ...rest] = items
  const visible = expanded ? items : [first]

  return (
    <View style={[ui.card, qtStyles.examCard]}>
      <Text style={[qtStyles.examHead, { color: ui.labelColor }]}>試験カウントダウン</Text>
      {visible.map((it, i) => {
        const tone = toneColors(it.tone)
        return (
          <PressableRow
            key={it.eventId}
            onPress={() => onPressItem(it)}
            accessibilityRole="button"
            accessibilityLabel={`${it.daysLabel} ${it.typeLabel} ${it.title} ${it.dateLabel}`}
            style={[qtStyles.examRow, i > 0 && { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
          >
            <View style={qtStyles.examTopLine}>
              <View style={[qtStyles.examDaysBox, { backgroundColor: tone.bg }]}>
                <Text style={[qtStyles.examDaysText, { color: tone.fg }]} numberOfLines={1}>
                  {it.daysLabel}
                </Text>
              </View>
              <Text style={[qtStyles.examMeta, { color: ui.labelColor }]}>
                {it.typeLabel} {it.dateLabel}
              </Text>
            </View>
            <Text style={[qtStyles.examTitle, { color: ui.valueColor }]} numberOfLines={2}>
              {it.title}
            </Text>
            {it.subtitle ? (
              <Text style={[qtStyles.examSubtitle, { color: ui.labelColor }]} numberOfLines={1}>
                {it.subtitle}
              </Text>
            ) : null}
          </PressableRow>
        )
      })}
      {rest.length > 0 ? (
        <PressableRow
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? '閉じる' : `ほか${rest.length}件を表示`}
          style={[qtStyles.examMoreRow, { borderTopWidth: 1, borderTopColor: ui.dividerColor }]}
        >
          <Text style={[qtStyles.examMoreText, { color: ui.accentSoft }]}>
            {expanded ? '閉じる' : `ほか${rest.length}件を表示`}
          </Text>
        </PressableRow>
      ) : null}
    </View>
  )
}

/** 半幅タイルの共通形（アイコン＋太字の名称＋小さい副題）。名称は最大2行・副題は最大3行まで、半幅の狭さに合わせて折り返す。
 * 行内の2枚の高さを揃えるため flexGrow を持つ（スロットの高さまで伸びる）。chevronは狭い幅を優先して置かない。 */
function HalfTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName
  title: string
  subtitle: string
  onPress: () => void
}) {
  const ui = useUi()
  return (
    <PressableRow style={[ui.card, qtStyles.halfTile]} onPress={onPress} accessibilityRole="button">
      <View style={[qtStyles.tileIcon, { backgroundColor: ui.pillBg }]}>
        <Ionicons name={icon} size={20} color={ui.accent} />
      </View>
      <View style={qtStyles.halfTileBody}>
        <Text style={[qtStyles.halfTileTitle, { color: ui.valueColor }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[qtStyles.halfTileSub, { color: ui.labelColor }]} numberOfLines={3}>
          {subtitle}
        </Text>
      </View>
    </PressableRow>
  )
}

const qtStyles = StyleSheet.create({
  tileRow: { flexDirection: 'row', gap: SPACE.s2 },
  halfSlot: { flex: 1, minWidth: 0 },
  gapTop: { marginTop: SPACE.s2 },

  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.s2 },
  cardHeadLabel: { ...TYPE.label, letterSpacing: 0.3 },
  countPill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.s2, paddingVertical: 1 },
  countPillText: { ...TYPE.caption, fontWeight: '700' },

  todayGroup: { gap: SPACE.s2, paddingVertical: SPACE.s3 },
  todayEvRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  todayEvTag: { borderRadius: RADIUS.md, paddingHorizontal: SPACE.s2, paddingVertical: 3, minWidth: 52, alignItems: 'center' },
  todayEvTagText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  todayEvTitle: { fontSize: 14, fontWeight: '600' },
  todayEvSub: { fontSize: 12, marginTop: 1 },

  newsTitle: { ...TYPE.dense, marginTop: 2 },
  newsSub: { ...TYPE.caption, marginTop: 2 },

  tileIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },

  halfTile: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, flexGrow: 1 },
  halfTileBody: { flex: 1, minWidth: 0 },
  halfTileTitle: { fontSize: 15, fontWeight: '600' },
  halfTileSub: { fontSize: 12, marginTop: 2 },

  examCard: { flexGrow: 1 },
  examHead: { ...TYPE.caption, fontWeight: '500', marginBottom: SPACE.s1 },
  examRow: { paddingVertical: SPACE.s2, gap: 2 },
  examTopLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACE.s2, rowGap: 2 },
  examDaysBox: { borderRadius: RADIUS.md, paddingHorizontal: SPACE.s2, paddingVertical: 2 },
  examDaysText: { ...TYPE.dense, fontWeight: '700' },
  examMeta: { ...TYPE.caption, flexShrink: 1 },
  examTitle: { ...TYPE.dense },
  examSubtitle: { ...TYPE.caption },
  examMoreRow: { paddingVertical: SPACE.s2 },
  examMoreText: { ...TYPE.caption, fontWeight: '700' },
})
