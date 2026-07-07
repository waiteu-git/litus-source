import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TimetableStack from './TimetableStack'
import AssignmentsStack from './AssignmentsStack'
import AttendanceScreen from '../screens/AttendanceScreen'
// 開発用ラボ（出席登録ボタンの発火検証）。必要時は下の出席タブの component をこちらに差し替える。
// import AttendanceLabScreen from '../screens/AttendanceLabScreen'
import SettingsScreen from '../screens/SettingsScreen'

const Tab = createBottomTabNavigator()

export default function RootTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="時間割" component={TimetableStack} options={{ headerShown: false }} />
      <Tab.Screen name="課題" component={AssignmentsStack} options={{ headerShown: false }} />
      <Tab.Screen name="出席" component={AttendanceScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  )
}
