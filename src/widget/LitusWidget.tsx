/**
 * ウィジェットの描画（react-native-android-widget の宣言的プリミティブ）。静止ビットマップに焼かれるため
 * アニメ・スクロール不可。既存 UI/motion は流用せず、翠テーマ色トークン（constants）で組む。
 * 「何を出すか」は viewModel.buildWidgetModel（純関数・テスト済み）が決め、ここは配置だけを担う。
 */
import * as React from 'react'
import { FlexWidget, TextWidget } from 'react-native-android-widget'
import type { WidgetModel } from './viewModel'
import { WIDGET_COLORS as C } from './constants'

/** litus:// ディープリンク（OPEN_URI）。タップで OS がアプリを起動→widgetLinking が遷移。 */
function uri(u: string) {
  return { clickAction: 'OPEN_URI', clickActionData: { uri: u } as Record<string, unknown> }
}

const ATTENDANCE_URI = 'litus://attendance'
const TIMETABLE_URI = 'litus://timetable'
const HOME_URI = 'litus://home'

function assignmentUri(url: string) {
  return `litus://assignment?url=${encodeURIComponent(url)}`
}

function RemoteBadge() {
  return (
    <FlexWidget
      style={{
        backgroundColor: C.remoteBadgeBg,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
      }}
    >
      <TextWidget text="遠隔" style={{ fontSize: 10, color: C.onDark, fontWeight: '700' }} />
    </FlexWidget>
  )
}

/** 次の授業カード（白地）。授業中/出席済みは出席画面へ、そうでなければ時間割へ飛ばす。 */
function NextClassCard({ model }: { model: WidgetModel }) {
  const nc = model.nextClass
  const target = model.attendance.state !== 'idle' ? ATTENDANCE_URI : TIMETABLE_URI

  if (!nc) {
    return (
      <FlexWidget
        style={{ backgroundColor: C.card, borderRadius: 12, padding: 12, width: 'match_parent' }}
        {...uri(TIMETABLE_URI)}
      >
        <TextWidget text="今日の授業は終わりました" style={{ fontSize: 13, color: C.cardSub }} />
      </FlexWidget>
    )
  }

  const badge =
    model.attendance.state === 'done'
      ? '出席済み'
      : model.attendance.state === 'open'
        ? '出席受付中かも'
        : nc.minutesUntil === null
          ? '進行中'
          : `あと${nc.minutesUntil}分`

  return (
    <FlexWidget
      style={{ backgroundColor: C.card, borderRadius: 12, padding: 12, width: 'match_parent' }}
      {...uri(target)}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget
          text={`${nc.period}限 ${nc.startText}`}
          style={{ fontSize: 12, color: C.accent, fontWeight: '700' }}
        />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={badge} style={{ fontSize: 12, color: C.cardSub, fontWeight: '600' }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, width: 'match_parent' }}>
        <TextWidget
          text={nc.name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 17, color: C.cardInk, fontWeight: '700' }}
        />
        {nc.isRemote ? <RemoteBadge /> : <FlexWidget />}
      </FlexWidget>
      {nc.room ? (
        <TextWidget text={nc.room} maxLines={1} truncate="END" style={{ fontSize: 12, color: C.cardSub, marginTop: 2 }} />
      ) : (
        <FlexWidget />
      )}
    </FlexWidget>
  )
}

function LaterClasses({ model }: { model: WidgetModel }) {
  if (model.laterClasses.length === 0) return <FlexWidget />
  return (
    <FlexWidget style={{ marginTop: 8, width: 'match_parent' }} {...uri(TIMETABLE_URI)}>
      {model.laterClasses.map((c, i) => (
        <FlexWidget
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: i === 0 ? 0 : 2, width: 'match_parent' }}
        >
          <TextWidget text={`${c.period}限`} style={{ fontSize: 11, color: C.onDarkDim, fontWeight: '700' }} />
          <TextWidget
            text={` ${c.name}`}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, color: C.onDark, marginLeft: 4 }}
          />
          <FlexWidget style={{ flex: 1 }} />
          <TextWidget text={c.startText} style={{ fontSize: 11, color: C.onDarkDim }} />
        </FlexWidget>
      ))}
    </FlexWidget>
  )
}

function AssignmentPill({ model }: { model: WidgetModel }) {
  const a = model.nearestAssignment
  if (!a) return <FlexWidget />
  return (
    <FlexWidget
      style={{
        marginTop: 8,
        backgroundColor: a.urgent ? C.dangerBg : C.card,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        width: 'match_parent',
      }}
      {...uri(assignmentUri(a.url))}
    >
      <TextWidget
        text={a.deadlineText}
        style={{ fontSize: 11, color: a.urgent ? C.danger : C.accent, fontWeight: '700' }}
      />
      <TextWidget
        text={` ${a.title}`}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, color: C.cardInk, marginLeft: 4 }}
      />
    </FlexWidget>
  )
}

/** 4x2 主役ウィジェット: 日付・次の授業・後続コマ・直近課題1件。 */
export function TodayWidget({ model }: { model: WidgetModel }) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bgBottom,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
      }}
      {...uri(HOME_URI)}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginBottom: 8 }}>
        <TextWidget text={model.todayLabel} style={{ fontSize: 13, color: C.onDark, fontWeight: '700' }} />
        <FlexWidget style={{ flex: 1 }} />
        {model.updatedAtLabel ? (
          <TextWidget text={model.updatedAtLabel} style={{ fontSize: 10, color: C.onDarkDim }} />
        ) : (
          <FlexWidget />
        )}
      </FlexWidget>
      <NextClassCard model={model} />
      <LaterClasses model={model} />
      <AssignmentPill model={model} />
    </FlexWidget>
  )
}

/** 2x2 コンパクトウィジェット: 次の授業と残り時間だけ。 */
export function NextWidget({ model }: { model: WidgetModel }) {
  const nc = model.nextClass
  const target = model.attendance.state !== 'idle' ? ATTENDANCE_URI : TIMETABLE_URI
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: C.bgBottom,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      {...uri(nc ? target : HOME_URI)}
    >
      {nc ? (
        <FlexWidget style={{ width: 'match_parent' }}>
          <TextWidget
            text={`${nc.period}限 ${nc.startText}`}
            style={{ fontSize: 12, color: C.onDarkDim, fontWeight: '700' }}
          />
          <TextWidget
            text={nc.name}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 16, color: C.onDark, fontWeight: '700', marginTop: 4 }}
          />
          <TextWidget
            text={
              model.attendance.state === 'done'
                ? '出席済み'
                : nc.minutesUntil === null
                  ? '進行中'
                  : `あと${nc.minutesUntil}分`
            }
            style={{ fontSize: 12, color: C.onDarkDim, marginTop: 4 }}
          />
        </FlexWidget>
      ) : (
        <TextWidget text="今日の授業は終わりました" style={{ fontSize: 13, color: C.onDarkDim }} />
      )}
    </FlexWidget>
  )
}
