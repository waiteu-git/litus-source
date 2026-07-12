import { createNativeStackNavigator } from '@react-navigation/native-stack'
import TimetableScreen from '../screens/TimetableScreen'
import CollectTimetableScreen from '../screens/CollectTimetableScreen'
import CollectCoursesScreen from '../screens/CollectCoursesScreen'
import UpdateCheckScreen from '../screens/UpdateCheckScreen'
import LetusCoursesScreen from '../screens/LetusCoursesScreen'
import SubjectDetailScreen from '../screens/SubjectDetailScreen'
import ClassEventFormScreen from '../screens/ClassEventFormScreen'
import PersonalEventFormScreen from '../screens/PersonalEventFormScreen'
import WebViewerScreen from '../screens/WebViewerScreen'
import PdfViewerScreen from '../screens/PdfViewerScreen'
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
      {/* LETUS自前UI（Turn4で確定した4b）。ScreenHeaderを自前描画するためheaderShown:false。 */}
      <Stack.Screen name="LetusCourses" component={LetusCoursesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SubjectDetail" component={SubjectDetailScreen} options={{ title: '科目' }} />
      <Stack.Screen
        name="ClassEventForm"
        component={ClassEventFormScreen}
        options={({ route }) => ({ title: route.params.editId ? '予定を編集' : '予定を追加' })}
      />
      <Stack.Screen
        name="PersonalEventForm"
        component={PersonalEventFormScreen}
        options={({ route }) => ({ title: route.params?.editId ? '個人予定を編集' : '個人予定を追加' })}
      />
      <Stack.Screen name="Syllabus" component={SyllabusScreen} options={{ title: 'シラバス' }} />
      <Stack.Screen
        name="Web"
        component={WebViewerScreen}
        options={({ route }) => ({ title: route.params.title ?? 'ページ' })}
      />
      <Stack.Screen
        name="PdfViewer"
        component={PdfViewerScreen}
        options={({ route }) => ({ title: route.params.title ?? 'ファイル' })}
      />
    </Stack.Navigator>
  )
}
