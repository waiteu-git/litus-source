import { createNativeStackNavigator } from '@react-navigation/native-stack'
import TimetableScreen from '../screens/TimetableScreen'
import CollectTimetableScreen from '../screens/CollectTimetableScreen'
import CollectCoursesScreen from '../screens/CollectCoursesScreen'
import UpdateCheckScreen from '../screens/UpdateCheckScreen'
import type { TimetableStackParamList } from './types'

const Stack = createNativeStackNavigator<TimetableStackParamList>()

export default function TimetableStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="TimetableHome" component={TimetableScreen} options={{ title: '時間割' }} />
      <Stack.Screen name="Collect" component={CollectTimetableScreen} options={{ title: '時間割を収集' }} />
      <Stack.Screen name="CollectCourses" component={CollectCoursesScreen} options={{ title: 'コース収集' }} />
      <Stack.Screen name="UpdateCheck" component={UpdateCheckScreen} options={{ title: '更新チェック' }} />
    </Stack.Navigator>
  )
}
