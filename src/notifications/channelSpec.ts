/**
 * Android 通知チャンネルの定義（純粋・expo 非依存＝vitest で固定できる）。
 *
 * **チャンネル属性は、そのIDで初めて作成された瞬間に永久固定される。**
 * AOSP の createNotificationChannel は既存チャンネルに対して name / description / group /
 * importance しか反映せず、それ以外のフィールドは無視される。削除→同ID再作成でも
 * 旧設定ごと復活する（un-delete）ため、リセットする手段もない。
 * したがって lockscreenVisibility / enableVibrate / vibrationPattern / sound / showBadge は
 * **「そのIDのチャンネルをまだ作っていない端末」にしか届かない**。
 *
 * expo のネイティブ実装（AndroidXNotificationsChannelManager.java）は `args.containsKey(...)` で
 * 分岐するため、**渡さなかったキーは setter が呼ばれず AOSP 既定値のまま**になる。
 * 既定は mVibrationEnabled=false（＝無振動）／lockscreenVisibility=VISIBILITY_NO_OVERRIDE
 * （＝ユーザーのロック画面設定に従う）。振動は明示しない限り一切鳴らない。
 *
 * 意図的に渡さないもの:
 * - `sound`: 既定通知音のまま（カスタム音は後から変更不可）。
 * - `showBadge` / `bypassDnd` / `enableLights`: 既定に任せる。bypassDnd は DND ポリシー権限が
 *   無いと無視される。
 * - 出席以外の `lockscreenVisibility`: PUBLIC を明示するとユーザーの全体設定を上書きしうる。
 *   決定C（出席のみ PRIVATE）は「他は渡さない」で満たされる。
 */

export type ChannelImportance = 'max' | 'high' | 'default'
/** 明示するのは private のみ（PUBLIC を明示しない理由はファイル冒頭）。 */
export type ChannelVisibility = 'private'

export type ChannelSpec = {
  id: string
  name: string
  description: string
  importance: ChannelImportance
  lockscreenVisibility?: ChannelVisibility
  enableVibrate: boolean
  vibrationPattern: number[]
}

export const ATTENDANCE_CHANNEL_ID = 'attendance'
export const ASSIGNMENT_CHANNEL_ID = 'assignments'
export const BULLETIN_CHANNEL_ID = 'bulletins'
export const LETUS_NEWS_CHANNEL_ID = 'letus-updates'
/**
 * 各回イベント（休講/補講/小テスト/教室変更）専用チャンネル。
 * 予約枠は課題と共有するが、**通知の性質が別物**なので OS 上の分類は分ける。
 * 同居していた頃は「休講」がOS設定で『課題リマインド』に属し、課題通知を切ると休講も消え、
 * 逆に休講だけ切ることもできなかった（2026-07-17修正）。
 */
export const CLASS_EVENT_CHANNEL_ID = 'class-events'

/** 出席は「いま出席登録しろ」と促すのが仕事なので少し長めに震わせる。 */
const ATTENDANCE_VIBRATION = [0, 250, 250, 250]
/** 情報通知は一度だけ短く。 */
const INFO_VIBRATION = [0, 200]

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  {
    id: ATTENDANCE_CHANNEL_ID,
    name: '出席リマインド',
    description: '授業開始と受付中のお知らせ',
    importance: 'max',
    // 決定C: ロック画面では伏せる。ユーザーは自分がどの授業にいるか知っているため、
    // 科目名がロック画面に出ても情報がほとんど増えない。
    lockscreenVisibility: 'private',
    enableVibrate: true,
    vibrationPattern: ATTENDANCE_VIBRATION,
  },
  {
    id: ASSIGNMENT_CHANNEL_ID,
    name: '課題リマインド',
    description: '課題の締切前のお知らせ',
    importance: 'high',
    enableVibrate: true,
    vibrationPattern: INFO_VIBRATION,
  },
  {
    id: CLASS_EVENT_CHANNEL_ID,
    name: '休講・補講・小テスト',
    description: '各回の休講・補講・小テスト・教室変更',
    importance: 'high',
    enableVibrate: true,
    vibrationPattern: INFO_VIBRATION,
  },
  {
    id: BULLETIN_CHANNEL_ID,
    name: '新着掲示',
    description: 'CLASS の新着掲示',
    importance: 'high',
    enableVibrate: true,
    vibrationPattern: INFO_VIBRATION,
  },
  {
    id: LETUS_NEWS_CHANNEL_ID,
    name: 'LETUS更新',
    description: 'LETUS の新着資料・活動',
    importance: 'high',
    enableVibrate: true,
    vibrationPattern: INFO_VIBRATION,
  },
]

/** expo の enum（AndroidImportance / AndroidNotificationVisibility）を注入する形。 */
export type ChannelEnums = {
  importance: { MAX: number; HIGH: number; DEFAULT: number }
  visibility: { PRIVATE: number }
}

/**
 * spec を setNotificationChannelAsync の入力へ変換する。
 * **未指定の属性はキーごと落とす**（undefined を入れるとネイティブ側の containsKey 分岐が
 * 意図せず真になり、既定に任せたかった項目を上書きしうる）。
 */
export function toChannelInput(spec: ChannelSpec, enums: ChannelEnums): Record<string, unknown> {
  const importance =
    spec.importance === 'max'
      ? enums.importance.MAX
      : spec.importance === 'high'
        ? enums.importance.HIGH
        : enums.importance.DEFAULT
  const input: Record<string, unknown> = {
    name: spec.name,
    description: spec.description,
    importance,
    enableVibrate: spec.enableVibrate,
    vibrationPattern: spec.vibrationPattern,
  }
  if (spec.lockscreenVisibility === 'private') input.lockscreenVisibility = enums.visibility.PRIVATE
  return input
}
