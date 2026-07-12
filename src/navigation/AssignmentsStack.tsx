import { createNativeStackNavigator } from '@react-navigation/native-stack'
import AssignmentsScreen from '../screens/AssignmentsScreen'
import CollectAssignmentsScreen from '../screens/CollectAssignmentsScreen'
import LetusAssignmentDetailScreen from '../screens/LetusAssignmentDetailScreen'
import ManualAssignmentScreen from '../screens/ManualAssignmentScreen'
import WebViewerScreen from '../screens/WebViewerScreen'
import PdfViewerScreen from '../screens/PdfViewerScreen'
import type { AssignmentsStackParamList } from '../navigation/types'
import { COLORS } from '../theme'
import { FONT } from '../ui/fontFamily'

const Stack = createNativeStackNavigator<AssignmentsStackParamList>()

export default function AssignmentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.emerald },
        headerTintColor: '#ffffff',
        // React Navigation のヘッダは共通Textラッパーを通らないため、fontFamily を直指定（600→700に寄せる）。
        headerTitleStyle: { fontFamily: FONT.bold },
      }}
    >
      <Stack.Screen name="AssignmentsHome" component={AssignmentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CollectAssignments" component={CollectAssignmentsScreen} options={{ title: '課題を収集' }} />
      {/* LETUS自前UI（Turn4で確定した4d）。 */}
      <Stack.Screen name="LetusAssignmentDetail" component={LetusAssignmentDetailScreen} options={{ title: '課題' }} />
      <Stack.Screen
        name="ManualAssignment"
        component={ManualAssignmentScreen}
        options={({ route }) => ({ title: route.params?.url ? '課題を編集' : '課題を追加' })}
      />
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
