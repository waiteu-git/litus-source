import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import TimetableStack from './TimetableStack'
import AssignmentsStack from './AssignmentsStack'
import AttendanceScreen from '../screens/AttendanceScreen'
// 開発用ラボ（出席登録ボタンの発火検証）。必要時は下の出席タブの component をこちらに差し替える。
// import AttendanceLabScreen from '../screens/AttendanceLabScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { COLORS } from '../theme'

const Tab = createBottomTabNavigator()

type IconName = keyof typeof Ionicons.glyphMap
const icon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />

export default function RootTabs() {
  const insets = useSafeAreaInsets()
  // ジェスチャーバー/ホームインジケータ分だけ底上げしないと、浮遊タブバーが下部で見切れる。
  const bottomInset = Math.max(insets.bottom, 8)
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.white,
        tabBarInactiveTintColor: '#0b5c48',
        // position:absolute にすると全画面でコンテンツに被って押せなくなるため、レイアウト領域を
        // 確保したまま余白＋角丸＋影で「浮遊」させる。
        tabBarStyle: {
          marginHorizontal: 12,
          marginBottom: bottomInset,
          height: 62,
          borderRadius: 20,
          backgroundColor: COLORS.white,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#0a6650',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveBackgroundColor: COLORS.emerald,
        // overflow:hidden が無いとアクティブ背景が角丸で切り抜かれず四角く見える。外枠(20)に合わせる。
        tabBarItemStyle: { borderRadius: 16, marginHorizontal: 6, overflow: 'hidden' },
      }}
    >
      <Tab.Screen name="時間割" component={TimetableStack} options={{ tabBarIcon: icon('calendar-outline') }} />
      <Tab.Screen name="課題" component={AssignmentsStack} options={{ tabBarIcon: icon('checkbox-outline') }} />
      <Tab.Screen name="出席" component={AttendanceScreen} options={{ tabBarIcon: icon('flash-outline') }} />
      <Tab.Screen name="設定" component={SettingsScreen} options={{ tabBarIcon: icon('settings-outline') }} />
    </Tab.Navigator>
  )
}
