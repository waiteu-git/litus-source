import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TimetableStack from './TimetableStack'
import AssignmentsStack from './AssignmentsStack'
import AttendanceScreen from '../screens/AttendanceScreen'
// 開発用ラボ（出席登録ボタンの発火検証）。必要時は下の出席タブの component をこちらに差し替える。
// import AttendanceLabScreen from '../screens/AttendanceLabScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { COLORS } from '../theme'

const Tab = createBottomTabNavigator()

export default function RootTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.white,
        tabBarInactiveTintColor: '#0b5c48',
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
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
        tabBarItemStyle: { borderRadius: 14, marginHorizontal: 6 },
      }}
    >
      <Tab.Screen name="時間割" component={TimetableStack} options={{ headerShown: false }} />
      <Tab.Screen name="課題" component={AssignmentsStack} options={{ headerShown: false }} />
      <Tab.Screen name="出席" component={AttendanceScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  )
}
