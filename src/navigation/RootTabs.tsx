import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import TimetableStack from './TimetableStack'
import AssignmentsScreen from '../screens/AssignmentsScreen'
import AttendanceScreen from '../screens/AttendanceScreen'
import SettingsScreen from '../screens/SettingsScreen'

const Tab = createBottomTabNavigator()

export default function RootTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="時間割" component={TimetableStack} options={{ headerShown: false }} />
      <Tab.Screen name="課題" component={AssignmentsScreen} />
      <Tab.Screen name="出席" component={AttendanceScreen} />
      <Tab.Screen name="設定" component={SettingsScreen} />
    </Tab.Navigator>
  )
}
