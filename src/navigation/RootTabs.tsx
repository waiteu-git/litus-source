import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TimetableStack from './TimetableStack'
import AssignmentsStack from './AssignmentsStack'
// 開発用: 出席タブは「出席登録ボタンの発火検証ラボ」に差し替え中。本番復帰時は AttendanceScreen に戻す。
import AttendanceLabScreen from '../screens/AttendanceLabScreen'
import SettingsScreen from '../screens/SettingsScreen'

const Tab = createBottomTabNavigator()

export default function RootTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="時間割" component={TimetableStack} options={{ headerShown: false }} />
      <Tab.Screen name="課題" component={AssignmentsStack} options={{ headerShown: false }} />
      <Tab.Screen name="出席" component={AttendanceLabScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  )
}
