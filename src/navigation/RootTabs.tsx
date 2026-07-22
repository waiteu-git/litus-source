import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute, type RouteProp } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import TimetableStack from './TimetableStack'
import AssignmentsStack from './AssignmentsStack'
import HomeStack from './HomeStack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, DARK, useThemeVariant } from '../theme'
import { FONT } from '../ui/fontFamily'
import { TAB_ROUTE_NAMES, INITIAL_TAB, TAB_BACK_BEHAVIOR } from './tabConfig'
import { HIDE_TAB_BAR_ROUTES } from './fullscreenRoutes'

const Tab = createBottomTabNavigator()

type IconName = keyof typeof Ionicons.glyphMap
const icon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />

export default function RootTabs() {
  const insets = useSafeAreaInsets()
  const { variant } = useThemeVariant()
  const dark = variant === 'dark'
  // ジェスチャーバー/ホームインジケータ分だけ底上げしないと、浮遊タブバーが下部で見切れる。
  const bottomInset = Math.max(insets.bottom, 8)

  // タブバーは position:absolute で**浮遊するピルだけ**を最前面に置き、その後ろは各画面(ScreenBg)が
  // 全高で描くので、タブの背後にアプリ画面がそのまま透ける（不要な下地=面は持たせない）。
  const tabBarStyle = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    marginHorizontal: 12,
    marginBottom: bottomInset,
    // IBM Plex Sans JP はラテン系標準フォントより行高が高く、62だと選択時のアクセント板から
    // ラベルがはみ出す（実機報告 2026-07-14）。板＝タブ項目自体を大きめに取る。
    height: 70,
    borderRadius: 20,
    backgroundColor: dark ? DARK.card : COLORS.white,
    borderTopWidth: dark ? 1 : 0,
    borderColor: DARK.cardBorder,
    elevation: 8,
    shadowColor: dark ? '#000000' : '#0a6650',
    shadowOpacity: dark ? 0.4 : 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    paddingBottom: 8,
    paddingTop: 8,
  }
  // 全画面ビューア（下部に自前のボタンを持つ）ではピルが被るのでタブバーを隠す。
  const barFor = (route: RouteProp<Record<string, object | undefined>, string>) =>
    HIDE_TAB_BAR_ROUTES.has(getFocusedRouteNameFromRoute(route) ?? '')
      ? ({ display: 'none' as const })
      : tabBarStyle

  return (
    <Tab.Navigator
      // 通常起動は常にホーム着地。出席通知タップ時のみ App 層が Attendance へ遷移させる。
      initialRouteName={INITIAL_TAB}
      // 既定('firstRoute')は先頭タブ=時間割に戻るため、ホームで戻ってもアプリが終了しない。
      backBehavior={TAB_BACK_BEHAVIOR}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: COLORS.white,
        tabBarInactiveTintColor: dark ? DARK.label : '#0b5c48',
        tabBarStyle,
        // タブラベルは共通Textラッパーを通らないため、fontFamily を直指定して本文と揃える。
        // fontSize/lineHeight も明示: Plex JP の既定行高だとラベルがアクセント板の下端からはみ出す。
        tabBarLabelStyle: { fontFamily: FONT.regular, fontSize: 11, lineHeight: 14 },
        tabBarActiveBackgroundColor: COLORS.emerald,
        // overflow:hidden が無いとアクティブ背景が角丸で切り抜かれず四角く見える。外枠(20)に合わせる。
        tabBarItemStyle: { borderRadius: 16, marginHorizontal: 6, overflow: 'hidden' },
      }}
    >
      <Tab.Screen
        name={TAB_ROUTE_NAMES[0]}
        component={TimetableStack}
        options={({ route }) => ({ tabBarIcon: icon('calendar-outline'), tabBarStyle: barFor(route) })}
      />
      <Tab.Screen
        name={TAB_ROUTE_NAMES[1]}
        component={HomeStack}
        options={({ route }) => ({ tabBarIcon: icon('home-outline'), tabBarStyle: barFor(route) })}
      />
      <Tab.Screen
        name={TAB_ROUTE_NAMES[2]}
        component={AssignmentsStack}
        options={({ route }) => ({ tabBarIcon: icon('checkbox-outline'), tabBarStyle: barFor(route) })}
      />
    </Tab.Navigator>
  )
}
