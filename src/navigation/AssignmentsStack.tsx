import { createNativeStackNavigator } from '@react-navigation/native-stack'
import AssignmentsScreen from '../screens/AssignmentsScreen'
import CollectAssignmentsScreen from '../screens/CollectAssignmentsScreen'
import LetusAssignmentDetailScreen from '../screens/LetusAssignmentDetailScreen'
import WebViewerScreen from '../screens/WebViewerScreen'
import PdfViewerScreen from '../screens/PdfViewerScreen'
import type { AssignmentsStackParamList } from '../navigation/types'
import { COLORS } from '../theme'

const Stack = createNativeStackNavigator<AssignmentsStackParamList>()

export default function AssignmentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.emerald },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="AssignmentsHome" component={AssignmentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CollectAssignments" component={CollectAssignmentsScreen} options={{ title: '課題を収集' }} />
      {/* LETUS自前UI（Turn4で確定した4d）。 */}
      <Stack.Screen name="LetusAssignmentDetail" component={LetusAssignmentDetailScreen} options={{ title: '課題' }} />
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
