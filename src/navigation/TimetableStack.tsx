import { createNativeStackNavigator } from '@react-navigation/native-stack'
import TimetableScreen from '../screens/TimetableScreen'
import CollectTimetableScreen from '../screens/CollectTimetableScreen'
import CollectCoursesScreen from '../screens/CollectCoursesScreen'
import UpdateCheckScreen from '../screens/UpdateCheckScreen'
import SubjectDetailScreen from '../screens/SubjectDetailScreen'
import WebViewerScreen from '../screens/WebViewerScreen'
import SyllabusScreen from '../screens/SyllabusScreen'
import type { TimetableStackParamList } from './types'
import { COLORS } from '../theme'

const Stack = createNativeStackNavigator<TimetableStackParamList>()

export default function TimetableStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.emerald },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="TimetableHome" component={TimetableScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Collect" component={CollectTimetableScreen} options={{ title: '時間割を収集' }} />
      <Stack.Screen name="CollectCourses" component={CollectCoursesScreen} options={{ title: 'コース収集' }} />
      <Stack.Screen name="UpdateCheck" component={UpdateCheckScreen} options={{ title: '更新チェック' }} />
      <Stack.Screen name="SubjectDetail" component={SubjectDetailScreen} options={{ title: '科目' }} />
      <Stack.Screen name="Syllabus" component={SyllabusScreen} options={{ title: 'シラバス' }} />
      <Stack.Screen
        name="Web"
        component={WebViewerScreen}
        options={({ route }) => ({ title: route.params.title ?? 'ページ' })}
      />
    </Stack.Navigator>
  )
}
