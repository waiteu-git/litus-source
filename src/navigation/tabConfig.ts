/**
 * タブナビの構成値（React Native 非依存＝vitest で戻る挙動を検証できるように切り出す）。
 *
 * backBehavior の既定は 'firstRoute'（@react-navigation/routers の TabRouter）で、
 * 先頭タブ＝時間割・初期タブ＝ホームと食い違うため history に時間割が積まれ、
 * ホームで戻ってもアプリが終了せず時間割へジャンプしていた。'initialRoute' で
 * 「どのタブからもホームへ戻り、ホームで戻ると終了する」Android の作法に合わせる。
 */
export const TAB_ROUTE_NAMES = ['時間割', 'ホーム', '課題'] as const
export const INITIAL_TAB = 'ホーム'
export const TAB_BACK_BEHAVIOR = 'initialRoute' as const
